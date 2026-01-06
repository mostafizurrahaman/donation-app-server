import { Schema, model } from 'mongoose';
import { IBalanceTransactionModel } from './balance.interface';

// ==========================================
// Balance Transaction Schema (History/Analytics Only)
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
        'payout_completed',
        'payout_failed',
        'refund_issued',
        'adjustment',
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
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
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

// Compound Indexes for filtering
balanceTransactionSchema.index({ organization: 1, createdAt: -1 });
balanceTransactionSchema.index({
  organization: 1,
  donationType: 1,
  createdAt: -1,
});

export const BalanceTransaction = model<IBalanceTransactionModel>(
  'BalanceTransaction',
  balanceTransactionSchema
);
