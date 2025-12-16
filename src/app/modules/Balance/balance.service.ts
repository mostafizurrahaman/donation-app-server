/* eslint-disable @typescript-eslint/no-explicit-any */
import { ClientSession, Types } from 'mongoose';
import { OrganizationBalance, BalanceTransaction } from './balance.model';

import { IBalanceTransaction } from './balance.interface';
import Donation from '../Donation/donation.model';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';

/**
 * Get or create balance record for an organization
 */
const getOrCreateBalance = async (
  organizationId: string,
  session?: ClientSession
) => {
  const query = OrganizationBalance.findOne({ organization: organizationId });
  if (session) query.session(session);

  let balance = await query;

  if (!balance) {
    const createData = [{ organization: organizationId }];
    const options = session ? { session } : {};
    const [newBalance] = await OrganizationBalance.create(createData, options);
    balance = newBalance;
  }

  return balance;
};

/**
 * Add funds from a donation (Pending State)
 * Used by Webhook Handler when payment succeeds
 */
const addDonationFunds = async (
  organizationId: string,
  donationId: string,
  donationType: 'one-time' | 'recurring' | 'round-up',
  session?: ClientSession
) => {
  const balance = await getOrCreateBalance(organizationId, session);
  const donation = await Donation.findById(donationId).session(session || null);

  if (!donation) {
    throw new Error('Donation not found during balance update');
  }

  // This matches the Destination Charge amount sent to their Stripe Connect account
  const amountToCredit = donation.netAmount;

  // Update Total Balances
  balance.pendingBalance = Number(
    (balance.pendingBalance + amountToCredit).toFixed(2)
  );
  balance.lifetimeEarnings = Number(
    (balance.lifetimeEarnings + amountToCredit).toFixed(2)
  );
  balance.lastTransactionAt = new Date();

  // Update Breakdown by

  if (donationType === 'one-time') {
    balance.pendingByType_oneTime = Number(
      (balance.pendingByType_oneTime + amountToCredit).toFixed(2)
    );
  } else if (donationType === 'recurring') {
    balance.pendingByType_recurring = Number(
      (balance.pendingByType_recurring + amountToCredit).toFixed(2)
    );
  } else if (donationType === 'round-up') {
    balance.pendingByType_roundUp = Number(
      (balance.pendingByType_roundUp + amountToCredit).toFixed(2)
    );
  }

  await balance.save({ session });

  // Create Ledger Entry
  const transaction: Partial<IBalanceTransaction> = {
    organization: new Types.ObjectId(organizationId),
    type: 'credit',
    category: 'donation_received',
    amount: amountToCredit,

    // Balance Snapshots
    balanceAfter_pending: balance.pendingBalance,
    balanceAfter_available: balance.availableBalance,
    balanceAfter_reserved: balance.reservedBalance,
    balanceAfter_total: Number(
      (
        balance.pendingBalance +
        balance.availableBalance +
        balance.reservedBalance
      ).toFixed(2)
    ),

    donation: new Types.ObjectId(donationId),
    donationType,
    description: `Donation received (${donationType}) - Net`,

    //  UPDATED METADATA: Stores the full financial picture
    metadata: {
      grossAmount: donation.totalAmount,
      baseDonation: donation.amount,
      platformFee: donation.platformFee,
      gstOnFee: donation.gstOnFee,
      stripeFee: donation.stripeFee,
      netCredited: amountToCredit,
      coverFees: donation.coverFees,
    },

    idempotencyKey: `don_${donationId}`,
  };

  await BalanceTransaction.create([transaction], { session });
};
/**
 * Get Balance Summary for Dashboard
 */
const getBalanceSummary = async (organizationId: string) => {
  const balance = await getOrCreateBalance(organizationId);
  return balance;
};

/**
 * Get Transaction History with Pagination
 */
