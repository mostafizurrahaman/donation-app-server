// src/app/modules/Reward/reward.route.ts
import express from 'express';
import { auth } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';
import { validateRequest } from '../../middlewares/validateRequest';
import { RewardController } from './reward.controller';
import { rewardValidation } from './reward.validation';
import { upload, uploadForParsing } from '../../lib/upload';

const router = express.Router();

// ====== PUBLIC ROUTES ======
// Get featured rewards
router.get('/featured', RewardController.getFeaturedRewards);

// Get all rewards with filters
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

// Check reward availability
router.get(
  '/:id/availability',
  validateRequest(rewardValidation.checkAvailabilitySchema),
  RewardController.checkAvailability
);

// Get rewards by business
router.get(
  '/business/:businessId',
  validateRequest(rewardValidation.getRewardsByBusinessSchema),
  RewardController.getRewardsByBusiness
);

// ====== CLIENT ROUTES (Authenticated Users) ======
// Claim a reward (DEDUCTS POINTS)
router.post(
  '/:id/claim',
  auth(ROLE.CLIENT),
  validateRequest(rewardValidation.claimRewardSchema),
  RewardController.claimReward
);

// Get user's claimed rewards
router.get(
  '/my/claimed',
  auth(ROLE.CLIENT),
  validateRequest(rewardValidation.getUserClaimedRewardsSchema),
  RewardController.getUserClaimedRewards
);

// Get specific claimed reward details
router.get(
  '/redemption/:redemptionId',
  auth(ROLE.CLIENT, ROLE.BUSINESS, ROLE.ADMIN),
  validateRequest(rewardValidation.getClaimedRewardByIdSchema),
  RewardController.getClaimedRewardById
);

// Cancel claimed reward (REFUNDS POINTS)
router.post(
  '/redemption/:redemptionId/cancel',
  auth(ROLE.CLIENT),
  validateRequest(rewardValidation.cancelClaimedRewardSchema),
  RewardController.cancelClaimedReward
);

// ====== BUSINESS/STAFF ROUTES ======
// Mark reward as redeemed (used at store)
router.post(
  '/redemption/:redemptionId/redeem',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  validateRequest(rewardValidation.redeemRewardSchema),
  RewardController.redeemReward
);

// ====== BUSINESS ADMIN ROUTES ======
// Create a new reward with image and codes file(s) upload
router.post(
  '/',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  upload.fields([
    { name: 'rewardImage', maxCount: 1 },
    { name: 'codesFiles', maxCount: 10 }, // Multiple code files for online rewards
  ]),
  validateRequest(rewardValidation.createRewardSchema),
  RewardController.createReward
);

// Update a reward with optional image upload
router.patch(
  '/:id',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  upload.fields([
    { name: 'rewardImage', maxCount: 1 },
    { name: 'codesFiles', maxCount: 10 }, // Multiple code files for online rewards
  ]),
  validateRequest(rewardValidation.updateRewardSchema),
  RewardController.updateReward
);

// Update only reward image
router.patch(
  '/:id/image',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  upload.single('rewardImage'),
  RewardController.updateRewardImage
);

// Delete reward (soft delete)
router.delete(
  '/:id',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  validateRequest(rewardValidation.deleteRewardSchema),
  RewardController.deleteReward
);

// Upload codes to existing reward (CSV/XLSX parsing) - supports multiple files
router.post(
  '/:id/codes',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  uploadForParsing.array('files', 10), // Multiple code files
  validateRequest(rewardValidation.uploadCodesSchema),
  RewardController.uploadCodes
);

// ====== ANALYTICS ROUTES ======
// Get reward statistics
router.get(
  '/analytics/stats',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  validateRequest(rewardValidation.getRewardStatsSchema),
  RewardController.getRewardStats
);

// ====== ADMIN ONLY ROUTES ======
// Archive reward (permanent delete)
router.delete(
  '/:id/archive',
  auth(ROLE.ADMIN),
  validateRequest(rewardValidation.deleteRewardSchema),
  RewardController.archiveReward
);

export const RewardRoutes = router;
