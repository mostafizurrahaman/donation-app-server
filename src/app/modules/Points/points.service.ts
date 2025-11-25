import { Types } from 'mongoose';
import { PointsTransaction, PointsBalance } from './points.model';
import Client from '../Client/client.model';
import {
  ICreatePointsTransactionPayload,
  IPointsFilterQuery,
  IPointsStatistics,
  IPointsLeaderboard,
} from './points.interface';
import {
  POINTS_MESSAGES,
  TRANSACTION_TYPE,
  POINTS_SOURCE,
  TRANSACTION_DESCRIPTIONS,
  LEADERBOARD_SIZE,
} from './points.constant';
import { AppError } from '../../utils';
import httpStatus from 'http-status';

class PointsService {
  /**
   * Create a points transaction
   */
  async createTransaction(
    payload: ICreatePointsTransactionPayload
  ): Promise<any> {
    const session = await PointsTransaction.startSession();
    session.startTransaction();

    try {
      const userId = new Types.ObjectId(payload.userId as string);

      // Get or create user balance
      let balance = await PointsBalance.findOne({ user: userId }).session(session);

      if (!balance) {
        balance = await PointsBalance.create(
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
        balance = balance[0];
      }

      // Calculate new balance
      let balanceChange = 0;
      switch (payload.transactionType) {
        case TRANSACTION_TYPE.EARNED:
          balanceChange = payload.amount;
          balance.totalEarned += payload.amount;
          break;
        case TRANSACTION_TYPE.SPENT:
          balanceChange = -payload.amount;
          if (balance.currentBalance < payload.amount) {
            throw new AppError(
              httpStatus.BAD_REQUEST,
              POINTS_MESSAGES.INSUFFICIENT_BALANCE
            );
          }
          balance.totalSpent += payload.amount;
          break;
        case TRANSACTION_TYPE.REFUNDED:
          balanceChange = payload.amount;
          balance.totalRefunded += payload.amount;
          break;
        case TRANSACTION_TYPE.ADJUSTED:
          balanceChange = payload.amount;
          balance.totalAdjusted += payload.amount;
          break;
        case TRANSACTION_TYPE.EXPIRED:
          balanceChange = -payload.amount;
          balance.totalExpired += payload.amount;
          break;
      }

      const newBalance = balance.currentBalance + balanceChange;

      if (newBalance < 0) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          POINTS_MESSAGES.NEGATIVE_BALANCE
        );
      }

      // Update balance
      await balance.updateBalance(balanceChange);

      // Create transaction record
      const transaction = await PointsTransaction.create(
        [
          {
            user: userId,
            transactionType: payload.transactionType,
            amount: payload.amount,
            balance: newBalance,
            source: payload.source,
            donation: payload.donationId
              ? new Types.ObjectId(payload.donationId as string)
              : undefined,
            rewardRedemption: payload.rewardRedemptionId
              ? new Types.ObjectId(payload.rewardRedemptionId as string)
              : undefined,
            badge: payload.badgeId
              ? new Types.ObjectId(payload.badgeId as string)
              : undefined,
            description: payload.description,
            metadata: payload.metadata,
            adjustedBy: payload.adjustedBy
              ? new Types.ObjectId(payload.adjustedBy as string)
              : undefined,
            adjustmentReason: payload.adjustmentReason,
            expiresAt: payload.expiresAt,
            isExpired: false,
          },
        ],
        { session }
      );

      await session.commitTransaction();
      return {
        transaction: transaction[0],
        balance: {
          currentBalance: balance.currentBalance,
          lifetimePoints: balance.lifetimePoints,
          currentTier: balance.currentTier,
        },
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Award points for a donation
   */
  async awardPointsForDonation(
    userId: Types.ObjectId | string,
    donationId: Types.ObjectId | string,
    donationAmount: number
  ): Promise<any> {
    const points = Math.floor(donationAmount * 100); // $1 = 100 points

    return this.createTransaction({
      userId,
      transactionType: TRANSACTION_TYPE.EARNED,
      amount: points,
      source: POINTS_SOURCE.DONATION,
      donationId,
      description: `${TRANSACTION_DESCRIPTIONS.DONATION_EARNED} - $${donationAmount.toFixed(2)}`,
      metadata: {
        donationAmount,
        conversionRate: 100,
      },
    });
  }

  /**
   * Deduct points (for reward redemption)
   */
  async deductPoints(
    userId: Types.ObjectId | string,
    amount: number,
    source: string,
    rewardRedemptionId?: Types.ObjectId | string,
    description?: string,
    metadata?: Record<string, any>
  ): Promise<any> {
    return this.createTransaction({
      userId,
      transactionType: TRANSACTION_TYPE.SPENT,
      amount,
      source: source as any,
      rewardRedemptionId,
      description: description || TRANSACTION_DESCRIPTIONS.REWARD_REDEEMED,
      metadata,
    });
  }

  /**
   * Refund points (for cancelled redemption)
   */
  async refundPoints(
    userId: Types.ObjectId | string,
    amount: number,
    source: string,
    reason: string,
    rewardRedemptionId?: Types.ObjectId | string,
    metadata?: Record<string, any>
  ): Promise<any> {
    return this.createTransaction({
      userId,
      transactionType: TRANSACTION_TYPE.REFUNDED,
      amount,
      source: source as any,
      rewardRedemptionId,
      description: reason,
      metadata,
    });
  }

  /**
   * Adjust points (admin only)
   */
  async adjustPoints(
    userId: Types.ObjectId | string,
    amount: number,
    reason: string,
    adjustedBy: Types.ObjectId | string,
    description?: string
  ): Promise<any> {
    return this.createTransaction({
      userId,
      transactionType: TRANSACTION_TYPE.ADJUSTED,
      amount,
      source: POINTS_SOURCE.ADMIN_ADJUSTMENT,
      adjustmentReason: reason,
      adjustedBy,
      description: description || TRANSACTION_DESCRIPTIONS.ADMIN_ADJUSTED,
    });
  }

  /**
   * Award bonus points for badge unlock
   */
  async awardBadgeBonus(
    userId: Types.ObjectId | string,
    badgeId: Types.ObjectId | string,
    bonusAmount: number
  ): Promise<any> {
    return this.createTransaction({
      userId,
      transactionType: TRANSACTION_TYPE.EARNED,
      amount: bonusAmount,
      source: POINTS_SOURCE.BADGE_UNLOCK,
      badgeId,
      description: TRANSACTION_DESCRIPTIONS.BADGE_UNLOCKED,
      metadata: {
        bonusAmount,
      },
    });
  }

  /**
   * Get user balance
   */
  async getUserBalance(userId: Types.ObjectId | string): Promise<any> {
    const balance = await PointsBalance.findOne({
      user: new Types.ObjectId(userId as string),
    });

    if (!balance) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        POINTS_MESSAGES.BALANCE_NOT_FOUND
      );
    }

    return balance;
  }

