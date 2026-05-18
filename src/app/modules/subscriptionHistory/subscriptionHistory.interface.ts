import { Document, Types } from 'mongoose';

export interface ISubscriptionHistory {
  user: Types.ObjectId;
  subscription: Types.ObjectId;

  /**
   * Exactly one of these two transaction ID fields will be populated,
   * depending on which payment provider processed the event.
   */
  stripeInvoiceId?: string;
  revenueCatTransactionId?: string;

  stripePaymentIntentId?: string;

  amount: number;

  /**
   * ISO 4217 currency code stored in lowercase (e.g. "usd", "aud").
   * Both Stripe (already lowercase) and RevenueCat (normalised on ingestion)
   * are stored in this format so comparisons and display logic are consistent.
   */
  currency: string;

  status: 'succeeded' | 'failed' | 'refunded';
  billingReason: string;
  planType: 'monthly' | 'yearly' | 'trial';
  invoiceUrl?: string;
  transactionDate: Date;
}

export interface ISubscriptionHistoryModel
  extends ISubscriptionHistory, Document {}
