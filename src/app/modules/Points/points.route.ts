import express from 'express';

import { ROLE } from '../Auth/auth.constant';

import * as pointsController from './points.controller';
import { auth, validateRequest } from '../../middlewares';
import { pointsValidation } from './points.validation';

const router = express.Router();

/**
 * @route   POST /api/points/transactions
 * @desc    Create a points transaction (Admin only)
 * @access  Private (Admin/Super Admin)
 */
router.post(
  '/transactions',
  auth(ROLE.ADMIN),
  validateRequest(pointsValidation.createTransactionSchema),
  pointsController.createTransaction
);

/**
 * @route   GET /api/points/balance/:userId
 * @desc    Get user points balance
 * @access  Private (Owner, Admin, Super Admin)
 */
router.get(
  '/balance/:userId',
  auth(ROLE.CLIENT, ROLE.ADMIN),
  validateRequest(pointsValidation.getUserBalanceSchema),
  pointsController.getUserBalance
);

/**
 * @route   GET /api/points/transactions/:userId
 * @desc    Get user transactions with filters
 * @access  Private (Owner, Admin, Super Admin)
 */
router.get(
  '/transactions/:userId',
  auth(ROLE.CLIENT, ROLE.ADMIN),
  validateRequest(pointsValidation.getUserTransactionsSchema),
  pointsController.getUserTransactions
);

// /**
//  * @route   GET /api/points/transaction/:id
//  * @desc    Get transaction by ID
//  * @access  Private (Owner, Admin, Super Admin)
//  */
// router.get(
//   '/transaction/:id',
//   auth(ROLE.CLIENT, ROLE.ADMIN),
//   validateRequest(pointsValidation.getTransactionByIdSchema),
//   pointsController.getTransactionById
// );

/**
 * @route   POST /api/points/deduct
 * @desc    Deduct points (for reward redemption)
 * @access  Private (System/Admin)
 */
router.post(
  '/deduct',
  auth(ROLE.ADMIN),
  validateRequest(pointsValidation.deductPointsSchema),
  pointsController.deductPoints
);

/**
 * @route   POST /api/points/refund
 * @desc    Refund points (for cancelled redemption)
 * @access  Private (Admin/Super Admin)
 */
router.post(
  '/refund',
  auth(ROLE.ADMIN),
  validateRequest(pointsValidation.refundPointsSchema),
  pointsController.refundPoints
);

/**
 * @route   POST /api/points/adjust
 * @desc    Adjust points (Admin only)
 * @access  Private (Admin/Super Admin)
 */
router.post(
  '/adjust',
  auth(ROLE.ADMIN, ROLE.ADMIN),
  validateRequest(pointsValidation.adjustPointsSchema),
  pointsController.adjustPoints
);

/**
 * @route   GET /api/points/leaderboard
 * @desc    Get points leaderboard
 * @access  Public
 */
router.get(
  '/leaderboard',
  validateRequest(pointsValidation.getLeaderboardSchema),
  pointsController.getLeaderboard
);

/**
 * @route   GET /api/points/stats
 * @desc    Get points statistics
 * @access  Private (Admin/Super Admin)
 */
router.get(
  '/stats',
  auth(ROLE.ADMIN),
  validateRequest(pointsValidation.getPointsStatsSchema),
  pointsController.getPointsStats
);

/**
 * @route   GET /api/points/can-afford/:userId
 * @desc    Check if user can afford points amount
 * @access  Private (Owner, Admin, Super Admin)
 */
router.get(
  '/can-afford/:userId',
  auth(ROLE.CLIENT),
  validateRequest(pointsValidation.checkAffordabilitySchema),
  pointsController.checkAffordability
);

/**
 * @route   GET /api/points/summary/:userId
 * @desc    Get user points summary (balance + recent transactions)
 * @access  Private (Owner, Admin, Super Admin)
 */
router.get(
  '/summary/:userId',
  auth(ROLE.CLIENT),
  validateRequest(pointsValidation.getUserBalanceSchema),
  pointsController.getUserPointsSummary
);

/**
 * @route   POST /api/points/award-donation
 * @desc    Award points for donation (Internal use)
 * @access  Private (System/Admin)
 */
router.post(
  '/award-donation',
  auth(ROLE.ADMIN),
  pointsController.awardPointsForDonation
);

export const PointsRoutes = router;
