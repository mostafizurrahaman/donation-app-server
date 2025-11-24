import { Router } from 'express';
import { auth } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';
import { AdminController } from './admin.controller';

const router = Router();

// all states for dashboard home page
router.get('/states', auth(ROLE.ADMIN), AdminController.getAdminStates);

router.get('/donations', auth(ROLE.ADMIN), AdminController.getDonationsReport);

router.get('/subscriptions', auth(ROLE.ADMIN), AdminController.getSubscriptionsReport);

router.get('/rewards', auth(ROLE.ADMIN), AdminController.getRewardsReport);

router.get('/user-states', auth(ROLE.ADMIN), AdminController.getUsersStatesReport);

router.get('/users', auth(ROLE.ADMIN), AdminController.getUsersReport);

router.get('/pending-users', auth(ROLE.ADMIN), AdminController.getPendingUsersReport);

router.patch('/:id', auth(ROLE.ADMIN), AdminController.updateAdminProfile);

export const AdminRoutes = router;
