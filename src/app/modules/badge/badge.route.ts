// src/app/modules/badge/badge.route.ts

import express from 'express';

import { ROLE } from '../Auth/auth.constant';

import * as badgeController from './badge.controller';
import * as badgeValidation from './badge.validation';
import { auth, validateRequest } from '../../middlewares';

const router = express.Router();

// Create badge
router.post(
  '/',
  auth(ROLE.ADMIN),
  validateRequest(badgeValidation.createBadgeSchema),
  badgeController.createBadge
);

// Update badge
router.patch(
  '/:id',
  auth(ROLE.ADMIN),
  validateRequest(badgeValidation.updateBadgeSchema),
  badgeController.updateBadge
);

// Get badge by ID
router.get(
  '/:id',
  validateRequest(badgeValidation.getBadgeByIdSchema),
  badgeController.getBadgeById
);

// Get all badges
router.get(
  '/',
  validateRequest(badgeValidation.getBadgesSchema),
  badgeController.getBadges
);

// Delete badge
router.delete(
  '/:id',
  auth(ROLE.ADMIN),
  validateRequest(badgeValidation.deleteBadgeSchema),
  badgeController.deleteBadge
);

// Assign badge to user
router.post(
  '/assign',
  auth(ROLE.ADMIN),
  validateRequest(badgeValidation.assignBadgeSchema),
  badgeController.assignBadgeToUser
);

// Get user badges
router.get(
  '/user/:userId',
  auth(ROLE.CLIENT, ROLE.ADMIN),
  validateRequest(badgeValidation.getUserBadgesSchema),
  badgeController.getUserBadges
);

// Get all badges with user progress
router.get(
  '/user/:userId/progress',
  auth(ROLE.CLIENT, ROLE.ADMIN),
  badgeController.getAllBadgesWithProgress
);

// Get user badge progress for specific badge
router.get(
  '/user/:userId/badge/:badgeId',
  auth(ROLE.CLIENT, ROLE.ADMIN),
  validateRequest(badgeValidation.getUserBadgeProgressSchema),
  badgeController.getUserBadgeProgress
);

// Update user badge progress
router.patch(
  '/user/:userId/badge/:badgeId/progress',
  auth(ROLE.ADMIN),
  validateRequest(badgeValidation.updateBadgeProgressSchema),
  badgeController.updateUserBadgeProgress
);

// Get badge statistics
router.get(
  '/stats',
  auth(ROLE.ADMIN),
  validateRequest(badgeValidation.getBadgeStatsSchema),
  badgeController.getBadgeStats
);

export const BadgeRoutes = router;
