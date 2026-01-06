import { Schema, model } from 'mongoose';

const rewardCodeSchema = new Schema(
  {
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
    // For In-Store: RWDXXXX-YYYY | For Online: ORIGINAL_CSV_CODE
    code: { type: String, required: true, unique: true, index: true },
    isGiftCard: { type: Boolean, default: false },
    isDiscountCode: { type: Boolean, default: false },
    isUsed: { type: Boolean, default: false, index: true },
    usedBy: { type: Schema.Types.ObjectId, ref: 'Client' },
    usedAt: { type: Date },
    redemption: { type: Schema.Types.ObjectId, ref: 'RewardRedemption' },
  },
  { timestamps: true }
);

export const RewardCode = model('RewardCode', rewardCodeSchema);
