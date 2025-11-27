import { Request, Response } from 'express';
import httpStatus from 'http-status';

import { badgeService } from './badge.service';

import { BADGE_MESSAGES } from './badge.constant';
import { asyncHandler, sendResponse } from '../../utils';

/**
 * Create a new badge
 */
export const createBadge = asyncHandler(async (req: Request, res: Response) => {
  const badge = await badgeService.createBadge(req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,

    message: BADGE_MESSAGES.CREATED,
    data: badge,
  });
});

/**
 * Update a badge
 */
export const updateBadge = asyncHandler(async (req: Request, res: Response) => {
  const badge = await badgeService.updateBadge(req.params.id, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,

    message: BADGE_MESSAGES.UPDATED,
    data: badge,
  });
});

/**
 * Get badge by ID
 */
export const getBadgeById = asyncHandler(
  async (req: Request, res: Response) => {
    const badge = await badgeService.getBadgeById(req.params.id);

    sendResponse(res, {
      statusCode: httpStatus.OK,

      message: 'Badge retrieved successfully',
      data: badge,
    });
  }
);

/**
 * Get all badges with filters
 */
export const getBadges = asyncHandler(async (req: Request, res: Response) => {
  const result = await badgeService.getBadges(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,

    message: 'Badges retrieved successfully',
    data: result,
  });
});

/**
 * Delete badge
 */
export const deleteBadge = asyncHandler(async (req: Request, res: Response) => {
  await badgeService.deleteBadge(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,

    message: BADGE_MESSAGES.DELETED,
    data: null,
  });
});

/**
 * Assign badge to user
 */
export const assignBadgeToUser = asyncHandler(
  async (req: Request, res: Response) => {
    const userBadge = await badgeService.assignBadgeToUser(req.body);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,

      message: BADGE_MESSAGES.ASSIGNED,
      data: userBadge,
    });
  }
);

/**
 * Get user badges
 */
export const getUserBadges = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await badgeService.getUserBadges(
      req.params.userId,
      req.query
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,

      message: 'User badges retrieved successfully',
      data: result,
    });
  }
);

/**
 * Get user badge progress
 */
export const getUserBadgeProgress = asyncHandler(
  async (req: Request, res: Response) => {
    const progress = await badgeService.getUserBadgeProgress(
      req.params.userId,
      req.params.badgeId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,

      message: 'Badge progress retrieved successfully',
      data: progress,
    });
  }
);

/**
 * Update user badge progress
 */
export const updateUserBadgeProgress = asyncHandler(
  async (req: Request, res: Response) => {
    const { count, amount } = req.body;
    const result = await badgeService.updateUserBadgeProgress(
      req.params.userId,
      req.params.badgeId,
      count,
      amount
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,

      message: BADGE_MESSAGES.PROGRESS_UPDATED,
      data: result,
    });
  }
);

/**
 * Get badge statistics
 */
export const getBadgeStats = asyncHandler(
  async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;

    const stats = await badgeService.getBadgeStatistics(
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
 * Get all badges with user progress (for donor app)
 */
export const getAllBadgesWithProgress = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.params.userId;
    const badges = await badgeService.getAllBadgesWithProgress(userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,

      message: 'Badges with progress retrieved successfully',
      data: badges,
    });
  }
);
