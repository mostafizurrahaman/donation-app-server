// src/app/modules/Reward/reward.controller.ts

import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { rewardService } from './reward.service';
import { REWARD_MESSAGES } from './reward.constant';
import { AppError, asyncHandler, sendResponse } from '../../utils';
import { ExtendedRequest } from '../../types';
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

const createOnlineRewardController = async (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const imageFile = files['rewardImage']?.[0];
  const codesFiles = files['codesFiles']; // Array of files

  const result = await rewardService.createOnlineReward(
    req.body,
    imageFile,
    codesFiles
  );

  res.status(201).json({ success: true, data: result });
};

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
  const userId = req.user._id?.toString();
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
 * Toggle Reward Status
 */
const toggleRewardStatus = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const { id } = req.params;
    const { isActive } = req.body;

    const result = await rewardService.toggleRewardStatus(id, userId, isActive);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: isActive
        ? 'Reward activated successfully'
        : 'Reward disabled successfully',
      data: result,
    });
  }
);

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
 * Delete reward (hard delete with cleanup)
 */
const deleteReward = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const result = await rewardService.deleteReward(req.params.id, userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: REWARD_MESSAGES.DELETED,
      data: result,
    });
  }
);

/**
 * Delete reward (hard delete with cleanup)
 */
const deleteRewardImage = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const result = await rewardService.deleteRewardImage(req.params.id, userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: REWARD_MESSAGES.DELETED,
      data: result,
    });
  }
);

/**
 * Check if reward can be deleted
 */
const canDeleteReward = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const result = await rewardService.canDeleteReward(req.params.id);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Delete check completed',
      data: result,
    });
  }
);

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

// API 1
const getBusinessRewards = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const result = await rewardService.getBusinessRewards(
      req.user._id.toString(),
      req.query
    );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Business rewards retrieved successfully',
      data: result.result,
      meta: result.meta,
    });
  }
);

// API 2
const getUserExploreRewards = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const result = await rewardService.getUserExploreRewards(
      req.user._id.toString(),
      req.query
    );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Explore rewards retrieved successfully',
      data: result.result,
      meta: result.meta,
    });
  }
);

// API 4
const getAdminRewards = asyncHandler(async (req: Request, res: Response) => {
  const result = await rewardService.getAdminRewards(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Admin rewards list retrieved successfully',
    data: result.result,
    meta: result.meta,
  });
});

const getAdminRewardsAnalytics = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await rewardService.getAdminRewardAnalytics();
    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Admin rewards analytics retrieved successfully',
      data: result,
    });
  }
);

const getRewardDetailsForAdmin = asyncHandler(
  async (req: Request, res: Response) => {
    const rewardId = req.params.rewardId;

    const result = await rewardService.getRewardDetailsForAdmin(rewardId);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Reward details retrieved successfully',
      data: result.data,
      meta: result.meta,
    });
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
  canDeleteReward,
  uploadCodes,
  checkAvailability,

  getBusinessRewards,
  getUserExploreRewards,
  getAdminRewards,

  // Admin/Dev Tools
  triggerRewardMaintenance,
  toggleRewardStatus,
  getAdminRewardsAnalytics,
  getRewardDetailsForAdmin,
  createOnlineRewardController,
  deleteRewardImage,
};
