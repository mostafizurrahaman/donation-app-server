import express from 'express';
import { OrganizationController } from './organization.controller';
import auth from '../../middlewares/auth';
import { ROLE } from '../Auth/auth.constant';
import { validateRequest } from '../../middlewares';
import { OrganizationValidation } from './organization.validation';
import { upload } from '../../lib';

const router = express.Router();

// Edit Organization Profile Details (Tab 1 - Text fields)
router.patch(
  '/profile-details',
  auth(ROLE.ORGANIZATION),
  validateRequest(OrganizationValidation.editProfileOrgDetailsSchema),
  OrganizationController.editProfileOrgDetails
);

// Update Organization Logo Image (Separate endpoint)
router.patch(
  '/logo-image',
  auth(ROLE.ORGANIZATION),
  upload.single('logoImage'),
  OrganizationController.updateLogoImage
);

// Edit Organization Tax Details (Tab 2)
router.patch(
  '/tax-details',
  auth(ROLE.ORGANIZATION),
  validateRequest(OrganizationValidation.editOrgTaxDetailsSchema),
  OrganizationController.editOrgTaxDetails
);

// Get all carites:
router.get(
  '/get-all',
  auth(ROLE.CLIENT, ROLE.BUSINESS),
  validateRequest(OrganizationValidation.getAllOrganizationsSchema),
  OrganizationController.getAllOrganization
);

router.get(
  '/:id',
  auth(ROLE.CLIENT, ROLE.ORGANIZATION),

  OrganizationController.getOrganizationDetails
);

// Stripe Connect Routes
// Start Stripe Connect onboarding (organizations only)
router.post(
  '/stripe-connect/onboard',
  auth(ROLE.ORGANIZATION),
  OrganizationController.startStripeConnectOnboarding
);

// Get Stripe Connect account status (organizations only)
router.get(
  '/stripe-connect/status',
  auth(ROLE.ORGANIZATION),
  OrganizationController.getStripeConnectStatus
);

// Refresh onboarding link (organizations only)
router.post(
  '/stripe-connect/refresh',
  auth(ROLE.ORGANIZATION),
  OrganizationController.refreshStripeConnectOnboarding
);

export const OrganizationRoutes = router;
 