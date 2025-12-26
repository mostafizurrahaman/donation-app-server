/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import httpStatus from 'http-status';
import { startSession } from 'mongoose';
import config from '../../config';

import {
  createAccessToken,
  createRefreshToken,
  generateOtp,
  verifyToken,
} from '../../lib';
import { TDeactiveAccountPayload, TProfileFileFields } from '../../types';
import { AppError, sendOtpEmail, uploadToS3 } from '../../utils';
import Business from '../Business/business.model';
import Organization from '../Organization/organization.model';
import Client from '../Client/client.model';
import { IAuth } from './auth.interface';
import { defaultUserImage, ROLE, AUTH_STATUS } from './auth.constant';
import Auth from './auth.model';
import { AuthValidation, TProfilePayload } from './auth.validation';
import { updateProfileImage } from './auth.utils';
import z from 'zod';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import { BoardMemberStatus } from '../BoardMember/board-member.constant';
import { BoardMemeber } from '../BoardMember/board-member.model';
import { FcmToken } from '../FcmToken/fcmToken.model';
import SuperAdmin from '../superAdmin/superAdmin.model';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { addMonths } from 'date-fns';
import {
  PLAN_TYPE,
  SUBSCRIPTION_STATUS,
} from '../Subscription/subscription.constant';
import { Subscription } from '../Subscription/subscription.model';
import { SubscriptionHistory } from '../subscriptionHistory/subscriptionHistory.model';
const OTP_EXPIRY_MINUTES =
  Number.parseInt(config.jwt.otpSecretExpiresIn as string, 10) || 5;

// 1. createAuthIntoDB
const createAuthIntoDB = async (payload: IAuth) => {
  const existingUser = await Auth.isUserExistsByEmail(payload.email);

  // if user exists but unverified
  if (existingUser && !existingUser.isVerifiedByOTP) {
    const now = new Date();

    // if OTP expired sending new otp
    if (!existingUser.otpExpiry || existingUser.otpExpiry < now) {
      const otp = generateOtp();
      await sendOtpEmail({ email: payload.email, otp });

      existingUser.otp = otp;
      existingUser.otpExpiry = new Date(
        now.getTime() + (OTP_EXPIRY_MINUTES || 5) * 60 * 1000
      );
      await existingUser.save();

      throw new AppError(
        httpStatus.BAD_REQUEST,
        'You have an unverified account, verify it with the new OTP sent to the mail!'
      );
    } else {
      // if OTP is valid till now
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'You have an unverified account, verify it now with the otp sent to the mail!'
      );
    }
  } else if (existingUser && existingUser.isVerifiedByOTP) {
    // if user is already verified
    throw new AppError(httpStatus.BAD_REQUEST, 'User already exists!');
  } else if (!existingUser) {
    //  OTP generating and sending if user is new
    const otp = generateOtp();
    await sendOtpEmail({ email: payload.email, otp });

    // Save new user as unverified
    const now = new Date();
    const newUser = await Auth.create({
      ...payload,
      otp,
      otpExpiry: new Date(
        now.getTime() + (OTP_EXPIRY_MINUTES || 5) * 60 * 1000
      ),
      isVerifiedByOTP: false,
      status: AUTH_STATUS.PENDING,
    });

    // const token = jwt.sign({ ...payload, otp }, config.jwt.otp_secret!, {
    //   expiresIn: config.jwt.otp_secret_expires_in!,
    // } as SignOptions);

    return {
      email: newUser.email,
      // token
    };
  }
};

// 2. sendSignupOtpAgain
const sendSignupOtpAgain = async (email: string) => {
  const now = new Date();
  const user = await Auth.isUserExistsByEmail(email);

  if (!user) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You must sign up first to get an OTP!'
    );
  } else if (!user.otpExpiry || user.otpExpiry < now) {
    // sending new OTP if previous one is expired
    const otp = generateOtp();

    // send OTP via Email
    await sendOtpEmail({ email: user.email, otp });

    user.otp = otp;
    user.otpExpiry = new Date(
      now.getTime() + (OTP_EXPIRY_MINUTES || 5) * 60 * 1000
    );

    // Ensure status is set before saving
    if (!user.status) {
      user.status = AUTH_STATUS.PENDING;
    }

    await user.save();

    return {
      email: user.email,
    };
  } else if (user.isVerifiedByOTP) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This account is already verified!'
    );
  } else {
    // if OTP is still valid
    await sendOtpEmail({
      email: user.email,
      otp: user.otp,
      customMessage: 'Verify quickly using this OTP!',
    });
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'An OTP was already sent. Please wait until it expires before requesting a new one.'
    );
  }
};

// 3. verifySignupOtpIntoDB
const verifySignupOtpIntoDB = async (email: string, otp: string) => {
  const now = new Date();
  const user = await Auth.isUserExistsByEmail(email);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  // Check if the user is already verified
  if (user.isVerifiedByOTP) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This account is already verified!'
    );
  }

  // Check if OTP is expired
  if (!user.otpExpiry || user.otpExpiry < now) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'OTP has been expired. Please request a new one!'
    );
  }

  // If OTP is invalid, throw error
  if (user?.otp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid OTP!');
  }

  // Mark user as verified
  user.isVerifiedByOTP = true;
  if (!user.status) {
    user.status = AUTH_STATUS.VERIFIED;
  } else {
    user.status = AUTH_STATUS.VERIFIED;
  }
  await user.save();

  // Prepare user data for token generation
  const accessTokenPayload = {
    id: user?._id.toString(),
    name: 'User',
    image: defaultUserImage,
    email: user?.email,
    role: user?.role,
    isProfile: user?.isProfile,
    isActive: user?.isActive,
    status: AUTH_STATUS.VERIFIED,
  };

  const refreshTokenPayload = {
    email: user?.email,
  };

  // tokens
  const accessToken = createAccessToken(accessTokenPayload);
  const refreshToken = createRefreshToken(refreshTokenPayload);

  return {
    accessToken,
    refreshToken,
  };
};

