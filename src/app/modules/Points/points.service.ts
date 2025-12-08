// src/app/modules/Points/points.service.ts
import { Types, ClientSession, SortOrder } from 'mongoose';

import {
  ICreatePointsTransactionPayload,
  IPointsFilterQuery,
  IPointsStatistics,
  IPointsLeaderboard,
  IPointsTransactionResult,
  IUserPointsSummary,
  IPopulatedUser,
} from './points.interface';
import {
  POINTS_MESSAGES,
  TRANSACTION_TYPE,
  POINTS_SOURCE,
  TRANSACTION_DESCRIPTIONS,
  LEADERBOARD_SIZE,
  POINTS_PER_DOLLAR,
} from './points.constant';
import { AppError } from '../../utils';
import httpStatus from 'http-status';
import { PointsBalance, PointsTransaction } from './points.model';
import Client from '../Client/client.model';

// =======================
// CREATE TRANSACTION
// =======================
export const createPointsTransaction = async (
  payload: ICreatePointsTransactionPayload,
  externalSession?: ClientSession // ✅ Accept optional session
): Promise<IPointsTransactionResult> => {
  const session = externalSession || (await PointsTransaction.startSession());
  // Only start transaction if we created the session
  if (!externalSession) {
    session.startTransaction();
  }

  try {
    const userId = new Types.ObjectId(payload.userId);

    let balanceDoc = await PointsBalance.findOne({ user: userId }).session(
      session
    );

    if (!balanceDoc) {
      const [newBalance] = await PointsBalance.create(
        [
          {
            user: userId,
            totalEarned: 0,
            totalSpent: 0,
            totalRefunded: 0,
            totalAdjusted: 0,
            totalExpired: 0,
            currentBalance: 0,
            lifetimePoints: 0,
            currentTier: 'bronze',
          },
        ],
        { session }
      );
      balanceDoc = newBalance;
    }

    let balanceChange = 0;
    switch (payload.transactionType) {
      case TRANSACTION_TYPE.EARNED:
        balanceChange = payload.amount;
        balanceDoc.totalEarned += payload.amount;
        break;
      case TRANSACTION_TYPE.SPENT:
        if (balanceDoc.currentBalance < payload.amount) {
          throw new AppError(
            httpStatus.BAD_REQUEST,
            POINTS_MESSAGES.INSUFFICIENT_BALANCE
          );
        }
        balanceChange = -payload.amount;
        balanceDoc.totalSpent += payload.amount;
        break;
      case TRANSACTION_TYPE.REFUNDED:
        balanceChange = payload.amount;
        balanceDoc.totalRefunded += payload.amount;
        break;
      case TRANSACTION_TYPE.ADJUSTED:
        balanceChange = payload.amount;
        balanceDoc.totalAdjusted += Math.abs(payload.amount);
        break;
      case TRANSACTION_TYPE.EXPIRED:
        balanceChange = -payload.amount;
        balanceDoc.totalExpired += payload.amount;
        break;
    }

    const newBalanceAmount = balanceDoc.currentBalance + balanceChange;
    // Safety check for negative balance
    if (newBalanceAmount < 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        POINTS_MESSAGES.NEGATIVE_BALANCE
      );
    }

    // Update balance
    balanceDoc.currentBalance = newBalanceAmount;
    if (balanceChange > 0) balanceDoc.lifetimePoints += payload.amount;
    balanceDoc.currentTier = balanceDoc.getTierByPoints();
    balanceDoc.lastTransactionAt = new Date();
    await balanceDoc.save({ session });

    // Create transaction
    const [transactionDoc] = await PointsTransaction.create(
      [
        {
          user: userId,
          transactionType: payload.transactionType,
          amount: payload.amount,
          balance: newBalanceAmount,
          source: payload.source,
          donation: payload.donationId
            ? new Types.ObjectId(payload.donationId)
            : undefined,
          rewardRedemption: payload.rewardRedemptionId
            ? new Types.ObjectId(payload.rewardRedemptionId)
            : undefined,
          badge: payload.badgeId
            ? new Types.ObjectId(payload.badgeId)
            : undefined,
          description: payload.description,
          metadata: payload.metadata || {},
          adjustedBy: payload.adjustedBy
            ? new Types.ObjectId(payload.adjustedBy)
            : undefined,
          adjustmentReason: payload.adjustmentReason,
          expiresAt: payload.expiresAt,
          isExpired: false,
        },
      ],
      { session }
    );

    // Only commit if we started the session
    if (!externalSession) {
      await session.commitTransaction();
    }

    return {
      transaction: transactionDoc,
      balance: {
        currentBalance: balanceDoc.currentBalance,
        lifetimePoints: balanceDoc.lifetimePoints,
        currentTier: balanceDoc.currentTier || 'bronze',
      },
    };
  } catch (error) {
    // Only abort if we started the session
    if (!externalSession) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    // Only end session if we started it
    if (!externalSession) {
      session.endSession();
    }
  }
};

