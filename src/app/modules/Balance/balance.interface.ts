import { Document, Types } from 'mongoose';

// ==========================================
// Organization Balance (State)
// ==========================================
export interface IOrganizationBalance {
  organization: Types.ObjectId;

  // Lifetime Totals (Reporting)
  lifetimeEarnings: number; // Total donations received ever
  lifetimePaidOut: number; // Total net payouts ever
  lifetimePlatformFees: number; // Total platform fees paid ever
  lifetimeTaxDeducted: number; // Total tax deducted ever
  lifetimeRefunds: number; // Total refunds issued ever

  // Current Balances
  pendingBalance: number; // In clearing period
  availableBalance: number; // Ready to withdraw
  reservedBalance: number; // Locked for processing payouts

  // Pending Breakdown by Donation Type
  pendingByType_oneTime: number;
  pendingByType_recurring: number;
  pendingByType_roundUp: number;

  // Available Breakdown by Donation Type
  availableByType_oneTime: number;
  availableByType_recurring: number;
  availableByType_roundUp: number;

  // Configuration
  clearingPeriodDays: number; // Default: 7

  // Tracking
  lastTransactionAt?: Date;
  lastPayoutAt?: Date;
  lastReconciliationAt?: Date;
}

export interface IOrganizationBalanceModel extends IOrganizationBalance, Document {
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// Balance Transaction (Ledger/History)
// ==========================================
export type TTransactionType = 'credit' | 'debit';

export type TTransactionCategory =
  | 'donation_received' // Pending +
  | 'donation_cleared' // Pending - , Available +
  | 'payout_reserved' // Available - , Reserved +
  | 'payout_completed' // Reserved -
  | 'payout_failed' // Reserved - , Available +
  | 'platform_fee' // (Handled internally usually, or explicit debit)
  | 'tax_deducted' // (Handled internally usually)
  | 'refund_issued' // Available - (or Pending -)
  | 'adjustment_credit' // Available +
  | 'adjustment_debit'; // Available -

export interface IBalanceTransaction {
  organization: Types.ObjectId;

  // Transaction Details
  type: TTransactionType;
  category: TTransactionCategory;
  amount: number; // Always positive

  // Balance Snapshot After Transaction (Audit trail)
  balanceAfter_pending: number;
  balanceAfter_available: number;
  balanceAfter_reserved: number;
  balanceAfter_total: number;

  // Source References
  donation?: Types.ObjectId;
  payout?: Types.ObjectId;

  // For Filtering
  donationType?: 'one-time' | 'recurring' | 'round-up';

  // Details
  description: string;
  metadata?: Record<string, unknown>;

  // Admin Tracking
  processedBy?: Types.ObjectId;

  // Idempotency
  idempotencyKey?: string;
}

export interface IBalanceTransactionModel extends IBalanceTransaction, Document {
  createdAt: Date;
}