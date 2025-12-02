import { Schema, model } from 'mongoose';
import { IPayoutModel } from './payout.interface';
import {
  PAYOUT_METHOD_VALUES,
  PAYOUT_STATUS,
  PAYOUT_STATUS_VALUES,
} from './payout.constant';

const payoutSchema = new Schema<IPayoutModel>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    payoutNumber: {
      type: String,
      required: true,
      unique: true,
    },
    requestedAmount: { type: Number, required: true },
    platformFeeRate: { type: Number, default: 0 },
    platformFeeAmount: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    netAmount: { type: Number, required: true }, // The actual amount sent

    currency: { type: String, default: 'USD' },

    scheduledDate: {
      type: Date,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: PAYOUT_STATUS_VALUES,
      default: PAYOUT_STATUS.PENDING,
      index: true,
    },

    payoutMethod: {
      type: String,
      enum: PAYOUT_METHOD_VALUES,
      default: 'stripe_connect',
    },

    processedAt: { type: Date },
    completedAt: { type: Date },

    stripeTransferId: { type: String },
    stripePayoutId: { type: String },

    requestedBy: { type: Schema.Types.ObjectId, ref: 'Auth', required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'Auth' },
    approvedAt: { type: Date },

    failureReason: { type: String },
    retryCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for common queries
payoutSchema.index({ organization: 1, status: 1 });
payoutSchema.index({ status: 1, scheduledDate: 1 }); // For cron job finding due payouts

export const Payout = model<IPayoutModel>('Payout', payoutSchema);
