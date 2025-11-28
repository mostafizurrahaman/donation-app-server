// src/app/modules/Reward/reward.service.ts
import { Types } from 'mongoose';
import crypto from 'crypto';
import { Reward } from './reward.model';
import Business from '../Business/business.model';
import { pointsServices } from '../Points/points.service';
import {
  ICreateRewardPayload,
  IUpdateRewardPayload,
  IRewardFilterQuery,
  IRewardStatistics,
  IRewardAvailability,
  IParsedCodeFromCSV,
  IRewardDocument,
} from './reward.interface';
import {
  REWARD_MESSAGES,
  REWARD_STATUS,
  STATIC_POINTS_COST,
  CODES_TO_GENERATE_FOR_INSTORE,
} from './reward.constant';
import httpStatus from 'http-status';
import { AppError } from '../../utils';

/**
 * Generate unique codes for in-store rewards
 */
const generateInStoreCodes = (count: number): string[] => {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Generate unique alphanumeric code (12 characters)
    const code = crypto.randomBytes(6).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;
};

/**
 * Parse CSV/XLSX file and extract codes
 */
const parseCodesFile = async (
  file: Express.Multer.File
): Promise<IParsedCodeFromCSV[]> => {
  try {
    // Parse CSV file manually
    const content = file.buffer.toString('utf-8');
    const lines = content.split(/\r?\n/).filter((line) => line.trim());

    if (lines.length === 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        REWARD_MESSAGES.INVALID_CSV_FORMAT
      );
    }

    // Get header row
    const header = lines[0].toLowerCase();
    const hasHeader =
      header.includes('code') ||
      header.includes('value') ||
      header.includes('url');

    const dataLines = hasHeader ? lines.slice(1) : lines;

    // Parse codes from data
    const parsedCodes: IParsedCodeFromCSV[] = [];

    for (const line of dataLines) {
      const values = line.split(',').map((v) => v.trim().replace(/"/g, ''));
      const codeValue = values[0];

      if (!codeValue) continue;

      const isURLPattern = /^https?:\/\//i.test(codeValue);

      parsedCodes.push({
        code: codeValue,
        isGiftCard: isURLPattern,
        isDiscountCode: !isURLPattern,
      });
    }

    if (parsedCodes.length === 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'No valid codes found in file'
      );
    }

    return parsedCodes;
  } catch (error) {
    console.error('Error parsing file:', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Failed to parse file. Please ensure it contains valid codes'
    );
  }
};

/**
 * Create a new reward with optional codes upload
 */
