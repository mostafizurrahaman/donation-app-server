import { Document, Types } from 'mongoose';

export interface ISubscriptionHistory {
  user: Types.ObjectId;
  subscription: Types.ObjectId; 
  stripeInvoiceId: string;
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
  extends ISubscriptionHistory,
    Document {}
