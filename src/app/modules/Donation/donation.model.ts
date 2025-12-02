import { Schema, model } from 'mongoose';
import { IDonationModel } from './donation.interface';
import {
  DONATION_STATUS,
  DONATION_TYPE,
  DEFAULT_CURRENCY,
} from './donation.constant';

const donationSchema = new Schema<IDonationModel>(
  {
    donor: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    cause: {
      type: Schema.Types.ObjectId,
      ref: 'Cause',
    },
    donationType: {
      type: String,
      enum: DONATION_TYPE,
      required: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be at least 0.01'],
    },
    isTaxable: {
      type: Boolean,
      default: false,
      index: true,
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: [0, 'Tax amount cannot be negative'],
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0.01, 'Total amount must be at least 0.01'],
    },

    currency: {
      type: String,
      default: DEFAULT_CURRENCY,
    },
    status: {
      type: String,
      enum: DONATION_STATUS,
      default: 'pending',
    },
    donationDate: {
      type: Date,
      default: Date.now,
    },
    stripePaymentIntentId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    stripeChargeId: {
      type: String,
    },
    stripeSessionId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    stripeCustomerId: {
      type: String,
    },
    stripePaymentMethodId: {
      type: String,
    },
    specialMessage: {
      type: String,
    },
    refundReason: {
      type: String,
    },
    pointsEarned: {
      type: Number,
      default: 0,
    },
  

    // Additional fields for recurring and round-up donations
    scheduledDonationId: {
      type: Schema.Types.ObjectId,
      ref: 'ScheduledDonation',
    },
    roundUpId: {
      type: Schema.Types.ObjectId,
      ref: 'RoundUp',
    },
    roundUpTransactionIds: {
      type: [Schema.Types.ObjectId],
      ref: 'RoundUpTransaction',
    },
    receiptGenerated: {
      type: Boolean,
      default: false,
    },
    receiptId: {
      type: Schema.Types.ObjectId,
      ref: 'Receipt',
    },

    // New fields for idempotency and payment tracking
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    paymentAttempts: {
      type: Number,
      default: 0,
    },
    lastPaymentAttempt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

donationSchema.index({ donor: 1, donationDate: -1 });
donationSchema.index({ organization: 1, donationDate: -1 });
donationSchema.index({ status: 1, donationDate: -1 });
donationSchema.index({ scheduledDonationId: 1 });
donationSchema.index({ roundUpId: 1 });
donationSchema.index({ idempotencyKey: 1, donor: 1 }, { unique: true });
donationSchema.index({ lastPaymentAttempt: 1 });
donationSchema.index({ isTaxable: 1 });
donationSchema.index({ totalAmount: 1 });

export const Donation = model<IDonationModel>('Donation', donationSchema);
export default Donation;
