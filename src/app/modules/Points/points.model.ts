// src/app/modules/Points/points.model.ts
import { Schema, model, Document } from 'mongoose';
import { IPointsTransaction, IPointsBalance } from './points.interface';
import {
  TRANSACTION_TYPE_VALUES,
  POINTS_SOURCE_VALUES,
  POINTS_TIER_VALUES,
  TIER_THRESHOLDS,
} from './points.constant';

// Use Document + interface directly — no IPointsTransactionModel needed
export type PointsTransactionModel = Document & IPointsTransaction;
export type PointsBalanceModel = Document &
  IPointsBalance & {
    updateBalance(amount: number): Promise<void>;
    canAfford(amount: number): boolean;
    getTierByPoints(): 'bronze' | 'silver' | 'gold' | 'platinum';
  };

// Transaction Schema
const pointsTransactionSchema = new Schema<PointsTransactionModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    transactionType: {
      type: String,
      enum: TRANSACTION_TYPE_VALUES,
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    balance: { type: Number, required: true, min: 0 },
    source: { type: String, enum: POINTS_SOURCE_VALUES, required: true },
    donation: { type: Schema.Types.ObjectId, ref: 'Donation' },
    rewardRedemption: { type: Schema.Types.ObjectId, ref: 'RewardRedemption' },
    badge: { type: Schema.Types.ObjectId, ref: 'Badge' },
    description: { type: String, maxlength: 500 },
    metadata: { type: Schema.Types.Mixed, default: {} },
    adjustedBy: { type: Schema.Types.ObjectId, ref: 'Auth' },
    adjustmentReason: { type: String, maxlength: 500 },
    expiresAt: { type: Date },
    isExpired: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

pointsTransactionSchema.index({ user: 1, createdAt: -1 });
pointsTransactionSchema.index({ createdAt: -1 });

export const PointsTransaction = model<PointsTransactionModel>(
  'PointsTransaction',
  pointsTransactionSchema
);

// Balance Schema
const pointsBalanceSchema = new Schema<PointsBalanceModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      unique: true,
    },
    totalEarned: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    totalRefunded: { type: Number, default: 0 },
    totalAdjusted: { type: Number, default: 0 },
    totalExpired: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0, min: 0 },
    lifetimePoints: { type: Number, default: 0 },
    currentTier: { type: String, enum: POINTS_TIER_VALUES, default: 'bronze' },
    lastTransactionAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

pointsBalanceSchema.methods.updateBalance = async function (amount: number) {
  this.currentBalance += amount;
  if (amount > 0) this.lifetimePoints += amount;
  this.currentTier = this.getTierByPoints();
  this.lastTransactionAt = new Date();
  await this.save();
};

pointsBalanceSchema.methods.canAfford = function (amount: number) {
  return this.currentBalance >= amount;
};

pointsBalanceSchema.methods.getTierByPoints = function () {
  if (this.lifetimePoints >= TIER_THRESHOLDS.PLATINUM) return 'platinum';
  if (this.lifetimePoints >= TIER_THRESHOLDS.GOLD) return 'gold';
  if (this.lifetimePoints >= TIER_THRESHOLDS.SILVER) return 'silver';
  return 'bronze';
};

export const PointsBalance = model<PointsBalanceModel>(
  'PointsBalance',
  pointsBalanceSchema
);
