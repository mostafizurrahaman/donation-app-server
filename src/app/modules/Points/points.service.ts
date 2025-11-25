// src/app/modules/Points/points.service.ts
import { Types } from 'mongoose';
import { PointsTransaction, PointsBalance } from './points.model';
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
  TIER_THRESHOLDS,
} from './points.constant';
import { AppError } from '../../utils';
import httpStatus from 'http-status';

class PointsService {
  // 1. Create any points transaction
  async createTransaction(payload: ICreatePointsTransactionPayload) {
    const session = await PointsTransaction.startSession();
    session.startTransaction();

    try {
      const userId = new Types.ObjectId(payload.userId);

      let balance = await PointsBalance.findOne({ user: userId }).session(
        session
      );
      if (!balance) {
        balance = await PointsBalance.create(
          [
            {
              user: userId,
              currentBalance: 0,
              lifetimePoints: 0,
              currentTier: 'bronze',
              totalEarned: 0,
              totalSpent: 0,
              totalRefunded: 0,
              totalAdjusted: 0,
              totalExpired: 0,
            },
          ],
          { session }
        )[0];
      }

      let balanceChange = 0;
      switch (payload.transactionType) {
        case TRANSACTION_TYPE.EARNED:
          balanceChange = payload.amount;
          balance.totalEarned += payload.amount;
          break;
        case TRANSACTION_TYPE.SPENT:
          if (balance.currentBalance < payload.amount) {
            throw new AppError(
              httpStatus.BAD_REQUEST,
              POINTS_MESSAGES.INSUFFICIENT_BALANCE
            );
          }
          balanceChange = -payload.amount;
          balance.totalSpent += payload.amount;
          break;
        case TRANSACTION_TYPE.REFUNDED:
          balanceChange = payload.amount;
          balance.totalRefunded += payload.amount;
          break;
        case TRANSACTION_TYPE.ADJUSTED:
          balanceChange = payload.amount;
          balance.totalAdjusted += Math.abs(payload.amount);
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

      await balance.updateBalance(balanceChange);

      const transaction = await PointsTransaction.create(
        [
          {
            user: userId,
            transactionType: payload.transactionType,
            amount: payload.amount,
            balance: newBalance,
            source: payload.source,
            donation: payload.donationId,
            rewardRedemption: payload.rewardRedemptionId,
            badge: payload.badgeId,
            description:
              payload.description || this.getDefaultDescription(payload),
            metadata: payload.metadata || {},
            adjustedBy: payload.adjustedBy,
            adjustmentReason: payload.adjustmentReason,
            expiresAt: payload.expiresAt,
            isExpired: false,
          },
        ],
        { session }
      )[0];

      await session.commitTransaction();
      return { transaction, balance };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  private getDefaultDescription(
    payload: ICreatePointsTransactionPayload
  ): string {
    if (payload.source === POINTS_SOURCE.DONATION)
      return TRANSACTION_DESCRIPTIONS.DONATION_EARNED;
    if (payload.source === POINTS_SOURCE.REWARD_REDEMPTION)
      return TRANSACTION_DESCRIPTIONS.REWARD_REDEEMED;
    if (payload.source === POINTS_SOURCE.BADGE_UNLOCK)
      return TRANSACTION_DESCRIPTIONS.BADGE_UNLOCKED;
    return 'Points transaction';
  }

  // 2. Award points from donation
  async awardPointsForDonation(
    userId: string,
    donationId: string,
    amount: number
  ) {
    const points = Math.floor(amount * 100);
    return this.createTransaction({
      userId,
      transactionType: TRANSACTION_TYPE.EARNED,
      amount: points,
      source: POINTS_SOURCE.DONATION,
      donationId,
      description: `${
        TRANSACTION_DESCRIPTIONS.DONATION_EARNED
      } - $${amount.toFixed(2)}`,
      metadata: { donationAmount: amount },
    });
  }

  // 3. Deduct points on reward redemption
  async deductPoints(
    userId: string,
    amount: number,
    rewardRedemptionId: string
  ) {
    return this.createTransaction({
      userId,
      transactionType: TRANSACTION_TYPE.SPENT,
      amount,
      source: POINTS_SOURCE.REWARD_REDEMPTION,
      rewardRedemptionId,
      description: TRANSACTION_DESCRIPTIONS.REWARD_REDEEMED,
    });
  }

  // 4. Refund points (e.g. cancelled reward)
  async refundPoints(
    userId: string,
    amount: number,
    rewardRedemptionId?: string
  ) {
    return this.createTransaction({
      userId,
      transactionType: TRANSACTION_TYPE.REFUNDED,
      amount,
      source: POINTS_SOURCE.REWARD_REDEMPTION,
      rewardRedemptionId,
      description: TRANSACTION_DESCRIPTIONS.REWARD_REFUNDED,
    });
  }

  // 5. Admin adjustment
  async adjustPoints(
    userId: string,
    amount: number,
    reason: string,
    adjustedBy: string
  ) {
    return this.createTransaction({
      userId,
      transactionType: TRANSACTION_TYPE.ADJUSTED,
      amount,
      source: POINTS_SOURCE.ADMIN_ADJUSTMENT,
      adjustmentReason: reason,
      adjustedBy,
      description: amount > 0 ? 'Admin added points' : 'Admin deducted points',
    });
  }

  // 6. Badge unlock bonus
  async awardBadgeBonus(userId: string, badgeId: string, bonusAmount = 500) {
    return this.createTransaction({
      userId,
      transactionType: TRANSACTION_TYPE.EARNED,
      amount: bonusAmount,
      source: POINTS_SOURCE.BADGE_UNLOCK,
      badgeId,
      description: `${TRANSACTION_DESCRIPTIONS.BADGE_UNLOCKED} (+${bonusAmount} bonus)`,
    });
  }

  // 7. Get user balance
  async getUserBalance(userId: string) {
    const balance = await PointsBalance.findOne({
      user: new Types.ObjectId(userId),
    })
      .select(
        'currentBalance lifetimePoints currentTier totalEarned totalSpent totalRefunded'
      )
      .lean();

    if (!balance)
      throw new AppError(
        httpStatus.NOT_FOUND,
        POINTS_MESSAGES.BALANCE_NOT_FOUND
      );
    return balance;
  }

  // 8. Get transaction history
  async getTransactions(userId: string, query: IPointsFilterQuery) {
    const filter: any = { user: new Types.ObjectId(userId) };
    if (query.source) filter.source = query.source;
    if (query.transactionType) filter.transactionType = query.transactionType;
    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
    }

    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      PointsTransaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('donation', 'amount organization')
        .populate('rewardRedemption', 'reward')
        .populate('badge', 'name')
        .lean(),
      PointsTransaction.countDocuments(filter),
    ]);

    return { transactions, total, page, limit };
  }

