import { Document, Types } from 'mongoose';

export type TTransactionType = 'credit' | 'debit';

export type TTransactionCategory =
  | 'donation_received'
  | 'payout_completed'
  | 'payout_failed'
  | 'refund_issued'
  | 'adjustment';

export interface IBalanceTransaction {
  organization: Types.ObjectId;
  type: TTransactionType;
  category: TTransactionCategory;
  amount: number;

  // Source References
  donation?: Types.ObjectId;
  payout?: Types.ObjectId;

  // For Filtering
  donationType?: 'one-time' | 'recurring' | 'round-up';

  description: string;
  metadata?: Record<string, unknown>;
  processedBy?: Types.ObjectId;
  idempotencyKey?: string;
}

export interface IBalanceTransactionModel
  extends IBalanceTransaction,
    Document {
  createdAt: Date;
}
