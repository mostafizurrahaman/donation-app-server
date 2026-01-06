// src/app/errors/handleMulterError.ts
import multer from 'multer';

const handleMulterError = (err: multer.MulterError) => {
  let message = err.message;

  // Provide more user-friendly messages for common upload issues
  if (err.code === 'LIMIT_FILE_SIZE') {
    message = 'File size is too large. Maximum limit is 15MB';
  } else if (err.code === 'LIMIT_FILE_COUNT') {
    message = 'Too many files uploaded';
  } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    message = `Unexpected field: ${err.field}. Please check the field name.`;
  }

  return {
    statusCode: 400,
    message: message,
    errors: [
      {
        path: err.field || '',
        message: message,
      },
    ],
  };
};

export default handleMulterError;
