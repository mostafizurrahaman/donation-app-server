// src/app/modules/Reward/reward.service.ts

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import crypto from 'crypto';
import httpStatus from 'http-status';
import fs from 'fs';

import { Reward, ViewReward } from './reward.model';
// Imported only for availability check (Read Only)
import { RewardRedemption } from '../RewardRedeemtion/reward-redeemtion.model';
import Business from '../Business/business.model';
import { pointsServices } from '../Points/points.service';

import { AppError } from '../../utils';
import { getFileUrl, deleteFile } from '../../lib/upload';

import {
  ICreateRewardPayload,
  IUpdateRewardPayload,
  IRewardFilterQuery,
  IRewardStatistics,
  IRewardAvailability,
  IParsedCodeFromCSV,
  IRewardDocument,
  IRewardsListResult,
} from './reward.interface';

import {
  REWARD_MESSAGES,
  REWARD_STATUS,
  STATIC_POINTS_COST,
  LIMIT_UPDATE_COOLDOWN_HOURS,
} from './reward.constant';
import QueryBuilder from '../../builders/QueryBuilder';
import Client from '../Client/client.model';
import Auth from '../Auth/auth.model';
import { AUTH_STATUS, ROLE } from '../Auth/auth.constant';
import {
  calculatePercentageChange,
  getDateRanges,
} from '../../lib/filter-helper';
import { createNotification } from '../Notification/notification.service';
import { DONATION_TYPE } from '../Donation/donation.constant';
import { NOTIFICATION_TYPE } from '../Notification/notification.constant';

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Generate unique codes for in-store rewards
 */
const generateInStoreCodes = (count: number): string[] => {
  const codes: string[] = [];
  const generatedSet = new Set<string>();

  while (codes.length < count) {
    const code = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 chars
    if (!generatedSet.has(code)) {
      generatedSet.add(code);
      codes.push(code);
    }
  }

  return codes;
};

const parseCodesFiles = async (
  files: Express.Multer.File[]
): Promise<{ codes: IParsedCodeFromCSV[]; filesProcessed: number }> => {
  const allCodes: IParsedCodeFromCSV[] = [];
  const seenCodes = new Set<string>();
  let filesProcessed = 0;
  for (const file of files) {
    const parsedCodes = await parseSingleCodesFile(file);
    for (const parsedCode of parsedCodes) {
      if (!seenCodes.has(parsedCode.code)) {
        seenCodes.add(parsedCode.code);
        allCodes.push(parsedCode);
      }
    }
    if (parsedCodes.length > 0) filesProcessed++;
  }
  if (allCodes.length === 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'No valid codes found in uploaded files'
    );
  }
  return { codes: allCodes, filesProcessed };
};

