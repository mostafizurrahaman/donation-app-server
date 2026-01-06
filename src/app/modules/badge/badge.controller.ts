import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { badgeService } from './badge.service';
import { BADGE_MESSAGES } from './badge.constant';
import { asyncHandler, sendResponse } from '../../utils';
import { ExtendedRequest } from '../../types';

const createBadge = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as Record<string, Express.Multer.File[]>;
  const result = await badgeService.createBadge(req.body, files);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: BADGE_MESSAGES.CREATED,
    data: result,
  });
});

const updateBadge = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as Record<string, Express.Multer.File[]>;
  const result = await badgeService.updateBadge(req.params.id, req.body, files);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: BADGE_MESSAGES.UPDATED,
    data: result,
  });
});

const getBadgeById = asyncHandler(async (req: Request, res: Response) => {
  const result = await badgeService.getBadgeById(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Badge retrieved',
    data: result,
  });
});

const getBadges = asyncHandler(async (req: Request, res: Response) => {
  const result = await badgeService.getAllBadges(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Badges retrieved',
    data: result.result,
    meta: result.meta,
  });
});

const deleteBadge = asyncHandler(async (req: Request, res: Response) => {
  await badgeService.deleteBadge(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: BADGE_MESSAGES.DELETED,
    data: null,
  });
});

const getAllBadgesWithProgress = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user._id.toString();
    const result = await badgeService.getAllBadgesWithProgress(
      userId,
      req.query
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'User badges progress retrieved',
      meta: result.meta,
      data: result.result,
    });
  }
);

const getBadgeHistory = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user._id.toString();
    const { id } = req.params;
    const result = await badgeService.getBadgeHistory(userId, id);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Badge history retrieved',
      data: result,
    });
  }
);

export const markTierVideoPreviewed = asyncHandler(async (req, res) => {
  const userId = req.user._id?.toString();
  const { badgeId, tier } = req.body;

  const result = await badgeService.markTierVideoPreviewed(
    userId,
    badgeId,
    tier
  );

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Tier video preview recorded',
    data: result,
  });
});

export const badgeController = {
  createBadge,
  updateBadge,
  getBadgeById,
  getBadges,
  deleteBadge,
  getAllBadgesWithProgress,
  getBadgeHistory,
  markTierVideoPreviewed,
};
