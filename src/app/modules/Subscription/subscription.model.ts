import { Schema, model } from 'mongoose';
import { ISubscriptionModel } from './subscription.interface';
import { PLAN_TYPE, SUBSCRIPTION_STATUS } from './subscription.constant';

const subscriptionSchema = new Schema<ISubscriptionModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Auth',
      required: true,
      unique: true,
      index: true,
    },
    stripeSubscriptionId: { type: String, unique: true, sparse: true },
    stripeCustomerId: { type: String },
    stripePriceId: { type: String },
    trialEndsAt: { type: Date },

    planType: {
      type: String,
      enum: Object.values(PLAN_TYPE),
      default: 'monthly',
    },

    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.TRIALING,
      index: true,
    },

    currentPeriodStart: { type: Date, default: Date.now },
    currentPeriodEnd: { type: Date, required: true },

    cancelAtPeriodEnd: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

export const Subscription = model<ISubscriptionModel>(
  'Subscription',
  subscriptionSchema
);
