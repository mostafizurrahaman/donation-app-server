import { Schema, model } from 'mongoose';
import { IReceiptModel } from './receipt.interface';

const receiptSchema = new Schema<IReceiptModel>(
  {
    donation: {
      type: Schema.Types.ObjectId,
      ref: 'Donation',
      required: [true, 'Donation is required'],
      unique: true,
      index: true,
    },
    donor: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: [true, 'Donor is required'],
      index: true,
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization is required'],
      index: true,
    },
    cause: {
      type: Schema.Types.ObjectId,
      ref: 'Cause',
    },

    receiptNumber: {
      type: String,
      required: [true, 'Receipt number is required'],
      unique: true,
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
    },
    isTaxable: {
      type: Boolean,
      default: false,
    },
    taxAmount: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
    },

    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
    },
    donationType: {
      type: String,
      enum: ['one-time', 'recurring', 'round-up'],
      required: true,
    },
    donationDate: {
      type: Date,
      required: true,
      index: true,
    },
    paymentMethod: {
      type: String,
    },

    taxDeductible: {
      type: Boolean,
      default: false,
    },
    abnNumber: {
      type: String,
    },
    zakatEligible: {
      type: Boolean,
      default: false,
    },

    pdfUrl: {
      type: String,
      required: [true, 'PDF URL is required'],
    },
    pdfKey: {
      type: String,
      required: [true, 'PDF key is required'],
    },

    emailSent: {
      type: Boolean,
      default: false,
      index: true,
    },
    emailSentAt: {
      type: Date,
    },
    emailAttempts: {
      type: Number,
      default: 0,
    },
    lastEmailError: {
      type: String,
    },

    donorName: {
      type: String,
      required: true,
    },
    donorEmail: {
      type: String,
      required: true,
      index: true,
    },

    organizationName: {
      type: String,
      required: true,
    },
    organizationEmail: {
      type: String,
    },
    organizationAddress: {
      type: String,
    },

    specialMessage: {
      type: String,
      maxlength: 500,
    },

    status: {
      type: String,
      enum: ['pending', 'generated', 'sent', 'failed'],
      default: 'pending',
      index: true,
    },

    generatedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes
receiptSchema.index({ donor: 1, createdAt: -1 });
receiptSchema.index({ organization: 1, createdAt: -1 });
receiptSchema.index({ receiptNumber: 1 });
receiptSchema.index({ emailSent: 1 });
receiptSchema.index({ status: 1 });
receiptSchema.index({ donationDate: -1 });
receiptSchema.index({ isTaxable: 1 });
receiptSchema.index({ totalAmount: 1 });

export const Receipt = model<IReceiptModel>('Receipt', receiptSchema);
