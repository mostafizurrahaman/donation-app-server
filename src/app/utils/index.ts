// import { Logger } from './logger';
import AppError from './AppError';
import asyncHandler from './asyncHandler';
import { deleteFile } from './deleteFile';
import globalErrorHandler from './globalErrorHandler';
import notFoundHandler from './notFound';
import sendContactUsEmail from './sendContactUsEmail';
import sendOtpEmail from './sendOtpEmail';
import sendReceiptEmail from './sendReceiptEmail';

import sendResponse from './sendResponse';
import { generateReceiptPDF } from './pdf.utils';

// S3 utils :`
import {
  uploadToS3,
  verifyS3Connection,
  deleteFromS3,
  getSignedS3Url,
} from './s3.utils';

// JWT configuration
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
  maxAge: 365 * 24 * 60 * 60 * 1000,
};

export {
  AppError,
  asyncHandler,
  globalErrorHandler,
  notFoundHandler,
  options,
  sendResponse,
  deleteFile,

  // Email utils :
  sendOtpEmail,
  sendContactUsEmail,
  sendReceiptEmail,

  // s3 utils :
  uploadToS3,
  verifyS3Connection,
  deleteFromS3,
  getSignedS3Url,

  // PDF Utils:
  generateReceiptPDF,

  // Logger
};
