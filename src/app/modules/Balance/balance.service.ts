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
  // The Platform Fee and GST are retained by the platform.
  const amountToCredit = donation.netAmount;

  // Update Balance
  balance.pendingBalance += amountToCredit;
  balance.lifetimeEarnings += amountToCredit;
  balance.lastTransactionAt = new Date();

  // Update Breakdown
  if (donationType === 'one-time')
    balance.pendingByType_oneTime += amountToCredit;
  if (donationType === 'recurring')
    balance.pendingByType_recurring += amountToCredit;
  if (donationType === 'round-up')
    balance.pendingByType_roundUp += amountToCredit;

  await balance.save({ session });

  // Create Ledger Entry
  const transaction: Partial<IBalanceTransaction> = {
    organization: new Types.ObjectId(organizationId),
    type: 'credit',
    category: 'donation_received',
    amount: amountToCredit, // Storing Net
    balanceAfter_pending: balance.pendingBalance,
    balanceAfter_available: balance.availableBalance,
    balanceAfter_reserved: balance.reservedBalance,
    balanceAfter_total:
      balance.pendingBalance +
      balance.availableBalance +
      balance.reservedBalance,
    donation: new Types.ObjectId(donationId),
    donationType,
    description: `Donation received (${donationType}) - Net`,

    // ✅ Store Fee Breakdown in Metadata for Audit
    metadata: {
      gross: donation.totalAmount,
      platformFee: donation.platformFee,
      gstOnFee: donation.gstOnFee,
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

  // ✅ CRITICAL: Deduct only what we credited (Net Amount)
  // If we refunded the user the Full Amount (Gross), the Platform takes the loss on the Fee/GST.
  // The Organization simply returns exactly what they received.
  const amountToDeduct = donation.netAmount;

  if (isPending) {
    balance.pendingBalance -= amountToDeduct;
    // Adjust breakdown if needed (simplified)
  } else {
    balance.availableBalance -= amountToDeduct;
  }

  balance.lifetimeRefunds += amountToDeduct;
  // Optionally adjust lifetimeEarnings or keep distinct
  balance.lifetimeEarnings -= amountToDeduct;

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
    balanceAfter_total:
      balance.pendingBalance +
      balance.availableBalance +
      balance.reservedBalance,
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