const updateFcmToken = async (
  userId: string,
  token: string,
  deviceType: string
) => {
  const fcmToken = await FcmToken.findOneAndUpdate(
    {
      user: userId,
      deviceType,
    },
    {
      token,
      deviceType,
    },
    {
      new: true,
      upsert: true,
    }
  );
  return fcmToken;
};
// 4. signinIntoDB
const signinIntoDB = async (payload: {
  email: string;
  password: string;
  fcmToken: string;
  deviceType: string;
}) => {
  // const user = await Auth.findOne({ email: payload.email }).select('+password');
  const user = await Auth.findOne({ email: payload.email }).select(
    '+password +twoFactorSecret'
  );

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User does not exist!');
  }

  if (!user.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is not active!');
  }

  user.ensureActiveStatus();

  if (user.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is deleted!');
  }

  if (!user.isVerifiedByOTP) {
    const otp = generateOtp();

    await sendOtpEmail({ email: user.email, otp });

    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Ensure status is set before saving
    if (!user.status) {
      user.status = AUTH_STATUS.PENDING;
    }

    await user.save();

    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Verify your account with the new OTP sent to the mail!'
    );
  }

  // Validate password
  const isPasswordCorrect = await user.isPasswordMatched(payload.password);

  if (!isPasswordCorrect) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid credentials!');
  }

  if (payload.fcmToken && payload.deviceType) {
    const res = await AuthService.updateFcmToken(
      user?._id?.toString(),
      payload.fcmToken,
      payload.deviceType
    );
  }

  if (user.isTwoFactorEnabled) {
    return {
      twoFactorRequired: true,
      email: user.email,
      message: 'Please enter your 2FA code to continue',
    };
  }

  // Prepare user data for token generation
  const accessTokenPayload = {
    id: user._id.toString(),
    name: 'User',
    image: defaultUserImage,
    email: user.email,
    role: user.role,
    isProfile: user?.isProfile,
    isActive: user?.isActive,
    status: user.status,
  };

  const refreshTokenPayload = {
    email: user?.email,
  };

  // tokens
  const accessToken = createAccessToken(accessTokenPayload);
  const refreshToken = createRefreshToken(refreshTokenPayload);

  return {
    accessToken,
    refreshToken,
    twoFactorRequired: false,
  };
};

// 5. createProfileIntoDB

