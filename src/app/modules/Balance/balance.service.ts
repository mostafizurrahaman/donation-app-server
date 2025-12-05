import mongoose, { ClientSession, Types } from 'mongoose';
import { OrganizationBalance, BalanceTransaction } from './balance.model';
import { AppError } from '../../utils';
import httpStatus from 'http-status';
import {
  IBalanceTransaction,
  TTransactionCategory,
  TTransactionType,
} from './balance.interface';
import Donation from '../Donation/donation.model';

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

  // ✅ CRITICAL: Credit only the NET amount to the organization
  const amountToCredit = donation.netAmount;

  // ✅ FIX: Rounding Logic for Totals
  balance.pendingBalance = Number(
    (balance.pendingBalance + amountToCredit).toFixed(2)
  );
  balance.lifetimeEarnings = Number(
    (balance.lifetimeEarnings + amountToCredit).toFixed(2)
  );
  balance.lastTransactionAt = new Date();

  // ✅ FIX: Rounding Logic for Breakdowns
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
    balanceAfter_pending: balance.pendingBalance,
    balanceAfter_available: balance.availableBalance,
    balanceAfter_reserved: balance.reservedBalance,
    // ✅ FIX: Ensure total matches sum of parts
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

    metadata: {
      gross: donation.totalAmount,
      baseDonation: donation.amount,
      platformFee: donation.platformFee,
      gstOnFee: donation.gstOnFee,
      stripeFee: donation.stripeFee || 0,
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

  // Determine if funds are likely in Pending or Available
  const clearingDays = balance.clearingPeriodDays || 7;
  const clearingMs = clearingDays * 24 * 60 * 60 * 1000;
  const timeSinceDonation = Date.now() - (donation?.createdAt?.getTime() || 0);

  const isPending = timeSinceDonation < clearingMs;
  const amountToDeduct = donation.netAmount;
  const type = donation.donationType;

  if (isPending) {
    // ✅ FIX: Rounding & Breakdown Deduction for Pending
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
    // ✅ FIX: Rounding & Breakdown Deduction for Available
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

  // Safety checks against negative values (just in case)
  if (balance.pendingBalance < 0) balance.pendingBalance = 0;
  if (balance.availableBalance < 0) balance.availableBalance = 0;

  // Update Lifetime Stats
  balance.lifetimeRefunds = Number(
    (balance.lifetimeRefunds + amountToDeduct).toFixed(2)
  );
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
    },
    idempotencyKey: `ref_${donationId}_${Date.now()}`,
  };

  await BalanceTransaction.create([transaction], { session });
};

export const BalanceService = {
  getOrCreateBalance,
  addDonationFunds,
  getBalanceSummary,
  getTransactionHistory,
  deductRefund,
};