const getTransactionHistory = async (
  organizationId: string,
  query: Record<string, unknown>
) => {
  const { page = 1, limit = 10, category, startDate, endDate } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter: any = { organization: organizationId };

  if (category) {
    filter.category = category;
  }

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

/**
 * Deduct funds for a refund
 * Used by Webhook Handler when charge.refunded occurs
 */
const deductRefund = async (
  organizationId: string,
  donationId: string,
  session?: ClientSession
) => {
  const balance = await getOrCreateBalance(organizationId, session);
  const donation = await Donation.findById(donationId).session(session || null);

  if (!donation) {
    throw new Error('Donation not found for refund deduction');
  }

  // Determine if funds are likely in Pending or Available based on clearing period
  const clearingDays = balance.clearingPeriodDays || 7;
  const clearingMs = clearingDays * 24 * 60 * 60 * 1000;
  const timeSinceDonation = Date.now() - (donation?.createdAt?.getTime() || 0);

  const isPending = timeSinceDonation < clearingMs;

  // When refunding a Destination Charge, Stripe reverses the transfer.
  // We must deduct the exact NET amount that was originally credited.
  const amountToDeduct = donation.netAmount;
  const type = donation.donationType;

  if (isPending) {
    // Deduct from Pending
    balance.pendingBalance = Number(
      (balance.pendingBalance - amountToDeduct).toFixed(2)
    );

    if (type === 'one-time')
      balance.pendingByType_oneTime = Number(
        (balance.pendingByType_oneTime - amountToDeduct).toFixed(2)
      );
    if (type === 'recurring')
      balance.pendingByType_recurring = Number(
        (balance.pendingByType_recurring - amountToDeduct).toFixed(2)
      );
    if (type === 'round-up')
      balance.pendingByType_roundUp = Number(
        (balance.pendingByType_roundUp - amountToDeduct).toFixed(2)
      );
  } else {
    // Deduct from Available
    balance.availableBalance = Number(
      (balance.availableBalance - amountToDeduct).toFixed(2)
    );

    if (type === 'one-time')
      balance.availableByType_oneTime = Number(
        (balance.availableByType_oneTime - amountToDeduct).toFixed(2)
      );
    if (type === 'recurring')
      balance.availableByType_recurring = Number(
        (balance.availableByType_recurring - amountToDeduct).toFixed(2)
      );
    if (type === 'round-up')
      balance.availableByType_roundUp = Number(
        (balance.availableByType_roundUp - amountToDeduct).toFixed(2)
      );
  }

  // Safety checks to prevent negative balances
  if (balance.pendingBalance < 0) balance.pendingBalance = 0;
  if (balance.availableBalance < 0) balance.availableBalance = 0;

  // Update Lifetime Stats
  balance.lifetimeRefunds = Number(
    (balance.lifetimeRefunds + amountToDeduct).toFixed(2)
  );
  // Reduce lifetime earnings to reflect the refund
  balance.lifetimeEarnings = Number(
    (balance.lifetimeEarnings - amountToDeduct).toFixed(2)
  );

  await balance.save({ session });

  // Create Ledger Entry
  const transaction: Partial<IBalanceTransaction> = {
    organization: new Types.ObjectId(organizationId),
    type: 'debit',
    category: 'refund_issued',
    amount: amountToDeduct,

    balanceAfter_pending: balance.pendingBalance,
    balanceAfter_available: balance.availableBalance,
    balanceAfter_reserved: balance.reservedBalance,
    balanceAfter_total: Number(
      (
        balance.pendingBalance +
        balance.availableBalance +
        balance.reservedBalance
      ).toFixed(2)
    ),

    donation: new Types.ObjectId(donationId),
    description: `Refund issued for donation ${donationId} (Net Reversal)`,
    metadata: {
      originalNet: donation.netAmount,
      refundedNet: amountToDeduct,
      stripeFeeWas: donation.stripeFee, // Note: Stripe fees are usually not refunded
    },
    idempotencyKey: `ref_${donationId}_${Date.now()}`,
  };

  await BalanceTransaction.create([transaction], { session });
};



interface IGetDataDashboardQuery {
  organization?: Types.ObjectId;
  donationType?: 'one-time' | 'round-up' | 'recurring';
  category: { $in: string[] };
}

/**
 * Get Dashboard Analytics (Net Deposits + Growth %)
 * Calculates: (Donations - Refunds) based on the filter
 */
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
  // ✅ IMPORTANT: We must include 'refund_issued' in the category filter
  const matchQuery: IGetDataDashboardQuery = {
    organization: orgObjectId,
    category: { $in: ['donation_received', 'refund_issued'] },
  };

  // Apply donation type filter if specific type requested
  if (donationType && donationType !== 'all') {
    matchQuery.donationType = donationType;
  }

  // 3. Define the Summation Logic (Donation - Refund)
  // We define this once to reuse it in all 3 facets
  const netDepositSumLogic = {
    $sum: {
      $cond: [
        { $eq: ['$category', 'donation_received'] },
        '$amount', // Add if donation
        {
          $cond: [
            { $eq: ['$category', 'refund_issued'] },
            { $multiply: ['$amount', -1] }, // Subtract if refund
            0,
          ],
        },
      ],
    },
  };

  // 4. Run Aggregation
  const stats = await BalanceTransaction.aggregate([
    {
      $facet: {
        // A. Total All Time Net
        totalLifetime: [
          { $match: matchQuery },
          { $group: { _id: null, total: netDepositSumLogic } },
        ],
        // B. Current Month Net
        currentMonth: [
          {
            $match: {
              ...matchQuery,
              createdAt: { $gte: currentMonthStart, $lte: currentMonthEnd },
            },
          },
          { $group: { _id: null, total: netDepositSumLogic } },
        ],
        // C. Last Month Net
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

  // 5. Extract Results
  const result = stats[0];

  // Default to 0 if no transactions found
  const totalDeposits = result.totalLifetime[0]?.total || 0;
  const currentMonthAmount = result.currentMonth[0]?.total || 0;
  const lastMonthAmount = result.lastMonth[0]?.total || 0;

  // 6. Calculate Percentage Change
  let percentageChange = 0;
  let trend: 'up' | 'down' | 'neutral' = 'neutral';

  if (lastMonthAmount > 0) {
    percentageChange =
      ((currentMonthAmount - lastMonthAmount) / lastMonthAmount) * 100;
  } else if (lastMonthAmount === 0 && currentMonthAmount > 0) {
    percentageChange = 100; // 100% increase from 0
  } else if (lastMonthAmount === 0 && currentMonthAmount === 0) {
    percentageChange = 0;
  }

  // Determine trend arrow
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
  getOrCreateBalance,
  addDonationFunds,
  getBalanceSummary,
  getTransactionHistory,
  deductRefund,
  getDashboardAnalytics,
};
