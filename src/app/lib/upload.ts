// src/app/lib/upload.ts
import multer from 'multer';
import { AppError } from '../utils';
import httpStatus from 'http-status';

/**
 * Memory storage keeps the file in a buffer (req.file.buffer).
 * This is required for uploading directly to AWS S3.
 */
const storage = multer.memoryStorage();

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  const allowedImageTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ];
  const allowedVideoTypes = [
    'video/mp4',
    'video/avi',
    'video/mov',
    'video/wmv',
  ];
  const allowedDocTypes = ['application/pdf'];
  const allowedExcelTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
  ];

  const allAllowedTypes = [
    ...allowedImageTypes,
    ...allowedVideoTypes,
    ...allowedDocTypes,
    ...allowedExcelTypes,
  ];

  if (allAllowedTypes.includes(file.mimetype)) {
    callback(null, true);
  } else {
    callback(
      new AppError(
        httpStatus.BAD_REQUEST,
        'Only images, videos, PDFs, and Excel/CSV files are allowed'
      )
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
    files: 10,
  },
});

const uploadForParsing = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, callback) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(
        new AppError(
          httpStatus.BAD_REQUEST,
          'Only CSV and Excel files are allowed'
        )
      );
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 10,
  },
});

export { upload, uploadForParsing };
export default upload;