// =======================
// AWARD POINTS FOR DONATION
// =======================
export const awardPointsForDonation = async (
  userId: Types.ObjectId | string,
  donationId: Types.ObjectId | string,
  donationAmount: number,
  session?: ClientSession // ✅ Added session
): Promise<IPointsTransactionResult> => {
  const points = Math.floor(donationAmount * POINTS_PER_DOLLAR);
  return createPointsTransaction(
    {
      userId,
      transactionType: TRANSACTION_TYPE.EARNED,
      amount: points,
      source: POINTS_SOURCE.DONATION,
      donationId,
      description: `${
        TRANSACTION_DESCRIPTIONS.DONATION_EARNED
      } - $${donationAmount.toFixed(2)}`,
      metadata: { donationAmount, conversionRate: POINTS_PER_DOLLAR },
    },
    session
  );
};

// =======================
// DEDUCT POINTS
// =======================
export const deductPoints = async (
  userId: Types.ObjectId | string,
  amount: number,
  source: string,
  rewardRedemptionId?: Types.ObjectId | string,
  description?: string,
  metadata?: Record<string, unknown>,
  session?: ClientSession // ✅ Added session
): Promise<IPointsTransactionResult> => {
  return createPointsTransaction(
    {
      userId,
      transactionType: TRANSACTION_TYPE.SPENT,
      amount,
      source: source as any,
      rewardRedemptionId,
      description: description || TRANSACTION_DESCRIPTIONS.REWARD_REDEEMED,
      metadata,
    },
    session
  );
};

// =======================
// REFUND POINTS
// =======================
export const refundPoints = async (
  userId: Types.ObjectId | string,
  amount: number,
  source: string,
  reason: string,
  rewardRedemptionId?: Types.ObjectId | string,
  metadata?: Record<string, unknown>,
  session?: ClientSession // ✅ Added session
): Promise<IPointsTransactionResult> => {
  return createPointsTransaction(
    {
      userId,
      transactionType: TRANSACTION_TYPE.REFUNDED,
      amount,
      source: source as any,
      rewardRedemptionId,
      description: reason,
      metadata,
    },
    session
  );
};

// =======================
// ADJUST POINTS (Admin)
// =======================
export const adjustPoints = async (
  userId: Types.ObjectId | string,
  amount: number,
  reason: string,
  adjustedBy: Types.ObjectId | string,
  description?: string,
  session?: ClientSession // ✅ Added session
): Promise<IPointsTransactionResult> => {
  return createPointsTransaction(
    {
      userId,
      transactionType: TRANSACTION_TYPE.ADJUSTED,
      amount,
      source: POINTS_SOURCE.ADMIN_ADJUSTMENT,
      adjustmentReason: reason,
      adjustedBy,
      description: description || TRANSACTION_DESCRIPTIONS.ADMIN_ADJUSTED,
    },
    session
  );
};

// =======================
// GET USER BALANCE
// =======================
export const getUserBalance = async (userId: Types.ObjectId | string) => {
  const isUserExists = await Client?.findById(userId);

  if (!isUserExists) {
    throw new AppError(httpStatus.NOT_FOUND, POINTS_MESSAGES.USER_NOT_FOUND);
  }
  const balance = await PointsBalance.findOne({
    user: new Types.ObjectId(userId),
  }).populate<{ user: IPopulatedUser }>('user', 'name image');

  if (!balance) {
    return await PointsBalance.create({
      user: new Types.ObjectId(userId),
      currentBalance: 0,
      lifetimePoints: 0,
      currentTier: 'bronze',
    });
  }
  return balance;
};

// =======================
// CAN AFFORD
// =======================
export const canUserAffordPoints = async (
  userId: Types.ObjectId | string,
  amount: number
): Promise<boolean> => {
  const balance = await getUserBalance(userId);
  return balance.currentBalance >= amount;
};

