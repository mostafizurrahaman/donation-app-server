// src/app/modules/Reward/reward.route.ts
import express from 'express';
import { auth } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';
import { validateRequest } from '../../middlewares/validateRequest';
import * as rewardController from './reward.controller';
import * as rewardValidation from './reward.validation';
import { uploadForParsing } from '../../lib/upload';

const router = express.Router();

// Get featured rewards
router.get('/featured', rewardController.getFeaturedRewards);

// Get all rewards with filters
router.get(
  '/',
  validateRequest(rewardValidation.getRewardsSchema),
  rewardController.getRewards
);

// Get reward by ID
router.get(
  '/:id',
  validateRequest(rewardValidation.getRewardByIdSchema),
  rewardController.getRewardById
);

// Check reward availability
router.get(
  '/:id/availability',
  validateRequest(rewardValidation.checkAvailabilitySchema),
  rewardController.checkAvailability
);

// Get rewards by business
router.get(
  '/business/:businessId',
  validateRequest(rewardValidation.getRewardsByBusinessSchema),
  rewardController.getRewardsByBusiness
);

// Create a new reward (Business/Admin)
router.post(
  '/',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  uploadForParsing.single('codesFile'),
  validateRequest(rewardValidation.createRewardSchema),
  rewardController.createReward
);

// Update a reward (Business/Admin)
router.patch(
  '/:id',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  validateRequest(rewardValidation.updateRewardSchema),
  rewardController.updateReward
);

// Delete (soft delete) reward (Business/Admin)
router.delete(
  '/:id',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  validateRequest(rewardValidation.deleteRewardSchema),
  rewardController.deleteReward
);

// Upload codes to reward (Business/Admin)
router.post(
  '/:id/codes',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  uploadForParsing.single('file'),
  validateRequest(rewardValidation.uploadCodesSchema),
  rewardController.uploadCodes
);

// Get reward statistics (Business/Admin)
router.get(
  '/analytics/stats',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  validateRequest(rewardValidation.getRewardStatsSchema),
  rewardController.getRewardStats
);

// Archive (permanent delete) reward
router.delete(
  '/:id/archive',
  auth(ROLE.ADMIN),
  validateRequest(rewardValidation.deleteRewardSchema),
  rewardController.archiveReward
);

export const RewardRoutes = router;
