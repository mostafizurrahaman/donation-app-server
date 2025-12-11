import httpStatus from 'http-status';
import { AppError, asyncHandler } from '../../utils';
import { BusinessService } from './business.service';
import { sendResponse } from '../../utils';

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

export const BusinessController = {
  updateBusinessProfile,
  getBusinessProfileById,
  increaseWebsiteCount,
};
