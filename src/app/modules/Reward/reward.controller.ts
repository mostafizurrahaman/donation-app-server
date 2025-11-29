// src/app/modules/Reward/reward.controller.ts

import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { Types } from 'mongoose';

import { rewardService } from './reward.service';
import { REWARD_MESSAGES } from './reward.constant';
import { AppError, asyncHandler, sendResponse } from '../../utils';
import { ExtendedRequest } from '../../types';
import { RewardRedemption } from '../RewardRedeemtion/rewardRedemption.model';
import { Reward } from './reward.model';
import { runRewardMaintenanceManual } from '../../jobs/updateRewardsStatus.job';

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
      req.file,
      userId
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
    data: result.rewards,
    meta: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPage: result.totalPages,
    },
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
    data: result.rewards,
    meta: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPage: result.totalPages,
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
      data: result.rewards,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPage: result.totalPages,
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
 * Redeem a claimed reward (mark as used)
 */
const redeemReward = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const staffId = req.user?._id?.toString();


    const { location, notes } = req.body;



    const result = await rewardService.redeemReward({
      redemptionId: req.params.redemptionId,
      staffId,
      location,
      notes,
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

    const { includeExpired, page, limit } = req.query;

    const result = await rewardService.getUserClaimedRewards(userId, {
      includeExpired: includeExpired === 'true',
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });

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

    const redemption = await rewardService.getClaimedRewardById(
      req.params.redemptionId,
      userId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Claimed reward retrieved successfully',
      data: redemption,
    });
  }
);

/**
 * Verify redemption by code or QR (only creator business can validate)
 */
const verifyRedemption = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const { code, redemptionId } = req.body;
    const staffBusinessId = req.user?._id?.toString();

    if (!staffBusinessId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Business not authenticated');
    }

    // Find by code or redemptionId
    let redemption;
    if (code) {
      redemption = await RewardRedemption.findOne({
        assignedCode: code,
        status: 'claimed',
      }).populate(['reward', 'business', 'user']);
    } else if (redemptionId) {
      redemption = await RewardRedemption.findOne({
        _id: redemptionId,
        status: 'claimed',
      }).populate(['reward', 'business', 'user']);
    }

    if (!redemption) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        REWARD_MESSAGES.REDEMPTION_NOT_FOUND
      );
    }

    // Check if expired
    if (new Date() > redemption.expiresAt) {
      throw new AppError(httpStatus.GONE, REWARD_MESSAGES.CLAIM_EXPIRED);
    }

    // Verify that only the creator business can validate their own rewards
    const reward = await Reward.findById(redemption.reward._id);
    if (reward && !reward.isCreatorBusiness(new Types.ObjectId(staffBusinessId))) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'Only the creator business can validate their own reward codes'
      );
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Redemption verified successfully',
      data: {
        redemptionId: redemption._id,
        user: redemption.user,
        reward: redemption.reward,
        status: redemption.status,
        assignedCode: redemption.assignedCode,
        claimedAt: redemption.claimedAt,
        expiresAt: redemption.expiresAt,
      },
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
