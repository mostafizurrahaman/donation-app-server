// src/app/modules/Reward/reward.route.ts
import express from 'express';
import { auth } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';
import {
  validateRequest,
  validateRequestFromFormData,
} from '../../middlewares/validateRequest';
import { RewardController } from './reward.controller';
import { rewardValidation } from './reward.validation';
import { upload, uploadForParsing } from '../../lib/upload';

const router = express.Router();

// ==========================================
// PUBLIC / GENERAL ROUTES
// ==========================================

// Get featured rewards
router.get('/featured', RewardController.getFeaturedRewards);

// Get all rewards with filters (search, category, type)
router.get(
  '/',
  validateRequest(rewardValidation.getRewardsSchema),
  RewardController.getRewards
);

// Get reward by ID
router.get(
  '/:id',
  validateRequest(rewardValidation.getRewardByIdSchema),
  RewardController.getRewardById
);

// Check if a reward is available for a specific user
router.get(
  '/:id/availability',
  validateRequest(rewardValidation.checkAvailabilitySchema),
  RewardController.checkAvailability
);

// Get rewards belonging to a specific business
router.get(
  '/business/:businessId',
  validateRequest(rewardValidation.getRewardsByBusinessSchema),
  RewardController.getRewardsByBusiness
);

// ==========================================
// CLIENT ROUTES (User Actions)
// ==========================================

// Claim a reward (Deducts Points)
router.post(
  '/:id/claim',
  auth(ROLE.CLIENT),
  validateRequest(rewardValidation.claimRewardSchema),
  RewardController.claimReward
);

// Get currently logged-in user's claimed rewards
router.get(
  '/my/claimed',
  auth(ROLE.CLIENT),
  validateRequest(rewardValidation.getUserClaimedRewardsSchema),
  RewardController.getUserClaimedRewards
);

// Get details of a specific claimed reward (Redemption Ticket)
router.get(
  '/redemption/:redemptionId',
  auth(ROLE.CLIENT, ROLE.BUSINESS, ROLE.ADMIN),
  validateRequest(rewardValidation.getClaimedRewardByIdSchema),
  RewardController.getClaimedRewardById
);

// Cancel a claimed reward (Refunds Points) - Only if not yet redeemed
router.post(
  '/redemption/:redemptionId/cancel',
  auth(ROLE.CLIENT),
  validateRequest(rewardValidation.cancelClaimedRewardSchema),
  RewardController.cancelClaimedReward
);

// ==========================================
// BUSINESS ROUTES (Redemption & Management)
// ==========================================

// 1. Verify a redemption code/QR before redeeming (Scanner Step)
router.post(
  '/redemption/verify',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  validateRequest(rewardValidation.verifyRedemptionSchema),
  RewardController.verifyRedemption
);

// 2. Mark reward as REDEEMED (Final Step)
router.post(
  '/redemption/:redemptionId/redeem',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  validateRequest(rewardValidation.redeemRewardSchema),
  RewardController.redeemReward
);

// Create a new reward
router.post(
  '/',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  upload.fields([
    { name: 'rewardImage', maxCount: 1 },
    { name: 'codesFiles', maxCount: 10 },
  ]),
  validateRequestFromFormData(rewardValidation.createRewardSchema),
  RewardController.createReward
);

// Update a reward
router.patch(
  '/:id',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  upload.fields([
    { name: 'rewardImage', maxCount: 1 },
    { name: 'codesFiles', maxCount: 10 },
  ]),
  validateRequestFromFormData(rewardValidation.updateRewardSchema),
  RewardController.updateReward
);

// Update only reward image
router.patch(
  '/:id/image',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  upload.single('rewardImage'),
  RewardController.updateRewardImage
);

// Delete reward (Soft Delete)
router.delete(
  '/:id',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  validateRequest(rewardValidation.deleteRewardSchema),
  RewardController.deleteReward
);

// Upload codes CSV/XLSX to existing reward
router.post(
  '/:id/codes',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  uploadForParsing.array('files', 10),
  validateRequest(rewardValidation.uploadCodesSchema),
  RewardController.uploadCodes
);

// Get analytics/stats for rewards
router.get(
  '/analytics/stats',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  validateRequest(rewardValidation.getRewardStatsSchema),
  RewardController.getRewardStats
);

// ==========================================
// ADMIN ROUTES
// ==========================================

// Archive reward (Hard/Permanent Delete)
router.delete(
  '/:id/archive',
  auth(ROLE.ADMIN),
  validateRequest(rewardValidation.deleteRewardSchema),
  RewardController.archiveReward
);

// Manual Trigger for Maintenance Job
router.post(
  '/maintenance/trigger',
  auth(ROLE.ADMIN),
  RewardController.triggerRewardMaintenance
);

export const RewardRoutes = router;