const createReward = async (
  rewardData: ICreateRewardPayload,
  codesFile?: Express.Multer.File
): Promise<IRewardDocument> => {
  const businessId = new Types.ObjectId(rewardData.businessId as string);

  // Verify business exists
  const business = await Business.findById(businessId);
  if (!business) {
    throw new AppError(httpStatus.NOT_FOUND, 'Business not found');
  }

  // Check for duplicate title within same business
  const existingReward = await Reward.findOne({
    business: businessId,
    title: rewardData.title,
  });

  if (existingReward) {
    throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.ALREADY_EXISTS);
  }

  // Validate redemption methods match type
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

  // Process codes
  let generatedCodes: Array<{
    code: string;
    isGiftCard: boolean;
    isDiscountCode: boolean;
    isUsed: boolean;
  }> = [];
  let redemptionLimit =
    rewardData.redemptionLimit || CODES_TO_GENERATE_FOR_INSTORE;

  if (rewardData.type === 'in-store') {
    // Generate codes for in-store rewards
    const codeStrings = generateInStoreCodes(CODES_TO_GENERATE_FOR_INSTORE);
    generatedCodes = codeStrings.map((code) => ({
      code,
      isGiftCard: false,
      isDiscountCode: false,
      isUsed: false,
    }));
  } else if (rewardData.type === 'online' && codesFile) {
    // Parse codes from file for online rewards
    const parsedCodes = await parseCodesFile(codesFile);

    // Validate codes match redemption methods
    const hasDiscountCodes = parsedCodes.some(
      (c: IParsedCodeFromCSV) => c.isDiscountCode
    );
    const hasGiftCards = parsedCodes.some(
      (c: IParsedCodeFromCSV) => c.isGiftCard
    );

    if (hasDiscountCodes && !rewardData.onlineRedemptionMethods?.discountCode) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Discount codes uploaded but discount code redemption method not enabled'
      );
    }

    if (hasGiftCards && !rewardData.onlineRedemptionMethods?.giftCard) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Gift card URLs uploaded but gift card redemption method not enabled'
      );
    }

    // Use uploaded codes
    generatedCodes = parsedCodes.map((c: IParsedCodeFromCSV) => ({
      code: c.code,
      isGiftCard: c.isGiftCard,
      isDiscountCode: c.isDiscountCode,
      isUsed: false,
    }));

    // Update redemption limit to match codes count if not specified
    if (
      !rewardData.redemptionLimit ||
      rewardData.redemptionLimit < generatedCodes.length
    ) {
      redemptionLimit = generatedCodes.length;
    }
  }

  // Create reward
  const reward = await Reward.create({
    business: businessId,
    title: rewardData.title,
    description: rewardData.description,
    image: rewardData.image,
    type: rewardData.type,
    category: rewardData.category,
    pointsCost: STATIC_POINTS_COST, // Always 500
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
  payload: IUpdateRewardPayload
): Promise<IRewardDocument> => {
  const reward = await Reward.findById(rewardId);

  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  // Check for duplicate title if title is being changed
  if (payload.title && payload.title !== reward.title) {
    const existingReward = await Reward.findOne({
      business: reward.business,
      title: payload.title,
      _id: { $ne: rewardId },
    });
    if (existingReward) {
      throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.ALREADY_EXISTS);
    }
  }

  // Update fields
  if (payload.title !== undefined) reward.title = payload.title;
  if (payload.description !== undefined)
    reward.description = payload.description;
  if (payload.image !== undefined) reward.image = payload.image;
  if (payload.category !== undefined) reward.category = payload.category;
  if (payload.redemptionLimit !== undefined) {
    // Adjust remaining count when limit changes
    const difference = payload.redemptionLimit - reward.redemptionLimit;
    reward.redemptionLimit = payload.redemptionLimit;
    reward.remainingCount = Math.max(0, reward.remainingCount + difference);
  }
  if (payload.startDate !== undefined) reward.startDate = payload.startDate;
  if (payload.expiryDate !== undefined) reward.expiryDate = payload.expiryDate;
  if (payload.terms !== undefined) reward.terms = payload.terms;
  if (payload.featured !== undefined) {
    reward.featured = payload.featured;
    reward.priority = payload.featured ? 10 : 1;
  }
  if (payload.isActive !== undefined) reward.isActive = payload.isActive;

  // Update redemption methods
  if (
    payload.inStoreRedemptionMethods !== undefined &&
    reward.inStoreRedemptionMethods
  ) {
    reward.inStoreRedemptionMethods = {
      ...reward.inStoreRedemptionMethods,
      ...payload.inStoreRedemptionMethods,
    };
  }
  if (
    payload.onlineRedemptionMethods !== undefined &&
    reward.onlineRedemptionMethods
  ) {
    reward.onlineRedemptionMethods = {
      ...reward.onlineRedemptionMethods,
      ...payload.onlineRedemptionMethods,
    };
  }

  // Update status
  await reward.updateStatus();
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

  // Increment view count (don't await to avoid slowing down response)
  reward.incrementViews().catch((error: Error) => {
    console.error('Failed to increment views:', error);
  });

  // Check user affordability if userId provided
  let userCanAfford = false;
  let userBalance = 0;

  if (userId) {
    try {
      const balance = await pointsServices.getUserBalance(userId);
      userBalance = balance.currentBalance;
      userCanAfford = balance.canAfford(STATIC_POINTS_COST);
    } catch {
      userCanAfford = false;
    }
  }

  // Don't expose unused codes to frontend
  const rewardData = reward.toJSON() as Record<string, unknown>;
  delete rewardData.codes;

  return {
    ...rewardData,
    availableCodesCount: reward.codes.filter((c) => !c.isUsed).length,
    isAvailable: reward.checkAvailability(),
    userCanAfford,
    userBalance,
  };
};