const createProfileIntoDB = async (
  payload: TProfilePayload,
  user: IAuth,
  files: TProfileFileFields
) => {
  // Prevent creating multiple profiles for same user
  if (user.isProfile) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Your profile is already created!'
    );
  }

  user.ensureActiveStatus();

  const {
    role,
    name,
    address,
    state,
    postalCode,
    category,
    tagLine,
    description,
    businessPhoneNumber,
    businessEmail,
    businessWebsite,
    locations,
    serviceType,
    website,
    phoneNumber,
    boardMemberName,
    boardMemberEmail,
    boardMemberPhoneNumber,
    tfnOrAbnNumber,
    zakatLicenseHolderNumber,
  } = payload;

  // Start a MongoDB session for transaction
  console.log(payload);
  const session = await startSession();

  try {
    session.startTransaction();

    // --- CLIENT PROFILE ---
    if (role === ROLE.CLIENT) {
      const isExistClient = await Client.findOne({ auth: user._id });
      if (isExistClient)
        throw new AppError(httpStatus.BAD_REQUEST, 'Client already exists');

      let imageUrl = null;
      if (files?.clientImage?.[0]) {
        const upload = await uploadToS3({
          buffer: files.clientImage[0].buffer,
          key: `client-${user._id}-${Date.now()}`,
          contentType: files.clientImage[0].mimetype,
          folder: 'profiles/clients',
        });
        imageUrl = upload.url;
      }

      const [client] = await Client.create(
        [
          {
            auth: user._id,
            name,
            address,
            state,
            postalCode,
            image: imageUrl,
          },
        ],
        { session }
      );

      await Auth.findByIdAndUpdate(
        user._id,
        { role: ROLE.CLIENT, isProfile: true },
        { session }
      );
      await session.commitTransaction();
      await session.endSession();

      return {
        accessToken: createAccessToken({
          id: user._id.toString(),
          name: client.name,
          image: client.image || '',
          email: user.email,
          role: user.role,
          isProfile: true,
          isActive: user.isActive,
          status: user.status,
        }),
      };
    }

    // --- BUSINESS PROFILE ---
    else if (role === ROLE.BUSINESS) {
      const isExistBusiness = await Business.findOne({ auth: user._id });
      if (isExistBusiness)
        throw new AppError(httpStatus.BAD_REQUEST, 'Business already exists');

      let coverUrl = null;
      if (files?.businessImage?.[0]) {
        const upload = await uploadToS3({
          buffer: files.businessImage[0].buffer,
          key: `business-${user._id}-${Date.now()}`,
          contentType: files.businessImage[0].mimetype,
          folder: 'profiles/businesses',
        });
        coverUrl = upload.url;
      }

      const [business] = await Business.create(
        [
          {
            auth: user._id,
            category,
            name,
            tagLine,
            description,
            coverImage: coverUrl,
            businessPhoneNumber,
            businessEmail,
            businessWebsite,
            locations,
          },
        ],
        { session }
      );

      await Auth.findByIdAndUpdate(
        user._id,
        { role: ROLE.BUSINESS, isProfile: true },
        { session }
      );
      await session.commitTransaction();
      await session.endSession();

      return {
        accessToken: createAccessToken({
          id: user._id.toString(),
          name: business.name,
          image: business.coverImage || '',
          email: user.email,
          role: user.role,
          isProfile: true,
          isActive: user.isActive,
          status: user.status,
        }),
      };
    }

    // --- ORGANIZATION PROFILE ---
    else if (role === ROLE.ORGANIZATION) {
      const isExistOrganization = await Organization.findOne({
        auth: user._id,
      });
      if (isExistOrganization)
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Organization already exists'
        );

      let coverUrl = null;
      let licenseUrl = null;

      if (files?.organizationImage?.[0]) {
        const upload = await uploadToS3({
          buffer: files.organizationImage[0].buffer,
          key: `org-cover-${user._id}-${Date.now()}`,
          contentType: files.organizationImage[0].mimetype,
          folder: 'profiles/orgs',
        });
        coverUrl = upload.url;
      }

      if (files?.drivingLincenseURL?.[0]) {
        const upload = await uploadToS3({
          buffer: files.drivingLincenseURL[0].buffer,
          key: `org-license-${user._id}-${Date.now()}`,
          contentType: files.drivingLincenseURL[0].mimetype,
          folder: 'documents/orgs',
        });
        licenseUrl = upload.url;
      }

      const [organization] = await Organization.create(
        [
          {
            auth: user._id,
            name,
            serviceType,
            address,
            state,
            postalCode,
            website,
            phoneNumber,
            coverImage: coverUrl,
            boardMemberName,
            boardMemberEmail,
            boardMemberPhoneNumber,
            drivingLicenseURL: licenseUrl,
            tfnOrAbnNumber,
            zakatLicenseHolderNumber,
          },
        ],
        { session }
      );

      await Auth.findByIdAndUpdate(
        user._id,
        { role: ROLE.ORGANIZATION, isProfile: true },
        { session }
      );
      await session.commitTransaction();
      await session.endSession();

      return {
        accessToken: createAccessToken({
          id: user._id.toString(),
          name: organization.name,
          image: organization.coverImage || '',
          email: user.email,
          role: user.role,
          isProfile: true,
          isActive: user.isActive,
          status: user.status,
        }),
      };
    } else if (role === ROLE.ADMIN) {
      const isExistAdmin = await SuperAdmin.findOne({ auth: user._id });

      if (isExistAdmin)
        throw new AppError(httpStatus.BAD_REQUEST, 'Profile already exists');

      let imageUrl = null;
      if (files?.adminImage?.[0]) {
        // Adjust field name in upload.fields if necessary
        const upload = await uploadToS3({
          buffer: files.adminImage[0].buffer,
          key: `admin-${user._id}-${Date.now()}`,
          contentType: files.adminImage[0].mimetype,
          folder: 'profiles/super-admins',
        });
        imageUrl = upload.url;
      }

      const [adminProfile] = await SuperAdmin.create(
        [
          {
            auth: user._id,
            name,
            address,
            phoneNumber,
            state,
            profileImage: imageUrl,
          },
        ],
        { session }
      );

      await Auth.findByIdAndUpdate(user._id, { isProfile: true }, { session });
      await session.commitTransaction();
      await session.endSession();

      return {
        accessToken: createAccessToken({
          id: user._id.toString(),
          name: adminProfile.name,
          image: adminProfile.profileImage || '',
          email: user.email,
          role: user.role,
          isProfile: true,
          isActive: user.isActive,
          status: user.status,
        }),
      };
    }
  } catch (error: any) {
    await session.abortTransaction();
    await session.endSession();
    throw error instanceof AppError
      ? error
      : new AppError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

// 6. updatePhotoIntoDB
const updatePhotoIntoDB = async (
  user: IAuth,
  file: Express.Multer.File | undefined
) => {
  switch (user?.role) {
    case ROLE.CLIENT:
      return updateProfileImage(user, file, Client, 'image');
    case ROLE.BUSINESS:
      return updateProfileImage(user, file, Business, 'coverImage');
    case ROLE.ORGANIZATION:
      return updateProfileImage(user, file, Organization, 'coverImage');
    default:
      throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid role!');
  }
};

// 7. changePasswordIntoDB
const changePasswordIntoDB = async (
  payload: z.infer<typeof AuthValidation.changePasswordSchema.shape.body>,
  userData: IAuth
) => {
  // const user = await Auth.findOne({ _id: userData._id, isActive: true }).select(
  //   '+password'
  // );

  const user = await Auth.isUserExistsByEmail(userData.email);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User does not exist!');
  }

  if (!user.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is not active!');
  }

  if (user.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is deleted!');
  }

  user.ensureActiveStatus();

  const isCredentialsCorrect = await user.isPasswordMatched(
    payload.oldPassword
  );

  if (!isCredentialsCorrect) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Current password is not correct!'
    );
  }

  user.password = payload.newPassword;
  user.passwordChangedAt = new Date(Date.now() - 5000); // set 5 second before to avoid isJWTIssuedBeforePasswordChanged issue

  // Ensure status is set before saving
  if (!user.status) {
    user.status = AUTH_STATUS.PENDING;
  }

  await user.save();

  let name: string = 'User';
  let image: string = defaultUserImage;

  if (user.role === ROLE.CLIENT) {
    const client = await Client.findOne({ auth: user._id });
    name = client?.name || 'User';
    image = client?.image || defaultUserImage;
  }

  if (user.role === ROLE.BUSINESS) {
    const business = await Business.findOne({ auth: user._id });
    name = business?.name || 'Business';
    image = business?.coverImage || defaultUserImage;
  }

  if (user.role === ROLE.ORGANIZATION) {
    const organization = await Organization.findOne({ auth: user._id });
    name = organization?.name || 'Organization';
    image = organization?.coverImage || defaultUserImage;
  }

  // Prepare user data for tokens
  const accessTokenPayload = {
    id: user._id.toString(),
    name,
    image,
    email: user.email,
    role: user.role,
    isProfile: user?.isProfile,
    isActive: user?.isActive,
    status: user.status,
  };

  const refreshTokenPayload = {
    email: user?.email,
  };

  const accessToken = createAccessToken(accessTokenPayload);
  const refreshToken = createRefreshToken(refreshTokenPayload);

  return {
    accessToken,
    refreshToken,
  };
};

