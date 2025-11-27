import express from 'express';

import { ROLE } from '../Auth/auth.constant';

import * as badgeController from './badge.controller';
import * as badgeValidation from './badge.validation';
import { auth, validateRequest } from '../../middlewares';

const router = express.Router();

/**
 * @route   POST /api/badges
 * @desc    Create a new badge
 * @access  Private (Admin, Super Admin)
 */
router.post(
  '/',
  auth(ROLE.ADMIN),
  validateRequest(badgeValidation.createBadgeSchema),
  badgeController.createBadge
);

/**
 * @route   PATCH /api/badges/:id
 * @desc    Update a badge
 * @access  Private (Admin, Super Admin)
 */
router.patch(
  '/:id',
  auth(ROLE.ADMIN),
  validateRequest(badgeValidation.updateBadgeSchema),
  badgeController.updateBadge
);

/**
 * @route   GET /api/badges/:id
 * @desc    Get badge by ID
 * @access  Public
 */
router.get(
  '/:id',
  validateRequest(badgeValidation.getBadgeByIdSchema),
  badgeController.getBadgeById
);

/**
* @route   GET /api/badgesFContinue
@desc    Get all badges with filters
@access  Public
*/
router.get(
  '/',
  validateRequest(badgeValidation.getBadgesSchema),
  badgeController.getBadges
);

/**

@route   DELETE /api/badges/:id
@desc    Delete badge
@access  Private (Admin, Super Admin)
*/
router.delete(
  '/:id',
  auth(ROLE.ADMIN),
  validateRequest(badgeValidation.deleteBadgeSchema),
  badgeController.deleteBadge
);

/**

@route   POST /api/badges/assign
@desc    Assign badge to user
@access  Private (Admin, Super Admin)
*/
router.post(
  '/assign',
  auth(ROLE.ADMIN),
  validateRequest(badgeValidation.assignBadgeSchema),
  badgeController.assignBadgeToUser
);

/**

@route   GET /api/badges/user/:userId
@desc    Get user badges
@access  Private (Owner, Admin, Super Admin)
*/
router.get(
  '/user/:userId',
  auth(ROLE.CLIENT, ROLE.ADMIN),
  validateRequest(badgeValidation.getUserBadgesSchema),
  badgeController.getUserBadges
);

/**

@route   GET /api/badges/user/:userId/progress
@desc    Get all badges with user progress (for donor app)
@access  Private (Owner, Admin, Super Admin)
*/
router.get(
  '/user/:userId/progress',
  auth(ROLE.CLIENT, ROLE.ADMIN),
  badgeController.getAllBadgesWithProgress
);

/**

@route   GET /api/badges/user/:userId/badge/:badgeId
@desc    Get user badge progress for specific badge
@access  Private (Owner, Admin, Super Admin)
*/
router.get(
  '/user/:userId/badge/:badgeId',
  auth(ROLE.CLIENT, ROLE.ADMIN),
  validateRequest(badgeValidation.getUserBadgeProgressSchema),
  badgeController.getUserBadgeProgress
);

/**

@route   PATCH /api/badges/user/:userId/badge/:badgeId/progress
@desc    Update user badge progress
@access  Private (System/Admin)
*/
router.patch(
  '/user/:userId/badge/:badgeId/progress',
  auth(ROLE.ADMIN),
  validateRequest(badgeValidation.updateBadgeProgressSchema),
  badgeController.updateUserBadgeProgress
);

/**

@route   GET /api/badges/stats
@desc    Get badge statistics
@access  Private (Admin, Super Admin)
*/
router.get(
  '/stats',
  auth(ROLE.ADMIN),
  validateRequest(badgeValidation.getBadgeStatsSchema),
  badgeController.getBadgeStats
);

export const BadgeRoutes = router;