interface IRewardResult {
  rewards: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Get rewards with filters
 */
const getRewards = async (
  query: IRewardFilterQuery
): Promise<IRewardResult> => {
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

  // If featured, prioritize by priority
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
      .select('-codes') // Don't send codes to frontend
      .lean(),
    Reward.countDocuments(filter),
  ]);

  // Check user affordability if userId provided
  let userBalance = 0;
  if (userId) {
    try {
      const balance = await pointsServices.getUserBalance(userId as string);
      userBalance = balance.currentBalance;
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
  }));

  return {
    rewards: rewardsWithAvailability,
    total,
    page,
    limit,
  };
};

/**
 * Get rewards by business
 */
const getRewardsByBusiness = async (
  businessId: string,
  query: IRewardFilterQuery
): Promise<IRewardResult> => {
  return getRewards({
    ...query,
    businessId,
  });
};

/**
 * Delete reward (soft delete)
 */
const deleteReward = async (rewardId: string): Promise<void> => {
  const reward = await Reward.findById(rewardId);

  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  // Soft delete by marking as inactive
  reward.isActive = false;
  reward.status = REWARD_STATUS.INACTIVE;
  await reward.save();
};

/**
 * Archive reward (permanent delete)
 */
const archiveReward = async (rewardId: string): Promise<void> => {
  const reward = await Reward.findByIdAndDelete(rewardId);

  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }
};

/**
 * Upload codes to reward (for online rewards)
 */
const uploadCodesToReward = async (
  rewardId: string,
  codesFile: Express.Multer.File
): Promise<{
  reward: IRewardDocument;
  codesAdded: number;
  codesDuplicated: number;
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

  // Parse codes from file
  const parsedCodes = await parseCodesFile(codesFile);

  // Validate codes match redemption methods
  const hasDiscountCodes = parsedCodes.some(
    (c: IParsedCodeFromCSV) => c.isDiscountCode
  );
  const hasGiftCards = parsedCodes.some(
    (c: IParsedCodeFromCSV) => c.isGiftCard
  );

  if (hasDiscountCodes && !reward.onlineRedemptionMethods?.discountCode) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Discount codes uploaded but discount code redemption method not enabled'
    );
  }

  if (hasGiftCards && !reward.onlineRedemptionMethods?.giftCard) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Gift card URLs uploaded but gift card redemption method not enabled'
    );
  }

  // Check for duplicate codes within this reward
  const existingCodes = new Set(reward.codes.map((c) => c.code));
  const newCodes = parsedCodes.filter(
    (c: IParsedCodeFromCSV) => !existingCodes.has(c.code)
  );

  if (newCodes.length === 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'All codes already exist in this reward'
    );
  }

  // Add new codes
  const codesToAdd = newCodes.map((c: IParsedCodeFromCSV) => ({
    code: c.code,
    isGiftCard: c.isGiftCard,
    isDiscountCode: c.isDiscountCode,
    isUsed: false,
  }));

  reward.codes = [...reward.codes, ...codesToAdd];

  // Update redemption limit
  reward.redemptionLimit += newCodes.length;
  reward.remainingCount += newCodes.length;

  await reward.save();

  return {
    reward,
    codesAdded: newCodes.length,
    codesDuplicated: parsedCodes.length - newCodes.length,
  };
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

  // Check if active
  if (!reward.isActive) {
    isAvailable = false;
    reason = REWARD_MESSAGES.INACTIVE;
  }
  // Check if started
  else if (reward.startDate > now) {
    isAvailable = false;
    reason = REWARD_MESSAGES.NOT_STARTED;
  }
  // Check if expired
  else if (reward.expiryDate && reward.expiryDate < now) {
    isAvailable = false;
    reason = REWARD_MESSAGES.EXPIRED;
  }
  // Check if sold out
  else if (reward.remainingCount <= 0) {
    isAvailable = false;
    reason = REWARD_MESSAGES.INSUFFICIENT_STOCK;
  }
  // For online rewards, check codes
  else if (reward.type === 'online' && reward.codes.length > 0) {
    const availableCode = reward.codes.find((code) => !code.isUsed);
    if (!availableCode) {
      isAvailable = false;
      reason = REWARD_MESSAGES.NO_CODES_AVAILABLE;
    }
  }

  // Check user affordability (always 500 points)
  if (userId && isAvailable) {
    try {
      const balance = await pointsServices.getUserBalance(userId);
      userBalance = balance.currentBalance;
      userCanAfford = balance.canAfford(STATIC_POINTS_COST);

      if (!userCanAfford) {
        reason = REWARD_MESSAGES.INSUFFICIENT_POINTS;
      }
    } catch {
      userCanAfford = false;
      reason = REWARD_MESSAGES.INSUFFICIENT_POINTS;
    }
  }

  return {
    isAvailable: isAvailable && (!userId || userCanAfford),
    reason,
    remainingCount: reward.remainingCount,
    userCanAfford,
    userBalance,
  };
};

