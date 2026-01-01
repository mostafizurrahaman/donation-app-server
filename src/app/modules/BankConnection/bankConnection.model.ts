import mongoose, { Schema, Document } from 'mongoose';
import { IBankConnection } from './bankConnection.interface';
import plaidService from './bankConnection.service';
import { bankConnectiionProviderValues } from './bankConnection.constant';

export interface IBankConnectionDocument extends IBankConnection, Document {}

const BankConnectionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Auth',
    },
    provider: {
      type: String,
      required: true,
      enum: bankConnectiionProviderValues,
    },
    itemId: {
      type: String,
      required: true,
      // unique: true,
    },
    accessToken: {
      type: String,
      required: true,
    },
    accountId: {
      type: String,
      required: true,
    },
    accountName: {
      type: String,
      required: true,
    },
    accountType: {
      type: String,
      required: true,
    },
    institutionName: {
      type: String,
      required: true,
    },
    institutionId: {
      type: String,
      required: true,
    },
    connectionId: {
      type: String,
    },
    consentGivenAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    consentExpiry: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    plaidWebhookId: {
      type: String,
    },
    lastSyncAt: {
      type: Date,
    },
    lastSyncCursor: {
    
      type: String,
    },

  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        // Remove sensitive fields
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const retObj = ret as any;
        delete retObj.accessToken;
        return retObj;
      },
    },
  }
);

// Indexes for optimal performance
BankConnectionSchema.index({ user: 1, isActive: 1 });
BankConnectionSchema.index({ itemId: 1 });
BankConnectionSchema.index({ isActive: 1, lastSyncAt: 1 });

// Method to check if consent is still valid
BankConnectionSchema.methods.isConsentValid = function (): boolean {
  return this.isActive && !!this.accessToken;
};

// Method to revoke consent
BankConnectionSchema.methods.revokeConsent = async function (): Promise<void> {
  try {
    // Remove from Plaid
    await plaidService.removeItem(this.itemId);

    // Mark as inactive in our database
    this.isActive = false;
    await this.save();
  } catch (error) {
    // Still mark as inactive even if Plaid removal fails
    this.isActive = false;
    await this.save();
    throw error;
  }
};

// Static methods
BankConnectionSchema.statics.findActiveByUserId = function (userId: string) {
  return this.findOne({ user: userId, isActive: true });
};

BankConnectionSchema.statics.findActiveByAccountIds = function (
  accountIds: string[]
) {
  return this.find({ accountId: { $in: accountIds }, isActive: true });
};

export const BankConnectionModel = mongoose.model<IBankConnectionDocument>(
  'BankConnection',
  BankConnectionSchema
);
