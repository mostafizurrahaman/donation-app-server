import fs from 'fs';
import httpStatus from 'http-status';
import { startSession } from 'mongoose';
import { AppError } from '../../utils';
import Business from './business.model';
import { IAuth } from '../Auth/auth.interface';
import { defaultUserImage } from '../Auth/auth.constant';

// 1. Update Business Profile Service
const updateBusinessProfile = async (
  payload: {
    category?: string;
    name?: string;
    tagLine?: string;
    description?: string;
    businessPhoneNumber?: string;
    businessEmail?: string;
    businessWebsite?: string;
    locations?: string[];
  },
  user: IAuth,
  files: {
    coverImage?: Express.Multer.File[];
    logoImage?: Express.Multer.File[];
  }
) => {
  // Check if user exists and is a business
  if (!user || user.role !== 'BUSINESS') {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Unauthorized access!');
  }

  // Find existing business profile
  const existingBusiness = await Business.findOne({ auth: user._id });

  if (!existingBusiness) {
    throw new AppError(httpStatus.NOT_FOUND, 'Business profile not found!');
  }

  // Extract file paths
  const coverImagePath =
    files?.coverImage?.[0]?.path.replace(/\\/g, '/') || null;
  const logoImagePath = files?.logoImage?.[0]?.path.replace(/\\/g, '/') || null;

  // Start a MongoDB session for transaction
  const session = await startSession();

  try {
    session.startTransaction();

    // Prepare update payload
    const businessUpdatePayload: any = {};

    if (payload.category) businessUpdatePayload.category = payload.category;
    if (payload.name) businessUpdatePayload.name = payload.name;
    if (payload.tagLine) businessUpdatePayload.tagLine = payload.tagLine;
    if (payload.description)
      businessUpdatePayload.description = payload.description;
    if (payload.businessPhoneNumber)
      businessUpdatePayload.businessPhoneNumber = payload.businessPhoneNumber;
    if (payload.businessEmail)
      businessUpdatePayload.businessEmail = payload.businessEmail;
    if (payload.businessWebsite)
      businessUpdatePayload.businessWebsite = payload.businessWebsite;
    if (payload.locations) businessUpdatePayload.locations = payload.locations;
    if (coverImagePath) businessUpdatePayload.coverImage = coverImagePath;
    if (logoImagePath) businessUpdatePayload.logoImage = logoImagePath;

    // Update business profile
    const updatedBusiness = await Business.findOneAndUpdate(
      { auth: user._id },
      businessUpdatePayload,
      { new: true, session }
    );

    if (!updatedBusiness) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to update business profile!'
      );
    }

    await session.commitTransaction();
    await session.endSession();

    // Prepare access token payload
    const accessTokenPayload = {
      id: user._id.toString(),
      name: updatedBusiness?.name,
      image:
        updatedBusiness?.logoImage ||
        updatedBusiness?.coverImage ||
        defaultUserImage,
      email: user.email,
      role: user.role,
      isProfile: user.isProfile,
      isActive: user.isActive,
      status: user.status,
    };

    return updatedBusiness;
  } catch (error: any) {
    await session.abortTransaction();
    await session.endSession();

    // Clean up uploaded files on error
    if (files) {
      Object.values(files).forEach((fileArray) => {
        fileArray.forEach((file) => {
          try {
            if (file?.path && fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          } catch (deleteErr) {
            console.warn(
              'Failed to delete uploaded file:',
              file.path,
              deleteErr
            );
          }
        });
      });
    }

    // Re-throw application-specific errors
    if (error instanceof AppError) {
      throw error;
    }

    // Throw generic internal server error
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error?.message || 'Failed to update business profile. Please try again!'
    );
  }
};

// 2. Get Business Profile
const getBusinessProfileById = async (businessId: string) => {
  const business = await Business.findOneAndUpdate(
    {
      _id: businessId,
    },
    {
      $inc: {
        views: 1,
      },
    },
    {
      new: true,
    }
  );

  if (!business) {
    throw new AppError(httpStatus.NOT_FOUND, `Business doesn't exists!`);
  }

  return business;
};
// 3. Increase Business website count
const increaseWebsiteCount = async (businessId: string) => {
  const business = await Business.findOneAndUpdate(
    {
      _id: businessId,
    },
    {
      $inc: {
        websiteViews: 1,
      },
    },
    {
      new: true,
    }
  );

  if (!business) {
    throw new AppError(httpStatus.NOT_FOUND, `Business doesn't exists!`);
  }

  return business;
};


// 4. 
export const BusinessService = {
  updateBusinessProfile,
  getBusinessProfileById,
  increaseWebsiteCount,
};
