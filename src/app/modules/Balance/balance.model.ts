import { Schema, model } from 'mongoose';
import {
  IOrganizationBalanceModel,
  IBalanceTransactionModel,
} from './balance.interface';

// ==========================================
// Organization Balance Schema
// ==========================================
const organizationBalanceSchema = new Schema<IOrganizationBalanceModel>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      unique: true,
      index: true,
    },

    // Lifetime Totals
    lifetimeEarnings: { type: Number, default: 0 },
    lifetimePaidOut: { type: Number, default: 0 },
    lifetimePlatformFees: { type: Number, default: 0 },
    lifetimeTaxDeducted: { type: Number, default: 0 },
    lifetimeRefunds: { type: Number, default: 0 },

    // Current Balances
    pendingBalance: { type: Number, default: 0 },
    availableBalance: { type: Number, default: 0 },
    reservedBalance: { type: Number, default: 0 },

    // Pending Breakdown
    pendingByType_oneTime: { type: Number, default: 0 },
    pendingByType_recurring: { type: Number, default: 0 },
    pendingByType_roundUp: { type: Number, default: 0 },

    // Available Breakdown
    availableByType_oneTime: { type: Number, default: 0 },
    availableByType_recurring: { type: Number, default: 0 },
    availableByType_roundUp: { type: Number, default: 0 },

    // Configuration
    clearingPeriodDays: { type: Number, default: 7 },

    // Tracking
    lastTransactionAt: { type: Date },
    lastPayoutAt: { type: Date },
    lastReconciliationAt: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes
organizationBalanceSchema.index({ availableBalance: 1 });
organizationBalanceSchema.index({ pendingBalance: 1 });
organizationBalanceSchema.index({ lastTransactionAt: -1 });

export const OrganizationBalance = model<IOrganizationBalanceModel>(
  'OrganizationBalance',
  organizationBalanceSchema
);

// ==========================================
// Balance Transaction Schema
// ==========================================
const balanceTransactionSchema = new Schema<IBalanceTransactionModel>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    category: {
      type: String,
      enum: [
        'donation_received',
        'donation_cleared',
        'payout_reserved',
        'payout_completed',
        'payout_failed',
        'platform_fee',
        'tax_deducted',
        'refund_issued',
        'adjustment_credit',
        'adjustment_debit',
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Snapshots
    balanceAfter_pending: { type: Number, required: true },
    balanceAfter_available: { type: Number, required: true },
    balanceAfter_reserved: { type: Number, required: true },
    balanceAfter_total: { type: Number, required: true },

    // References
    donation: { type: Schema.Types.ObjectId, ref: 'Donation', index: true },
    payout: { type: Schema.Types.ObjectId, ref: 'Payout', index: true },

    donationType: {
      type: String,
      enum: ['one-time', 'recurring', 'round-up'],
    },

    description: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },

    processedBy: { type: Schema.Types.ObjectId, ref: 'Auth' },

    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Only createdAt needed for ledger
    versionKey: false,
  }
);

// Compound Indexes for filtering
balanceTransactionSchema.index({ organization: 1, createdAt: -1 });
balanceTransactionSchema.index({ organization: 1, donationType: 1, createdAt: -1 });
balanceTransactionSchema.index({ organization: 1, category: 1, createdAt: -1 });

export const BalanceTransaction = model<IBalanceTransactionModel>(
  'BalanceTransaction',
  balanceTransactionSchema
);