import httpStatus from 'http-status';
import { AppError, asyncHandler } from '../../utils';
import { BusinessService } from './business.service';
import { sendResponse } from '../../utils';
import { rewardRedemptionService } from '../RewardRedeemtion/reward-redeemtion.service';
import { ExtendedRequest } from '../../types';
import { TTimeFilter } from '../Donation/donation.interface';

// Update Business Profile Controller
const updateBusinessProfile = asyncHandler(async (req, res) => {
  const body = req.body;
  const user = req.user;

  // Type assert req.files to the expected structure from upload.fields()
  const files = req.files as
    | { coverImage?: Express.Multer.File[]; logoImage?: Express.Multer.File[] }
    | undefined;

  console.log('Files received in controller:', {
    files,
    body,
    user,
  });

  const result = await BusinessService.updateBusinessProfile(
    body,
    user,
    files || {}
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Business profile updated successfully!',
    data: result,
  });
});

// Update Business Profile Controller
const getBusinessProfileById = asyncHandler(async (req, res) => {
  const businessId = req.params?.businessId;

  if (!businessId) {
    throw new AppError(httpStatus.NOT_FOUND, 'BusinessId is missing!');
  }

  const result = await BusinessService.getBusinessProfileById(businessId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Business profile retrived successfully!',
    data: result,
  });
});

// Update Business Profile Controller
const increaseWebsiteCount = asyncHandler(async (req, res) => {
  const businessId = req.params?.businessId;

  if (!businessId) {
    throw new AppError(httpStatus.NOT_FOUND, 'BusinessId is missing!');
  }

  const result = await BusinessService.increaseWebsiteCount(businessId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Business website views updated!',
    data: result,
  });
});

// Get reward overview:
const getBusinessOverview = asyncHandler(async (req, res) => {
  const businessId = req.user?._id?.toString();

  if (!businessId) {
    throw new AppError(httpStatus.NOT_FOUND, 'BusinessId is missing!');
  }

  const result = await BusinessService.getBusinessOverview(businessId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Business overview retrived successfully!',
    data: result,
  });
});

/**
 * Get Business Recent Activity
 */
const getBusinessRecentActivity = asyncHandler(
  async (req: ExtendedRequest, res) => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const result = await BusinessService.getBusinessRecentActivity(
      userId,
      req.query
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Recent activity retrieved successfully',
      data: result.activities,
      meta: result.meta,
    });
  }
);

/**
 * Get Business Analytics
 */
const getBusinessAnalytics = asyncHandler(async (req: ExtendedRequest, res) => {
  const userId = req.user?._id?.toString();
  const timeFilter = req.query.timeFilter as TTimeFilter;

  if (!userId) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }

  const result = await BusinessService.getBusinessAnalytics(userId, timeFilter);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Recent activity retrieved successfully',
    data: result,
  });
});

/**
 * Get Business Analytics
 */
const getSingleRewardAnalytics = asyncHandler(
  async (req: ExtendedRequest, res) => {
    const userId = req.user?._id?.toString();
    const rewardId = req.params?.rewardId?.toString();

    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const result = await BusinessService.getSingleRewardAnalytics(
      userId,
      rewardId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Reward analytics retrived successfully!',
      data: result,
    });
  }
);

export const BusinessController = {
  updateBusinessProfile,
  getBusinessProfileById,
  increaseWebsiteCount,
  getBusinessOverview,
  getBusinessRecentActivity,
  getBusinessAnalytics,
  getSingleRewardAnalytics,
};
