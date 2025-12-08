/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/modules/Reward/reward.service.ts

import { Types, ClientSession } from 'mongoose';
import mongoose from 'mongoose';
import crypto from 'crypto';
import httpStatus from 'http-status';

import { Reward, RewardRedemption } from './reward.model';

import Business from '../Business/business.model';
import { pointsServices } from '../Points/points.service';
import { PointsBalance } from '../Points/points.model';
import { AppError } from '../../utils';
import { getFileUrl, deleteFile } from '../../lib/upload';

import {
  ICreateRewardPayload,
  IUpdateRewardPayload,
  IRewardFilterQuery,
  IRewardStatistics,
  IRewardAvailability,
  IClaimRewardPayload,
  IClaimResult,
  IRedeemRewardPayload,
  ICancelClaimPayload,
  IParsedCodeFromCSV,
  IRewardDocument,
  IRewardRedemptionDocument,
  IRewardsListResult,
} from './reward.interface';

import {
  REWARD_MESSAGES,
  REWARD_STATUS,
  STATIC_POINTS_COST,
  LIMIT_UPDATE_COOLDOWN_HOURS,
  CANCELLATION_WINDOW_HOURS,
  CLAIM_EXPIRY_DAYS,
  REDEMPTION_METHOD,
  REDEMPTION_STATUS,
} from './reward.constant';
import QueryBuilder from '../../builders/QueryBuilder';
import Client from '../Client/client.model';
import { String } from 'aws-sdk/clients/apigateway';

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

const parseSingleCodesFile = async (
  file: Express.Multer.File
): Promise<IParsedCodeFromCSV[]> => {
  try {
    const content = file.buffer.toString('utf-8');
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
    views: 0,
    redemptions: 0,
  });

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

  // eslint-disable-next-line no-console
  reward.incrementViews().catch(console.error);

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

const getClaimedRewardById = async (
  redemptionId: string,
  userId: string
): Promise<IRewardRedemptionDocument> => {
  const redemption = await RewardRedemption.findOne({
    _id: redemptionId,
    user: userId,
  })
    .populate('reward', 'title description image type category pointsCost')
    .populate('business', 'name locations coverImage');

  if (!redemption) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.CLAIM_NOT_FOUND);
  }
  return redemption;
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

// ==========================================
// REWARD CLAIMING & REDEMPTION
// ==========================================

/**
 * Claim a reward (deduct points)
 */