  // 9. Check if user can afford
  async canAfford(userId: string, amount: number): Promise<boolean> {
    const balance = await this.getUserBalance(userId);
    return balance.currentBalance >= amount;
  }

  // 10. Get leaderboard (top 100)
  async getLeaderboard(tier?: string): Promise<IPointsLeaderboard[]> {
    const filter: any = {};
    if (tier) filter.currentTier = tier;

    const topUsers = await PointsBalance.find(filter)
      .sort({ lifetimePoints: -1 })
      .limit(LEADERBOARD_SIZE)
      .populate('user', 'name image')
      .lean();

    return topUsers.map((entry, index) => ({
      rank: index + 1,
      userId: entry.user._id,
      name: (entry.user as any).name,
      image: (entry.user as any).image,
      lifetimePoints: entry.lifetimePoints,
      currentTier: entry.currentTier,
    }));
  }

  // 11. Get global stats (admin only)
  async getStatistics(): Promise<IPointsStatistics> {
    const stats = await PointsBalance.aggregate([
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          totalPointsEarned: { $sum: '$totalEarned' },
          totalPointsSpent: { $sum: '$totalSpent' },
          totalPointsCurrent: { $sum: '$currentBalance' },
        },
      },
    ]);

    return (
      stats[0] || {
        totalUsers: 0,
        totalPointsEarned: 0,
        totalPointsSpent: 0,
        totalPointsCurrent: 0,
      }
    );
  }
}

export const pointsService = new PointsService();
