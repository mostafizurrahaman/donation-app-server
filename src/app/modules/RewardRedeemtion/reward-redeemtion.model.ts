// ==========================================
// Reward Redemption Schema
// ==========================================

import { model, Schema, Types } from 'mongoose';
import {
  IRewardRedemptionDocument,
  IRewardRedemptionModel,
} from '../Reward/reward.interface';
import { STATIC_POINTS_COST } from '../Reward/reward.constant';
import {
  CLAIM_EXPIRY_DAYS,
  REDEMPTION_METHOD_VALUES,
  REDEMPTION_STATUS_VALUES,
} from './reward-redeemtion.constant';

const rewardRedemptionSchema = new Schema<
  IRewardRedemptionDocument,
  IRewardRedemptionModel
>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    reward: {
      type: Schema.Types.ObjectId,
      ref: 'Reward',
      required: true,
      index: true,
    },
    business: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },

    pointsSpent: {
      type: Number,
      default: STATIC_POINTS_COST,
      required: true,
    },
    pointsTransactionId: {
      type: Schema.Types.ObjectId,
      ref: 'PointsTransaction',
    },

    status: {
      type: String,
      enum: REDEMPTION_STATUS_VALUES,
      default: 'claimed',
      index: true,
    },

    claimedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    redeemedAt: { type: Date },
    expiredAt: { type: Date },
    cancelledAt: { type: Date },

    assignedCode: { type: String },

    // ✅ The specific method used to finalize redemption
    redemptionMethod: {
      type: String,
      enum: [...REDEMPTION_METHOD_VALUES, null],
    },

    // ✅ The list of allowed methods for this claim (Snapshot)
    availableRedemptionMethods: {
      type: [String],
      enum: REDEMPTION_METHOD_VALUES,
      default: [],
    },

    qrCode: { type: String },
    qrCodeUrl: { type: String },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    redeemedByStaff: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
    },
    redemptionLocation: { type: String },
    redemptionNotes: { type: String },

    cancellationReason: { type: String },
    refundTransactionId: {
      type: Schema.Types.ObjectId,
      ref: 'PointsTransaction',
    },

    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes
rewardRedemptionSchema.index({ user: 1, reward: 1 });
rewardRedemptionSchema.index({ user: 1, status: 1 });
rewardRedemptionSchema.index({ business: 1, status: 1 });
rewardRedemptionSchema.index({ expiresAt: 1, status: 1 });
rewardRedemptionSchema.index({ idempotencyKey: 1 });
rewardRedemptionSchema.index({ assignedCode: 1 });

// Instance Methods
rewardRedemptionSchema.methods.markAsRedeemed = async function (
  staffId?: Types.ObjectId,
  notes?: string
): Promise<void> {
  if (this.status !== 'claimed') {
    throw new Error('Can only redeem claimed rewards');
  }

  this.status = 'redeemed';
  this.redeemedAt = new Date();

  if (staffId) this.redeemedByStaff = staffId;
  if (notes) this.redemptionNotes = notes;

  await this.save();
};

rewardRedemptionSchema.methods.cancel = async function (
  reason?: string
): Promise<void> {
  if (this.status !== 'claimed') {
    throw new Error('Can only cancel claimed rewards');
  }

  this.status = 'cancelled';
  this.cancelledAt = new Date();
  if (reason) this.cancellationReason = reason;

  await this.save();
};

rewardRedemptionSchema.methods.checkExpiry = async function (): Promise<void> {
  if (this.status === 'claimed' && new Date() > this.expiresAt) {
    this.status = 'expired';
    this.expiredAt = new Date();
    await this.save();
  }
};

rewardRedemptionSchema.methods.generateQRCode =
  async function (): Promise<string> {
    const qrData = JSON.stringify({
      redemptionId: this._id.toString(),
      rewardId: this.reward.toString(),
      userId: this.user.toString(),
      code: this.assignedCode || this._id.toString(),
      expiresAt: this.expiresAt.toISOString(),
    });

    const base64QR = Buffer.from(qrData).toString('base64');
    this.qrCode = base64QR;
    this.qrCodeUrl = `data:text/plain;base64,${base64QR}`;

    await this.save();
    return this.qrCode;
  };

rewardRedemptionSchema.pre('save', function (next) {
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(
      Date.now() + CLAIM_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );
  }
  next();
});

rewardRedemptionSchema.statics.findClaimedByUser = function (
  userId: Types.ObjectId
) {
  return this.find({
    user: userId,
    status: 'claimed',
    expiresAt: { $gt: new Date() },
  }).populate('reward business');
};

rewardRedemptionSchema.statics.expireOldClaims =
  async function (): Promise<number> {
    const now = new Date();
    const result = await this.updateMany(
      {
        status: 'claimed',
        expiresAt: { $lte: now },
      },
      {
        $set: {
          status: 'expired',
          expiredAt: now,
        },
      }
    );
    return result.modifiedCount;
  };

export const RewardRedemption = model<
  IRewardRedemptionDocument,
  IRewardRedemptionModel
>('RewardRedemption', rewardRedemptionSchema);