const claimReward = async (
  payload: IClaimRewardPayload
): Promise<IClaimResult> => {
  const { rewardId, userId } = payload;
  const idempotencyKey = crypto.randomBytes(16).toString('hex');

  // Check if client exists
  const isClientExists = await Client.findOne({ auth: userId });
  if (!isClientExists) {
    throw new AppError(httpStatus.NOT_FOUND, 'Client not found');
  }

  // Check for duplicate claim
  const existingUserClaim = await RewardRedemption.findOne({
    user: isClientExists._id,
    reward: rewardId,
    status: { $in: ['claimed', 'redeemed'] },
  });

  if (existingUserClaim) {
    throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.ALREADY_CLAIMED);
  }

  const session: ClientSession = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Atomic reward stock check & decrement
    const reward = await Reward.findOneAndUpdate(
      {
        _id: rewardId,
        remainingCount: { $gt: 0 },
        status: 'active',
        isActive: true,
        startDate: { $lte: new Date() },
        $or: [{ expiryDate: { $gte: new Date() } }, { expiryDate: null }],
      },
      {
        $inc: { remainingCount: -1, redeemedCount: 1, redemptions: 1 },
      },
      { new: true, session, runValidators: true }
    );

    if (!reward) {
      throw new AppError(httpStatus.GONE, REWARD_MESSAGES.RACE_CONDITION);
    }

    // 2. Atomic points deduction (Passing session to prevent write conflict)
    try {
      await pointsServices.deductPoints(
        isClientExists._id?.toString(),
        STATIC_POINTS_COST,
        'reward_redemption',
        undefined, // rewardRedemptionId not created yet
        `Claimed reward: ${reward.title}`,
        {
          rewardId: reward._id.toString(),
          businessId: reward.business.toString(),
        },
        session // ✅ Critical: Pass the session
      );
    } catch (err: any) {
      throw new AppError(
        httpStatus.PAYMENT_REQUIRED,
        err.message || REWARD_MESSAGES.INSUFFICIENT_POINTS
      );
    }

    // 3. Determine Available Methods & Assign Code
    let assignedCode: string | undefined;
    const availableMethods: string[] = [];
    let finalRedemptionMethod: string | undefined;

    if (reward.type === 'in-store') {
      // Snapshot available methods for in-store
      if (reward.inStoreRedemptionMethods?.qrCode)
        availableMethods.push(REDEMPTION_METHOD.QR_CODE);
      if (reward.inStoreRedemptionMethods?.staticCode)
        availableMethods.push(REDEMPTION_METHOD.STATIC_CODE);
      if (reward.inStoreRedemptionMethods?.nfcTap)
        availableMethods.push(REDEMPTION_METHOD.NFC);

      // Assign static code if available
      if (reward.codes.length > 0) {
        const availableCode = reward.getAvailableCode();
        if (availableCode) {
          assignedCode = availableCode.code;
        }
      }
    } else if (reward.type === 'online') {
      // Snapshot method for online
      if (reward.codes.length > 0) {
        const availableCode = reward.getAvailableCode();
        if (availableCode) {
          assignedCode = availableCode.code;
          const method = availableCode.isGiftCard
            ? REDEMPTION_METHOD.GIFT_CARD
            : REDEMPTION_METHOD.DISCOUNT_CODE;
          availableMethods.push(method);
          finalRedemptionMethod = method; // Auto-set for online
        }
      }
    }

    const expiresAt = new Date(
      Date.now() + CLAIM_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    // 4. Create Redemption Record
    const [redemption] = await RewardRedemption.create(
      [
        {
          user: isClientExists._id,
          reward: rewardId,
          business: reward.business,
          pointsSpent: STATIC_POINTS_COST,
          status: REDEMPTION_STATUS.CLAIMED,
          assignedCode,
          availableRedemptionMethods: availableMethods, // ✅ Stored Snapshot
          redemptionMethod: finalRedemptionMethod,
          idempotencyKey,
          expiresAt,
        },
      ],
      { session }
    );

    // 5. Mark Code as Used
    if (assignedCode) {
      await reward.markCodeAsUsed(
        assignedCode,
        isClientExists._id,
        redemption._id as Types.ObjectId
      );
    }

    // 6. Update Reward Status if Sold Out
    if (reward.remainingCount <= 0) {
      reward.status = 'sold-out';
      await reward.save({ session });
    }

    await session.commitTransaction();

    await redemption.populate([
      { path: 'reward', select: 'title description image type category' },
      { path: 'business', select: 'name locations' },
    ]);

    return {
      redemption,
      message: REWARD_MESSAGES.CLAIMED,
      code: assignedCode,
      availableMethods,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Cancel claimed reward and refund points
 */
const cancelClaimedReward = async (
  payload: ICancelClaimPayload
): Promise<IRewardRedemptionDocument> => {
  const { redemptionId, userId, reason } = payload;

  // Resolve client ID (handling admin vs user calls if necessary)
  const isClientExists = await Client.findOne({ auth: userId });
  // Fallback to direct ID if passed
  const userObjectId = isClientExists
    ? isClientExists._id
    : new Types.ObjectId(userId);

  const redemption = await RewardRedemption.findOne({
    _id: redemptionId,
    user: userObjectId,
    status: 'claimed',
  }).populate('reward');

  if (!redemption) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.CLAIM_NOT_FOUND);
  }

  const hoursSinceClaim =
    (Date.now() - redemption.claimedAt.getTime()) / (1000 * 60 * 60);
  if (hoursSinceClaim > CANCELLATION_WINDOW_HOURS) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      REWARD_MESSAGES.CANCELLATION_EXPIRED
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Refund points (Passing session)
    const refundTransaction = await pointsServices.refundPoints(
      userId,
      redemption.pointsSpent,
      'reward_redemption',
      reason || 'Reward claim cancelled',
      redemptionId,
      undefined,
      session // ✅ Critical: Pass the session
    );

    // 2. Update status
    redemption.status = 'cancelled';
    redemption.cancelledAt = new Date();
    redemption.cancellationReason = reason;
    redemption.refundTransactionId = refundTransaction.transaction
      ._id as Types.ObjectId;

    await redemption.save({ session });
    await session.commitTransaction();
    return redemption;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};
