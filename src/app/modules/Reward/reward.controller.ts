// src/app/modules/Reward/reward.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { asyncHandler, sendResponse } from '../../utils';
import { ExtendedRequest } from '../../types';
import { rewardService } from './reward.service';
import { REWARD_MESSAGES } from './reward.constant';

/**
 * Create a new reward
 */
export const createReward = asyncHandler(
  async (req: ExtendedRequest, res: Response): Promise<void> => {
    // Get business ID from auth (for business users) or body (for admin)
    const businessId = req.user?.businessId || req.body.businessId;

    if (!businessId) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Business ID is required');
    }

    const reward = await rewardService.createReward(req.body, businessId);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      message: REWARD_MESSAGES.CREATED,
      data: reward,
    });
  }
);

/**
 * Update a reward
 */
export const updateReward = asyncHandler(
  async (req: ExtendedRequest, res: Response): Promise<void> => {
    const businessId = req.user?.businessId; // For business users
    const reward = await rewardService.updateReward(
      req.params.id,
      req.body,
      businessId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: REWARD_MESSAGES.UPDATED,
      data: reward,
    });
  }
);

/**
 * Get reward by ID
 */
export const getRewardById = asyncHandler(
  async (req: ExtendedRequest, res: Response): Promise<void> => {
    const userId = req.user?._id?.toString();
    const reward = await rewardService.getRewardById(req.params.id, userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Reward retrieved successfully',
      data: reward,
    });
  }
);

/**
 * Get all rewards with filters
 */
export const getRewards = asyncHandler(
  async (req: ExtendedRequest, res: Response): Promise<void> => {
    const userId = req.user?._id?.toString();
    const query = { ...req.query, userId };
    const result = await rewardService.getRewards(query);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Rewards retrieved successfully',
      data: result.rewards,
      meta: result.meta,
    });
  }
);

/**
 * Get rewards by business
 */
export const getRewardsByBusiness = asyncHandler(
  async (req: ExtendedRequest, res: Response): Promise<void> => {
    const userId = req.user?._id?.toString();
    const query = { ...req.query, userId };
    const result = await rewardService.getRewardsByBusiness(
      req.params.businessId,
      query
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Business rewards retrieved successfully',
      data: result.rewards,
      meta: result.meta,
    });
  }
);

/**
 * Delete reward
 */
export const deleteReward = asyncHandler(
  async (req: ExtendedRequest, res: Response): Promise<void> => {
    const businessId = req.user?.businessId;
    await rewardService.deleteReward(req.params.id, businessId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: REWARD_MESSAGES.DELETED,
      data: null,
    });
  }
);

/**
 * Archive reward (permanent delete)
 */
export const archiveReward = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await rewardService.archiveReward(req.params.id);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: REWARD_MESSAGES.ARCHIVED,
      data: null,
    });
  }
);

/**
 * Upload codes to reward
 */
export const uploadCodes = asyncHandler(
  async (req: ExtendedRequest, res: Response): Promise<void> => {
    const businessId = req.user?.businessId;
    const reward = await rewardService.uploadCodes(
      req.params.id,
      req.body.codes,
      businessId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: REWARD_MESSAGES.CODES_UPLOADED,
      data: reward,
    });
  }
);

/**
 * Check reward availability
 */
export const checkAvailability = asyncHandler(
  async (req: ExtendedRequest, res: Response): Promise<void> => {
    const userId = req.user?._id?.toString();
    const availability = await rewardService.checkAvailability(
      req.params.id,
      userId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Availability checked successfully',
      data: availability,
    });
  }
);

/**
 * Get reward statistics
 */
export const getRewardStats = asyncHandler(
  async (req: ExtendedRequest, res: Response): Promise<void> => {
    const { businessId, startDate, endDate } = req.query;

    const stats = await rewardService.getRewardStatistics(
      businessId as string | undefined,
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
 * Get featured rewards
 */
export const getFeaturedRewards = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const rewards = await rewardService.getFeaturedRewards(limit);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Featured rewards retrieved successfully',
      data: rewards,
    });
  }
);
