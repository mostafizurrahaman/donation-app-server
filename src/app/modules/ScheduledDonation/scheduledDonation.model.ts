import { Schema, model } from 'mongoose';
import {
  RECURRING_FREQUENCY,
  DEFAULT_CURRENCY,
} from '../Donation/donation.constant';
import { IScheduledDonationModel } from '../Donation/donation.interface';

/**
 * ScheduledDonation Schema - Minimal Approach
 *
 * This schema stores ONLY:
 * 1. Scheduling configuration (frequency, dates, status)
 * 2. Execution tracking (lastExecutedDate, totalExecutions)
 * 3. Template data (what to donate: amount, cause, payment method)
 *
 * When a scheduled donation executes, it creates a full Donation record with:
 * - donationType: 'recurring'
 * - scheduledDonationId: reference to this ScheduledDonation
 * - All payment/transaction fields (stripePaymentIntentId, status, etc.)
 */
const scheduledDonationSchema = new Schema<IScheduledDonationModel>(
  {
    // User & Organization (Template Data)
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: [true, 'User is required'],
      index: true,
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization is required'],
      index: true,
    },

    // Donation Template (what to donate)
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be at least 0.01'],
    },

    isTaxable: {
      type: Boolean,
      default: false,
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
      uppercase: true,
    },
    cause: {
      type: Schema.Types.ObjectId,
      ref: 'Cause',
      required: [true, 'Cause is required'],
      index: true,
    },
    specialMessage: {
      type: String,
      maxlength: [500, 'Special message cannot exceed 500 characters'],
      trim: true,
    },

    // Payment Information
    stripeCustomerId: {
      type: String,
      required: [true, 'Stripe Customer ID is required'],
      index: true,
    },
    paymentMethod: {
      type: Schema.Types.ObjectId,
      ref: 'PaymentMethod',
      required: [true, 'Payment method is required'],
    },

    // Scheduling Configuration
    frequency: {
      type: String,
      enum: {
        values: RECURRING_FREQUENCY,
        message: 'Invalid frequency: {VALUE}',
      },
      required: [true, 'Frequency is required'],
    },
    customInterval: {
      value: {
        type: Number,
        min: [1, 'Interval value must be at least 1'],
      },
      unit: {
        type: String,
        enum: {
          values: ['days', 'weeks', 'months'],
          message: 'Invalid interval unit: {VALUE}',
        },
      },
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    nextDonationDate: {
      type: Date,
      required: [true, 'Next donation date is required'],
      index: true,
    },
    endDate: {
      type: Date,
      validate: {
        validator: function (this: IScheduledDonationModel, value: Date) {
          return !value || value > this.startDate;
        },
        message: 'End date must be after start date',
      },
    },

    // Status & Execution Tracking
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastExecutedDate: {
      type: Date,
    },
    totalExecutions: {
      type: Number,
      default: 0,
      min: [0, 'Total executions cannot be negative'],
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
scheduledDonationSchema.index({ user: 1, isActive: 1 });
scheduledDonationSchema.index({ organization: 1, isActive: 1 });
scheduledDonationSchema.index({ nextDonationDate: 1, isActive: 1 });
scheduledDonationSchema.index({ stripeCustomerId: 1, isActive: 1 });
scheduledDonationSchema.index({ isTaxable: 1 });

export const ScheduledDonation = model<IScheduledDonationModel>(
  'ScheduledDonation',
  scheduledDonationSchema
);