/**
 * Verify redemption by code or ID (Step 1: Scan/Input)
 */
const verifyRedemption = async (
  staffBusinessId: string,
  code?: string,
  redemptionId?: string
) => {
  const query: any = { status: 'claimed' };

  if (code) {
    query.assignedCode = code;
  } else if (redemptionId) {
    query._id = redemptionId;
  } else {
    throw new AppError(httpStatus.BAD_REQUEST, 'Provide code or redemptionId');
  }

  const redemption = await RewardRedemption.findOne(query).populate([
    'reward',
    'business',
    'user',
  ]);

  if (!redemption) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      REWARD_MESSAGES.REDEMPTION_NOT_FOUND
    );
  }

  if (redemption.business._id.toString() !== staffBusinessId) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'This reward does not belong to your business'
    );
  }

  if (new Date() > redemption.expiresAt) {
    throw new AppError(httpStatus.GONE, REWARD_MESSAGES.CLAIM_EXPIRED);
  }

  return {
    redemptionId: redemption._id,
    user: redemption.user,
    rewardName: (redemption.reward as any).title,
    status: redemption.status,
    assignedCode: redemption.assignedCode,
    availableMethods: redemption.availableRedemptionMethods, // ✅ Return allowed methods
    expiresAt: redemption.expiresAt,
  };
};

/**
 * Mark reward as redeemed (Step 2: Confirmation)
 */
