// src/app/modules/Reward/reward.controller.ts

import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { rewardService } from './reward.service';
import { REWARD_MESSAGES } from './reward.constant';
import { AppError, asyncHandler, sendResponse } from '../../utils';
import { ExtendedRequest } from '../../types';
import { runRewardMaintenanceManual } from '../../jobs/updateRewardsStatus.job';
import Client from '../Client/client.model';

// Type for multer files object
interface MulterFiles {
  rewardImage?: Express.Multer.File[];
  codesFiles?: Express.Multer.File[];
}

/**
 * Create a new reward
 */
const createReward = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as MulterFiles | undefined;
  const rewardImage = files?.rewardImage?.[0];
  const codesFiles = files?.codesFiles;

  const reward = await rewardService.createReward(
    req.body,
    rewardImage,
    codesFiles
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: REWARD_MESSAGES.CREATED,
    data: reward,
  });
});

/**
 * Update a reward
 */
const updateReward = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const files = req.files as MulterFiles | undefined;
    const rewardImage = files?.rewardImage?.[0];
    const codesFiles = files?.codesFiles;

    const reward = await rewardService.updateReward(
      req.params.id,
      req.body,
      userId,
      rewardImage,
      codesFiles
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: REWARD_MESSAGES.UPDATED,
      data: reward,
    });
  }
);

/**
 * Update reward image only
 */
const updateRewardImage = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    if (!req.file) {
      throw new AppError(httpStatus.BAD_REQUEST, 'No image file uploaded');
    }

    const reward = await rewardService.updateRewardImage(
      req.params.id,
      req.file
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Reward image updated successfully',
      data: reward,
    });
  }
);

/**
 * Get reward by ID
 */
const getRewardById = asyncHandler(async (req: Request, res: Response) => {
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
const getRewards = asyncHandler(async (req: Request, res: Response) => {
  const result = await rewardService.getRewards(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Rewards retrieved successfully',
    data: result.data,
    meta: result.meta,
  });
});

/**
 * Get featured rewards
 */
const getFeaturedRewards = asyncHandler(async (req: Request, res: Response) => {
  const result = await rewardService.getRewards({
    featured: true,
    ...req.query,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Featured rewards retrieved successfully',
    data: result.data,
    meta: {
      total: result.meta.total,
      page: result.meta.page,
      limit: result.meta.limit,
      totalPage: result.meta.totalPage,
    },
  });
});

/**
 * Get rewards by business
 */
const getRewardsByBusiness = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await rewardService.getRewardsByBusiness(
      req.params.businessId,
      req.query
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Business rewards retrieved successfully',
      data: result.data,
      meta: {
        total: result.meta.total,
        page: result.meta.page,
        limit: result.meta.limit,
        totalPage: result.meta.totalPage,
      },
    });
  }
);

/**
 * Delete reward (soft delete)
 */
const deleteReward = asyncHandler(async (req: Request, res: Response) => {
  await rewardService.deleteReward(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: REWARD_MESSAGES.DELETED,
    data: null,
  });
});

/**
 * Archive reward (hard delete)
 */
const archiveReward = asyncHandler(async (req: Request, res: Response) => {
  await rewardService.archiveReward(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: REWARD_MESSAGES.ARCHIVED,
    data: null,
  });
});

/**
 * Upload codes to reward (supports multiple files)
 */
const uploadCodes = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;

  if (!files || files.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No file(s) uploaded');
  }

  const result = await rewardService.uploadCodesToReward(req.params.id, files);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: REWARD_MESSAGES.CODES_UPLOADED,
    data: {
      codesAdded: result.codesAdded,
      codesDuplicated: result.codesDuplicated,
      totalCodes: result.reward.codes.length,
      newRedemptionLimit: result.reward.redemptionLimit,
      filesProcessed: result.filesProcessed,
    },
  });
});

/**
 * Check reward availability
 */
const checkAvailability = asyncHandler(async (req: Request, res: Response) => {
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
});

