import express from 'express';
import { auth } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';
import { validateRequest } from '../../middlewares/validateRequest';
import { RewardRedemptionController } from './reward-redeemtion.controller';
import { rewardRedemptionValidation } from './reward-redeemtion.validation';
import { checkSubscription } from '../../middlewares/checkSubscription';

const router = express.Router();

// ==========================================
// CLIENT ROUTES (User Actions)
// ==========================================

// 2. Mark reward as REDEEMED (Final Step)
router.post(
  '/redeem',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  checkSubscription(),
  validateRequest(rewardRedemptionValidation.redeemRewardSchema),
  RewardRedemptionController.redeemReward
);

// Claim a reward (Deducts Points)
router.post(
  '/:id/claim',
  auth(ROLE.CLIENT),
  validateRequest(rewardRedemptionValidation.claimRewardSchema),
  RewardRedemptionController.claimReward
);

// Get currently logged-in user's claimed rewards
router.get(
  '/my/claimed',
  auth(ROLE.CLIENT),
  validateRequest(rewardRedemptionValidation.getUserClaimedRewardsSchema),
  RewardRedemptionController.getUserClaimedRewards
);

// Get details of a specific claimed reward (Redemption Ticket)
router.get(
  '/:redemptionId',
  auth(ROLE.CLIENT, ROLE.BUSINESS, ROLE.ADMIN),
  validateRequest(rewardRedemptionValidation.getClaimedRewardByIdSchema),
  RewardRedemptionController.getClaimedRewardById
);

// Cancel a claimed reward (Refunds Points) - Only if not yet redeemed
router.post(
  '/:redemptionId/cancel',
  auth(ROLE.CLIENT),

  validateRequest(rewardRedemptionValidation.cancelClaimedRewardSchema),
  RewardRedemptionController.cancelClaimedReward
);

// ==========================================
// BUSINESS ROUTES (Redemption & Management)
// ==========================================

// 1. Verify a redemption code/QR before redeeming (Scanner Step)
router.post(
  '/verify',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  checkSubscription(),
  validateRequest(rewardRedemptionValidation.verifyRedemptionSchema),
  RewardRedemptionController.verifyRedemption
);

export const RewardRedemptionRoutes = router;