const redeemReward = async (
  payload: IRedeemRewardPayload
): Promise<IRewardRedemptionDocument> => {
  const { redemptionId, code, staffId, location, notes, method } = payload;

  const business = await Business.findOne({ auth: staffId });
  if (!business)
    throw new AppError(
      httpStatus.NOT_FOUND,
      REWARD_MESSAGES.BUSINESS_NOT_FOUND
    );

  let redemption;

  // Lookup redemption doc by ID or Code
  if (redemptionId) {
    redemption = await RewardRedemption.findById(redemptionId);
  } else if (code) {
    redemption = await RewardRedemption.findOne({ assignedCode: code });
  }

  if (!redemption)
    throw new AppError(
      httpStatus.NOT_FOUND,
      REWARD_MESSAGES.REDEMPTION_NOT_FOUND
    );

  if (redemption.business.toString() !== business._id.toString()) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'This reward does not belong to your business'
    );
  }

  if (redemption.status === 'redeemed')
    throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.ALREADY_REDEEMED);
  if (redemption.status !== 'claimed')
    throw new AppError(
      httpStatus.BAD_REQUEST,
      REWARD_MESSAGES.CANNOT_REDEEM_NON_CLAIMED
    );
  if (new Date() > redemption.expiresAt) {
    redemption.status = 'expired';
    redemption.expiredAt = new Date();
    await redemption.save();
    throw new AppError(httpStatus.GONE, REWARD_MESSAGES.CLAIM_EXPIRED);
  }

  // ✅ VALIDATE METHOD: Ensure method matches the snapshot allowed list
  if (!redemption.availableRedemptionMethods.includes(method)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Invalid redemption method: '${method}'. Allowed methods: ${redemption.availableRedemptionMethods.join(
        ', '
      )}`
    );
  }

  redemption.status = 'redeemed';
  redemption.redeemedAt = new Date();
  redemption.redemptionMethod = method; // ✅ Record specific method used
  redemption.redeemedByStaff = new Types.ObjectId(business._id);
  if (location) redemption.redemptionLocation = location;
  if (notes) redemption.redemptionNotes = notes;

  await redemption.save();

  return redemption.populate([
    { path: 'reward', select: 'title description image type category' },
    { path: 'business', select: 'name locations' },
  ]);
};

const getUserClaimedRewards = async (
  userId: string,
  options: { includeExpired?: boolean; page?: number; limit?: number } = {}
): Promise<{ redemptions: IRewardRedemptionDocument[]; total: number }> => {
  const { includeExpired = false, page = 1, limit = 20 } = options;
  const filter: Record<string, unknown> = { user: userId };
  if (includeExpired) {
    filter.status = { $ne: 'cancelled' };
  } else {
    filter.status = 'claimed';
    filter.expiresAt = { $gt: new Date() };
  }
  const skip = (page - 1) * limit;
  const [redemptions, total] = await Promise.all([
    RewardRedemption.find(filter)
      .populate('reward', 'title description image type category pointsCost')
      .populate('business', 'name locations coverImage')
      .sort('-claimedAt')
      .skip(skip)
      .limit(limit),
    RewardRedemption.countDocuments(filter),
  ]);
  return { redemptions, total };
};

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

const expireOldClaimsWithFullRestoration =
  async (): Promise<IExpireClaimsResult> => {
    const now = new Date();
    const result: IExpireClaimsResult = {
      totalProcessed: 0,
      expiredCount: 0,
      codesReturned: 0,
      pointsRefunded: 0,
      stockRestored: 0,
      errors: [],
    };
    const expiredClaims = await RewardRedemption.find({
      status: 'claimed',
      expiresAt: { $lte: now },
    });
    result.totalProcessed = expiredClaims.length;

    if (expiredClaims.length === 0) return result;

    for (const claim of expiredClaims) {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        claim.status = 'expired';
        claim.expiredAt = now;
        await claim.save({ session });

        try {
          // Get Auth ID from Client ID to pass to points service
          const client = await Client.findById(claim.user);
          const authUserId = client
            ? client.auth.toString()
            : claim.user.toString();

          const refundResult = await pointsServices.refundPoints(
            authUserId,
            claim.pointsSpent,
            'claim_expired',
            `Reward claim expired - automatic refund for claim ${claim._id}`,
            claim._id.toString(),
            undefined,
            session // ✅ Critical: Pass the session
          );

          if (refundResult && refundResult.transaction) {
            claim.refundTransactionId = refundResult.transaction
              ._id as Types.ObjectId;
            await claim.save({ session });
            result.pointsRefunded += claim.pointsSpent;
          }
        } catch (refundError) {
          console.error(
            `[EXPIRATION] Failed to refund points for claim ${claim._id}:`,
            refundError
          );
        }

        await session.commitTransaction();
        result.expiredCount++;
      } catch (error: any) {
        await session.abortTransaction();
        result.errors.push({
          claimId: claim._id.toString(),
          error: error.message,
        });
      } finally {
        session.endSession();
      }
    }
    return result;
  };

const getExpiringClaims = async (hoursUntilExpiry = 24) => {
  const now = new Date();
  const expiryThreshold = new Date(
    now.getTime() + hoursUntilExpiry * 60 * 60 * 1000
  );
  return RewardRedemption.find({
    status: 'claimed',
    expiresAt: { $gt: now, $lte: expiryThreshold },
  }).populate('user name email reward title business name');
};

const getUserExpirationSummary = async (userId: string) => {
  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [expiringIn24Hours, expiringIn7Days, totalActive] = await Promise.all([
    RewardRedemption.countDocuments({
      user: userId,
      status: 'claimed',
      expiresAt: { $gt: now, $lte: in24Hours },
    }),
    RewardRedemption.countDocuments({
      user: userId,
      status: 'claimed',
      expiresAt: { $gt: now, $lte: in7Days },
    }),
    RewardRedemption.countDocuments({
      user: userId,
      status: 'claimed',
      expiresAt: { $gt: now },
    }),
  ]);
  return { expiringIn24Hours, expiringIn7Days, totalActive };
};

const getRewardStatistics = async (
  businessId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<IRewardStatistics> => {
  const filter: Record<string, unknown> = {};
  if (businessId) filter.business = new Types.ObjectId(businessId);
  const dateFilter: Record<string, unknown> = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate)
      (dateFilter.createdAt as Record<string, Date>).$gte = startDate;
    if (endDate) (dateFilter.createdAt as Record<string, Date>).$lte = endDate;
  }
  const [overallStats, topRewardsResult, categoryStats, typeStats] =
    await Promise.all([
      Reward.aggregate([
        { $match: { ...filter, ...dateFilter } },
        {
          $group: {
            _id: null,
            totalRewards: { $sum: 1 },
            activeRewards: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
            },
            expiredRewards: {
              $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] },
            },
            soldOutRewards: {
              $sum: { $cond: [{ $eq: ['$status', 'sold-out'] }, 1, 0] },
            },
            totalRedemptions: { $sum: '$redemptions' },
            totalViews: { $sum: '$views' },
          },
        },
      ]),
      Reward.find({ ...filter, ...dateFilter })
        .sort({ redemptions: -1 })
        .limit(10)
        .select('_id title redemptions')
        .lean(),
      Reward.aggregate([
        { $match: { ...filter, ...dateFilter } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      Reward.aggregate([
        { $match: { ...filter, ...dateFilter } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
    ]);
  const stats = overallStats[0] || {
    totalRewards: 0,
    activeRewards: 0,
    expiredRewards: 0,
    soldOutRewards: 0,
    totalRedemptions: 0,
    totalViews: 0,
  };
  const typeMap: Record<string, number> = {};
  typeStats.forEach((t: { _id: string; count: number }) => {
    typeMap[t._id] = t.count;
  });
  return {
    totalRewards: stats.totalRewards,
    activeRewards: stats.activeRewards,
    expiredRewards: stats.expiredRewards,
    soldOutRewards: stats.soldOutRewards,
    totalRedemptions: stats.totalRedemptions,
    totalViews: stats.totalViews,
    averageRedemptionRate:
      stats.totalViews > 0
        ? (stats.totalRedemptions / stats.totalViews) * 100
        : 0,
    topRewards: topRewardsResult.map((reward) => ({
      reward: reward._id as Types.ObjectId,
      title: reward.title,
      redemptions: reward.redemptions,
    })),
    rewardsByCategory: categoryStats.map(
      (cat: { _id: string; count: number }) => ({
        category: cat._id,
        count: cat.count,
      })
    ),
    rewardsByType: {
      inStore: typeMap['in-store'] || 0,
      online: typeMap['online'] || 0,
    },
  };
};

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

export const rewardService = {
  createReward,
  updateReward,
  updateRewardImage,
  getRewardById,
  getClaimedRewardById,
  getRewards,
  getRewardsByBusiness,
  deleteReward,
  archiveReward,
  claimReward,
  cancelClaimedReward,
  verifyRedemption,
  redeemReward,
  getUserClaimedRewards,
  checkAvailability,
  uploadCodesToReward,
  expireOldClaimsWithFullRestoration,
  getExpiringClaims,
  getUserExpirationSummary,
  getRewardStatistics,
  updateExpiredRewards,
  updateUpcomingRewards,
};
