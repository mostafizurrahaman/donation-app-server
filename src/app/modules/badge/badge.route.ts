import express from 'express';
import { ROLE } from '../Auth/auth.constant';
import { auth, validateRequest } from '../../middlewares';
import { badgeController } from './badge.controller';
import { createBadgeSchema, updateBadgeSchema } from './badge.validation';
import { upload } from '../../lib';

const router = express.Router();

// Public / User Routes
router.get(
  '/user/progress',
  auth(ROLE.CLIENT, ROLE.ADMIN),
  badgeController.getAllBadgesWithProgress
);

router.get('/:id', auth(ROLE.CLIENT, ROLE.ADMIN), badgeController.getBadgeById);

router.get('/', auth(ROLE.CLIENT, ROLE.ADMIN), badgeController.getBadges);

// Admin Routes
router.post(
  '/',
  auth(ROLE.ADMIN),
  upload.single('icon'),
  validateRequest(createBadgeSchema),
  badgeController.createBadge
);

router.patch(
  '/:id',
  auth(ROLE.ADMIN),
  upload.single('icon'),
  validateRequest(updateBadgeSchema),
  badgeController.updateBadge
);

router.delete('/:id', auth(ROLE.ADMIN), badgeController.deleteBadge);

export const BadgeRoutes = router;
