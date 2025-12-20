// src/app/modules/Reward/reward.service.ts

/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose, { Types } from 'mongoose';
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
import { generateUniqueRWDPrefix } from './reward.utils';
import { RewardCode } from '../RewardCode/reward-code.model';

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Generate unique codes for in-store rewards with Database lookup
 * Format: PREFIX-SUFFIX (e.g., RWD7F21-A1B2C3)
 */
const generateInStoreCodes = async (
  prefix: string,
  count: number
): Promise<string[]> => {
  const codes: string[] = [];
  const localSet = new Set<string>();

  // We continue until the 'codes' array reaches the requested 'count'
  while (codes.length < count) {
    const batchNeeded = count - codes.length;
    const currentBatch: string[] = [];

    // 1. Generate a batch of unique suffixes locally first
    while (currentBatch.length < batchNeeded) {
      const suffix = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 chars
      const fullCode = `${prefix}-${suffix}`;

      if (!localSet.has(fullCode)) {
        localSet.add(fullCode);
        currentBatch.push(fullCode);
      }
    }

    // 2. Check the Database for any collisions across the entire batch in one query
    const existingCodesInDb = await RewardCode.find({
      code: { $in: currentBatch },
    })
      .select('code')
      .lean();

    // 3. Filter out codes that already exist in the DB
    if (existingCodesInDb.length > 0) {
      const existingSet = new Set(existingCodesInDb.map((doc) => doc.code));

      for (const candidate of currentBatch) {
        if (!existingSet.has(candidate)) {
          codes.push(candidate);
        } else {
          // Remove from localSet so it can be re-attempted in next loop if needed
          localSet.delete(candidate);
        }
      }
    } else {
      // No collisions found in DB, add the whole batch
      codes.push(...currentBatch);
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

/**
 * Main: Create Reward Service
 */
const createReward = async (
  rewardData: ICreateRewardPayload,
  imageFile?: Express.Multer.File,
  codesFiles?: Express.Multer.File[]
): Promise<IRewardDocument> => {
  const businessId = new Types.ObjectId(rewardData.businessId as string);

  // 1. Validate Business Existence
  const business = await Business.findById(businessId);
  if (!business) {
    if (imageFile) deleteFile(imageFile.path);
    throw new AppError(
      httpStatus.NOT_FOUND,
      REWARD_MESSAGES.BUSINESS_NOT_FOUND
    );
  }

  // 2. Validate Reward Title Uniqueness (For this specific business)
  const existingReward = await Reward.findOne({
    business: businessId,
    title: rewardData.title,
  });
  if (existingReward) {
    if (imageFile) deleteFile(imageFile.path);
    throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.ALREADY_EXISTS);
  }

  // 3. Validate Date Logic (Expiry must be after Start)
  if (rewardData.expiryDate && rewardData.startDate) {
    if (new Date(rewardData.expiryDate) <= new Date(rewardData.startDate)) {
      if (imageFile) deleteFile(imageFile.path);
      throw new AppError(
        httpStatus.BAD_REQUEST,
        REWARD_MESSAGES.EXPIRY_BEFORE_START
      );
    }
  }

  // 4. Validate Redemption Methods match Reward Type
  if (rewardData.type === 'in-store' && !rewardData.inStoreRedemptionMethods) {
    if (imageFile) deleteFile(imageFile.path);
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'In-store methods (QR/Static) are required for in-store rewards'
    );
  }

  if (rewardData.type === 'online' && !rewardData.onlineRedemptionMethods) {
    if (imageFile) deleteFile(imageFile.path);
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Online methods (Discount/GiftCard) are required for online rewards'
    );
  }

  // 5. Handle Image Upload
  if (imageFile) {
    rewardData.image = getFileUrl(imageFile);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 6. Auto-generate Unique RWD Prefix
    const autoPrefix = await generateUniqueRWDPrefix();
    rewardData.codePrefix = autoPrefix;

    // 7. Create the Reward Configuration
    const [reward] = await Reward.create(
      [
        {
          ...rewardData,
          business: businessId,
          pointsCost: STATIC_POINTS_COST,
          remainingCount: rewardData.redemptionLimit,
          redeemedCount: 0,
          isActive: true,
        },
      ],
      { session }
    );

    let codesToInsert = [];

    // 8. Type-Specific Code Logic & Validation
    if (reward.type === 'in-store') {
      const suffixes = await generateInStoreCodes(
        reward?.codePrefix,
        reward.redemptionLimit
      );
      codesToInsert = suffixes.map((suffix) => ({
        reward: reward._id,
        business: reward.business,
        code: `${autoPrefix}-${suffix}`, // RWDXXXX-YYYY
        isDiscountCode: false,
        isUsed: false,
      }));
    } else {
      // ONLINE VALIDATIONS
      if (!codesFiles || codesFiles.length === 0) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          REWARD_MESSAGES.FILE_REQUIRED
        );
      }

      const { codes: parsedCodes } = await parseCodesFiles(codesFiles);

      // Validate: CSV must contain at least as many codes as the redemption limit
      if (parsedCodes.length < reward.redemptionLimit) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          `Insufficient codes in CSV. Required: ${reward.redemptionLimit}, Found: ${parsedCodes.length}`
        );
      }

      // Validate: Check if any of these online codes already exist in the database (Global Uniqueness)
      const rawCodeStrings = parsedCodes.map((c) => c.code);
      const duplicateInDb = await RewardCode.findOne({
        code: { $in: rawCodeStrings },
      });
      if (duplicateInDb) {
        throw new AppError(
          httpStatus.CONFLICT,
          'One or more codes in your file have already been used in another reward.'
        );
      }

      codesToInsert = parsedCodes.slice(0, reward.redemptionLimit).map((c) => ({
        reward: reward._id,
        business: reward.business,
        code: c.code, // No prefix for online
        isGiftCard: c.isGiftCard,
        isDiscountCode: c.isDiscountCode,
        isUsed: false,
      }));
    }

    // 9. Bulk Insert into RewardCode collection
    await RewardCode.insertMany(codesToInsert, { session });

    await session.commitTransaction();

    // 10. Broadcast notification
    broadcastNewReward(reward);

    return reward;
  } catch (error: any) {
    await session.abortTransaction();
    // Cleanup uploaded reward image on failure
    if (rewardData.image && rewardData.image.startsWith('public/')) {
      deleteFile(rewardData.image);
    }
    throw error;
  } finally {
    session.endSession();
  }
};
/**
 * Helper: Broadcast to all clients
 */
