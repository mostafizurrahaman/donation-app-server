import { TStripeAccountStatus } from './stripe-account.model';
import { Document, Types } from 'mongoose';
export interface IStripeAccount extends Document {
  organization: Types.ObjectId;
  stripeAccountId: string;

  // Status Flags
  status: TStripeAccountStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;

  // Compliance Requirements (Crucial for Production)
  requirements: {
    currently_due: string[];
    eventually_due: string[];
    disabled_reason?: string;
  };

  createdAt: Date;
  updatedAt: Date;
}
