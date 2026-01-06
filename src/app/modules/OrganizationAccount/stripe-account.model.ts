import { Schema, model } from 'mongoose';
import { IStripeAccount } from './stripe-account.interface';

export type TStripeAccountStatus =
  | 'active'
  | 'pending'
  | 'restricted'
  | 'rejected';

const stripeAccountSchema = new Schema<IStripeAccount>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      unique: true, // 🔒 ENFORCES ONLY ONE ACCOUNT PER ORG
      index: true,
    },
    stripeAccountId: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['active', 'pending', 'restricted', 'rejected'],
      default: 'pending',
    },
    // Stripe capability flags
    chargesEnabled: { type: Boolean, default: false },
    payoutsEnabled: { type: Boolean, default: false },
    detailsSubmitted: { type: Boolean, default: false },

    // Detailed requirements for frontend alerts
    requirements: {
      currently_due: { type: [String], default: [] },
      eventually_due: { type: [String], default: [] },
      disabled_reason: { type: String, default: null },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const StripeAccount = model<IStripeAccount>(
  'StripeAccount',
  stripeAccountSchema
);