const broadcastNewReward = async (reward: any) => {
  try {
    const clients = await Auth.find({
      isActive: true,
      status: AUTH_STATUS.VERIFIED,
      role: ROLE.CLIENT,
    }).select('_id');

    if (clients.length > 0) {
      const promises = clients.map((client) =>
        createNotification(
          client._id.toString(),
          NOTIFICATION_TYPE.NEW_REWARD,
          `New Reward: "${reward.title}" is now available!`,
          reward._id.toString(),
          { rewardId: reward._id.toString() }
        )
      );
      await Promise.all(promises);
    }
  } catch (err) {
    console.error('Broadcast failed:', err);
  }
};

/**
 * Update Reward Details and Inventory
 */
const updateReward = async (
  rewardId: string,
  payload: IUpdateRewardPayload,
  userId: string,
  imageFile?: Express.Multer.File,
  codesFiles?: Express.Multer.File[] // Used if increasing limit for online rewards
): Promise<IRewardDocument> => {
  // 1. Fetch current reward state
  const reward = await Reward.findById(rewardId);
  if (!reward) {
    if (imageFile) deleteFile(imageFile.path);
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  // 2. Validation: Prevent extending an already expired reward
  if (payload.expiryDate && reward.status === 'expired') {
    if (imageFile) deleteFile(imageFile.path);
    throw new AppError(
      httpStatus.BAD_REQUEST,
      REWARD_MESSAGES.CANNOT_EXTEND_EXPIRED
    );
  }

  // 3. Validation: 24-Hour Limit Update Cooldown
  if (payload.redemptionLimit !== undefined && reward.lastLimitUpdate) {
    const hoursSinceUpdate =
      (Date.now() - reward.lastLimitUpdate.getTime()) / (1000 * 60 * 60);
    if (hoursSinceUpdate < LIMIT_UPDATE_COOLDOWN_HOURS) {
      if (imageFile) deleteFile(imageFile.path);
      throw new AppError(
        httpStatus.TOO_MANY_REQUESTS,
        REWARD_MESSAGES.UPDATE_COOLDOWN
      );
    }
  }

  // 4. Handle Image Update
  if (imageFile) {
    if (reward.image && reward.image.startsWith('public/')) {
      deleteFile(reward.image);
    }
    payload.image = getFileUrl(imageFile);
  }

  // Start Transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 5. Handle Redemption Limit Increase Logic
    if (payload.redemptionLimit !== undefined) {
      const newLimit = payload.redemptionLimit;
      const currentLimit = reward.redemptionLimit;

      // Validation: Cannot set limit below what has already been redeemed
      if (newLimit < reward.redeemedCount) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          `${REWARD_MESSAGES.LIMIT_BELOW_REDEEMED}. Minimum: ${reward.redeemedCount}`
        );
      }

      // CASE: In-Store Limit Increase (Auto-generate codes with the RWD prefix)
      if (newLimit > currentLimit && reward.type === 'in-store') {
        const diff = newLimit - currentLimit;
        const suffixes = await generateInStoreCodes(reward.codePrefix, diff);

        const newCodes = suffixes.map((s) => ({
          reward: reward._id,
          business: reward.business,
          code: `${reward.codePrefix}-${s}`, // Consistent RWD prefix from DB
          isDiscountCode: false,
          isGiftCard: false,
          isUsed: false,
        }));

        await RewardCode.insertMany(newCodes, { session });
      }

      // CASE: Online Limit Increase (Requires CSV File)
      else if (newLimit > currentLimit && reward.type === 'online') {
        if (!codesFiles || codesFiles.length === 0) {
          throw new AppError(
            httpStatus.BAD_REQUEST,
            'To increase the limit for an online reward, you must upload a CSV file with the new codes.'
          );
        }

        const { codes: parsedCodes } = await parseCodesFiles(codesFiles);
        const neededCount = newLimit - currentLimit;

        if (parsedCodes.length < neededCount) {
          throw new AppError(
            httpStatus.BAD_REQUEST,
            `File only contains ${parsedCodes.length} codes, but you need ${neededCount} to reach the new limit.`
          );
        }

        // Global Uniqueness Check for new codes
        const codeStrings = parsedCodes.map((c) => c.code);
        const duplicate = await RewardCode.findOne({
          code: { $in: codeStrings },
        });
        if (duplicate)
          throw new AppError(
            httpStatus.CONFLICT,
            `Code "${duplicate.code}" already exists in system.`
          );

        const codesToInsert = parsedCodes.slice(0, neededCount).map((c) => ({
          reward: reward._id,
          business: reward.business,
          code: c.code, // No prefix for online
          isGiftCard: c.isGiftCard,
          isDiscountCode: c.isDiscountCode,
          isUsed: false,
        }));

        await RewardCode.insertMany(codesToInsert, { session });
      }

      // Record update in history
      reward.limitUpdateHistory!.push({
        previousLimit: currentLimit,
        newLimit,
        changedBy: new Types.ObjectId(userId),
        changedAt: new Date(),
        reason: payload.updateReason || 'Manual Update',
      });

      reward.redemptionLimit = newLimit;
      reward.remainingCount = newLimit - reward.redeemedCount;
      reward.lastLimitUpdate = new Date();
    }

    // 6. Handle Featured -> Priority Mapping
    if (payload.featured !== undefined) {
      reward.featured = payload.featured;
      reward.priority = payload.featured ? 10 : 1;
    }

    // 7. Update General Fields
    if (payload.title) reward.title = payload.title;
    if (payload.description) reward.description = payload.description;
    if (payload.image) reward.image = payload.image;
    if (payload.category) reward.category = payload.category;
    if (payload.startDate) reward.startDate = payload.startDate;
    if (payload.expiryDate) reward.expiryDate = payload.expiryDate;
    if (payload.isActive !== undefined) reward.isActive = payload.isActive;

    // 8. Finalize Reward Status
    await reward.save({ session });
    await reward.updateStatus(); // Sync status (active/sold-out/expired)

    await session.commitTransaction();
    return reward.populate('business', 'name category coverImage');
  } catch (error: any) {
    await session.abortTransaction();
    // Cleanup uploaded file if DB operation failed
    if (payload.image) deleteFile(payload.image);
    throw error;
  } finally {
    session.endSession();
  }
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

  return {
    ...rewardData,
    availableCodesCount: reward?.remainingCount,
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

/**
 * Upload codes to an Online reward and increase stock.
 * Online rewards do NOT use the RWD prefix.
 */
const uploadCodesToReward = async (
  rewardId: string,
  codesFiles: Express.Multer.File[]
) => {
  // 1. Fetch the Reward document
  const reward = await Reward.findById(rewardId);
  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  // 2. Validation: This endpoint is strictly for Online rewards
  if (reward.type !== 'online') {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Manual CSV upload is only for Online rewards. In-store codes are auto-generated by the system.'
    );
  }

  // 3. Parse the uploaded files
  const { codes: parsedCodes, filesProcessed } = await parseCodesFiles(
    codesFiles
  );
  const rawCodeStrings = parsedCodes.map((c) => c.code);

  // 4. Global Uniqueness Validation
  // Check if ANY of these codes exist anywhere in the RewardCode collection (all rewards, all businesses)
  const duplicateInDb = await RewardCode.findOne({
    code: { $in: rawCodeStrings },
  })
    .select('code')
    .lean();

  if (duplicateInDb) {
    throw new AppError(
      httpStatus.CONFLICT,
      `Upload blocked. The code "${duplicateInDb.code}" already exists in the system (potentially used in another reward).`
    );
  }

  // 5. Start Session for Atomic Updates
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 6. Map parsed codes to the RewardCode schema
    // Online rewards: We use the raw code from CSV without adding the RWD prefix
    const codesToInsert = parsedCodes.map((c) => ({
      reward: reward._id,
      business: reward.business,
      code: c.code,
      isGiftCard: c.isGiftCard,
      isDiscountCode: c.isDiscountCode,
      isUsed: false,
    }));

    // 7. Bulk Insert codes into inventory
    await RewardCode.insertMany(codesToInsert, { session });

    // 8. Update main Reward document counters
    const countAdded = codesToInsert.length;
    reward.redemptionLimit += countAdded;
    reward.remainingCount += countAdded;

    // 9. Validation: Ensure we are not extending an expired reward
    if (reward.status === REWARD_STATUS.EXPIRED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        REWARD_MESSAGES.CANNOT_EXTEND_EXPIRED
      );
    }

    // 10. Status Management: If the reward was 'sold-out', move it back to 'active'
    if (reward.status === REWARD_STATUS.SOLD_OUT && reward.remainingCount > 0) {
      reward.status = REWARD_STATUS.ACTIVE;
    }

    // 11. Sync metadata
    reward.lastLimitUpdate = new Date();

    // 12. Save and Commit
    await reward.save({ session });
    await session.commitTransaction();

    return {
      reward: {
        _id: reward._id,
        title: reward.title,
        status: reward.status,
        redemptionLimit: reward.redemptionLimit,
        remainingCount: reward.remainingCount,
      },
      codesAdded: countAdded,
     
      filesProcessed,
    };
  } catch (error: any) {
    // Abort transaction to prevent inconsistent stock counts
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Check availability
 */
/**
 * Check availability
 */
const checkAvailability = async (
  rewardId: string,
  userId?: string
): Promise<IRewardAvailability> => {
  const reward = await Reward.findById(rewardId);

  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  const now = new Date();
  let isAvailable = true;
  let reason: string | undefined;
  let userCanAfford = false;
  let userBalance = 0;
  let hasAlreadyClaimed = false;
  let existingClaimId: Types.ObjectId | undefined;

  // 1. Basic Status & Date Checks
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
  } else {
    const hasAvailableCode = await RewardCode.exists({
      reward: reward._id,
      isUsed: false,
    });

    if (!hasAvailableCode) {
      isAvailable = false;
      reason = REWARD_MESSAGES.NO_CODES_AVAILABLE;
    }
  }

  // 4. User-Specific Checks
  if (userId && isAvailable) {
    // Only check if general availability passed
    // Check for previous claims (Unchanged)
    const existingClaim = await RewardRedemption.findOne({
      user: userId,
      reward: rewardId,
      status: { $in: ['claimed', 'redeemed'] },
    });

    if (existingClaim) {
      hasAlreadyClaimed = true;
      existingClaimId = existingClaim._id as Types.ObjectId;
      isAvailable = false;
      reason = REWARD_MESSAGES.ALREADY_CLAIMED;
    }

    // Check Points Balance (Unchanged)
    try {
      const balance = await pointsServices.getUserBalance(userId);
      userBalance = balance.currentBalance;
      userCanAfford = balance.canAfford(STATIC_POINTS_COST);

      if (!userCanAfford && isAvailable) {
        isAvailable = false; // Must set this to false
        reason = REWARD_MESSAGES.INSUFFICIENT_POINTS;
      }
    } catch {
      userCanAfford = false;
    }
  }

  return {
    isAvailable,
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
