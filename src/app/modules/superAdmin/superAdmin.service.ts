import httpStatus from 'http-status';
import { AppError } from '../../utils';
import SuperAdmin from './superAdmin.model';
import {
  uploadToS3,
  deleteFromS3,
  getS3KeyFromUrl,
} from '../../utils/s3.utils';

const updateSuperAdminProfile = async (
  userId: string,
  payload: any,
  file?: Express.Multer.File
) => {
  const profile = await SuperAdmin.findOne({ auth: userId });
  if (!profile) {
    throw new AppError(httpStatus.NOT_FOUND, 'Super Admin profile not found!');
  }

  if (file) {
    if (profile.profileImage) {
      const oldKey = getS3KeyFromUrl(profile.profileImage);
      if (oldKey) await deleteFromS3(oldKey).catch(() => null);
    }

    const uploadRes = await uploadToS3({
      buffer: file.buffer,
      key: `super-admin-${userId}-${Date.now()}`,
      contentType: file.mimetype,
      folder: 'profiles/super-admins',
    });
    payload.profileImage = uploadRes.url;
  }

  const updatedProfile = await SuperAdmin.findOneAndUpdate(
    { auth: userId },
    { $set: payload },
    { new: true, runValidators: true }
  );

  return updatedProfile;
};

export const SuperAdminService = {
  updateSuperAdminProfile,
};
