import { Document, Types } from 'mongoose';

export interface IPayout {
  organization: Types.ObjectId;
  payoutNumber: string; // e.g., PO-2401-00001

  // Amount Breakdown
  requestedAmount: number; // Gross
  platformFeeRate: number; // %
  platformFeeAmount: number;
  taxRate: number; // %
  taxAmount: number;
  netAmount: number; // What org receives

  currency: string;

  // Scheduling
  scheduledDate: Date;

  // Status
  status:
    | 'pending'
    | 'approved'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'cancelled';

  // Processing
  payoutMethod: 'stripe_connect' | 'bank_transfer';
  processedAt?: Date;
  completedAt?: Date;

  // Stripe Details
  stripeTransferId?: string;
  stripePayoutId?: string;

  // Workflow
  requestedBy: Types.ObjectId;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;

  // Failure Handling
  failureReason?: string;
  retryCount: number;

  createdAt: Date;
  updatedAt: Date;
}

export interface IPayoutModel extends IPayout, Document {}
