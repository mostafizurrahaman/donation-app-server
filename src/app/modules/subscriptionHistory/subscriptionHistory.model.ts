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

    // ── Payment-provider transaction IDs (mutually exclusive) ───────────────
    // Stripe invoices populate stripeInvoiceId; RevenueCat events populate
    // revenueCatTransactionId.  Neither is required so both providers can share
    // this collection without nullable hacks.
    stripeInvoiceId: { type: String, required: false },
    revenueCatTransactionId: { type: String, required: false },
    stripePaymentIntentId: { type: String },

    amount: { type: Number, required: true },

    /**
     * Always stored in lowercase (e.g. "usd").
     * RevenueCat sends uppercase; normalisation happens in the service layer
     * before the record is created.
     */
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
