import { Router } from 'express';
import { auth } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';
import { BalanceController } from './balance.controller';

const router = Router();

// Get Balance Summary
router.get(
  '/',
  auth(ROLE.ORGANIZATION, ROLE.ADMIN),
  BalanceController.getMyBalance
);

// Get Transaction History (Ledger)
router.get(
  '/history',
  auth(ROLE.ORGANIZATION, ROLE.ADMIN),
  BalanceController.getMyTransactions
);

export const BalanceRoutes = router;