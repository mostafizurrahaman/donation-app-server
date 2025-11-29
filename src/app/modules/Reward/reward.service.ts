// src/app/modules/Reward/reward.service.ts

import { Types, ClientSession } from 'mongoose';
import mongoose from 'mongoose';
import crypto from 'crypto';
import httpStatus from 'http-status';

import { Reward } from './reward.model';
import { RewardRedemption } from '../RewardRedeemtion/rewardRedemption.model';
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
} from './reward.constant';

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
    const code = crypto.randomBytes(6).toString('hex').toUpperCase();
    if (!generatedSet.has(code)) {
      generatedSet.add(code);
      codes.push(code);
    }
  }

  return codes;
};

/**
 * Parse a single codes file and extract codes
 */
const parseSingleCodesFile = async (
  file: Express.Multer.File
): Promise<IParsedCodeFromCSV[]> => {
  try {
    const content = file.buffer.toString('utf-8');

    const lines = content.split(/\r?\n/).filter((line) => line.trim());

    if (lines.length === 0) {
      return [];
    }

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
  } catch (error) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Failed to parse file: ${file.originalname}`
    );
  }
};

/**
 * Parse multiple codes files and combine codes
 */
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

    if (parsedCodes.length > 0) {
      filesProcessed++;
    }
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

/**
 * Create a new reward
 */
const createReward = async (
  rewardData: ICreateRewardPayload,
  imageFile?: Express.Multer.File,
  codesFiles?: Express.Multer.File[]
): Promise<IRewardDocument> => {
  const businessId = new Types.ObjectId(rewardData.businessId as string);

  // Verify business exists
  const business = await Business.findById(businessId);
  if (!business) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      REWARD_MESSAGES.BUSINESS_NOT_FOUND
    );
  }

  // Check for duplicate title
  const existingReward = await Reward.findOne({
    business: businessId,
    title: rewardData.title,
  });

  if (existingReward) {
    throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.ALREADY_EXISTS);
  }

  // Validate dates
  if (rewardData.expiryDate && rewardData.startDate) {
    if (new Date(rewardData.expiryDate) <= new Date(rewardData.startDate)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        REWARD_MESSAGES.EXPIRY_BEFORE_START
      );
    }
  }

  // Validate redemption methods
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

  // Handle image upload
  let imageUrl: string | undefined = rewardData.image;
  if (imageFile) {
    imageUrl = getFileUrl(imageFile);
  }

  // Process codes based on reward type
  let generatedCodes: Array<{
    code: string;
    isGiftCard: boolean;
    isDiscountCode: boolean;
    isUsed: boolean;
  }> = [];

  let redemptionLimit = rewardData.redemptionLimit;

  if (rewardData.type === 'in-store') {
    // Generate codes equal to redemption limit
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

    // Check code uniqueness across business
    const isUnique = await Reward.checkCodeUniqueness(
      businessId,
      parsedCodes.map((c) => c.code)
    );

    if (!isUnique) {
      throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.DUPLICATE_CODES);
    }

    // If redemptionLimit not provided, use codes count
    if (!redemptionLimit) {
      redemptionLimit = parsedCodes.length;
    }

    // Validate codes count matches limit
    if (parsedCodes.length < redemptionLimit) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `${REWARD_MESSAGES.LIMIT_EXCEEDS_CODES}. Uploaded: ${parsedCodes.length}, Required: ${redemptionLimit}`
      );
    }

    // Use only needed codes
    generatedCodes = parsedCodes.slice(0, redemptionLimit).map((c) => ({
      code: c.code,
      isGiftCard: c.isGiftCard,
      isDiscountCode: c.isDiscountCode,
      isUsed: false,
    }));
  }

  // Create reward
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
    terms: rewardData.terms,
    featured: rewardData.featured || false,
    priority: rewardData.featured ? 10 : 1,
    isActive: true,
    views: 0,
    redemptions: 0,
  });

  return reward.populate('business', 'name category coverImage');
};

/**
 * Update a reward
 */
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

  // Check for expired reward extension
  if (payload.expiryDate && reward.status === 'expired') {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      REWARD_MESSAGES.CANNOT_EXTEND_EXPIRED
    );
  }

  // Handle image update
  if (imageFile) {
    // Delete old image if it exists and is a local file
    if (reward.image && reward.image.startsWith('/')) {
      deleteFile(`public${reward.image}`);
    }
    payload.image = getFileUrl(imageFile);
  }

  // Handle additional codes for online rewards
  if (codesFiles && codesFiles.length > 0 && reward.type === 'online') {
    const { codes: newParsedCodes } = await parseCodesFiles(codesFiles);

    // Check for duplicates within this reward
    const existingCodes = new Set(reward.codes.map((c) => c.code));
    const uniqueNewCodes = newParsedCodes.filter(
      (c) => !existingCodes.has(c.code)
    );

    if (uniqueNewCodes.length > 0) {
      // Check for duplicates across business
      const isUnique = await Reward.checkCodeUniqueness(
        reward.business,
        uniqueNewCodes.map((c) => c.code),
        reward._id
      );

      if (!isUnique) {
        throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.DUPLICATE_CODES);
      }

      // Add new codes
      const codesToAdd = uniqueNewCodes.map((c) => ({
        code: c.code,
        isGiftCard: c.isGiftCard,
        isDiscountCode: c.isDiscountCode,
        isUsed: false,
      }));

      reward.codes.push(...codesToAdd);
      reward.redemptionLimit += uniqueNewCodes.length;
      reward.remainingCount += uniqueNewCodes.length;

      // Reactivate if was sold out
      if (reward.status === 'sold-out') {
        reward.status = 'active';
      }
    }
  }

  // Handle redemption limit update
  if (payload.redemptionLimit !== undefined) {
    const newLimit = payload.redemptionLimit;
    const currentRedeemed = reward.redeemedCount;

    // Check cooldown period
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

    // Validate new limit
    if (newLimit < currentRedeemed) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `${REWARD_MESSAGES.LIMIT_BELOW_REDEEMED}. Minimum: ${currentRedeemed}`
      );
    }

    // For online rewards, check available codes
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

    // For in-store rewards, generate additional codes if increasing limit
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

    // Log the change
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

    // Update status
    if (reward.remainingCount === 0) {
      reward.status = 'sold-out';
    } else if (reward.status === 'sold-out' && reward.remainingCount > 0) {
      reward.status = 'active';
    }
  }

  // Update other fields
  if (payload.title !== undefined) reward.title = payload.title;
  if (payload.description !== undefined)
    reward.description = payload.description;
  if (payload.image !== undefined) reward.image = payload.image;
  if (payload.category !== undefined) reward.category = payload.category;
  if (payload.startDate !== undefined) reward.startDate = payload.startDate;
  if (payload.expiryDate !== undefined) reward.expiryDate = payload.expiryDate;
  if (payload.terms !== undefined) reward.terms = payload.terms;
  if (payload.featured !== undefined) {
    reward.featured = payload.featured;
    reward.priority = payload.featured ? 10 : 1;
  }
  if (payload.isActive !== undefined) reward.isActive = payload.isActive;

  // Update redemption methods
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

/**
 * Update reward image only
 */
const updateRewardImage = async (
  rewardId: string,
  imageFile: Express.Multer.File,
  userId: string
): Promise<IRewardDocument> => {
  const reward = await Reward.findById(rewardId);

  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  // Delete old image if it exists and is a local file
  if (reward.image && reward.image.startsWith('/')) {
    deleteFile(`public${reward.image}`);
  }

  reward.image = getFileUrl(imageFile);
  await reward.save();

  return reward.populate('business', 'name category coverImage');
};

/**
 * Get reward by ID
 */
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

  // Increment views (non-blocking)
  reward.incrementViews().catch(console.error);

  // Check user-specific data
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

  // Build response (hide codes)
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

/**
 * Get claimed reward by ID
 */
const getClaimedRewardById = async (
  redemptionId: string,
  userId: string
): Promise<IRewardRedemptionDocument> => {
  const redemption = await RewardRedemption.findOne({
    _id: redemptionId,
    user: userId,
  })
    .populate('reward', 'title description image type category pointsCost terms')
    .populate('business', 'name locations coverImage');

  if (!redemption) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.CLAIM_NOT_FOUND);
  }

  return redemption;
};

/**
 * Get rewards with filters
 */
const getRewards = async (
  query: IRewardFilterQuery
): Promise<IRewardsListResult> => {
  const {
    businessId,
    type,
    category,
    status,
    featured,
    userId,
    search,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = query;

  const filter: Record<string, unknown> = {};

  if (businessId) filter.business = new Types.ObjectId(businessId as string);
  if (type) filter.type = type;
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (featured !== undefined) filter.featured = featured;

  if (search) {
    filter.$text = { $search: search };
  }

  const skip = (page - 1) * limit;
  const sort: Record<string, 1 | -1> = {
    [sortBy]: sortOrder === 'asc' ? 1 : -1,
  };

  if (featured) {
    sort.priority = -1;
    sort.createdAt = -1;
  }

  const [rewards, total] = await Promise.all([
    Reward.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('business', 'name category coverImage locations')
      .select('-codes')
      .lean(),
    Reward.countDocuments(filter),
  ]);

  // Get user-specific data
  let userBalance = 0;
  const userClaims = new Map<string, string>();

  if (userId) {
    try {
      const [balance, claims] = await Promise.all([
        pointsServices.getUserBalance(userId as string),
        RewardRedemption.find({
          user: userId,
          reward: { $in: rewards.map((r) => r._id) },
          status: { $in: ['claimed', 'redeemed'] },
        }).select('reward status'),
      ]);

      userBalance = balance.currentBalance;
      claims.forEach(
        (claim: { reward: { toString: () => string }; status: string }) => {
          userClaims.set(claim.reward.toString(), claim.status);
        }
      );
    } catch {
      userBalance = 0;
    }
  }

  const rewardsWithAvailability = rewards.map((reward) => ({
    ...reward,
    isAvailable:
      reward.isActive &&
      reward.remainingCount > 0 &&
      new Date() >= new Date(reward.startDate) &&
      (!reward.expiryDate || new Date() <= new Date(reward.expiryDate)),
    userCanAfford: userId ? userBalance >= STATIC_POINTS_COST : undefined,
    claimStatus: userId
      ? userClaims.get((reward._id as Types.ObjectId).toString())
      : undefined,
  }));

  return {
    rewards: rewardsWithAvailability,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

/**
 * Get rewards by business
 */
const getRewardsByBusiness = async (
  businessId: string,
  query: IRewardFilterQuery
): Promise<IRewardsListResult> => {
  return getRewards({ ...query, businessId });
};

/**
 * Delete reward (soft delete)
 */
const deleteReward = async (rewardId: string): Promise<void> => {
  const reward = await Reward.findById(rewardId);

  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  reward.isActive = false;
  reward.status = REWARD_STATUS.INACTIVE;
  await reward.save();
};

/**
 * Archive reward (hard delete)
 */
const archiveReward = async (rewardId: string): Promise<void> => {
  const reward = await Reward.findByIdAndDelete(rewardId);

  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  // Delete image if it's a local file
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
  const { rewardId, userId, preferredCodeType, idempotencyKey } = payload;

  // Check for existing claim (idempotency)
  if (idempotencyKey) {
    const existingByKey = await RewardRedemption.findOne({ idempotencyKey });
    if (existingByKey) {
      return {
        redemption: existingByKey,
        message: 'Reward already claimed',
        isRetry: true,
        code: existingByKey.assignedCode,
        qrCode: existingByKey.qrCode,
      };
    }
  }

  // Check if user already claimed this reward
  const existingUserClaim = await RewardRedemption.findOne({
    user: userId,
    reward: rewardId,
    status: { $in: ['claimed', 'redeemed'] },
  });

  if (existingUserClaim) {
    throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.ALREADY_CLAIMED);
  }

  const session: ClientSession = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Atomic reward availability check and stock decrement
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
        $inc: {
          remainingCount: -1,
          redeemedCount: 1,
          redemptions: 1,
        },
      },
      {
        new: true,
        session,
        runValidators: true,
      }
    );

    if (!reward) {
      throw new AppError(httpStatus.GONE, REWARD_MESSAGES.RACE_CONDITION);
    }

    // 2. Atomic points deduction
    const pointsBalance = await PointsBalance.findOneAndUpdate(
      {
        user: userId,
        currentBalance: { $gte: STATIC_POINTS_COST },
      },
      {
        $inc: {
          currentBalance: -STATIC_POINTS_COST,
          totalSpent: STATIC_POINTS_COST,
        },
        $set: {
          lastTransactionAt: new Date(),
        },
      },
      {
        session,
        new: true,
      }
    );

    if (!pointsBalance) {
      throw new AppError(
        httpStatus.PAYMENT_REQUIRED,
        REWARD_MESSAGES.INSUFFICIENT_POINTS
      );
    }

    // 3. Get available code
    let assignedCode: string | undefined;
    let codeType: 'discount' | 'giftcard' | 'static' | 'qr' | 'nfc' | undefined;

    if (reward.codes.length > 0) {
      let availableCode = reward.getAvailableCode(preferredCodeType);

      if (!availableCode && preferredCodeType) {
        const fallbackType =
          preferredCodeType === 'discount' ? 'giftcard' : 'discount';
        availableCode = reward.getAvailableCode(fallbackType);
      }

      if (!availableCode) {
        availableCode = reward.getAvailableCode();
      }

      if (availableCode) {
        assignedCode = availableCode.code;
        codeType = availableCode.isGiftCard
          ? 'giftcard'
          : availableCode.isDiscountCode
            ? 'discount'
            : reward.type === 'in-store'
              ? 'static'
              : undefined;
      }
    }

    // 4. Create redemption record
    const expiresAt = new Date(
      Date.now() + CLAIM_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    const [redemption] = await RewardRedemption.create(
      [
        {
          user: userId,
          reward: rewardId,
          business: reward.business,
          pointsSpent: STATIC_POINTS_COST,
          status: 'claimed',
          assignedCode,
          codeType,
          idempotencyKey,
          expiresAt,
        },
      ],
      { session }
    );

    // 5. Generate QR code for in-store rewards
    if (reward.type === 'in-store') {
      await redemption.generateQRCode();
    }

    // 6. Mark code as used
    if (assignedCode) {
      await reward.markCodeAsUsed(
        assignedCode,
        new Types.ObjectId(userId),
        redemption._id as Types.ObjectId
      );
    }

    // 7. Update reward status if sold out
    if (reward.remainingCount <= 0) {
      reward.status = 'sold-out';
      await reward.save({ session });
    }

    // 8. Create points transaction record
    await pointsServices.createPointsTransaction({
      userId,
      transactionType: 'spent',
      amount: STATIC_POINTS_COST,
      source: 'reward_redemption',
      rewardRedemptionId: redemption._id.toString(),
      description: `Claimed reward: ${reward.title}`,
      metadata: {
        rewardId: reward._id.toString(),
        rewardTitle: reward.title,
        businessId: reward.business.toString(),
      },
    });

    await session.commitTransaction();

    // Populate for response
    await redemption.populate([
      { path: 'reward', select: 'title description image type category terms' },
      { path: 'business', select: 'name locations' },
    ]);

    return {
      redemption,
      message: REWARD_MESSAGES.CLAIMED,
      code: assignedCode,
      qrCode: redemption.qrCode,
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

  const redemption = await RewardRedemption.findOne({
    _id: redemptionId,
    user: userId,
    status: 'claimed',
  }).populate('reward');

  if (!redemption) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.CLAIM_NOT_FOUND);
  }

  // Check cancellation window
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
    // 1. Refund points
    const refundTransaction = await pointsServices.refundPoints(
      userId,
      redemption.pointsSpent,
      'reward_redemption',
      reason || 'Reward claim cancelled',
      redemptionId
    );

    // 2. Return code to pool if assigned
    if (redemption.assignedCode) {
      const reward = await Reward.findById(redemption.reward).session(session);
      if (reward) {
        await reward.returnCode(redemption.assignedCode);

        // Update reward counts
        reward.remainingCount += 1;
        reward.redeemedCount = Math.max(0, reward.redeemedCount - 1);
        reward.redemptions = Math.max(0, reward.redemptions - 1);

        if (reward.status === 'sold-out' && reward.remainingCount > 0) {
          reward.status = 'active';
        }

        await reward.save({ session });
      }
    }

    // 3. Update redemption status
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
 * Mark reward as redeemed (used at store/online)
 */
const redeemReward = async (
  payload: IRedeemRewardPayload
): Promise<IRewardRedemptionDocument> => {
  const { redemptionId, staffId, location, notes } = payload;

  const redemption = await RewardRedemption.findById(redemptionId);

  if (!redemption) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      REWARD_MESSAGES.REDEMPTION_NOT_FOUND
    );
  }

  if (redemption.status === 'redeemed') {
    throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.ALREADY_REDEEMED);
  }

  if (redemption.status !== 'claimed') {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      REWARD_MESSAGES.CANNOT_REDEEM_NON_CLAIMED
    );
  }

  // Check if expired
  if (new Date() > redemption.expiresAt) {
    redemption.status = 'expired';
    redemption.expiredAt = new Date();
    await redemption.save();
    throw new AppError(httpStatus.GONE, REWARD_MESSAGES.CLAIM_EXPIRED);
  }

  redemption.status = 'redeemed';
  redemption.redeemedAt = new Date();
  if (staffId) redemption.redeemedByStaff = new Types.ObjectId(staffId);
  if (location) redemption.redemptionLocation = location;
  if (notes) redemption.redemptionNotes = notes;

  await redemption.save();

  return redemption.populate([
    { path: 'reward', select: 'title description image type category' },
    { path: 'business', select: 'name locations' },
  ]);
};

/**
 * Get user's claimed rewards
 */
const getUserClaimedRewards = async (
  userId: string,
  options: { includeExpired?: boolean; page?: number; limit?: number } = {}
): Promise<{ redemptions: IRewardRedemptionDocument[]; total: number }> => {
  const { includeExpired = false, page = 1, limit = 20 } = options;

  const filter: Record<string, unknown> = {
    user: userId,
  };

  if (includeExpired) {
    filter.status = { $ne: 'cancelled' };
  } else {
    filter.status = 'claimed';
    filter.expiresAt = { $gt: new Date() };
  }

  const skip = (page - 1) * limit;

  const [redemptions, total] = await Promise.all([
    RewardRedemption.find(filter)
      .populate(
        'reward',
        'title description image type category pointsCost terms'
      )
      .populate('business', 'name locations coverImage')
      .sort('-claimedAt')
      .skip(skip)
      .limit(limit),
    RewardRedemption.countDocuments(filter),
  ]);

  return { redemptions, total };
};

/**
 * Check reward availability
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

  // Basic availability checks
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

  // User-specific checks
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

// ==========================================
// CODE MANAGEMENT
// ==========================================

/**
 * Upload codes to reward (supports multiple files)
 */
const uploadCodesToReward = async (
  rewardId: string,
  codesFiles: Express.Multer.File[]
): Promise<{
  reward: IRewardDocument;
  codesAdded: number;
  codesDuplicated: number;
  filesProcessed: number;
}> => {
  const reward = await Reward.findById(rewardId);

  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  if (reward.type !== 'online') {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Codes can only be uploaded to online rewards'
    );
  }

  const { codes: parsedCodes, filesProcessed } =
    await parseCodesFiles(codesFiles);

  // Check for duplicates within this reward
  const existingCodes = new Set(reward.codes.map((c) => c.code));
  const newCodes = parsedCodes.filter((c) => !existingCodes.has(c.code));

  if (newCodes.length === 0) {
    throw new AppError(
      httpStatus.CONFLICT,
      'All codes already exist in this reward'
    );
  }

  // Check for duplicates across business
  const isUnique = await Reward.checkCodeUniqueness(
    reward.business,
    newCodes.map((c) => c.code),
    reward._id
  );

  if (!isUnique) {
    throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.DUPLICATE_CODES);
  }

  // Add new codes
  const codesToAdd = newCodes.map((c) => ({
    code: c.code,
    isGiftCard: c.isGiftCard,
    isDiscountCode: c.isDiscountCode,
    isUsed: false,
  }));

  reward.codes.push(...codesToAdd);
  reward.redemptionLimit += newCodes.length;
  reward.remainingCount += newCodes.length;

  // Reactivate if was sold out
  if (reward.status === 'sold-out') {
    reward.status = 'active';
  }

  await reward.save();

  return {
    reward,
    codesAdded: newCodes.length,
    codesDuplicated: parsedCodes.length - newCodes.length,
    filesProcessed,
  };
};

// ==========================================
// EXPIRATION HANDLING (FULL USER-FRIENDLY)
// ==========================================

/**
 * Result interface for expiration job
 */
interface IExpireClaimsResult {
  totalProcessed: number;
  expiredCount: number;
  codesReturned: number;
  pointsRefunded: number;
  stockRestored: number;
  errors: Array<{ claimId: string; error: string }>;
}

/**
 * Expire old claims with full restoration
 * - Updates status to 'expired'
 * - Returns codes to pool
 * - Restores reward stock
 * - Refunds points to user
 */
const expireOldClaimsWithFullRestoration = async (): Promise<IExpireClaimsResult> => {
  const now = new Date();
  const result: IExpireClaimsResult = {
    totalProcessed: 0,
    expiredCount: 0,
    codesReturned: 0,
    pointsRefunded: 0,
    stockRestored: 0,
    errors: [],
  };

  // Find all expired claims that haven't been processed
  const expiredClaims = await RewardRedemption.find({
    status: 'claimed',
    expiresAt: { $lte: now },
  });

  result.totalProcessed = expiredClaims.length;

  if (expiredClaims.length === 0) {
    return result;
  }

  console.log(`[EXPIRATION] Processing ${expiredClaims.length} expired claims...`);

  for (const claim of expiredClaims) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Update claim status
      claim.status = 'expired';
      claim.expiredAt = now;
      await claim.save({ session });

      // 2. Return code to pool and restore stock
      if (claim.assignedCode) {
        const reward = await Reward.findById(claim.reward).session(session);
        
        if (reward) {
          // Return the code
          const codeIndex = reward.codes.findIndex(
            (c) => c.code === claim.assignedCode && c.isUsed
          );

          if (codeIndex !== -1) {
            reward.codes[codeIndex].isUsed = false;
            reward.codes[codeIndex].usedBy = undefined;
            reward.codes[codeIndex].usedAt = undefined;
            reward.codes[codeIndex].redemptionId = undefined;
            result.codesReturned++;
          }

          // Restore stock
          reward.remainingCount += 1;
          reward.redeemedCount = Math.max(0, reward.redeemedCount - 1);
          reward.redemptions = Math.max(0, reward.redemptions - 1);
          result.stockRestored++;

          // Reactivate reward if it was sold out
          if (reward.status === 'sold-out' && reward.remainingCount > 0) {
            // Check if reward hasn't expired
            if (!reward.expiryDate || reward.expiryDate > now) {
              reward.status = 'active';
            }
          }

          await reward.save({ session });
        }
      }

      // 3. Refund points to user
      try {
        const refundResult = await pointsServices.refundPoints(
          claim.user.toString(),
          claim.pointsSpent,
          'claim_expired',
          `Reward claim expired - automatic refund for claim ${claim._id}`,
          claim._id.toString()
        );

        if (refundResult && refundResult.transaction) {
          claim.refundTransactionId = refundResult.transaction._id as Types.ObjectId;
          await claim.save({ session });
          result.pointsRefunded += claim.pointsSpent;
        }
      } catch (refundError) {
        // Log refund error but continue with expiration
        console.error(
          `[EXPIRATION] Failed to refund points for claim ${claim._id}:`,
          refundError
        );
        // Still mark as expired even if refund fails
        // The refund can be manually processed later
      }

      await session.commitTransaction();
      result.expiredCount++;

      console.log(
        `[EXPIRATION] Expired claim ${claim._id} - Code returned: ${!!claim.assignedCode}, Points refunded: ${claim.pointsSpent}`
      );
    } catch (error) {
      await session.abortTransaction();
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({
        claimId: claim._id.toString(),
        error: errorMessage,
      });
      
      console.error(
        `[EXPIRATION] Failed to expire claim ${claim._id}:`,
        error
      );
    } finally {
      session.endSession();
    }
  }

  console.log(
    `[EXPIRATION] Completed - Expired: ${result.expiredCount}, Codes returned: ${result.codesReturned}, Points refunded: ${result.pointsRefunded}, Errors: ${result.errors.length}`
  );

  return result;
};

/**
 * Notify users about expiring claims (optional - for email/push notifications)
 * Claims expiring within specified hours
 */
const getExpiringClaims = async (
  hoursUntilExpiry: number = 24
): Promise<IRewardRedemptionDocument[]> => {
  const now = new Date();
  const expiryThreshold = new Date(now.getTime() + hoursUntilExpiry * 60 * 60 * 1000);

  return RewardRedemption.find({
    status: 'claimed',
    expiresAt: {
      $gt: now,
      $lte: expiryThreshold,
    },
  })
    .populate('user', 'name email')
    .populate('reward', 'title')
    .populate('business', 'name');
};

/**
 * Get expiration summary for a user
 */
const getUserExpirationSummary = async (
  userId: string
): Promise<{
  expiringIn24Hours: number;
  expiringIn7Days: number;
  totalActive: number;
}> => {
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

  return {
    expiringIn24Hours,
    expiringIn7Days,
    totalActive,
  };
};

// ==========================================
// STATISTICS & ANALYTICS
// ==========================================

/**
 * Get reward statistics
 */
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

/**
 * Update expired rewards (cron job)
 */
const updateExpiredRewards = async (): Promise<number> => {
  const now = new Date();

  const result = await Reward.updateMany(
    {
      expiryDate: { $lte: now },
      status: { $ne: REWARD_STATUS.EXPIRED },
      isActive: true,
    },
    {
      $set: { status: REWARD_STATUS.EXPIRED },
    }
  );

  return result.modifiedCount;
};

/**
 * Update upcoming rewards to active (cron job)
 */
const updateUpcomingRewards = async (): Promise<number> => {
  const now = new Date();

  const result = await Reward.updateMany(
    {
      startDate: { $lte: now },
      status: REWARD_STATUS.UPCOMING,
      isActive: true,
      remainingCount: { $gt: 0 },
    },
    {
      $set: { status: REWARD_STATUS.ACTIVE },
    }
  );

  return result.modifiedCount;
};

// ==========================================
// EXPORT SERVICE
// ==========================================

export const rewardService = {
  // CRUD
  createReward,
  updateReward,
  updateRewardImage,
  getRewardById,
  getClaimedRewardById,
  getRewards,
  getRewardsByBusiness,
  deleteReward,
  archiveReward,

  // Claiming & Redemption
  claimReward,
  cancelClaimedReward,
  redeemReward,
  getUserClaimedRewards,
  checkAvailability,

  // Code Management
  uploadCodesToReward,

  // Expiration Handling (Full User-Friendly)
  expireOldClaimsWithFullRestoration,
  getExpiringClaims,
  getUserExpirationSummary,

  // Statistics & Cron Jobs
  getRewardStatistics,
  updateExpiredRewards,
  updateUpcomingRewards,
};