// =======================
// GET USER TRANSACTIONS
// =======================
export const getUserTransactions = async (
  userId: Types.ObjectId | string,
  query: IPointsFilterQuery
) => {
  const {
    transactionType,
    source,
    startDate,
    endDate,
    minAmount,
    maxAmount,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = query;

  const filter: any = { user: new Types.ObjectId(userId) };
  if (transactionType) filter.transactionType = transactionType;
  if (source) filter.source = source;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }
  if (minAmount !== undefined)
    filter.amount = { ...filter.amount, $gte: minAmount };
  if (maxAmount !== undefined)
    filter.amount = { ...filter.amount, $lte: maxAmount };

  const sort: Record<string, SortOrder> = {
    [sortBy]: sortOrder === 'asc' ? 1 : -1,
  };

  const [transactions, total] = await Promise.all([
    PointsTransaction.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('donation', 'amount donationType organization')
      .populate('rewardRedemption', 'reward status')
      .populate('badge', 'name tier')
      .lean(),
    PointsTransaction.countDocuments(filter),
  ]);

  return { transactions, total, page, limit };
};

// =======================
// GET LEADERBOARD
// =======================
export const getPointsLeaderboard = async (
  limit = LEADERBOARD_SIZE,
  tier?: string
): Promise<IPointsLeaderboard[]> => {
  const filter: any = {};
  if (tier) filter.currentTier = tier;

  const entries = await PointsBalance.find(filter)
    .sort({ lifetimePoints: -1 })
    .limit(limit)
    .populate<{ user: IPopulatedUser }>('user', 'name image')
    .lean();

  return entries.map((entry: any, index: number) => ({
    rank: index + 1,
    user: entry.user._id,
    userName: entry.user.name,
    userImage: entry.user.image,
    totalPoints: entry.lifetimePoints,
    tier: entry.currentTier || 'bronze',
  }));
};

// =======================
// GET POINTS STATISTICS
// =======================
export const getPointsStatistics = async (
  startDate?: Date,
  endDate?: Date
): Promise<IPointsStatistics> => {
  const dateFilter: any = {};
  if (startDate)
    dateFilter.createdAt = { ...dateFilter.createdAt, $gte: startDate };
  if (endDate)
    dateFilter.createdAt = { ...dateFilter.createdAt, $lte: endDate };

  const [overall, sources, topEarners, totalUsers] = await Promise.all([
    PointsTransaction.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalPointsEarned: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'earned'] }, '$amount', 0],
            },
          },
          totalPointsSpent: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'spent'] }, '$amount', 0],
            },
          },
          totalPointsExpired: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'expired'] }, '$amount', 0],
            },
          },
        },
      },
    ]),
    PointsTransaction.aggregate([
      { $match: dateFilter },
      { $group: { _id: '$source', total: { $sum: '$amount' } } },
    ]),
    PointsBalance.find()
      .sort({ lifetimePoints: -1 })
      .limit(10)
      .select('user lifetimePoints currentTier')
      .populate({
        path: 'user',
        select: 'name image email',
        model: 'Client',
      })
      .lean(),
    PointsBalance.countDocuments(),
  ]);

  const stats = overall[0] || {
    totalPointsEarned: 0,
    totalPointsSpent: 0,
    totalPointsExpired: 0,
  };

  return {
    totalUsers,
    totalPointsEarned: stats.totalPointsEarned,
    totalPointsSpent: stats.totalPointsSpent,
    totalPointsExpired: stats.totalPointsExpired,
    averagePointsPerUser:
      totalUsers > 0 ? Math.floor(stats.totalPointsEarned / totalUsers) : 0,
    topEarners: topEarners.map((e: any) => ({
      ...(e.user ? e.user : {}),
      points: e.lifetimePoints,
    })),
    pointsBySource: sources.map((s: any) => ({
      source: s._id,
      total: s.total,
    })),
  };
};

// =======================
// GET USER POINTS SUMMARY
// =======================
export const getUserPointsSummary = async (
  userId: Types.ObjectId | string
): Promise<IUserPointsSummary> => {
  const balance = await getUserBalance(userId);
  const recentTransactions = await PointsTransaction.find({
    user: new Types.ObjectId(userId),
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('donation', 'amount organization')
    .populate('rewardRedemption', 'reward')
    .lean();

  return {
    balance: {
      currentBalance: balance.currentBalance,
      lifetimePoints: balance.lifetimePoints,
      totalEarned: balance.totalEarned,
      totalSpent: balance.totalSpent,
      currentTier: balance.currentTier,
    },
    recentTransactions,
  };
};

// =======================
// EXPORT ALL FUNCTIONS
// =======================
export const pointsServices = {
  createPointsTransaction,
  awardPointsForDonation,
  deductPoints,
  refundPoints,
  adjustPoints,
  getUserBalance,
  canUserAffordPoints,
  getUserTransactions,
  getPointsLeaderboard,
  getPointsStatistics,
  getUserPointsSummary,
};
