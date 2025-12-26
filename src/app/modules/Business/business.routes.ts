import { Router } from 'express';

import { upload } from '../../lib';
import { ROLE } from '../Auth/auth.constant';
import {
  validateRequest,
  validateRequestFromFormData,
} from '../../middlewares/validateRequest';
import { auth } from '../../middlewares';
import { BusinessValidation } from './business.validation';
import { BusinessController } from './business.controller';
import { checkSubscription } from './../../middlewares/checkSubscription';

const router = Router();

router.get(
  '/overview',
  auth(ROLE.BUSINESS),
  checkSubscription(),
  BusinessController.getBusinessOverview
);

router.get(
  '/recent-activity',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  checkSubscription(),
  BusinessController.getBusinessRecentActivity
);
router.get(
  '/analytics',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  checkSubscription(),
  BusinessController.getBusinessAnalytics
);

router.get(
  '/analytics/:rewardId',
  auth(ROLE.BUSINESS, ROLE.ADMIN),
  checkSubscription(),
  BusinessController.getSingleRewardAnalytics
);

// Update Business Profile Route
router.patch(
  '/update-profile',
  auth(ROLE.BUSINESS),

  upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'logoImage', maxCount: 1 },
  ]),
  validateRequestFromFormData(BusinessValidation.updateBusinessProfileSchema),
  BusinessController.updateBusinessProfile
);

router.get(
  '/:businessId',
  auth(ROLE.CLIENT, ROLE.ADMIN),
  validateRequest(BusinessValidation.getBusinessProfileValidaitonSchema),
  BusinessController.getBusinessProfileById
);

router.patch(
  '/:businessId',
  auth(ROLE.CLIENT, ROLE.ADMIN),
  validateRequest(BusinessValidation.getBusinessProfileValidaitonSchema),
  BusinessController.increaseWebsiteCount
);

export const BusinessRoutes = router;
