import express from 'express';

import { auth } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';
import { clientController } from './client.controller';

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

export const clientRoutes = router;
