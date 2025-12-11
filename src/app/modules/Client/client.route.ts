import express from 'express';

import { auth, validateRequest } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';
import { clientController } from './client.controller';
import { clientValidationSchema } from './client.validation';
import { upload } from '../../lib';
import { validateRequestFromFormData } from '../../middlewares/validateRequest';

const router = express.Router();

// Get roundup stats
router.get(
  '/roundup-stats',
  auth(ROLE.CLIENT),
  clientController.getRoundupStats
);
router.get(
  '/onetime-stats',
  auth(ROLE.CLIENT),
  clientController.getOnetimeDonationStats
);
router.get(
  '/recurring-stats',
  auth(ROLE.CLIENT),
  clientController.getRecurringDonationStats
);

router.get(
  '/recurring',
  validateRequest(
    clientValidationSchema.getUserRecurringDonationsForSpecificOrganizationSchema
  ),
  auth(ROLE.CLIENT),
  clientController.getUserRecurringDonationsForSpecificOrganization
);

router.get(
  '/transaction/history',
  auth(ROLE.CLIENT),
  clientController.getUnifiedHistory
);

router.patch(
  '/update-profile',
  auth(ROLE.CLIENT),
  upload.single('image'), // Expects form-data field name "image"
  validateRequestFromFormData(clientValidationSchema.updateClientProfileSchema),
  clientController.updateClientProfile
);

export const clientRoutes = router;
