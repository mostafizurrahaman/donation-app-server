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
import { checkSubscription } from '../../middlewares/checkSubscription';

const router = express.Router();

// ==================================================
// 1. SPECIFIC STATIC ROUTES (Must come first)
// ==================================================

// User: Explore Active Rewards
router.get(
  '/explore',
  auth(ROLE.CLIENT),
  validateRequest(rewardValidation.getUserExploreRewardsSchema),
  RewardController.getUserExploreRewards
);

// Public: Get Featured Rewards
router.get('/featured', RewardController.getFeaturedRewards);

// Business: Get Own Rewards (Specific Path)
router.get(
  '/business/my-rewards',
  auth(ROLE.BUSINESS),
  checkSubscription(),
  validateRequest(rewardValidation.getBusinessRewardsSchema),
  RewardController.getBusinessRewards
);

// Admin: Get All Rewards
router.get(
  '/admin/all',
  auth(ROLE.ADMIN),
  validateRequest(rewardValidation.getAdminRewardsSchema),
  RewardController.getAdminRewards
);

// Admin: Get All Rewards
router.get(
  '/admin/analytics',
  auth(ROLE.ADMIN),
  RewardController.getAdminRewardsAnalytics
);

router.get(
  '/admin/:rewardId/details',
  auth(ROLE.ADMIN),
  RewardController.getRewardDetailsForAdmin
);

// ==================================================
// 2. DYNAMIC ROUTES (Parameters come after static)
// ==================================================

// Public: Get Rewards by Business ID (Dynamic :businessId)
// This catches /business/xyz, so it must be below /business/my-rewards
router.get(
  '/business/:businessId',
  validateRequest(rewardValidation.getRewardsByBusinessSchema),
  RewardController.getRewardsByBusiness
);

// Public: Check Reward Availability
router.get(
  '/:id/availability',
  validateRequest(rewardValidation.checkAvailabilitySchema),
  RewardController.checkAvailability
);

// Admin: Archive Reward
router.delete(
  '/:id/archive',
  auth(ROLE.ADMIN),
  validateRequest(rewardValidation.deleteRewardSchema),
  RewardController.archiveReward
);

// Business: Upload Codes
router.post(
  '/:id/codes',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  checkSubscription(),
  uploadForParsing.array('files', 10),
  validateRequest(rewardValidation.uploadCodesSchema),
  RewardController.uploadCodes
);

// Business: Update Reward Image
router.patch(
  '/:id/image',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  checkSubscription(),
  upload.single('rewardImage'),
  RewardController.updateRewardImage
);

// Public: Get Reward Details (Dynamic :id)
// This catches /:id, so it must be near the bottom
router.get(
  '/:id',
  auth(ROLE.CLIENT, ROLE.ADMIN),
  validateRequest(rewardValidation.getRewardByIdSchema),
  RewardController.getRewardById
);

// ==================================================
// 3. ROOT ROUTES & OPERATIONS
// ==================================================

// Public: Get All Rewards (Generic Filter)
router.get(
  '/',
  validateRequest(rewardValidation.getRewardsSchema),
  RewardController.getRewards
);

// Business: Create Reward
router.post(
  '/',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  checkSubscription(),
  upload.fields([
    { name: 'rewardImage', maxCount: 1 },
    { name: 'codesFiles', maxCount: 10 },
  ]),
  validateRequestFromFormData(rewardValidation.createRewardSchema),
  RewardController.createReward
);

router.post(
  '/online',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  checkSubscription(),
  upload.fields([
    { name: 'rewardImage', maxCount: 1 },
    { name: 'codesFiles', maxCount: 10 },
  ]),
  validateRequestFromFormData(rewardValidation.createRewardSchema),
  RewardController.createOnlineRewardController
);

router.patch(
  '/:id/status',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  checkSubscription(),
  validateRequest(rewardValidation.toggleRewardStatusSchema),
  RewardController.toggleRewardStatus
);

// Business: Update Reward Details
router.patch(
  '/:id',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  checkSubscription(),
  upload.fields([
    { name: 'rewardImage', maxCount: 1 },
    { name: 'codesFiles', maxCount: 10 },
  ]),
  validateRequestFromFormData(rewardValidation.updateRewardSchema),
  RewardController.updateReward
);

// Business: Soft Delete Reward
router.delete(
  '/:id',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  checkSubscription(),
  validateRequest(rewardValidation.deleteRewardSchema),
  RewardController.deleteReward
);

// Admin: Manual Maintenance Trigger
router.post(
  '/maintenance/trigger',
  auth(ROLE.ADMIN),
  RewardController.triggerRewardMaintenance
);

export const RewardRoutes = router;