/**
 * Get reward statistics
 */
const getRewardStats = asyncHandler(async (req: Request, res: Response) => {
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
});

/**
 * Claim a reward (deduct points)
 */
const claimReward = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const result = await rewardService.claimReward({
      rewardId: req.params.id,
      userId,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: result.message,
      data: {
        redemption: result.redemption,
        code: result.code,
        availableMethods: result.availableMethods,
        isRetry: result.isRetry || false,
      },
    });
  }
);

/**
 * Cancel claimed reward (refund points)
 */
const cancelClaimedReward = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const { reason } = req.body;

    const result = await rewardService.cancelClaimedReward({
      redemptionId: req.params.redemptionId,
      userId,
      reason,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: REWARD_MESSAGES.CANCELLED,
      data: result,
    });
  }
);

/**
 * Redeem a claimed reward (mark as used - Final Step)
 */
const redeemReward = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const staffId = req.user?._id?.toString();

    const { redemptionId, code, location, notes, method } = req.body;

    const result = await rewardService.redeemReward({
      redemptionId, // Can be from params OR body
      code, // Can be from body
      staffId,
      location,
      notes,
      method,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: REWARD_MESSAGES.REDEEMED,
      data: result,
    });
  }
);

/**
 * Get user's claimed rewards
 */
const getUserClaimedRewards = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const client = await Client.findOne({ auth: userId });

    if (!client) {
      throw new AppError(httpStatus.NOT_FOUND, 'Client not found');
    }

    const { includeExpired, page, limit } = req.query;

    const result = await rewardService.getUserClaimedRewards(
      client?._id?.toString(),
      {
        includeExpired: includeExpired === 'true',
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      }
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Claimed rewards retrieved successfully',
      data: result.redemptions,
      meta: {
        total: result.total,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
        totalPage: Math.ceil(result.total / (limit ? Number(limit) : 20)),
      },
    });
  }
);

/**
 * Get claimed reward by ID
 */
const getClaimedRewardById = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const client = await Client.findOne({ auth: userId });

    if (!client) {
      throw new AppError(httpStatus.NOT_FOUND, 'Client not found');
    }

    const redemption = await rewardService.getClaimedRewardById(
      req.params.redemptionId,
      client?._id?.toString()
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Claimed reward retrieved successfully',
      data: redemption,
    });
  }
);

/**
 * Verify redemption by code or QR (only business can validate)
 * This is Step 1 of redemption (Scanning)
 */
const verifyRedemption = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const { code, redemptionId } = req.body;
    const staffBusinessId = req.user?._id?.toString();

    if (!staffBusinessId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Business not authenticated');
    }

    const result = await rewardService.verifyRedemption(
      staffBusinessId,
      code,
      redemptionId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Redemption verified successfully',
      data: result,
    });
  }
);

/**
 * Trigger reward maintenance job manually (Admin/Development only)
 */
const triggerRewardMaintenance = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    console.log('🔧 Manual trigger: Reward maintenance job started by admin');

    try {
      const result = await runRewardMaintenanceManual();

      sendResponse(res, {
        statusCode: httpStatus.OK,
        message: 'Reward maintenance job completed successfully',
        data: {
          executedAt: new Date(),
          summary: 'Expired claims processed, reward statuses updated',
          details: result,
        },
      });
    } catch (error) {
      console.error('❌ Manual reward maintenance failed:', error);
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Reward maintenance job failed'
      );
    }
  }
);

export const RewardController = {
  // CRUD
  createReward,
  updateReward,
  updateRewardImage,
  getRewardById,
  getRewards,
  getFeaturedRewards,
  getRewardsByBusiness,
  deleteReward,
  archiveReward,
  uploadCodes,
  checkAvailability,
  getRewardStats,

  // Claiming & Redemption
  claimReward,
  cancelClaimedReward,
  redeemReward,
  getUserClaimedRewards,
  getClaimedRewardById,
  verifyRedemption,

  // Admin/Dev Tools
  triggerRewardMaintenance,
};
