// src/app/modules/Points/points.route.ts
import { Router } from 'express';
import {
  getMyPoints,
  getMyTransactions,
  getLeaderboard,
} from './points.controller';

import { ROLE } from '../Auth/auth.constant';
import { auth } from '../../middlewares';

const router = Router();

router.get('/balance', auth(ROLE.CLIENT), getMyPoints);
router.get('/transactions', auth(ROLE.CLIENT), getMyTransactions);
router.get('/leaderboard', auth(ROLE.CLIENT), getLeaderboard); // optional: add admin() middleware

export const PointsRoutes = router;
