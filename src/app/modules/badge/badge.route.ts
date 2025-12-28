import express from 'express';
import { ROLE } from '../Auth/auth.constant';
import { auth, validateRequest } from '../../middlewares';
import { badgeController } from './badge.controller';
import {
  createBadgeSchema,
  getBadgesQuerySchema,
  updateBadgeSchema,
} from './badge.validation';
import { upload } from '../../lib';
import { validateRequestFromFormData } from '../../middlewares/validateRequest';

const router = express.Router();

// Public / User Routes
router.get(
  '/user/progress',
  auth(ROLE.CLIENT, ROLE.ADMIN),
  badgeController.getAllBadgesWithProgress
);

router.get(
  '/:id/history',
  auth(ROLE.CLIENT, ROLE.ADMIN),
  badgeController.getBadgeHistory
);

router.get('/:id', auth(ROLE.CLIENT, ROLE.ADMIN), badgeController.getBadgeById);

router.get(
  '/',
  auth(ROLE.CLIENT, ROLE.ADMIN),
  validateRequest(getBadgesQuerySchema),
  badgeController.getBadges
);

// Admin Routes
router.post(
  '/',
  auth(ROLE.ADMIN),
  upload.fields([
    { name: 'mainIcon', maxCount: 1 },
    { name: 'tier_colour', maxCount: 1 },
    { name: 'tier_bronze', maxCount: 1 },
    { name: 'tier_silver', maxCount: 1 },
    { name: 'tier_gold', maxCount: 1 },
    { name: 'tier_one-tier', maxCount: 1 },
  ]),
  validateRequestFromFormData(createBadgeSchema),
  badgeController.createBadge
);

router.patch(
  '/:id',
  auth(ROLE.ADMIN),
  upload.fields([
    { name: 'mainIcon', maxCount: 1 },
    { name: 'tier_colour', maxCount: 1 },
    { name: 'tier_bronze', maxCount: 1 },
    { name: 'tier_silver', maxCount: 1 },
    { name: 'tier_gold', maxCount: 1 },
    { name: 'tier_one-tier', maxCount: 1 },
  ]),
  validateRequestFromFormData(updateBadgeSchema),
  badgeController.updateBadge
);

router.delete('/:id', auth(ROLE.ADMIN), badgeController.deleteBadge);

export const BadgeRoutes = router;