interface ITopReward {
  _id: Types.ObjectId;
  title: string;
  redemptions: number;
}

interface ICategoryStats {
  _id: string;
  count: number;
}

/**
 * Get reward statistics
 */
const getRewardStatistics = async (
  businessId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<IRewardStatistics> => {
  const filter: Record<string, unknown> = {};
  if (businessId) filter.business = new Types.ObjectId(businessId as string);

  const dateFilter: Record<string, unknown> = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate)
      (dateFilter.createdAt as Record<string, Date>).$gte = startDate;
    if (endDate) (dateFilter.createdAt as Record<string, Date>).$lte = endDate;
  }

  const [overallStats, topRewardsResult, categoryStats] = await Promise.all([
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
          totalRedemptions: { $sum: '$redemptions' },
          totalViews: { $sum: '$views' },
        },
      },
    ]),
    Reward.find({ ...filter, ...dateFilter })
      .sort({ redemptions: -1 })
      .limit(10)
      .select('_id title redemptions')
      .lean()
      .exec(),
    Reward.aggregate<ICategoryStats>([
      { $match: { ...filter, ...dateFilter } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const stats = overallStats[0] || {
    totalRewards: 0,
    activeRewards: 0,
    expiredRewards: 0,
    totalRedemptions: 0,
    totalViews: 0,
  };

  return {
    totalRewards: stats.totalRewards,
    activeRewards: stats.activeRewards,
    expiredRewards: stats.expiredRewards,
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
    rewardsByCategory: categoryStats.map((cat) => ({
      category: cat._id,
      count: cat.count,
    })),
  };
};

/**
 * Update expired rewards status (scheduled job)
 */
const updateExpiredRewards = async (): Promise<void> => {
  const now = new Date();

  await Reward.updateMany(
    {
      expiryDate: { $lte: now },
      status: { $ne: REWARD_STATUS.EXPIRED },
    },
    {
      $set: { status: REWARD_STATUS.EXPIRED },
    }
  );
};

/**
 * Update upcoming rewards to active (scheduled job)
 */
const updateUpcomingRewards = async (): Promise<void> => {
  const now = new Date();

  await Reward.updateMany(
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
};

/**
 * Get available code for redemption
 */
const getAvailableCodeForRedemption = async (
  rewardId: string,
  type?: 'discount' | 'giftcard'
): Promise<string | null> => {
  const reward = await Reward.findById(rewardId);

  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.NOT_FOUND);
  }

  // For in-store rewards, return any available code
  if (reward.type === 'in-store') {
    const availableCode = reward.codes.find((c) => !c.isUsed);
    return availableCode ? availableCode.code : null;
  }

  // For online rewards, return code based on type
  if (reward.type === 'online' && type) {
    const code = await reward.getAvailableCode(type);
    return code ? code.code : null;
  }

  return null;
};

export const rewardService = {
  createReward,
  updateReward,
  getRewardById,
  getRewards,
  getRewardsByBusiness,
  deleteReward,
  archiveReward,
  uploadCodesToReward,
  checkAvailability,
  getRewardStatistics,
  updateExpiredRewards,
  updateUpcomingRewards,
  getAvailableCodeForRedemption,
};
