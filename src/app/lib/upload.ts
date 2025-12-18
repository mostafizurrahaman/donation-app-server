// src/app/lib/upload.ts
import multer from 'multer';
import path from 'path';
import { AppError } from '../utils';
import httpStatus from 'http-status';
import fs from 'fs';

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    let folderPath = './public';

    if (file.mimetype.startsWith('image')) {
      folderPath = './public/images';
    } else if (file.mimetype.startsWith('video')) {
      folderPath = './public/videos';
    } else if (file.mimetype === 'application/pdf') {
      folderPath = './public/documents';
    } else if (
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'text/csv'
    ) {
      folderPath = './public/spreadsheets';
    } else {
      callback(
        new AppError(
          httpStatus.BAD_REQUEST,
          'Only images, videos, PDFs, and Excel/CSV files are allowed'
        ),
        './public'
      );
      return;
    }

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    callback(null, folderPath);
  },

  filename(_req, file, callback) {
    const fileExt = path.extname(file.originalname);
    const fileName = `${file.originalname
      .replace(fileExt, '')
      .toLocaleLowerCase()
      .split(' ')
      .join('-')}-${Date.now()}`;

    callback(null, fileName + fileExt);
  },
});

const fileFilter = (
  req: Express.Request,
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
    fileSize: 10 * 1024 * 1024,
    files: 10,
  },
});

// Memory storage for CSV/Excel parsing
const uploadForParsing = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, callback) => {
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
    fileSize: 5 * 1024 * 1024,
    files: 10, // Allow multiple code files
  },
});

/**
 * Get the public URL path for an uploaded file
 */
const getFileUrl = (file: Express.Multer.File): string => {
  return `${file.path.replace(/\\/g, '/')}`;
};

/**
 * Clean up uploaded file from disk
 */
const deleteFile = (filePath: string): void => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Error deleting file:', error);
  }
};

export { upload, uploadForParsing, getFileUrl, deleteFile };
export default upload;