  /**
   * Check if user can afford an amount
   */
  async canAfford(
    userId: Types.ObjectId | string,
    amount: number
  ): Promise<boolean> {
    const balance = await this.getUserBalance(userId);
    return balance.canAfford(amount);
  }

  /**
   * Get user transactions with filters
   */
  async getUserTransactions(
    userId: Types.ObjectId | string,
    query: IPointsFilterQuery
  ): Promise<{
    transactions: any[];
    total: number;
    page: number;
    limit: number;
  }> {
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

    const filter: any = { user: new Types.ObjectId(userId as string) };

    if (transactionType) filter.transactionType = transactionType;
    if (source) filter.source = source;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      filter.amount = {};
      if (minAmount !== undefined) filter.amount.$gte = minAmount;
      if (maxAmount !== undefined) filter.amount.$lte = maxAmount;
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [transactions, total] = await Promise.all([
      PointsTransaction.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('donation', 'amount donationType organization')
        .populate('rewardRedemption', 'reward status')
        .populate('badge', 'name tier')
        .lean(),
      PointsTransaction.countDocuments(filter),
    ]);

    return {
      transactions,
      total,
      page,
      limit,
    };
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(transactionId: string): Promise<any> {
    const transaction = await PointsTransaction.findById(transactionId)
      .populate('user', 'name image')
      .populate('donation', 'amount donationType organization')
      .populate('rewardRedemption', 'reward status')
      .populate('badge', 'name tier')
      .populate('adjustedBy', 'email');

    if (!transaction) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        POINTS_MESSAGES.TRANSACTION_NOT_FOUND
      );
    }

    return transaction;
  }

  /**
   * Get points leaderboard
   */
  async getLeaderboard(
    limit: number = LEADERBOARD_SIZE,
    tier?: string
  ): Promise<IPointsLeaderboard[]> {
    const filter: any = {};
    if (tier) filter.currentTier = tier;

    const leaderboard = await PointsBalance.find(filter)
      .sort({ lifetimePoints: -1 })
      .limit(limit)
      .populate('user', 'name image')
      .lean();

    return leaderboard.map((entry, index) => ({
      rank: index + 1,
      user: entry.user as Types.ObjectId,
      userName: (entry.user as any).name,
      userImage: (entry.user as any).image,
      totalPoints: entry.lifetimePoints,
      tier: entry.currentTier || 'bronze',
    }));
  }

  /**
   * Get points statistics
   */
  async getPointsStatistics(
    startDate?: Date,
    endDate?: Date
  ): Promise<IPointsStatistics> {
    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = startDate;
      if (endDate) dateFilter.createdAt.$lte = endDate;
    }

    const [overallStats, sourceStats, topEarners] = await Promise.all([
      PointsTransaction.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            totalPointsEarned: {
              $