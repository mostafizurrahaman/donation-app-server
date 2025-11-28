import httpStatus from 'http-status';
import { asyncHandler } from '../../utils';
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

export const BusinessController = {
  updateBusinessProfile,
};
