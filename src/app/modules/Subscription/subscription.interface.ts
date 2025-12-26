import { Document, Types } from 'mongoose';
import { TPlanType, TSubscriptionStatus } from './subscription.constant';

export interface ISubscription {
  user: Types.ObjectId; // Reference to Auth (Owner)
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  stripePriceId?: string;
  planType: TPlanType;
  status: TSubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface ISubscriptionModel extends ISubscription, Document {}
