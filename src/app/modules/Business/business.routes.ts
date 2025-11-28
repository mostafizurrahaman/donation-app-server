import { Router } from 'express';

import { upload } from '../../lib';
import { ROLE } from '../Auth/auth.constant';
import { validateRequestFromFormData } from '../../middlewares/validateRequest';
import { auth } from '../../middlewares';
import { BusinessValidation } from './business.validation';
import { BusinessController } from './business.controller';

const router = Router();

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

export const BusinessRoutes = router;
