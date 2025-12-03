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

    // ✅ Financial Fields (Australian Logic + Stripe Fees)
    amount: {
      type: Number,
      required: [true, 'Base Amount is required'],
      min: [0.01, 'Amount must be at least 0.01'], // This is the donation amount
    },
    coverFees: {
      type: Boolean,
      default: true, // Default Checked
    },
    platformFee: {
      type: Number,
      default: 0, // 5% Fee
    },
    gstOnFee: {
      type: Number,
      default: 0, // 10% GST on Platform Fee
    },
    stripeFee: {
      type: Number,
      default: 0, // ✅ NEW: 1.75% + 30c
    },
    netAmount: {
      type: Number,
      required: true, // The exact amount the Organization receives
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'], // The amount charged to the card
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

// Indexes
donationSchema.index({ donor: 1, donationDate: -1 });
donationSchema.index({ organization: 1, donationDate: -1 });
donationSchema.index({ status: 1, donationDate: -1 });
donationSchema.index({ scheduledDonationId: 1 });
donationSchema.index({ roundUpId: 1 });
donationSchema.index({ idempotencyKey: 1, donor: 1 }, { unique: true });
donationSchema.index({ lastPaymentAttempt: 1 });
donationSchema.index({ totalAmount: 1 });
donationSchema.index({ netAmount: 1 });

export const Donation = model<IDonationModel>('Donation', donationSchema);
export default Donation;
