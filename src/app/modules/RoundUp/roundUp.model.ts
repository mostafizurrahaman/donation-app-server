import mongoose, { Schema, Document } from 'mongoose';
import { IRoundUp, TRoundUpStatus } from './roundUp.interface';

export interface IRoundUpDocument extends IRoundUp, Document {
  resetMonthlyTotal(): void;
  addRoundUpAmount(amount: number): boolean;
  updateStatus(newStatus: TRoundUpStatus): void;
  checkAndUpdateThresholdStatus(): TRoundUpStatus;
  completeDonationCycle(): Promise<void>;
  cancelRoundUp(reason?: string): Promise<void>;
  markAsFailed(failureReason?: string): Promise<void>;
  resetToPending(): Promise<void>;
  canSwitchCharity(): boolean;
  switchCharity(newOrganizationId: string): boolean;
}

const RoundUpSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Auth',
      required: true,
      index: true,
    },
    organization: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    cause: {
      type: Schema.Types.ObjectId,
      ref: 'Cause',
      required: [true, 'Cause is required'],
      index: true,
    },
    bankConnection: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'BankConnection',
      index: true,
    },
    paymentMethod: {
      type: Schema.Types.ObjectId,
      ref: 'PaymentMethod',
      required: [true, 'Payment method is required for RoundUp donations'],
      index: true,
    },

    isTaxable: {
      type: Boolean,
      default: false,
      index: true,
    },

    monthlyThreshold: {
      type: Schema.Types.Mixed,
      validate: {
        validator: function (value: unknown) {
          return (
            value === 'no-limit' ||
            (typeof value === 'number' && value >= 3 && value <= 1000)
          );
        },
        message: 'Monthly threshold must be "no-limit" or a number at least $3',
      },
      default: undefined,
    },
    specialMessage: {
      type: String,
      maxlength: [250, 'Special message must not exceed 250 characters'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'cancelled', 'failed'],
      default: 'pending',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    totalAccumulated: {
      type: Number,
      default: 0,
      min: 0,
    },
    currentMonthTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastMonthReset: {
      type: Date,
      default: Date.now,
    },
    lastCharitySwitch: {
      type: Date,
    },

    // Webhook-based donation tracking fields
    lastDonationAttempt: {
      type: Date,
    },
    lastSuccessfulDonation: {
      type: Date,
    },
    lastDonationFailure: {
      type: Date,
    },
    lastDonationFailureReason: {
      type: String,
      maxlength: [500, 'Failure reason must not exceed 500 characters'],
    },
    cancelReason: {
      type: String,
      maxlength: [500, 'Failure reason must not exceed 500 characters'],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for checking if monthly threshold is met
RoundUpSchema.virtual('isThresholdMet').get(function (this: IRoundUpDocument) {
  return (
    this.monthlyThreshold !== 'no-limit' &&
    typeof this.monthlyThreshold === 'number' &&
    this.currentMonthTotal >= this.monthlyThreshold
  );
});

// Virtual for days since last charity switch
RoundUpSchema.virtual('daysSinceLastCharitySwitch').get(function (
  this: IRoundUpDocument
) {
  if (!this.lastCharitySwitch) return Infinity;
  return Math.floor(
    (Date.now() - this.lastCharitySwitch.getTime()) / (1000 * 60 * 60 * 24)
  );
});

// Method to reset monthly total
RoundUpSchema.methods.resetMonthlyTotal = function (
  this: IRoundUpDocument
): void {
  this.currentMonthTotal = 0;
  this.lastMonthReset = new Date();
  this.save();
};

// Method to add round-up amount
RoundUpSchema.methods.addRoundUpAmount = function (
  this: IRoundUpDocument,
  amount: number
): boolean {
  this.currentMonthTotal += amount;
  this.totalAccumulated += amount;

  const thresholdMet =
    this.monthlyThreshold !== 'no-limit' &&
    typeof this.monthlyThreshold === 'number' &&
    this.currentMonthTotal >= this.monthlyThreshold;

  // Update status if threshold is met and current status is pending
  if (thresholdMet && this.status === 'pending') {
    this.status = 'processing';
  }

  this.save();
  return !!thresholdMet;
};

// Method to update status (backend only)
RoundUpSchema.methods.updateStatus = function (
  this: IRoundUpDocument,
  newStatus: TRoundUpStatus
): void {
  this.status = newStatus;
  this.save();
};

// Method to check if monthly threshold is met and update status
RoundUpSchema.methods.checkAndUpdateThresholdStatus = function (
  this: IRoundUpDocument
): TRoundUpStatus {
  const thresholdMet =
    this.monthlyThreshold !== 'no-limit' &&
    typeof this.monthlyThreshold === 'number' &&
    this.currentMonthTotal >= this.monthlyThreshold;

  if (thresholdMet && this.status === 'pending') {
    this.status = 'processing';
  }

  this.save();
  return this.status;
};

// Method to complete donation cycle (sets status to completed and resets monthly total)
RoundUpSchema.methods.completeDonationCycle = async function (
  this: IRoundUpDocument
): Promise<void> {
  this.status = 'completed';
  this.currentMonthTotal = 0;
  this.lastMonthReset = new Date();
  this.lastSuccessfulDonation = new Date();
  await this.save();

  // Reset to pending for next cycle after a short delay
  setTimeout(async () => {
    this.status = 'pending';
    await this.save();
  }, 1000);
};

// Method to cancel round-up (user initiated or bank connection lost)
RoundUpSchema.methods.cancelRoundUp = async function (
  this: IRoundUpDocument,
  _reason?: string
): Promise<void> {
  this.status = 'cancelled';
  this.cancelReason = _reason;
  this.enabled = false;
  await this.save();
};

// Method to mark round-up as failed (payment processing failed)
RoundUpSchema.methods.markAsFailed = async function (
  this: IRoundUpDocument,
  failureReason?: string
): Promise<void> {
  this.status = 'failed';
  this.lastDonationFailure = new Date();
  this.lastDonationFailureReason = failureReason;
  await this.save();
};

// Method to reset status to pending (after failure resolution)
RoundUpSchema.methods.resetToPending = async function (
  this: IRoundUpDocument
): Promise<void> {
  this.status = 'pending';
  await this.save();
};

// Method to check if organization switch is allowed
RoundUpSchema.methods.canSwitchCharity = function (
  this: IRoundUpDocument & { canSwitchCharity: () => boolean }
): boolean {
  if (!this.lastCharitySwitch) return true;
  const daysSinceSwitch = Math.floor(
    (Date.now() - this.lastCharitySwitch.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSinceSwitch >= 30;
};

// Method to switch organization
RoundUpSchema.methods.switchCharity = function (
  this: IRoundUpDocument & { canSwitchCharity: () => boolean },
  newOrganizationId: string
): boolean {
  if (!this.canSwitchCharity()) {
    return false;
  }

  this.organization = newOrganizationId;
  this.lastCharitySwitch = new Date();
  this.save();
  return true;
};

// Static methods
RoundUpSchema.statics.findActiveByUserId = function (userId: string) {
  return this.findOne({
    user: userId,
    isActive: true,
    enabled: true,
  });
};

RoundUpSchema.statics.findByBankConnection = function (
  bankConnectionId: string
) {
  return this.findOne({
    bankConnection: bankConnectionId,
    isActive: true,
  });
};

RoundUpSchema.statics.findByOrganization = function (organizationId: string) {
  return this.find({
    organization: organizationId,
    isActive: true,
  });
};

// Compound indexes
RoundUpSchema.index({ user: 1, isActive: 1 });
RoundUpSchema.index({ organization: 1, isActive: 1 });
RoundUpSchema.index({ bankConnection: 1, isActive: 1 });
RoundUpSchema.index({ isActive: 1, enabled: 1 });
RoundUpSchema.index({ isTaxable: 1 });

export const RoundUpModel = mongoose.model<IRoundUpDocument>(
  'RoundUp',
  RoundUpSchema
);
