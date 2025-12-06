import { Router } from 'express';
import { auth } from '../../middlewares';
import { ROLE } from '../Auth/auth.constant';
import { BalanceController } from './balance.controller';
import { balanceClear } from '../../jobs/balanceClearing.job';

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

router.post('/manual-balance-clear', (req, res) => {
  balanceClear();
  res.status(200).send({ message: 'Balance clearing job triggered' });
});

router.get(
  '/dashboard-stats',
  auth(ROLE.ORGANIZATION, ROLE.ADMIN),
  BalanceController.getDashboardStats
);

export const BalanceRoutes = router;
