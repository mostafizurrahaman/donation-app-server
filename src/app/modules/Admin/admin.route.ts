import { Router } from 'express';
import { auth, validateRequest } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';
import { AdminController } from './admin.controller';
import { AdminValidation } from './admin.validation';

const router = Router();

// all states for dashboard home page
router.get('/states', auth(ROLE.ADMIN), AdminController.getAdminStates);

router.get('/donations', auth(ROLE.ADMIN), AdminController.getDonationsReport);

router.get(
  '/subscriptions',
  auth(ROLE.ADMIN),
  AdminController.getSubscriptionsReport
);

router.get(
  '/user-states',
  auth(ROLE.ADMIN),
  AdminController.getUsersStatesReport
);

router.get('/users', auth(ROLE.ADMIN), AdminController.getUsersReport);

router.patch(
  '/change-user-status/:id',
  auth(ROLE.ADMIN),
  AdminController.changeUserStatus
);

router.delete('/delete-user/:id', auth(ROLE.ADMIN), AdminController.deleteUser);

router.get(
  '/pending-users',
  auth(ROLE.ADMIN),
  AdminController.getPendingUsersReport
);

router.get(
  '/user-engagement',
  auth(ROLE.ADMIN),
  AdminController.getUsersEngagementReport
);

router.get(
  '/donation-engagement',
  auth(ROLE.ADMIN),
  AdminController.getDonationsEngagementReport
);

router.get(
  '/clause-wise-percentages',
  auth(ROLE.ADMIN),
  AdminController.getClauseWisePercentagesReport
);

router.get(
  '/organizations',
  auth(ROLE.ADMIN),
  AdminController.getOrganizationsReport
);

router.get('/causes', auth(ROLE.ADMIN), AdminController.getCausesReport);

router.get(
  '/businesses',
  auth(ROLE.ADMIN),
  AdminController.getBusinessesReport
);

router.get(
  '/donors',
  validateRequest(AdminValidation.getDonorsSchema),
  auth(ROLE.ADMIN),
  AdminController.getDonors
);

router.get(
  '/business-reward-overview',
  validateRequest(AdminValidation.getBusinessRewardOverview),
  auth(ROLE.ADMIN),
  AdminController.getBusinessRewardOverview
);

router.patch('/:id', auth(ROLE.ADMIN), AdminController.updateAdminProfile);

export const AdminRoutes = router;