// 8. forgotPassword - 1.(send Otp)
const forgotPassword = async (email: string) => {
  // const user = await Auth.findOne({ email, isActive: true });
  const user = await Auth.isUserExistsByEmail(email);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  if (!user.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is not active!');
  }

  if (user.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is deleted!');
  }

  user.ensureActiveStatus();

  const now = new Date();

  // If OTP exists and not expired, reuse it
  if (user.otp && user.otpExpiry && now < user.otpExpiry) {
    // Do nothing, just reuse existing OTP
    const remainingMs = user.otpExpiry.getTime() - now.getTime();
    const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));

    // await sendOtpEmail(email, user.otp, user.fullName || 'Guest');

    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Last OTP is valid till now, use that in ${remainingMinutes} minutes!`
    );
  } else {
    // Generate new OTP
    const otp = generateOtp();
    const otpExpiry = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

    user.otp = otp;
    user.otpExpiry = otpExpiry;

    // Ensure status is set before saving
    if (!user.status) {
      user.status = AUTH_STATUS.PENDING;
    }

    await user.save();

    let name: string = 'User';

    if (user.role === ROLE.CLIENT) {
      const client = await Client.findOne({ auth: user._id });
      name = client?.name || 'User';
    }

    if (user.role === ROLE.BUSINESS) {
      const business = await Business.findOne({ auth: user._id });
      name = business?.name || 'Business';
    }

    if (user.role === ROLE.ORGANIZATION) {
      const organization = await Organization.findOne({ auth: user._id });
      name = organization?.name || 'Organization';
    }

    // Send OTP
    await sendOtpEmail({ email, otp, name });
  }

  // Issue token (just with email)
  const token = jwt.sign({ email }, config.jwt.otpSecret!, {
    expiresIn: config.jwt.otpSecretExpiresIn!,
  } as SignOptions);

  return { token };
};

// 9. sendForgotPasswordOtpAgain - 2.(send Otp Again)
const sendForgotPasswordOtpAgain = async (forgotPassToken: string) => {
  if (!forgotPassToken) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Token is required!');
  }

  // Check if token is a valid JWT format (should have 3 parts separated by dots)
  if (typeof forgotPassToken !== 'string' || !forgotPassToken.includes('.')) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid token format!');
  }

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(forgotPassToken, config.jwt.otpSecret!, {
      ignoreExpiration: true,
    }) as JwtPayload;
  } catch (error) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid token!');
  }
  const email = decoded.email;

  if (!email) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid token!');
  }

  // const user = await Auth.findOne({ email, isActive: true });
  const user = await Auth.isUserExistsByEmail(email);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  if (!user.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is not active!');
  }

  if (user.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is deleted!');
  }

  user.ensureActiveStatus();

  const now = new Date();

  // If OTP exists and not expired, reuse it
  if (user.otp && user.otpExpiry && now < user.otpExpiry) {
    // Do nothing, just reuse existing OTP
    const remainingMs = user.otpExpiry.getTime() - now.getTime();
    const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));

    // await sendOtpEmail(email, user.otp, user.fullName || 'Guest');

    throw new AppError(
      httpStatus.NOT_FOUND,
      `Last OTP is valid till now, use that in ${remainingMinutes} minutes!`
    );
  } else {
    // Generate new OTP
    const otp = generateOtp();
    const otpExpiry = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

    user.otp = otp;
    user.otpExpiry = otpExpiry;

    // Ensure status is set before saving
    if (!user.status) {
      user.status = AUTH_STATUS.PENDING;
    }

    await user.save();

    let name: string = 'User';

    if (user.role === ROLE.CLIENT) {
      const client = await Client.findOne({ auth: user._id });
      name = client?.name || 'User';
    }

    if (user.role === ROLE.BUSINESS) {
      const business = await Business.findOne({ auth: user._id });
      name = business?.name || 'Business';
    }

    if (user.role === ROLE.ORGANIZATION) {
      const organization = await Organization.findOne({ auth: user._id });
      name = organization?.name || 'Organization';
    }

    // Send OTP
    await sendOtpEmail({ email, otp, name });
  }

  return null;
};

// 10. verifyOtpForForgotPassword - 3.(verify Otp)
const verifyOtpForForgotPassword = async (payload: {
  token: string;
  otp: string;
}) => {
  let decoded: JwtPayload;

  try {
    decoded = jwt.verify(payload.token, config.jwt.otpSecret!, {
      ignoreExpiration: true,
    }) as JwtPayload;
  } catch {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid token!');
  }

  const email = decoded.email;

  // const user = await Auth.findOne({ email, isActive: true });
  const user = await Auth.isUserExistsByEmail(email);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  if (!user.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is not active!');
  }

  if (user.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is deleted!');
  }

  user.ensureActiveStatus();

  // Check if OTP expired
  if (!user.otp || !user.otpExpiry || Date.now() > user.otpExpiry.getTime()) {
    // Generate and send new OTP
    const newOtp = generateOtp();
    const newExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    user.otp = newOtp;
    user.otpExpiry = newExpiry;

    // Ensure status is set before saving
    if (!user.status) {
      user.status = AUTH_STATUS.PENDING;
    }

    await user.save();

    let name: string = 'User';

    if (user.role === ROLE.CLIENT) {
      const client = await Client.findOne({ auth: user._id });
      name = client?.name || 'User';
    }

    if (user.role === ROLE.BUSINESS) {
      const business = await Business.findOne({ auth: user._id });
      name = business?.name || 'Business';
    }

    if (user.role === ROLE.ORGANIZATION) {
      const organization = await Organization.findOne({ auth: user._id });
      name = organization?.name || 'Organization';
    }

    await sendOtpEmail({ email, otp: newOtp, name });

    throw new AppError(
      httpStatus.BAD_REQUEST,
      'OTP expired. A new OTP has been sent again!'
    );
  }

  // Check if OTP matches
  if (user.otp !== payload.otp) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid OTP!');
  }

  // OTP verified → issue reset password token
  const resetPasswordToken = jwt.sign(
    {
      email: user.email,
      isResetPassword: true,
    },
    config.jwt.otpSecret!,
    { expiresIn: config.jwt.otpSecretExpiresIn } as SignOptions
  );

  return { resetPasswordToken };
};

// 11. resetPasswordIntoDB - 4.(reset Password)
const resetPasswordIntoDB = async (
  resetPasswordToken: string,
  newPassword: string
) => {
  if (!resetPasswordToken) {
    throw new AppError(httpStatus.FORBIDDEN, 'Invalid reset password token!');
  }

  const payload = verifyToken(resetPasswordToken, config.jwt.otpSecret!) as {
    email: string;
    isResetPassword?: boolean;
  };

  if (!payload?.isResetPassword || !payload?.email) {
    throw new AppError(httpStatus.FORBIDDEN, 'Invalid reset password token!');
  }

  // const user = await Auth.findOne({ email: payload.email, isActive: true });
  const user = await Auth.isUserExistsByEmail(payload.email);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  if (!user.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is not active!');
  }

  if (user.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is deleted!');
  }

  user.ensureActiveStatus();

  user.password = newPassword;
  await user.save({ validateBeforeSave: true });

  return null;
};

// 12. fetchProfileFromDB
const fetchProfileFromDB = async (user: IAuth) => {
  console.log({
    user,
  });
  if (user?.role === ROLE.CLIENT) {
    const client = await Client.findOne({ auth: user._id }).populate([
      {
        path: 'auth',
        select: 'email role isProfile isTwoFactorEnabled',
      },
    ]);
    // .lean();

    return client;

    // return { ...client,  preference};
    // return { ...client?.toObject(), preference };
  } else if (user?.role === ROLE.BUSINESS) {
    const business = await Business.findOne({ auth: user._id }).populate([
      {
        path: 'auth',
        select: 'email role isProfile isTwoFactorEnabled',
      },
    ]);
    console.log({ business });

    // return business;
    const businessProfile = business?.toObject();

    return {
      ...businessProfile,
      coverImage: businessProfile?.coverImage || null,
      logoImage: businessProfile?.logoImage || null,
    };
  } else if (user?.role === ROLE.ORGANIZATION) {
    const organization = await Organization.findOne({
      auth: user._id,
    }).populate([
      {
        path: 'auth',
        select: 'email role isProfile isTwoFactorEnabled',
      },
    ]);

    return organization;

    // return { ...organization?.toObject(), preference };
  } else if (user?.role === ROLE.ADMIN) {
    const admin = await SuperAdmin.findOne({
      auth: user._id,
    }).populate([
      {
        path: 'auth',
        select: 'email role isProfile isTwoFactorEnabled',
      },
    ]);
    return admin;
  }
};

// 13. deactivateUserAccountFromDB
const deactivateUserAccountFromDB = async (
  user: IAuth,
  payload: TDeactiveAccountPayload
) => {
  const { email, password, deactivationReason } = payload;

  const currentUser = await Auth.findOne({
    _id: user._id,
    email: email,
  }).select('+password');

  if (!currentUser) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const isPasswordCorrect = currentUser.isPasswordMatched(password);

  if (!isPasswordCorrect) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid credentials');
  }

  const result = await Auth.findByIdAndUpdate(
    user._id,
    {
      $set: {
        isActive: false,
        deactivationReason,
        deactivatedAt: new Date(),
      },
    },
    {
      new: true,
      select: 'email name isActive deactivationReason deactivatedAt',
    }
  );

  return result;
};

// 14. deleteSpecificUserAccountFromDB
const deleteSpecificUserAccountFromDB = async (user: IAuth) => {
  const session = await startSession();

  try {
    session.startTransaction();

    // 1. Find the user to get their email and confirm they exist before deleting.
    const userToDelete = await Auth.findById(user._id).session(session);

    if (!userToDelete) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
    }

    // 2. Initialize a default name for the return object.
    let name: string = 'User';

    // 3. Find and delete the associated profile document based on the user's role.
    if (user.role === ROLE.CLIENT) {
      const deletedClient = await Client.findOneAndDelete(
        { auth: user._id },
        { session }
      );
      // If a client profile existed and was deleted, use its name.
      if (deletedClient?.name) {
        name = deletedClient.name;
      }
    } else if (user.role === ROLE.BUSINESS) {
      const deletedBusiness = await Business.findOneAndDelete(
        { auth: user._id },
        { session }
      );
      if (deletedBusiness?.name) {
        name = deletedBusiness.name;
      }
    } else if (user.role === ROLE.ORGANIZATION) {
      const deletedOrganization = await Organization.findOneAndDelete(
        { auth: user._id },
        { session }
      );
      if (deletedOrganization?.name) {
        name = deletedOrganization.name;
      }
    }

    // 4. Hard delete the main authentication document.
    await Auth.findByIdAndDelete(user._id, { session });

    await session.commitTransaction();
    await session.endSession();

    // 5. Return the details of the deleted user.
    return {
      email: userToDelete.email,
      id: userToDelete._id,
      name,
    };
  } catch (error) {
    await session.abortTransaction();
    await session.endSession();
    throw error;
  }
};

// 15. getNewAccessTokenFromServer
const getNewAccessTokenFromServer = async (refreshToken: string) => {
  // checking if the given token is valid
  const decoded = verifyToken(
    refreshToken,
    config.jwt.refreshTokenExpiresIn!
  ) as JwtPayload;

  const { email, iat } = decoded;

  // checking if the user is exist
  const user = await Auth.isUserExistsByEmail(email);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  if (!user?.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is not active!');
  }

  if (user?.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is deleted!');
  }

  // checking if the any hacker using a token even-after the user changed the password
  if (
    user.passwordChangedAt &&
    user.isJWTIssuedBeforePasswordChanged(iat as number)
  ) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'You are not authorized!');
  }

  let name: string = 'User';
  let image: string = defaultUserImage;

  if (user.role === ROLE.CLIENT) {
    const client = await Client.findOne({ auth: user._id });
    name = client?.name || 'User';
    image = client?.image || defaultUserImage;
  }

  if (user.role === ROLE.BUSINESS) {
    const business = await Business.findOne({ auth: user._id });
    name = business?.name || 'Business';
    image = business?.coverImage || defaultUserImage;
  }

  if (user.role === ROLE.ORGANIZATION) {
    const organization = await Organization.findOne({ auth: user._id });
    name = organization?.name || 'Organization';
    image = organization?.coverImage || defaultUserImage;
  }

  // Prepare user data for tokens
  const accessTokenPayload = {
    id: user?._id.toString(),
    name,
    image,
    email: user?.email,
    role: user?.role,
    isProfile: user?.isProfile,
    isActive: user?.isActive,
    status: user.status,
  };

  const accessToken = createAccessToken(accessTokenPayload);

  return {
    accessToken,
  };
};

// 16. updateAuthDataIntoDB
const updateAuthDataIntoDB = async (
  payload: { name: string },
  userData: IAuth
) => {
  let updatedProfile;

  // Update name in the appropriate profile model based on user role
  if (userData.role === ROLE.CLIENT) {
    updatedProfile = await Client.findOneAndUpdate(
      { auth: userData._id },
      { name: payload.name },
      { new: true }
    );
  } else if (userData.role === ROLE.BUSINESS) {
    updatedProfile = await Business.findOneAndUpdate(
      { auth: userData._id },
      { name: payload.name },
      { new: true }
    );
  } else if (userData.role === ROLE.ORGANIZATION) {
    updatedProfile = await Organization.findOneAndUpdate(
      { auth: userData._id },
      { name: payload.name },
      { new: true }
    );
  } else {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Invalid user role for profile update!'
    );
  }

  if (!updatedProfile) {
    throw new AppError(httpStatus.NOT_FOUND, 'Profile not found!');
  }

  // Re-fetch the user to ensure we have the latest data
  const user = await Auth.findById(userData._id);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  if (!user?.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is not active!');
  }

  if (user?.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is deleted!');
  }

  if (user?.status !== AUTH_STATUS.VERIFIED) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This account is not verified!');
  }

  let name: string = updatedProfile.name || 'User';
  let image: string = defaultUserImage;

  if (user.role === ROLE.CLIENT) {
    image = (updatedProfile as any)?.image || defaultUserImage;
  } else if (user.role === ROLE.BUSINESS) {
    image = (updatedProfile as any)?.coverImage || defaultUserImage;
  } else if (user.role === ROLE.ORGANIZATION) {
    image = (updatedProfile as any)?.coverImage || defaultUserImage;
  }

  // Prepare user data for tokens
  const accessTokenPayload = {
    id: user._id.toString(),
    name,
    image,
    email: user.email,
    role: user.role,
    isProfile: user?.isProfile,
    isActive: user?.isActive,
    status: user.status,
  };

  const accessToken = createAccessToken(accessTokenPayload);

  return {
    accessToken,
  };
};

// Business Signup with Profile Creation (Single Transaction)
const businessSignupWithProfile = async (
  payload: {
    // Auth fields
    email: string;
    password: string;

    // Business profile fields (required)
    category: string;
    name: string;
    tagLine: string;
    description: string;

    // Business profile fields (optional)
    businessPhoneNumber?: string;
    businessEmail?: string;
    businessWebsite?: string;
    locations?: string[];
  },
  files?: {
    logoImage?: Express.Multer.File[];
  }
) => {
  // Extract auth and business data

  const { email, password, ...businessData } = payload;

  console.log({ payload, files });

  // Check if user already exists
  const existingUser = await Auth.isUserExistsByEmail(email);

  if (existingUser) {
    // Clean up uploaded files if user exists
    if (files?.logoImage?.[0]?.path) {
      try {
        fs.unlinkSync(files.logoImage[0].path);
      } catch (err) {
        console.error('Failed to delete uploaded file:', err);
      }
    }

    // Throw error immediately - no OTP sending
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'User with this email already exists!'
    );
  }

  // Extract cover image path (optional)
  let logoImageUrl = null;
  if (files?.logoImage?.[0]) {
    const uploadResult = await uploadToS3({
      buffer: files.logoImage[0].buffer,
      key: `logo-${Date.now()}`,
      contentType: files.logoImage[0].mimetype,
      folder: 'profiles/businesses',
    });
    logoImageUrl = uploadResult.url;
  }

  // Generate OTP for new user
  const otp = generateOtp();
  const now = new Date();
  const otpExpiry = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Start transaction
  const session = await startSession();

  try {
    session.startTransaction();

    // 1. Create Auth record
    const authPayload = {
      email,
      password,
      otp,
      otpExpiry,
      isVerifiedByOTP: false,
      isProfile: true, // Set to true since we're creating profile
      role: ROLE.BUSINESS,
      isActive: true,
      isDeleted: false,
      status: AUTH_STATUS.PENDING, // Will be verified after OTP verification
    };

    const [newAuth] = await Auth.create([authPayload], { session });

    if (!newAuth) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to create authentication record!'
      );
    }

    // 2. Create Business profile with optional fields
    const businessPayload = {
      auth: newAuth._id,
      category: businessData.category,
      name: businessData.name,
      tagLine: businessData.tagLine,
      description: businessData.description,

      // Optional fields - only add if provided
      ...(logoImageUrl && { logoImage: logoImageUrl }),
      ...(businessData.businessPhoneNumber && {
        businessPhoneNumber: businessData.businessPhoneNumber,
      }),
      ...(businessData.businessEmail && {
        businessEmail: businessData.businessEmail,
      }),
      ...(businessData.businessWebsite && {
        businessWebsite: businessData.businessWebsite,
      }),
      ...(businessData.locations &&
        businessData.locations.length > 0 && {
          locations: businessData.locations,
        }),
    };

    const [newBusiness] = await Business.create([businessPayload], { session });

    if (!newBusiness) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to create business profile!'
      );
    }

    // 3. Send OTP email
    await sendOtpEmail({
      email,
      otp,
      name: businessData.name,
      customMessage:
        'Welcome to our platform! Please verify your business account with this OTP.',
    });

    if (ROLE.BUSINESS === newAuth.role) {
      const trialEndDate = addMonths(new Date(), 6);

      const [newSub] = await Subscription.create(
        [
          {
            user: newAuth._id,
            planType: PLAN_TYPE.TRIAL,
            status: SUBSCRIPTION_STATUS.TRIALING,
            currentPeriodStart: new Date(),
            currentPeriodEnd: trialEndDate,
          },
        ],
        { session }
      );

      await SubscriptionHistory.create(
        [
          {
            user: newAuth._id,
            subscription: newSub._id,
            stripeInvoiceId: `TRAIL-${new Date().getTime()}-${crypto
              .randomBytes(6)
              .toString('hex')}`,
            amount: 0,
            status: 'succeeded',
            billingReason: 'trial_start',
            planType: 'trial',
            transactionDate: new Date(),
          },
        ],
        { session }
      );
    }

    // Commit transaction
    await session.commitTransaction();
    await session.endSession();

    // Return response (without tokens since account is not verified yet)
    return {
      message:
        'Business account created successfully! Please check your email for OTP verification.',
      data: {
        email: newAuth.email,
        businessName: newBusiness.name,
        isProfileCreated: true,
        requiresVerification: true,
      },
    };
  } catch (error: any) {
    console.log(error);
    // Rollback transaction
    await session.abortTransaction();
    await session.endSession();

    // // Clean up uploaded files on error
    // if (logoImage && fs.existsSync(logoImage)) {
    //   try {
    //     fs.unlinkSync(logoImage);
    //   } catch (deleteErr) {
    //     console.error('Failed to delete uploaded file:', deleteErr);
    //   }
    // }

    // Re-throw application errors
    if (error instanceof AppError) {
      throw error;
    }

    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Email already exists!');
    }

    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error?.message || 'Failed to create business account!'
    );
  }
};

const organizationSignupWithProfile = async (
  payload: any,
  files?: {
    logoImage?: Express.Multer.File[];
    coverImage?: Express.Multer.File[];
    drivingLicense?: Express.Multer.File[];
  }
) => {
  const { email, password, ...orgData } = payload;

  // 1. Check if user already exists
  const existingUser = await Auth.isUserExistsByEmail(email);
  if (existingUser) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'User with this email already exists!'
    );
  }

  // 2. Upload Files to S3
  let logoImageUrl = null;
  let coverImageUrl = null;
  let drivingLicenseUrl = null;

  if (files?.logoImage?.[0]) {
    const upload = await uploadToS3({
      buffer: files.logoImage[0].buffer,
      key: `logo-${Date.now()}`,
      contentType: files.logoImage[0].mimetype,
      folder: 'organization/logos',
    });
    logoImageUrl = upload.url;
  }

  if (files?.coverImage?.[0]) {
    const upload = await uploadToS3({
      buffer: files.coverImage[0].buffer,
      key: `cover-${Date.now()}`,
      contentType: files.coverImage[0].mimetype,
      folder: 'organization/covers',
    });
    coverImageUrl = upload.url;
  }

  if (files?.drivingLicense?.[0]) {
    const upload = await uploadToS3({
      buffer: files.drivingLicense[0].buffer,
      key: `license-${Date.now()}`,
      contentType: files.drivingLicense[0].mimetype,
      folder: 'organization/documents',
    });
    drivingLicenseUrl = upload.url;
  }

  // 3. Generate OTP
  const otp = generateOtp();
  const now = new Date();
  const otpExpiry = new Date(
    now.getTime() + (Number(config.jwt.otpSecretExpiresIn) || 5) * 60 * 1000
  );

  const session = await startSession();

  try {
    session.startTransaction();

    // 4. Create Auth record
    const authPayload = {
      email,
      password,
      otp,
      otpExpiry,
      isVerifiedByOTP: false,
      isProfile: true,
      role: ROLE.ORGANIZATION,
      isActive: true,
      isDeleted: false,
      status: AUTH_STATUS.PENDING,
    };

    const [newAuth] = await Auth.create([authPayload], { session });

    if (!newAuth) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to create authentication record!'
      );
    }

    // 5. Create Organization Profile
    const organizationPayload = {
      auth: newAuth._id,
      name: orgData.name,
      serviceType: orgData.serviceType,
      address: orgData.address,
      state: orgData.state,
      country: orgData.country,
      postalCode: orgData.postalCode,
      website: orgData.website,
      phoneNumber: orgData.phoneNumber,
      aboutUs: orgData.aboutUs,
      registeredCharityName: orgData.registeredCharityName,
      dateOfEstablishment: orgData.dateOfEstablishment,

      tfnOrAbnNumber: orgData.tfnOrAbnNumber,
      acncNumber: orgData.acncNumber,
      zakatLicenseHolderNumber: orgData.zakatLicenseHolderNumber,

      // Use S3 URLs
      logoImage: logoImageUrl,
      coverImage: coverImageUrl,
    };

    const [newOrganization] = await Organization.create([organizationPayload], {
      session,
    });

    if (!newOrganization) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to create organization profile!'
      );
    }

    // 6. Create Board Member
    const boardMemeberPayload = {
      organization: newOrganization?._id,
      boardMemberName: orgData.boardMemberName,
      boardMemberEmail: orgData.boardMemberEmail,
      boardMemberPhoneNumber: orgData.boardMemberPhoneNumber,
      drivingLicenseURL: drivingLicenseUrl, // Use S3 URL
      status: BoardMemberStatus.PENDING,
    };

    const [boardMember] = await BoardMemeber.create([boardMemeberPayload], {
      session,
    });

    if (!boardMember) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to create board member!'
      );
    }

    // 7. Send OTP Email
    await sendOtpEmail({
      email,
      otp,
      name: orgData.name,
      customMessage:
        'Welcome! Please verify your organization account to proceed.',
    });

    // 7. Database lable trail subscription for organization role
    if (newAuth.role === ROLE.ORGANIZATION) {
      const trialEndDate = addMonths(new Date(), 6);

      const [newSub] = await Subscription.create(
        [
          {
            user: newAuth._id,
            planType: PLAN_TYPE.TRIAL,
            status: SUBSCRIPTION_STATUS.TRIALING,
            currentPeriodStart: new Date(),
            currentPeriodEnd: trialEndDate,
          },
        ],
        { session }
      );

      await SubscriptionHistory.create(
        [
          {
            user: newAuth._id,
            subscription: newSub._id,
            stripeInvoiceId: 'trial_initiation',
            amount: 0,
            status: 'succeeded',
            billingReason: 'trial_start',
            planType: 'trial',
            transactionDate: new Date(),
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();
    await session.endSession();

    return {
      message: 'Organization account created successfully! Please verify OTP.',
      data: {
        email: newAuth.email,
        organizationName: newOrganization.name,
        requiresVerification: true,
      },
    };
  } catch (error: any) {
    await session.abortTransaction();
    await session.endSession();

    if (error instanceof AppError) throw error;
    if (error.code === 11000)
      throw new AppError(httpStatus.BAD_REQUEST, 'Email already exists!');

    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error?.message || 'Failed to create organization account!'
    );
  }
};

const setup2FA = async (userId: string) => {
  const user = await Auth.findById(userId);
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  const secret = speakeasy.generateSecret({
    name: `CrescentChange:${user.email}`,
  });

  // Store secret temporarily (don't enable yet)
  user.twoFactorSecret = secret.base32;
  await user.save();

  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

  return {
    qrCodeUrl,
    secret: secret.base32,
  };
};

const verifyAndEnable2FA = async (userId: string, token: string) => {
  const user = await Auth.findById(userId).select('+twoFactorSecret');
  if (!user || !user.twoFactorSecret) {
    throw new AppError(httpStatus.BAD_REQUEST, '2FA setup not initiated');
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token,
  });

  if (!verified) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid 2FA token');
  }

  user.isTwoFactorEnabled = true;
  // Generate backup codes
  const backupCodes = Array.from({ length: 5 }, () => {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  });
  user.twoFactorBackupCodes = backupCodes;

  await user.save();

  return { backupCodes };
};

const verify2FALogin = async (email: string, token: string) => {
  const user = await Auth.findOne({ email }).select('+twoFactorSecret');
  if (!user || !user.twoFactorSecret) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Authentication failed');
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token,
  });

  if (!verified) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid 2FA token');
  }

  // Generate real tokens
  const accessTokenPayload = {
    id: user._id.toString(),
    name: 'User',
    image: defaultUserImage,
    email: user.email,
    role: user.role,
    isProfile: user?.isProfile,
    isActive: user?.isActive,
    status: user.status,
  };

  return {
    accessToken: createAccessToken(accessTokenPayload),
    refreshToken: createRefreshToken({ email: user.email }),
  };
};

const disable2FA = async (userId: string, token: string) => {
  const user = await Auth.findById(userId).select('+twoFactorSecret');
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret!,
    encoding: 'base32',
    token,
  });

  if (!verified)
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid 2FA token');

  user.isTwoFactorEnabled = false;
  user.twoFactorSecret = undefined;
  user.twoFactorBackupCodes = [];
  await user.save();

  return { success: true };
};

export const AuthService = {
  createAuthIntoDB,
  sendSignupOtpAgain,
  verifySignupOtpIntoDB,
  signinIntoDB,
  createProfileIntoDB,
  updatePhotoIntoDB,
  changePasswordIntoDB,
  forgotPassword,
  sendForgotPasswordOtpAgain,
  verifyOtpForForgotPassword,
  resetPasswordIntoDB,
  fetchProfileFromDB,
  deactivateUserAccountFromDB,
  deleteSpecificUserAccountFromDB,
  getNewAccessTokenFromServer,
  updateAuthDataIntoDB,
  businessSignupWithProfile,
  organizationSignupWithProfile,
  updateFcmToken,
  setup2FA,
  disable2FA,
  verify2FALogin,
  verifyAndEnable2FA,
};
