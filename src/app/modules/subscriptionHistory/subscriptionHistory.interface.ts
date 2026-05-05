import { Document, Types } from 'mongoose';

export interface ISubscriptionHistory {
  user: Types.ObjectId;
  subscription: Types.ObjectId;

  // Revenue cat and stripe alternative fields:
  stripeInvoiceId?: string; // Make optional
  revenueCatTransactionId?: string; // Add RevenueCat transaction ID
  stripePaymentIntentId?: string;

  amount: number;
  currency: string;
  status: 'succeeded' | 'failed' | 'refunded';
  billingReason: string;
  planType: 'monthly' | 'yearly' | 'trial';
  invoiceUrl?: string;
  transactionDate: Date;
}

export interface ISubscriptionHistoryModel
  extends ISubscriptionHistory, Document {}
