/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
import httpStatus from 'http-status';
import { IAuth } from './auth.interface';
import { AppError } from '../../utils';
import { defaultUserImage } from '../Auth/auth.constant';
import { createAccessToken } from '../../lib';
import {
  deleteFromS3,
  getS3KeyFromUrl,
  uploadToS3,
} from '../../utils/s3.utils';

// Helper function to delete old image if exists
// const deleteOldImage = async (imagePath: string | undefined) => {
//   if (imagePath) {
//     try {
//       await fs.promises.unlink(imagePath);
//     } catch (error) {
//       console.error('Error deleting old file:', error);
//     }
//   }
// };

/**
 * Helper function to update the profile image in S3 and return a new JWT token
 */
export const updateProfileImage = async (
  user: IAuth,
  file: Express.Multer.File | undefined,
  model: any, // Client, Business, or Organization
  imageField: string
) => {
  // 1. Validate file exists in memory (buffer)
  if (!file) {
    throw new AppError(httpStatus.BAD_REQUEST, 'File is required!');
  }

  // 2. Find the user-specific model instance
  const entity = await model.findOne({ auth: user?._id });

  if (!entity) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      `${model.modelName} profile not found!`
    );
  }

  // 3. Cleanup: Delete the old image from S3 if it exists and is not a default image
  const oldImageUrl = entity[imageField];
  if (oldImageUrl && !oldImageUrl.includes('default')) {
    const oldKey = getS3KeyFromUrl(oldImageUrl);
    if (oldKey) {
      // Fire and forget, or await to ensure cleanup
      await deleteFromS3(oldKey).catch((err) =>
        console.error('Failed to delete old S3 image:', err)
      );
    }
  }

  // 4. Upload the new image buffer to S3
  const folderName = `profiles/${user.role.toLowerCase()}s`;
  const fileName = `${user._id}-${Date.now()}`;

  const uploadResult = await uploadToS3({
    buffer: file.buffer,
    key: fileName,
    contentType: file.mimetype,
    folder: folderName,
  });

  // 5. Update the database with the new S3 URL
  const updatedEntity = await model
    .findOneAndUpdate(
      { auth: user?._id },
      { [imageField]: uploadResult.url },
      { new: true }
    )
    .select(`name ${imageField}`);

  if (!updatedEntity) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to update profile record'
    );
  }

  // 6. Prepare JWT payload with the new AWS S3 URL
  const accessTokenPayload = {
    id: user._id.toString(),
    name: updatedEntity?.name,
    image: updatedEntity[imageField] || defaultUserImage,
    email: user.email,
    role: user.role,
    isProfile: user.isProfile,
    isActive: user.isActive,
    status: user.status,
  };

  const accessToken = createAccessToken(accessTokenPayload);

  return {
    accessToken,
    image: updatedEntity[imageField],
  };
};
