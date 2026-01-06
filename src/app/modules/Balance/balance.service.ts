/* eslint-disable @typescript-eslint/no-explicit-any */
import { ClientSession, Types } from 'mongoose';
import { BalanceTransaction } from './balance.model';
import { IBalanceTransaction } from './balance.interface';
import Donation from '../Donation/donation.model';
import { StripeService } from '../Stripe/stripe.service';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';

import { StripeAccount } from '../OrganizationAccount/stripe-account.model';

/**
 * Get Balance Summary from Stripe (Single Source of Truth)
 */
const getBalanceSummary = async (organizationId: string) => {
  // 1. Find the Stripe Account linked to this org
  const stripeAccount = await StripeAccount.findOne({
    organization: organizationId,
    status: 'active',
  });

  // If no account or not enabled, return zero
  if (!stripeAccount || !stripeAccount.chargesEnabled) {
    return {
      availableBalance: 0,
      pendingBalance: 0,
      currency: 'usd',
    };
  }

  // 2. Fetch directly from Stripe l
  const stripeBalance = await StripeService.getAccountBalance(
    stripeAccount.stripeAccountId
  );

  return {
    availableBalance: stripeBalance.available,
    pendingBalance: stripeBalance.pending,
    currency: stripeBalance.currency,
  };
};

/**
 * Log a Donation Transaction (History Only)
 *  just creates a ledger entry for analytics.
 */
const logDonationTransaction = async (
  organizationId: string,
  donationId: string,
  donationType: 'one-time' | 'recurring' | 'round-up',
  session?: ClientSession
) => {
  const donation = await Donation.findById(donationId).session(session || null);

  if (!donation) {
    throw new Error('Donation not found during logging');
  }

  const transaction: Partial<IBalanceTransaction> = {
    organization: new Types.ObjectId(organizationId),
    type: 'credit',
    category: 'donation_received',
    amount: donation.netAmount, // Destination Charge Net
    donation: new Types.ObjectId(donationId),
    donationType,
    description: `Donation received (${donationType})`,
    metadata: {
      grossAmount: donation.totalAmount,
      stripeFee: donation.stripeFee,
      platformFee: donation.platformFee,
    },
    idempotencyKey: `don_${donationId}`,
  };

  await BalanceTransaction.create([transaction], { session });
};

/**
 * Log a Refund (History Only)
 */
const logRefundTransaction = async (
  organizationId: string,
  donationId: string,
  session?: ClientSession
) => {
  const donation = await Donation.findById(donationId).session(session || null);
  if (!donation) return;

  const transaction: Partial<IBalanceTransaction> = {
    organization: new Types.ObjectId(organizationId),
    type: 'debit',
    category: 'refund_issued',
    amount: donation.netAmount, // The amount taken back
    donation: new Types.ObjectId(donationId),
    description: `Refund issued for donation ${donationId}`,
    idempotencyKey: `ref_${donationId}_${Date.now()}`,
  };

  await BalanceTransaction.create([transaction], { session });
};

/**
 * Get Transaction History (Unchanged mostly, just simpler query)
 */
const getTransactionHistory = async (
  organizationId: string,
  query: Record<string, unknown>
) => {
  const { page = 1, limit = 10, category, startDate, endDate } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter: any = { organization: organizationId };

  if (category) filter.category = category;
  if (startDate && endDate) {
    filter.createdAt = {
      $gte: new Date(startDate as string),
      $lte: new Date(endDate as string),
    };
  }

  const transactions = await BalanceTransaction.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .populate('donation', 'amount currency status totalAmount netAmount')
    .populate('payout', 'payoutNumber status');

  const total = await BalanceTransaction.countDocuments(filter);

  return {
    transactions,
    meta: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPage: Math.ceil(total / Number(limit)),
    },
  };
};

const getDashboardAnalytics = async (
  organizationId: string,
  donationType?: 'one-time' | 'recurring' | 'round-up' | 'all'
) => {
  const orgObjectId = new Types.ObjectId(organizationId);
  const now = new Date();

  // 1. Define Time Ranges
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  // 2. Build Match Query
  const matchQuery: any = {
    organization: orgObjectId,
    category: { $in: ['donation_received', 'refund_issued'] },
  };

  if (donationType && donationType !== 'all') {
    matchQuery.donationType = donationType;
  }

  const netDepositSumLogic = {
    $sum: {
      $cond: [
        { $eq: ['$category', 'donation_received'] },
        '$amount',
        {
          $cond: [
            { $eq: ['$category', 'refund_issued'] },
            { $multiply: ['$amount', -1] },
            0,
          ],
        },
      ],
    },
  };

  const stats = await BalanceTransaction.aggregate([
    {
      $facet: {
        totalLifetime: [
          { $match: matchQuery },
          { $group: { _id: null, total: netDepositSumLogic } },
        ],
        currentMonth: [
          {
            $match: {
              ...matchQuery,
              createdAt: { $gte: currentMonthStart, $lte: currentMonthEnd },
            },
          },
          { $group: { _id: null, total: netDepositSumLogic } },
        ],
        lastMonth: [
          {
            $match: {
              ...matchQuery,
              createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
            },
          },
          { $group: { _id: null, total: netDepositSumLogic } },
        ],
      },
    },
  ]);

  const result = stats[0];
  const totalDeposits = result.totalLifetime[0]?.total || 0;
  const currentMonthAmount = result.currentMonth[0]?.total || 0;
  const lastMonthAmount = result.lastMonth[0]?.total || 0;

  let percentageChange = 0;
  let trend: 'up' | 'down' | 'neutral' = 'neutral';

  if (lastMonthAmount > 0) {
    percentageChange =
      ((currentMonthAmount - lastMonthAmount) / lastMonthAmount) * 100;
  } else if (lastMonthAmount === 0 && currentMonthAmount > 0) {
    percentageChange = 100;
  }

  if (percentageChange > 0) trend = 'up';
  if (percentageChange < 0) trend = 'down';

  return {
    totalDeposits: Number(totalDeposits.toFixed(2)),
    metrics: {
      currentMonth: Number(currentMonthAmount.toFixed(2)),
      lastMonth: Number(lastMonthAmount.toFixed(2)),
      percentage: Number(Math.abs(percentageChange).toFixed(1)),
      trend,
    },
  };
};

export const BalanceService = {
  getBalanceSummary,
  logDonationTransaction,
  logRefundTransaction,
  getTransactionHistory,
  getDashboardAnalytics,
};
