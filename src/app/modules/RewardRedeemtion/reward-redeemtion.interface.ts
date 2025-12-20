import { keyof } from 'zod';
import {
  REDEMPTION_METHOD,
  REDEMPTION_METHOD_VALUES,
} from './reward-redeemtion.constant';

export type RedemptionMethod =
  (typeof REDEMPTION_METHOD)[keyof typeof REDEMPTION_METHOD];
