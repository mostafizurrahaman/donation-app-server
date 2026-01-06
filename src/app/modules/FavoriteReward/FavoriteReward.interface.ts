import { Types } from 'mongoose';
export interface IFavoriteReward {
  user: Types.ObjectId;
  reward: Types.ObjectId;
}


