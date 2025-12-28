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

import { AppError, uploadToS3 } from '../../utils';

import {
  ICreateRewardPayload,
  IUpdateRewardPayload,
  IRewardFilterQuery,
  IRewardAvailability,
  IParsedCodeFromCSV,
  IRewardDocument,
  IRewardsListResult,
  IHardDeleteResult,
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
import { NOTIFICATION_TYPE } from '../Notification/notification.constant';
import { generateUniqueRWDPrefix } from './reward.utils';
import { RewardCode } from '../RewardCode/reward-code.model';
import { deleteFromS3, getS3KeyFromUrl } from '../../utils/s3.utils';

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

/**
 * Main: Create Reward Service (Updated for S3)
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
    throw new AppError(
      httpStatus.NOT_FOUND,
      REWARD_MESSAGES.BUSINESS_NOT_FOUND
    );
  }

  // 2. Validate Reward Title Uniqueness
  const existingReward = await Reward.findOne({
    business: businessId,
    title: rewardData.title,
  });
  if (existingReward) {
    throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.ALREADY_EXISTS);
  }

  // 3. Validate Date Logic
  if (rewardData.expiryDate && rewardData.startDate) {
    if (new Date(rewardData.expiryDate) <= new Date(rewardData.startDate)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        REWARD_MESSAGES.EXPIRY_BEFORE_START
      );
    }
  }

  // 4. Validate Redemption Methods
  if (rewardData.type === 'in-store' && !rewardData.inStoreRedemptionMethods) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'In-store methods (QR/Static) are required'
    );
  }

  if (rewardData.type === 'online' && !rewardData.onlineRedemptionMethods) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Online methods (Discount/GiftCard) are required'
    );
  }

  // 5. Handle Image Upload to S3
  let uploadedImageUrl = '';
  if (imageFile) {
    const uploadResult = await uploadToS3({
      buffer: imageFile.buffer,
      key: `reward-${Date.now()}`,
      contentType: imageFile.mimetype,
      folder: 'rewards',
    });
    uploadedImageUrl = uploadResult.url;
    rewardData.image = uploadedImageUrl;
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

    // 8. Type-Specific Code Logic
    if (reward.type === 'in-store') {
      const codes = await generateInStoreCodes(
        reward?.codePrefix,
        reward.redemptionLimit
      );
      codesToInsert = codes.map((code) => ({
        reward: reward._id,
        business: reward.business,
        code,
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

      if (parsedCodes.length < reward.redemptionLimit) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          `Insufficient codes in CSV. Required: ${reward.redemptionLimit}`
        );
      }

      const rawCodeStrings = parsedCodes.map((c) => c.code);
      const duplicateInDb = await RewardCode.findOne({
        code: { $in: rawCodeStrings },
      });

      if (duplicateInDb) {
        throw new AppError(
          httpStatus.CONFLICT,
          'One or more codes already used in another reward.'
        );
      }

      codesToInsert = parsedCodes.slice(0, reward.redemptionLimit).map((c) => ({
        reward: reward._id,
        business: reward.business,
        code: c.code,
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

    // Optional: Cleanup S3 if DB transaction fails
    if (uploadedImageUrl) {
      const key = getS3KeyFromUrl(uploadedImageUrl);
      if (key) await deleteFromS3(key).catch(() => null);
    }

    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Create Online Reward Service
 * Dynamically sets redemptionLimit based on the number of codes in the uploaded files.
 */
const createOnlineReward = async (
  rewardData: Omit<ICreateRewardPayload, 'redemptionLimit'>, // Limit comes from file, not payload
  imageFile?: Express.Multer.File,
  codesFiles?: Express.Multer.File[]
): Promise<IRewardDocument> => {
  const businessId = new Types.ObjectId(rewardData.businessId as string);
  // 1. Validate Business Existence
  const business = await Business.findById(businessId);

  if (!business) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      REWARD_MESSAGES.BUSINESS_NOT_FOUND
    );
  }

  // 2. Validate Reward Title Uniqueness
  const existingReward = await Reward.findOne({
    business: business?._id,
    title: rewardData.title,
  });
  if (existingReward) {
    throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.ALREADY_EXISTS);
  }

  // 3. Ensure Code Files are provided
  if (!codesFiles || codesFiles.length === 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You must upload a CSV/Excel file containing the reward codes.'
    );
  }

  // 4. Parse Codes First to determine the limit
  const { codes: parsedCodes } = await parseCodesFiles(codesFiles);

  if (!parsedCodes || parsedCodes.length === 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'The uploaded files contain no valid codes.'
    );
  }

  // Calculate the limit from the file
  const calculatedRedemptionLimit = parsedCodes.length ?? 0;

  // 5. Check for global code duplicates in Database
  const rawCodeStrings = parsedCodes.map((c) => c.code);
  const duplicateInDb = await RewardCode.findOne({
    code: { $in: rawCodeStrings },
  });

  if (duplicateInDb) {
    throw new AppError(
      httpStatus.CONFLICT,
      `One or more codes (e.g., ${duplicateInDb.code}) are already in use in another reward.`
    );
  }

  // 6. Handle Image Upload to S3
  let uploadedImageUrl = '';
  if (imageFile) {
    const uploadResult = await uploadToS3({
      buffer: imageFile.buffer,
      key: `reward-online-${Date.now()}`,
      contentType: imageFile.mimetype,
      folder: 'rewards',
    });
    uploadedImageUrl = uploadResult.url;
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 7. Auto-generate Unique RWD Prefix
    const autoPrefix: string = await generateUniqueRWDPrefix();

    // 8. Create the Reward Configuration
    const [reward] = await Reward.create(
      [
        {
          ...rewardData,
          business: businessId,
          type: 'online',
          image: uploadedImageUrl,
          codePrefix: autoPrefix,
          redemptionLimit: calculatedRedemptionLimit,
          remainingCount: calculatedRedemptionLimit,
          redeemedCount: 0,
          pointsCost: STATIC_POINTS_COST,
          isActive: true,
        },
      ],
      { session }
    );

    // 9. Prepare and Bulk Insert Reward Codes
    const codesToInsert = parsedCodes.map((c) => ({
      reward: reward._id,
      business: business?._id,
      code: c.code,
      isGiftCard: c.isGiftCard,
      isDiscountCode: c.isDiscountCode,
      isUsed: false,
    }));

    await RewardCode.insertMany(codesToInsert, { session });

    await session.commitTransaction();

    // 10. Broadcast notification
    broadcastNewReward(reward);

    return reward;
  } catch (error: any) {
    await session.abortTransaction();

    // Cleanup S3 if DB transaction fails
    if (uploadedImageUrl) {
      const key = getS3KeyFromUrl(uploadedImageUrl);
      if (key) await deleteFromS3(key).catch(() => null);
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
 * Update Reward Details and Inventory (Migrated to AWS S3)
 */

const updateReward = async (
  rewardId: string,
  payload: IUpdateRewardPayload,
  userId: string,
  imageFile?: Express.Multer.File,
  codesFiles?: Express.Multer.File[]
): Promise<IRewardDocument> => {
  // 1. Fetch current reward state
  const reward = await Reward.findById(rewardId);
  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  // 2. Validation: Prevent extending an already expired reward
  if (payload.expiryDate && reward.status === 'expired') {
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
      throw new AppError(
        httpStatus.TOO_MANY_REQUESTS,
        REWARD_MESSAGES.UPDATE_COOLDOWN
      );
    }
  }

  // 4. Handle S3 Image Update (Outside the DB Transaction)
  if (imageFile) {
    // A. Delete old image from S3 if it exists
    if (reward.image) {
      const oldKey = getS3KeyFromUrl(reward.image);
      if (oldKey) {
        await deleteFromS3(oldKey).catch((err) =>
          console.error('Failed to delete old reward image from S3:', err)
        );
      }
    }

    // B. Upload new image buffer to S3
    const uploadResult = await uploadToS3({
      buffer: imageFile.buffer,
      key: `reward-${Date.now()}`,
      contentType: imageFile.mimetype,
      folder: 'rewards',
    });
    payload.image = uploadResult.url;
  }

  // Start MongoDB Transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 5. Handle Redemption Limit Increase Logic
    if (payload.redemptionLimit !== undefined) {
      const newLimit = payload.redemptionLimit;
      const currentLimit = reward.redemptionLimit;

      if (newLimit < reward.redeemedCount) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          `${REWARD_MESSAGES.LIMIT_BELOW_REDEEMED}. Minimum required: ${reward.redeemedCount}`
        );
      }

      // CASE: In-Store Limit Increase
      if (newLimit > currentLimit && reward.type === 'in-store') {
        const diff = newLimit - currentLimit;
        const codes = await generateInStoreCodes(reward.codePrefix, diff);

        const newCodes = codes.map((code) => ({
          reward: reward._id,
          business: reward.business,
          code,
          isUsed: false,
        }));

        await RewardCode.insertMany(newCodes, { session });
      }

      // CASE: Online Limit Increase (Processing CSV buffers)
      else if (newLimit > currentLimit && reward.type === 'online') {
        if (!codesFiles || codesFiles.length === 0) {
          throw new AppError(
            httpStatus.BAD_REQUEST,
            'A CSV file with new codes is required to increase the limit for online rewards.'
          );
        }

        const { codes: parsedCodes } = await parseCodesFiles(codesFiles);
        const neededCount = newLimit - currentLimit;

        if (parsedCodes.length < neededCount) {
          throw new AppError(
            httpStatus.BAD_REQUEST,
            `File only contains ${parsedCodes.length} codes, but ${neededCount} are required.`
          );
        }

        const codeStrings = parsedCodes.map((c) => c.code);
        const duplicate = await RewardCode.findOne({
          code: { $in: codeStrings },
        }).session(session);
        if (duplicate) {
          throw new AppError(
            httpStatus.CONFLICT,
            `Code "${duplicate.code}" already exists in the system.`
          );
        }

        const codesToInsert = parsedCodes.slice(0, neededCount).map((c) => ({
          reward: reward._id,
          business: reward.business,
          code: c.code,
          isGiftCard: c.isGiftCard,
          isDiscountCode: c.isDiscountCode,
          isUsed: false,
        }));

        await RewardCode.insertMany(codesToInsert, { session });
      }

      // Record update history
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

    // 6. Update Featured/Priority
    if (payload.featured !== undefined) {
      reward.featured = payload.featured;
      reward.priority = payload.featured ? 10 : 1;
    }

    // 7. Map General Fields
    if (payload.title) reward.title = payload.title;
    if (payload.description) reward.description = payload.description;
    if (payload.image) reward.image = payload.image;
    if (payload.category) reward.category = payload.category;
    if (payload.startDate) reward.startDate = payload.startDate;
    if (payload.expiryDate) reward.expiryDate = payload.expiryDate;
    if (payload.isActive !== undefined) reward.isActive = payload.isActive;

    if (reward?.type === 'in-store' && payload?.inStoreRedemptionMethods) {
      reward.inStoreRedemptionMethods = {
        qrCode: payload?.inStoreRedemptionMethods.qrCode! || false,
        nfcTap: payload?.inStoreRedemptionMethods.nfcTap! || false,
        staticCode: payload?.inStoreRedemptionMethods.staticCode! || false,
      };
    }
    if (reward?.type === 'online' && payload?.onlineRedemptionMethods) {
      reward.onlineRedemptionMethods = {
        giftCard: payload?.onlineRedemptionMethods.giftCard! || false,
        discountCode: payload?.onlineRedemptionMethods.discountCode! || false,
      };
    }

    // 8. Finalize Save and Status
    await reward.save({ session });
    await reward.updateStatus();

    // 9. Commit Transaction
    await session.commitTransaction();

    const updatedReward = await Reward.findById(reward._id)
      .populate('business', 'name category coverImage locations')
      .lean();

    return updatedReward as unknown as IRewardDocument;
  } catch (error: any) {
    // Abort on any failure
    await session.abortTransaction();
    throw error;
  } finally {
    // Cleanly close the session
    await session.endSession();
  }
};

