// src/app/modules/Points/points.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';

import { pointsServices } from './points.service';

import { POINTS_MESSAGES } from './points.constant';
import { asyncHandler, sendResponse } from '../../utils';
import { ExtendedRequest } from '../../types';
import { Types } from 'mongoose';

/**
 * Create a points transaction (Admin only)
 */
export const createTransaction = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await pointsServices.createPointsTransaction(req.body);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      message: POINTS_MESSAGES.TRANSACTION_SUCCESS,
      data: result,
    });
  }
);

/**
 * Get user balance
 */
export const getUserBalance = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const balance = await pointsServices.getUserBalance(req.params.userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Balance retrieved successfully',
      data: balance,
    });
  }
);

/**
 * Get user transactions
 */
export const getUserTransactions = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await pointsServices.getUserTransactions(
      req.params.userId,
      req.query
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Transactions retrieved successfully',
      data: result,
    });
  }
);

/**
 * Deduct points
 */
export const deductPoints = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const {
      userId,
      amount,
      source,
      rewardRedemptionId,
      description,
      metadata,
    } = req.body;

    const result = await pointsServices.deductPoints(
      userId,
      amount,
      source,
      rewardRedemptionId,
      description,
      metadata
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Points deducted successfully',
      data: result,
    });
  }
);

/**
 * Refund points
 */
export const refundPoints = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { userId, amount, source, reason, rewardRedemptionId, metadata } =
      req.body;

    const result = await pointsServices.refundPoints(
      userId,
      amount,
      source,
      reason,
      rewardRedemptionId,
      metadata
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Points refunded successfully',
      data: result,
    });
  }
);

/**
 * Adjust points (Admin only)
 */
export const adjustPoints = asyncHandler(
  async (req: ExtendedRequest, res: Response): Promise<void> => {
    const { userId, amount, reason, description } = req.body;
    const adjustedBy = req.user?._id as unknown as Types.ObjectId;

    const result = await pointsServices.adjustPoints(
      userId,
      amount,
      reason,
      adjustedBy,
      description
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: POINTS_MESSAGES.BALANCE_UPDATED,
      data: result,
    });
  }
);

// /**
//  * Get transaction by ID
//  */
// export const getTransactionById = asyncHandler(
//   async (req: Request, res: Response): Promise<void> => {
//     const transaction = await pointsServices.getTransactionById(req.params.id);

//     sendResponse(res, {
//       statusCode: httpStatus.OK,
//       message: 'Transaction retrieved successfully',
//       data: transaction,
//     });
//   }
// );

/**
 * Get points leaderboard
 */
export const getLeaderboard = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { limit, tier } = req.query;

    const leaderboard = await pointsServices.getPointsLeaderboard(
      limit ? Number(limit) : undefined,
      tier as string
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Leaderboard retrieved successfully',
      data: leaderboard,
    });
  }
);

/**
 * Get points statistics
 */
export const getPointsStats = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { startDate, endDate } = req.query;

    const stats = await pointsServices.getPointsStatistics(
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Statistics retrieved successfully',
      data: stats,
    });
  }
);

/**
 * Check if user can afford points
 */
export const checkAffordability = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const { amount } = req.query;

    const canAfford = await pointsServices.canUserAffordPoints(userId, Number(amount));

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Affordability checked successfully',
      data: { canAfford, requiredAmount: Number(amount) },
    });
  }
);

/**
 * Get user points summary
 */
export const getUserPointsSummary = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const summary = await pointsServices.getUserPointsSummary(req.params.userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Points summary retrieved successfully',
      data: summary,
    });
  }
);

/**
 * Award points for donation (Internal use - called from donation service)
 */
export const awardPointsForDonation = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { userId, donationId, donationAmount } = req.body;

    const result = await pointsServices.awardPointsForDonation(
      userId,
      donationId,
      donationAmount
    );

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      message: 'Points awarded for donation',
      data: result,
    });
  }
);
