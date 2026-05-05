import { Schema, model } from 'mongoose';
import { ISubscriptionHistoryModel } from './subscriptionHistory.interface';

const subscriptionHistorySchema = new Schema<ISubscriptionHistoryModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Auth',
      required: true,
      index: true,
    },
    subscription: {
      type: Schema.Types.ObjectId,
      ref: 'Subscription',
      required: true,
      index: true,
    },

    // STRIPE AND REVENUE CAT ALTERNATIVE FIELDS
    stripeInvoiceId: { type: String, required: false }, // Changed from true to false
    revenueCatTransactionId: { type: String, required: false }, // Added
    stripePaymentIntentId: { type: String },

    amount: { type: Number, required: true },
    currency: { type: String, default: 'usd' },
    status: {
      type: String,
      enum: ['succeeded', 'failed', 'refunded'],
      required: true,
      index: true,
    },
    billingReason: { type: String },
    planType: { type: String, enum: ['monthly', 'yearly', 'trial'] },
    invoiceUrl: { type: String },
    transactionDate: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false },
);

export const SubscriptionHistory = model<ISubscriptionHistoryModel>(
  'SubscriptionHistory',
  subscriptionHistorySchema,
);