/**
 * Update Reward Image only (Migrated to AWS S3)
 */
const updateRewardImage = async (
  rewardId: string,
  imageFile: Express.Multer.File
): Promise<IRewardDocument> => {
  // 1. Check if reward exists
  const reward = await Reward.findById(rewardId);
  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  // 2. Cleanup: Delete the old image from S3 if it exists
  if (reward.image) {
    const oldKey = getS3KeyFromUrl(reward.image);
    if (oldKey) {
      await deleteFromS3(oldKey).catch((err) =>
        console.error('Failed to delete old reward image from S3:', err)
      );
    }
  }

  const uploadResult = await uploadToS3({
    buffer: imageFile.buffer,
    key: `reward-${rewardId}-${Date.now()}`,
    contentType: imageFile.mimetype,
    folder: 'rewards',
  });

  // 4. Update the database with the new AWS S3 URL
  reward.image = uploadResult.url;
  await reward.save();

  // 5. Return the updated and populated document
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
    if (client) {
      await ViewReward.create({ user: client.auth, reward: rewardId });
    }
  }

  let userCanAfford = false;
  let userBalance = 0;
  let hasAlreadyClaimed = false;
  let existingClaimId: Types.ObjectId | undefined;
  let claimDetails = null;

  if (userId) {
    const client = await Client.findOne({ auth: userId });
    try {
      const [balance, existingClaim] = await Promise.all([
        pointsServices.getUserBalance(client!._id.toString()),
        RewardRedemption.findOne({
          user: client?._id,
          reward: rewardId,
          status: { $in: ['claimed', 'redeemed'] },
        }),
      ]);

      userBalance = balance.currentBalance;
      userCanAfford = balance.canAfford(STATIC_POINTS_COST);
      if (existingClaim) {
        hasAlreadyClaimed = true;
        claimDetails = existingClaim;
        existingClaimId = existingClaim._id;
      }
    } catch (err) {
      console.log(err);

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
    claimDetails,
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

const deleteReward = async (
  rewardId: string,
  userId: string
): Promise<IHardDeleteResult> => {
  // 1. Find the reward
  const reward = await Reward.findById(rewardId);

  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  // 2. Check if reward is active
  if (reward.isActive) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      REWARD_MESSAGES.CANNOT_DELETE_ACTIVE
    );
  }

  // 3. Check for active claims (claimed but not yet redeemed/expired/cancelled)
  const activeClaimsCount = await RewardRedemption.countDocuments({
    reward: rewardId,
    status: 'claimed',
    expiresAt: { $gt: new Date() },
  });

  if (activeClaimsCount > 0) {
    throw new AppError(
      httpStatus.CONFLICT,
      `${
        REWARD_MESSAGES.CANNOT_DELETE_WITH_ACTIVE_CLAIMS
      } (${activeClaimsCount} active claim${
        activeClaimsCount > 1 ? 's' : ''
      } remaining)`
    );
  }

  // 4. Start transaction for atomic deletion
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 5. Delete all RewardCodes for this reward
    const codesResult = await RewardCode.deleteMany(
      { reward: reward._id },
      { session }
    );

    // 6. Delete all ViewRewards for this reward
    const viewsResult = await ViewReward.deleteMany(
      { reward: reward._id },
      { session }
    );

    // 7. Hide all RewardRedemptions (keep for audit, but hide from user)
    const redemptionsResult = await RewardRedemption.updateMany(
      { reward: reward._id },
      {
        $set: {
          isHidden: true,
          hiddenAt: new Date(),
          hiddenReason: 'Reward deleted',
        },
      },
      { session }
    );

    // 8. Store reward info before deletion
    const deletedRewardInfo = {
      id: reward._id.toString(),
      title: reward.title,
    };

    // 9. Delete the reward document
    await Reward.findByIdAndDelete(rewardId).session(session);

    // 10. Commit transaction
    await session.commitTransaction();

    // 11. Cleanup S3 image (outside transaction - fire and forget)
    if (reward.image) {
      const s3Key = getS3KeyFromUrl(reward.image);
      if (s3Key) {
        deleteFromS3(s3Key).catch((err) =>
          console.error('Failed to delete reward image from S3:', err)
        );
      }
    }

    return {
      success: true,
      deletedReward: deletedRewardInfo,
      cleanup: {
        codesDeleted: codesResult.deletedCount,
        viewsDeleted: viewsResult.deletedCount,
        redemptionsHidden: redemptionsResult.modifiedCount,
      },
    };
  } catch (error: any) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const deleteRewardImage = async (rewardId: string, userId: string) => {
  // 1. Find the reward
  const reward = await Reward.findById(rewardId);

  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  try {
    if (reward.image) {
      const s3Key = getS3KeyFromUrl(reward.image);
      if (s3Key) {
        deleteFromS3(s3Key).catch((err) =>
          console.error('Failed to delete reward image from S3:', err)
        );
      }
    }

    reward.image = '';
    await reward.save();

    return reward;
  } catch (error: any) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Check if reward can be deleted
 * Useful for frontend to show/hide delete button or show warning
 */
const canDeleteReward = async (
  rewardId: string
): Promise<{
  canDelete: boolean;
  reason?: string;
  activeClaimsCount?: number;
}> => {
  const reward = await Reward.findById(rewardId);

  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  if (reward.isActive) {
    return {
      canDelete: false,
      reason: 'Reward is still active. Deactivate it first.',
    };
  }

  const activeClaimsCount = await RewardRedemption.countDocuments({
    reward: rewardId,
    status: 'claimed',
    expiresAt: { $gt: new Date() },
  });

  if (activeClaimsCount > 0) {
    return {
      canDelete: false,
      reason: `${activeClaimsCount} active claim${
        activeClaimsCount > 1 ? 's' : ''
      } pending. Wait for redemption or expiry.`,
      activeClaimsCount,
    };
  }

  return { canDelete: true };
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
          isHidden: { $ne: true },
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
  const reward = await Reward.findById(rewardId).select(
    'name description inStoreRedemptionMethods  onlineRedemptionMethods image isActive status'
  );

  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, 'Reward not found!');
  }

  const redeemtions = new QueryBuilder(
    RewardRedemption.find({
      reward: reward?._id,
      isHidden: { $ne: true },
    }).populate({
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
  canDeleteReward,
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
  createOnlineReward,
  deleteRewardImage,
};
