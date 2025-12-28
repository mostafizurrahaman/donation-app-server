import express from 'express';
import { auth } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';
import { SubscriptionController } from './subscriptionHistory.controller';

const router = express.Router();

router.get(
  '/billing-history',
  auth(ROLE.ORGANIZATION, ROLE.BUSINESS),
  SubscriptionController.getBillingHistory
);

export const SubscriptionHistoryRoutes = router;