const parseSingleCodesFile = async (
  file: Express.Multer.File
): Promise<IParsedCodeFromCSV[]> => {
  try {
    let content = '';

    if (file.buffer) {
      content = file.buffer.toString('utf-8');
    } else if (file.path) {
      content = fs.readFileSync(file.path, 'utf-8');
      try {
        fs.unlinkSync(file.path);
      } catch (cleanupError) {
        console.error('Error deleting temp CSV file:', cleanupError);
      }
    } else {
      throw new Error('File source not found (no buffer or path)');
    }

    const lines = content.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) return [];

    const header = lines[0].toLowerCase();
    const hasHeader =
      header.includes('code') ||
      header.includes('value') ||
      header.includes('url');

    const dataLines = hasHeader ? lines.slice(1) : lines;
    const parsedCodes: IParsedCodeFromCSV[] = [];
    const seenCodes = new Set<string>();

    for (const line of dataLines) {
      const values = line.split(',').map((v) => v.trim().replace(/"/g, ''));
      const codeValue = values[0];
      if (!codeValue || seenCodes.has(codeValue)) continue;

      seenCodes.add(codeValue);
      // Auto-detect URL for gift cards
      const isURLPattern = /^https?:\/\//i.test(codeValue);

      parsedCodes.push({
        code: codeValue,
        isGiftCard: isURLPattern,
        isDiscountCode: !isURLPattern,
      });
    }
    return parsedCodes;
  } catch (error: any) {
    console.log(error);
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Failed to parse file: ${file.originalname}`
    );
  }
};

// ==========================================
// REWARD CRUD OPERATIONS
// ==========================================

const createReward = async (
  rewardData: ICreateRewardPayload,
  imageFile?: Express.Multer.File,
  codesFiles?: Express.Multer.File[]
): Promise<IRewardDocument> => {
  const businessId = new Types.ObjectId(rewardData.businessId as string);
  const business = await Business.findById(businessId);
  if (!business) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      REWARD_MESSAGES.BUSINESS_NOT_FOUND
    );
  }

  const existingReward = await Reward.findOne({
    business: businessId,
    title: rewardData.title,
  });
  if (existingReward) {
    throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.ALREADY_EXISTS);
  }

  if (rewardData.expiryDate && rewardData.startDate) {
    if (new Date(rewardData.expiryDate) <= new Date(rewardData.startDate)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        REWARD_MESSAGES.EXPIRY_BEFORE_START
      );
    }
  }

  if (rewardData.type === 'in-store' && !rewardData.inStoreRedemptionMethods) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'In-store redemption methods are required for in-store rewards'
    );
  }

  if (rewardData.type === 'online' && !rewardData.onlineRedemptionMethods) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Online redemption methods are required for online rewards'
    );
  }

  let imageUrl: string | undefined = rewardData.image;
  if (imageFile) {
    imageUrl = getFileUrl(imageFile);
  }

  let generatedCodes: Array<{
    code: string;
    isGiftCard: boolean;
    isDiscountCode: boolean;
    isUsed: boolean;
  }> = [];

  let redemptionLimit = rewardData.redemptionLimit;

  if (rewardData.type === 'in-store') {
    const codeStrings = generateInStoreCodes(redemptionLimit);
    generatedCodes = codeStrings.map((code) => ({
      code,
      isGiftCard: false,
      isDiscountCode: false,
      isUsed: false,
    }));
  } else if (rewardData.type === 'online') {
    if (!codesFiles || codesFiles.length === 0) {
      throw new AppError(httpStatus.BAD_REQUEST, REWARD_MESSAGES.FILE_REQUIRED);
    }
    const { codes: parsedCodes } = await parseCodesFiles(codesFiles);

    const isUnique = await Reward.checkCodeUniqueness(
      parsedCodes.map((c) => c.code)
    );
    if (!isUnique) {
      throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.DUPLICATE_CODES);
    }
    if (!redemptionLimit) {
      redemptionLimit = parsedCodes.length;
    }
    if (parsedCodes.length < redemptionLimit) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `${REWARD_MESSAGES.LIMIT_EXCEEDS_CODES}. Uploaded: ${parsedCodes.length}, Required: ${redemptionLimit}`
      );
    }
    generatedCodes = parsedCodes.slice(0, redemptionLimit).map((c) => ({
      code: c.code,
      isGiftCard: c.isGiftCard,
      isDiscountCode: c.isDiscountCode,
      isUsed: false,
    }));
  }

  const reward = await Reward.create({
    business: businessId,
    title: rewardData.title,
    description: rewardData.description,
    image: imageUrl,
    type: rewardData.type,
    category: rewardData.category,
    pointsCost: STATIC_POINTS_COST,
    redemptionLimit,
    redeemedCount: 0,
    remainingCount: redemptionLimit,
    startDate: rewardData.startDate || new Date(),
    expiryDate: rewardData.expiryDate,
    inStoreRedemptionMethods: rewardData.inStoreRedemptionMethods,
    onlineRedemptionMethods: rewardData.onlineRedemptionMethods,
    codes: generatedCodes,
    featured: rewardData.featured || false,
    priority: rewardData.featured ? 10 : 1,
    isActive: true,
    redemptions: 0,
  });

  //  fetch all the clients :

  (async () => {
    try {
      const allClients = await Auth.find({
        isActive: true,
        status: AUTH_STATUS.VERIFIED,
        role: ROLE.CLIENT,
      }).select({ _id: 1 });

      if (allClients?.length > 0) {
        console.log(`✅ Sending notifications to ${allClients.length} clients`);

        // Use map to create an array of promises
        const notificationPromises = allClients.map((client) =>
          createNotification(
            client._id.toString(),
            NOTIFICATION_TYPE.NEW_REWARD,
            `New Reward: "${reward.title}" is now available. Explore and claim it now!`,
            reward._id.toString(),
            {
              rewardName: reward.title,
              rewardId: reward._id.toString(),
            }
          )
        );

        // Run them in parallel batches (better performance)
        await Promise.all(notificationPromises);
      }
    } catch (error) {
      console.error('❌ Broadcast notification failed:', error);
    }
  })();

  return reward.populate('business', 'name category coverImage');
};

const updateReward = async (
  rewardId: string,
  payload: IUpdateRewardPayload,
  userId: string,
  imageFile?: Express.Multer.File,
  codesFiles?: Express.Multer.File[]
): Promise<IRewardDocument> => {
  const reward = await Reward.findById(rewardId);
  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  if (payload.expiryDate && reward.status === 'expired') {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      REWARD_MESSAGES.CANNOT_EXTEND_EXPIRED
    );
  }

  if (imageFile) {
    if (reward.image && reward.image.startsWith('/')) {
      deleteFile(`public${reward.image}`);
    }
    payload.image = getFileUrl(imageFile);
  }

  if (codesFiles && codesFiles.length > 0 && reward.type === 'online') {
    const { codes: newParsedCodes } = await parseCodesFiles(codesFiles);
    const existingCodes = new Set(reward.codes.map((c) => c.code));
    const uniqueNewCodes = newParsedCodes.filter(
      (c) => !existingCodes.has(c.code)
    );

    if (uniqueNewCodes.length > 0) {
      const isUnique = await Reward.checkCodeUniqueness(
        uniqueNewCodes.map((c) => c.code),
        reward._id as Types.ObjectId
      );
      if (!isUnique) {
        throw new AppError(
          httpStatus.CONFLICT,
          REWARD_MESSAGES.DUPLICATE_CODES
        );
      }
      const codesToAdd = uniqueNewCodes.map((c) => ({
        code: c.code,
        isGiftCard: c.isGiftCard,
        isDiscountCode: c.isDiscountCode,
        isUsed: false,
      }));
      reward.codes.push(...codesToAdd);
      reward.redemptionLimit += uniqueNewCodes.length;
      reward.remainingCount += uniqueNewCodes.length;
      if (reward.status === 'sold-out') {
        reward.status = 'active';
      }
    }
  }

  if (payload.redemptionLimit !== undefined) {
    const newLimit = payload.redemptionLimit;
    const currentRedeemed = reward.redeemedCount;

    if (reward.lastLimitUpdate) {
      const hoursSinceUpdate =
        (Date.now() - reward.lastLimitUpdate.getTime()) / (1000 * 60 * 60);
      if (hoursSinceUpdate < LIMIT_UPDATE_COOLDOWN_HOURS) {
        throw new AppError(
          httpStatus.TOO_MANY_REQUESTS,
          REWARD_MESSAGES.UPDATE_COOLDOWN
        );
      }
    }

    if (newLimit < currentRedeemed) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `${REWARD_MESSAGES.LIMIT_BELOW_REDEEMED}. Minimum: ${currentRedeemed}`
      );
    }

    if (reward.type === 'online' && reward.codes.length > 0) {
      const unusedCodesCount = reward.codes.filter((c) => !c.isUsed).length;
      const maxPossible = currentRedeemed + unusedCodesCount;
      if (newLimit > maxPossible) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          `Cannot increase limit beyond available codes. Maximum: ${maxPossible}`
        );
      }
    }

    if (reward.type === 'in-store' && newLimit > reward.redemptionLimit) {
      const additionalCodesNeeded = newLimit - reward.redemptionLimit;
      const newCodes = generateInStoreCodes(additionalCodesNeeded);
      const newCodeObjects = newCodes.map((code) => ({
        code,
        isGiftCard: false,
        isDiscountCode: false,
        isUsed: false,
      }));
      reward.codes.push(...newCodeObjects);
    }

    reward.limitUpdateHistory = reward.limitUpdateHistory || [];
    reward.limitUpdateHistory.push({
      previousLimit: reward.redemptionLimit,
      newLimit,
      changedBy: new Types.ObjectId(userId),
      changedAt: new Date(),
      reason: payload.updateReason,
    });

    reward.redemptionLimit = newLimit;
    reward.remainingCount = newLimit - currentRedeemed;
    reward.lastLimitUpdate = new Date();

    if (reward.remainingCount === 0) {
      reward.status = 'sold-out';
    } else if (reward.status === 'sold-out' && reward.remainingCount > 0) {
      reward.status = 'active';
    }
  }

  if (payload.title !== undefined) reward.title = payload.title;
  if (payload.description !== undefined)
    reward.description = payload.description;
  if (payload.image !== undefined) reward.image = payload.image;
  if (payload.category !== undefined) reward.category = payload.category;
  if (payload.startDate !== undefined) reward.startDate = payload.startDate;
  if (payload.expiryDate !== undefined) reward.expiryDate = payload.expiryDate;
  if (payload.featured !== undefined) {
    reward.featured = payload.featured;
    reward.priority = payload.featured ? 10 : 1;
  }
  if (payload.isActive !== undefined) reward.isActive = payload.isActive;

  if (payload.inStoreRedemptionMethods && reward.inStoreRedemptionMethods) {
    reward.inStoreRedemptionMethods = {
      ...reward.inStoreRedemptionMethods,
      ...payload.inStoreRedemptionMethods,
    };
  }
  if (payload.onlineRedemptionMethods && reward.onlineRedemptionMethods) {
    reward.onlineRedemptionMethods = {
      ...reward.onlineRedemptionMethods,
      ...payload.onlineRedemptionMethods,
    };
  }

  await reward.save();
  await reward.updateStatus();

  return reward.populate('business', 'name category coverImage');
};

const updateRewardImage = async (
  rewardId: string,
  imageFile: Express.Multer.File
): Promise<IRewardDocument> => {
  const reward = await Reward.findById(rewardId);
  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }
  if (reward.image && reward.image.startsWith('/')) {
    deleteFile(`public${reward.image}`);
  }
  reward.image = getFileUrl(imageFile);
  await reward.save();
  return reward.populate('business', 'name category coverImage');
};

const getRewardById = async (
  rewardId: string,
  userId?: string
): Promise<Record<string, unknown>> => {
  const reward = await Reward.findById(rewardId).populate(
    'business',
    'name category coverImage locations businessEmail businessPhoneNumber'
  );
  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  console.log({
    userId,
    rewardId,
  });

  // Handle Reward Views
  if (userId) {
    const client = await Client.findOne({ auth: userId });
    console.log({
      client,
    });
    if (client) {
      await ViewReward.create({ user: client.auth, reward: rewardId });
    }
  }

  let userCanAfford = false;
  let userBalance = 0;
  let hasAlreadyClaimed = false;
  let existingClaimId: Types.ObjectId | undefined;

  if (userId) {
    try {
      const [balance, existingClaim] = await Promise.all([
        pointsServices.getUserBalance(userId),
        RewardRedemption.findOne({
          user: userId,
          reward: rewardId,
          status: { $in: ['claimed', 'redeemed'] },
        }),
      ]);
      userBalance = balance.currentBalance;
      userCanAfford = balance.canAfford(STATIC_POINTS_COST);
      if (existingClaim) {
        hasAlreadyClaimed = true;
        existingClaimId = existingClaim._id;
      }
    } catch {
      userCanAfford = false;
    }
  }

  const rewardData = reward.toJSON() as Record<string, unknown>;
  delete rewardData.codes;

  return {
    ...rewardData,
    availableCodesCount: reward.codes.filter((c) => !c.isUsed).length,
    isAvailable: reward.checkAvailability(),
    userCanAfford,
    userBalance,
    hasAlreadyClaimed,
    existingClaimId,
  };
};

const getRewards = async (
  query: IRewardFilterQuery
): Promise<IRewardsListResult> => {
  const {
    userId,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = query;

  const filter: Record<string, unknown> = {};
  if (query.businessId) filter.business = new Types.ObjectId(query.businessId);
  if (query.type) filter.type = query.type;
  if (query.category) filter.category = query.category;
  if (query.status) filter.status = query.status;
  if (query.featured !== undefined) filter.featured = query.featured;
  if (query.search) filter.$text = { $search: query.search };

  const rewardQuery = Reward.find(filter);
  const rewardBuilder = new QueryBuilder(rewardQuery, {
    ...query,
    page,
    limit,
    sortBy,
    sortOrder,
  })
    .sort()
    .paginate()
    .fields();

  const rewards = await rewardBuilder.modelQuery
    .populate('business', 'name category coverImage locations')
    .select('-codes')
    .lean();

  const meta = await rewardBuilder.countTotal();

  let userBalance = 0;
  const userClaims = new Map<string, string>();

  if (userId) {
    try {
      const [balance, claims] = await Promise.all([
        pointsServices.getUserBalance(userId),
        RewardRedemption.find({
          user: userId,
          reward: { $in: rewards.map((r) => r._id) },
          status: { $in: ['claimed', 'redeemed'] },
        }).select('reward status'),
      ]);
      userBalance = balance.currentBalance;
      claims.forEach((claim: any) => {
        userClaims.set(claim.reward.toString(), claim.status);
      });
    } catch {
      userBalance = 0;
    }
  }

  const rewardsWithAvailability = (rewards as any[]).map((reward: any) => ({
    ...reward,
    isAvailable:
      reward?.isActive &&
      reward.remainingCount > 0 &&
      new Date() >= new Date(reward.startDate) &&
      (!reward.expiryDate || new Date() <= new Date(reward.expiryDate)),
    userCanAfford: userId ? userBalance >= STATIC_POINTS_COST : undefined,
    claimStatus: userId ? userClaims.get(String(reward._id)) : undefined,
  }));

  return { data: rewardsWithAvailability, meta };
};

const getRewardsByBusiness = async (
  businessId: string,
  query: IRewardFilterQuery
): Promise<IRewardsListResult> => {
  return getRewards({ ...query, businessId });
};

/**
 * Toggle reward status (Active/Inactive)
 */
const toggleRewardStatus = async (
  rewardId: string,
  userId: string,
  isActive: boolean
) => {
  const reward = await Reward.findById(rewardId);

  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  const user = await Auth.findById(userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const business = await Business.findOne({ auth: userId });

  if (
    user.role === ROLE.BUSINESS &&
    (!business || reward.business.toString() !== business!._id.toString())
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You do not have permission to modify this reward'
    );
  }

  if (
    ![ROLE.ADMIN, ROLE.BUSINESS].includes(user?.role as 'ADMIN' | 'BUSINESS')
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You do not have permission to modify this reward'
    );
  }
  reward.isActive = isActive;

  await reward.save();

  await reward.updateStatus();

  return reward;
};

const deleteReward = async (rewardId: string): Promise<void> => {
  const reward = await Reward.findById(rewardId);
  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }
  reward.isActive = false;
  reward.status = REWARD_STATUS.INACTIVE;
  await reward.save();
};

const archiveReward = async (rewardId: string): Promise<void> => {
  const reward = await Reward.findByIdAndDelete(rewardId);
  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }
  if (reward.image && reward.image.startsWith('/')) {
    deleteFile(`public${reward.image}`);
  }
};

const uploadCodesToReward = async (
  rewardId: string,
  codesFiles: Express.Multer.File[]
) => {
  const reward = await Reward.findById(rewardId);
  if (!reward)
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  if (reward.type !== 'online')
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Codes can only be uploaded to online rewards'
    );
  const { codes: parsedCodes, filesProcessed } = await parseCodesFiles(
    codesFiles
  );
  const existingCodes = new Set(reward.codes.map((c) => c.code));
  const newCodes = parsedCodes.filter((c) => !existingCodes.has(c.code));
  if (newCodes.length === 0)
    throw new AppError(
      httpStatus.CONFLICT,
      'All codes already exist in this reward'
    );
  const isUnique = await Reward.checkCodeUniqueness(
    newCodes.map((c) => c.code),
    reward._id as Types.ObjectId
  );
  if (!isUnique)
    throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.DUPLICATE_CODES);
  const codesToAdd = newCodes.map((c) => ({
    code: c.code,
    isGiftCard: c.isGiftCard,
    isDiscountCode: c.isDiscountCode,
    isUsed: false,
  }));
  reward.codes.push(...codesToAdd);
  reward.redemptionLimit += newCodes.length;
  reward.remainingCount += newCodes.length;
  if (reward.status === 'sold-out') reward.status = 'active';
  await reward.save();
  return {
    reward,
    codesAdded: newCodes.length,
    codesDuplicated: parsedCodes.length - newCodes.length,
    filesProcessed,
  };
};

/**
 * Check availability
 */
const checkAvailability = async (
  rewardId: string,
  userId?: string
): Promise<IRewardAvailability> => {
  const reward = await Reward.findById(rewardId);
  if (!reward)
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  const now = new Date();
  let isAvailable = true;
  let reason: string | undefined;
  let userCanAfford = false;
  let userBalance = 0;
  let hasAlreadyClaimed = false;
  let existingClaimId: Types.ObjectId | undefined;
  if (!reward.isActive) {
    isAvailable = false;
    reason = REWARD_MESSAGES.INACTIVE;
  } else if (reward.startDate > now) {
    isAvailable = false;
    reason = REWARD_MESSAGES.NOT_STARTED;
  } else if (reward.expiryDate && reward.expiryDate < now) {
    isAvailable = false;
    reason = REWARD_MESSAGES.EXPIRED;
  } else if (reward.remainingCount <= 0) {
    isAvailable = false;
    reason = REWARD_MESSAGES.INSUFFICIENT_STOCK;
  } else if (reward.type === 'online' && reward.codes.length > 0) {
    const availableCode = reward.codes.find((code) => !code.isUsed);
    if (!availableCode) {
      isAvailable = false;
      reason = REWARD_MESSAGES.NO_CODES_AVAILABLE;
    }
  }
  if (userId) {
    // We check RewardRedemption only for status, logic is moved
    const existingClaim = await RewardRedemption.findOne({
      user: userId,
      reward: rewardId,
      status: { $in: ['claimed', 'redeemed'] },
    });
    if (existingClaim) {
      hasAlreadyClaimed = true;
      existingClaimId = existingClaim._id;
      isAvailable = false;
      reason = REWARD_MESSAGES.ALREADY_CLAIMED;
    }
    try {
      const balance = await pointsServices.getUserBalance(userId);
      userBalance = balance.currentBalance;
      userCanAfford = balance.canAfford(STATIC_POINTS_COST);
      if (!userCanAfford && isAvailable) {
        reason = REWARD_MESSAGES.INSUFFICIENT_POINTS;
      }
    } catch {
      userCanAfford = false;
    }
  }
  return {
    isAvailable:
      isAvailable && (!userId || (userCanAfford && !hasAlreadyClaimed)),
    reason,
    remainingCount: reward.remainingCount,
    userCanAfford,
    userBalance,
    hasAlreadyClaimed,
    existingClaimId,
  };
};

/**
 * Maintenance: Update expired rewards status
 */
const updateExpiredRewards = async () => {
  const now = new Date();
  const result = await Reward.updateMany(
    {
      expiryDate: { $lte: now },
      status: { $ne: REWARD_STATUS.EXPIRED },
      isActive: true,
    },
    { $set: { status: REWARD_STATUS.EXPIRED } }
  );
  return result.modifiedCount;
};

/**
 * Maintenance: Activate upcoming rewards
 */
const updateUpcomingRewards = async () => {
  const now = new Date();
  const result = await Reward.updateMany(
    {
      startDate: { $lte: now },
      status: REWARD_STATUS.UPCOMING,
      isActive: true,
      remainingCount: { $gt: 0 },
    },
    { $set: { status: REWARD_STATUS.ACTIVE } }
  );
  return result.modifiedCount;
};

const getBusinessRewards = async (
  userId: string,
  query: Record<string, unknown>
) => {
  console.log('Getting business rewards for user:', userId);

  const business = await Business.findOne({ auth: userId });
  if (!business)
    throw new AppError(httpStatus.NOT_FOUND, 'Business profile not found');

  const { status, search, page = 1, limit = 10 } = query;
  const filter: any = { business: business._id };

  // Status Logic
  if (status === 'active') {
    filter.isActive = true;
    filter.status = 'active';
  } else if (status === 'disabled') {
    filter.isActive = false;
  } else if (status === 'expires_soon') {
    // Expires in next 7 days
    const next7Days = new Date();
    next7Days.setDate(next7Days.getDate() + 7);
    filter.expiryDate = { $gte: new Date(), $lte: next7Days };
    filter.isActive = true;
  }

  // Search Logic
  if (search) {
    filter.title = { $regex: search, $options: 'i' };
  }

  const rewardQuery = new QueryBuilder(Reward.find(filter), { page, limit })
    .sort()
    .paginate();

  const result = await rewardQuery.modelQuery;
  const meta = await rewardQuery.countTotal();

  return { result, meta };
};

// Get Rewards for Users to Explore
const getUserExploreRewards = async (
  userId: string,
  query: Record<string, unknown>
) => {
  const client = await Client.findOne({ auth: userId });
  if (!client) throw new AppError(httpStatus.NOT_FOUND, 'Client not found');

  const { category, businessId, search, page = 1, limit = 20 } = query;

  // Basic Filters for Active Rewards
  const filter: any = {
    isActive: true,
    status: { $ne: 'expired' },
    remainingCount: { $gt: 0 },
    startDate: { $lte: new Date() },
    $or: [{ expiryDate: { $gte: new Date() } }, { expiryDate: null }],
  };

  if (category) filter.category = category;
  if (businessId) filter.business = new Types.ObjectId(businessId as string);
  if (search) filter.title = { $regex: search, $options: 'i' };

  // 1. Fetch Rewards
  const rewardQuery = new QueryBuilder(
    Reward.find(filter)
      .populate('business', 'name coverImage  logoImage')
      .select('-codes -limitUpdateHistory -priority -redemptions -featured'),
    { page, limit }
  )
    .sort()
    .paginate();

  const rewards = await rewardQuery.modelQuery.lean();
  const meta = await rewardQuery.countTotal();

  // 2. Attach User Status (Check Redemptions)
  const rewardIds = rewards.map((r: any) => r._id);

  const userClaims = await RewardRedemption.find({
    user: client._id,
    reward: { $in: rewardIds },
    status: { $ne: 'cancelled' },
  }).select('reward status');

  const claimMap = new Map();
  userClaims.forEach((claim) =>
    claimMap.set(claim.reward.toString(), claim.status)
  );

  // 3. Transform Result
  const finalResult = rewards.map((r: any) => {
    const status = claimMap.get(r._id.toString()) || 'not_claimed';

    return {
      ...r,
      userStatus: status,
      isAlreadyClaimed: status === 'claimed',
      isAlreadyRedeemed: status === 'redeemed',
    };
  });

  return { result: finalResult, meta };
};

/**
 * API 4: For Super Admin - Get All Rewards
 */
const getAdminRewards = async (query: Record<string, unknown>) => {
  const serachableFields = ['title', 'description'];
  const { fromDate, toDate, ...apiQuery } = query;

  if (fromDate || toDate) {
    const createdAtFilter: Record<string, unknown> = {};

    if (fromDate) {
      createdAtFilter.$gte = new Date(fromDate as string);
    }

    if (toDate) {
      createdAtFilter.$lte = new Date(toDate as string);
    }

    apiQuery.createdAt = createdAtFilter;
  }

  const rewardQuery = new QueryBuilder(
    Reward.find({}).populate('business', 'name email').select('-codes'),
    apiQuery
  )
    .search(serachableFields)
    .sort()
    .paginate()
    .filter();

  const result = await rewardQuery.modelQuery;
  const meta = await rewardQuery.countTotal();

  return { result, meta };
};

// Reward Analytics For Admin
const getAdminRewardAnalytics = async () => {
  const { current, previous } = getDateRanges('this_month');

  const [activeRewards, rewardRedeemed] = await Promise.all([
    await Reward.aggregate([
      {
        $match: {
          isActive: true,
          status: 'active',
        },
      },
      {
        $facet: {
          currentMonth: [
            {
              $match: {
                createdAt: {
                  $gte: current.startDate,
                  $lte: current.endDate,
                },
              },
            },
            {
              $count: 'count',
            },
          ],
          previousMonth: [
            {
              $match: {
                createdAt: {
                  $gte: previous.startDate,
                  $lte: previous.endDate,
                },
              },
            },
            {
              $count: 'count',
            },
          ],
        },
      },
    ]),
    await RewardRedemption.aggregate([
      {
        $match: {
          status: 'redeemed',
        },
      },
      {
        $facet: {
          currentMonth: [
            {
              $match: {
                createdAt: {
                  $gte: current.startDate,
                  $lte: current.endDate,
                },
              },
            },
            {
              $count: 'count',
            },
          ],
          previousMonth: [
            {
              $match: {
                createdAt: {
                  $gte: previous.startDate,
                  $lte: previous.endDate,
                },
              },
            },
            {
              $count: 'count',
            },
          ],
          topRewards: [
            {
              $group: {
                _id: '$reward',
                count: {
                  $sum: 1,
                },
              },
            },
            {
              $sort: {
                count: 1,
              },
            },
            {
              $limit: 1,
            },
            {
              $project: {
                _id: 0,
                reward: '$_id',
              },
            },
            {
              $lookup: {
                from: 'rewards',
                localField: 'reward',
                foreignField: '_id',
                as: 'rewardDetails',
              },
            },
            {
              $unwind: '$rewardDetails',
            },
            {
              $project: {
                _id: '$rewardDetails._id',
                business: '$rewardDetails.business',
                title: '$rewardDetails.title',
                description: '$rewardDetails.description',
                type: '$rewardDetails.type',
                category: '$rewardDetails.category',
                image: '$reweardDetails.image',
              },
            },
          ],
        },
      },
    ]),
  ]);



  const currentMonthActiveRewards =
    activeRewards?.[0]?.currentMonth?.[0]?.count || 0;

  const previousMonthActiveRewards =
    activeRewards?.[0]?.previousMonth?.[0]?.count || 0;
  const {
    isIncrease: rewardPercentageIncrease,
    percentageChange: rewardPercentageChange,
  } = calculatePercentageChange(
    currentMonthActiveRewards,
    previousMonthActiveRewards
  );

  // Redeemtion :
  const currentMonthRedeemedRewards =
    rewardRedeemed?.[0]?.currentMonth?.[0]?.count || 0;

  const previousMonthRedeemedRewards =
    rewardRedeemed?.[0]?.previousMonth?.[0]?.count || 0;

  const {
    isIncrease: redeemedRewardPercentageIncrease,
    percentageChange: redeemedRewardPercentageChange,
  } = calculatePercentageChange(
    currentMonthRedeemedRewards,
    previousMonthRedeemedRewards
  );

  // top rewards:
  const topRewards = rewardRedeemed?.[0]?.topRewards?.[0];

  return {
    reward: {
      currentMonthActiveRewards,
      previousMonthActiveRewards,
      rewardPercentageChange,
      rewardPercentageIncrease,
    },
    // redeemtion :
    redeem: {
      currentMonthRedeemedRewards,
      previousMonthRedeemedRewards,
      redeemedRewardPercentageIncrease,
      redeemedRewardPercentageChange,
    },
    topRewards,
  };
};

// Get Single Reward Details with Redeemtion and claimed:
const getRewardDetailsForAdmin = async (rewardId: string) => {
  console.log({ rewardId });
  const reward = await Reward.findById(rewardId).select(
    'name description inStoreRedemptionMethods  onlineRedemptionMethods image isActive status'
  );

  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, 'Reward not found!');
  }

  const redeemtions = new QueryBuilder(
    RewardRedemption.find({ reward: reward?._id }).populate({
      path: 'user',
      select: 'name image address phoneNumber auth',
      populate: {
        path: 'auth',
        select: 'email status',
      },
    }),
    {}
  )
    .sort()
    .paginate();

  const data = await redeemtions.modelQuery;
  const meta = await redeemtions.countTotal();

  return {
    data: {
      redeemtionList: data,
      reward,
    },
    meta,
  };
};

export const rewardService = {
  createReward,
  updateReward,
  updateRewardImage,
  getRewardById,
  getRewards,
  getRewardsByBusiness,
  deleteReward,
  archiveReward,
  checkAvailability,
  uploadCodesToReward,
  updateExpiredRewards,
  updateUpcomingRewards,
  getBusinessRewards,
  getUserExploreRewards,
  getAdminRewards,
  toggleRewardStatus,
  getAdminRewardAnalytics,
  getRewardDetailsForAdmin,
};
