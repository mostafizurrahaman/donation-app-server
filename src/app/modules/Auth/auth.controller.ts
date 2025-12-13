import httpStatus from 'http-status';
import { AppError, asyncHandler } from '../../utils';
import { AuthService } from './auth.service';
import { TProfileFileFields } from '../../types';
import { sendResponse } from '../../utils';

// 1. createAuth
const createAuth = asyncHandler(async (req, res) => {
  const result = await AuthService.createAuthIntoDB(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'OTP sent successfully, verify your account in 5 minutes!',
    data: result,
  });
});

// 2. sendSignupOtpAgain
const sendSignupOtpAgain = asyncHandler(async (req, res) => {
  const email = req.body.email;
  const result = await AuthService.sendSignupOtpAgain(email);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'OTP sent again successfully, verify in 5 minutes!',
    data: result,
  });
});

// 3. verifySignupOtp
const verifySignupOtp = asyncHandler(async (req, res) => {
  const email = req.body.email;
  const otp = req.body.otp;
  const result = await AuthService.verifySignupOtpIntoDB(email, otp);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: 'OTP verified successfully!',
    data: result,
  });
});

// 4. signin
const signin = asyncHandler(async (req, res) => {
  const result = await AuthService.signinIntoDB(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Signin successful!',
    data: result,
  });
});

// 5. createProfile
const createProfile = asyncHandler(async (req, res) => {
  const body = req.body;
  const user = req.user;
  const files = (req?.files as TProfileFileFields) || {};
  const result = await AuthService.createProfileIntoDB(body, user, files);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: 'Profile created successfully!',
    data: result,
  });
});

// 6. updatePhoto
const updatePhoto = asyncHandler(async (req, res) => {
  const files = (req.files as Record<string, Express.Multer.File[]>) || {};
  const uploadedFile =
    req.file ||
    files.file?.[0] ||
    files.image?.[0] ||
    files.photo?.[0] ||
    files.profileImage?.[0] ||
    files.avatar?.[0];

  const result = await AuthService.updatePhotoIntoDB(req.user, uploadedFile);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Photo updated successfully!',
    data: result,
  });
});

// 7. changePassword
const changePassword = asyncHandler(async (req, res) => {
  const result = await AuthService.changePasswordIntoDB(req.body, req.user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Password changed successfully!',
    data: result,
  });
});

// 8. forgotPassword
const forgotPassword = asyncHandler(async (req, res) => {
  const email = req.body.email;
  const result = await AuthService.forgotPassword(email);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message:
      'OTP sent to your email. Please check your spam or junk folder too!',
    data: result,
  });
});

// 9. sendForgotPasswordOtpAgain
const sendForgotPasswordOtpAgain = asyncHandler(async (req, res) => {
  const token = req.body.token;
  const result = await AuthService.sendForgotPasswordOtpAgain(token);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'OTP sent again. Please check your spam or junk folder too!',
    data: result,
  });
});

// 10. verifyOtpForForgotPassword
const verifyOtpForForgotPassword = asyncHandler(async (req, res) => {
  const result = await AuthService.verifyOtpForForgotPassword(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'OTP verified successfully!',
    data: result,
  });
});

// 11. resetPassword
const resetPassword = asyncHandler(async (req, res) => {
  const result = await AuthService.resetPasswordIntoDB(
    req.body.resetPasswordToken,
    req.body.newPassword
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Password has been reset successfully!',
    data: result,
  });
});

// 12. fetchProfile
const fetchProfile = asyncHandler(async (req, res) => {
  const result = await AuthService.fetchProfileFromDB(req.user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Profile data retrieved successfully!',
    data: result,
  });
});

// 13. deactivateUserAccount
const deactivateUserAccount = asyncHandler(async (req, res) => {
  const result = await AuthService.deactivateUserAccountFromDB(
    req.user,
    req.body
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Account Deactivate successfully!',
    data: result,
  });
});

// 14. deleteSpecificUserAccountFromDB
const deleteSpecificUserAccountFromDB = asyncHandler(async (req, res) => {
  const result = await AuthService.deleteSpecificUserAccountFromDB(req.user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Account Deleted successfully!',
    data: result,
  });
});

// 15. getNewAccessToken
const getNewAccessToken = asyncHandler(async (req, res) => {
  const refreshToken = req.headers.authorization?.replace('Bearer ', '');

  if (!refreshToken) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Refresh token is required!');
  }

  const result = await AuthService.getNewAccessTokenFromServer(refreshToken);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Access token given successfully!',
    data: result,
  });
});

// 16. updateAuthData
const updateAuthData = asyncHandler(async (req, res) => {
  const result = await AuthService.updateAuthDataIntoDB(req.body, req.user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Data updated successfully!',
    data: result,
  });
});

// 17. Besiness Profile Create :
const businessSignupWithProfile = asyncHandler(async (req, res) => {
  const files = {
    logoImage: (req.files as any)?.logoImage || undefined,
  };
  console.log({
    files,
  });

  const result = await AuthService.businessSignupWithProfile(req.body, files);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: result.message,
    data: result.data,
  });
});

const organizationSignupWithProfile = asyncHandler(async (req, res) => {
  const files = {
    logoImage: (req.files as any)?.logoImage || undefined,
    coverImage: (req.files as any)?.coverImage || undefined,
    drivingLicense: (req.files as any)?.drivingLicense || undefined,
  };

  const result = await AuthService.organizationSignupWithProfile(
    req.body,
    files
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: result.message,
    data: result.data,
  });
});

export const AuthController = {
  createAuth,
  sendSignupOtpAgain,
  verifySignupOtp,
  signin,
  createProfile,
  updatePhoto,
  changePassword,
  forgotPassword,
  sendForgotPasswordOtpAgain,
  verifyOtpForForgotPassword,
  resetPassword,
  fetchProfile,
  deactivateUserAccount,
  deleteSpecificUserAccountFromDB,
  getNewAccessToken,
  updateAuthData,
  businessSignupWithProfile,
  organizationSignupWithProfile,
};
