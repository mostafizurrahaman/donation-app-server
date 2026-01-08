import httpStatus from 'http-status';
import { asyncHandler, sendResponse } from '../../utils';
import { SuperAdminService } from './superAdmin.service';

const updateMyProfile = asyncHandler(async (req, res) => {
 

  const result = await SuperAdminService.updateSuperAdminProfile(
    req.user._id?.toString(),
    req.body,
    req.file
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Profile updated successfully!',
    data: result,
  });
});

export const SuperAdminController = {
  updateMyProfile,
};
