// src/app/modules/Reward/reward.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';

import { rewardService } from './reward.service';

import { REWARD_MESSAGES } from './reward.constant';
import { AppError, asyncHandler, sendResponse } from '../../utils';


/**
 * Create a new reward with optional codes upload
 */
export const createReward = asyncHandler(async (req: Request, res: Response) => {
  const reward = await rewardService.createReward(req.body, req.file);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    
    message: REWARD_MESSAGES.CREATED,
    data: reward,
  });
});

/**
 * Update a reward
 */
export const updateReward = asyncHandler(async (req: Request, res: Response) => {
  const reward = await rewardService.updateReward(req.params.id, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    
    message: REWARD_MESSAGES.UPDATED,
    data: reward,
  });
});

/**
 * Get reward by ID
 */
export const getRewardById = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.query.userId as string | undefined;
  const reward = await rewardService.getRewardById(req.params.id, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    
    message: 'Reward retrieved successfully',
    data: reward,
  });
});

/**
 * Get all rewards with filters
 */
export const getRewards = asyncHandler(async (req: Request, res: Response) => {
  const result = await rewardService.getRewards(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    
    message: 'Rewards retrieved successfully',
    data: result,
  });
});

/**
 * Get featured rewards
 */
export const getFeaturedRewards = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await rewardService.getRewards({
      featured: true,
      ...req.query,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      
      message: 'Featured rewards retrieved successfully',
      data: result,
    });
  }
);

/**
 * Get rewards by business
 */
export const getRewardsByBusiness = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await rewardService.getRewardsByBusiness(
      req.params.businessId,
      req.query
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      
      message: 'Business rewards retrieved successfully',
      data: result,
    });
  }
);

/**
 * Delete reward
 */
export const deleteReward = asyncHandler(async (req: Request, res: Response) => {
  await rewardService.deleteReward(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    
    message: REWARD_MESSAGES.DELETED,
    data: null,
  });
});

/**
 * Archive reward (permanent delete)
 */
export const archiveReward = asyncHandler(async (req: Request, res: Response) => {
  await rewardService.archiveReward(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    
    message: REWARD_MESSAGES.ARCHIVED,
    data: null,
  });
});

/**
 * Upload codes to reward (CSV/XLSX)
 */
export const uploadCodes = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No file uploaded');
  }

  const result = await rewardService.uploadCodesToReward(
    req.params.id,
    req.file
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    
    message: REWARD_MESSAGES.CODES_UPLOADED,
    data: {
      reward: result.reward,
      codesAdded: result.codesAdded,
      codesDuplicated: result.codesDuplicated,
      totalCodes: result.reward.codes.length,
    },
  });
});

/**
 * Check reward availability
 */
export const checkAvailability = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.query.userId as string | undefined;
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
  async (req: Request, res: Response) => {
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
