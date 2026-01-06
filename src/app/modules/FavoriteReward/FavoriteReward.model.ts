import { Schema, model } from 'mongoose';
import { IFavoriteReward } from './FavoriteReward.interface';

const FavoriteRewardSchema = new Schema<IFavoriteReward>(
  {
    reward: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Reward',
    },
    user: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Auth',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const FavoriteReward = model<IFavoriteReward>(
  'FavoriteReward',
  FavoriteRewardSchema
);
