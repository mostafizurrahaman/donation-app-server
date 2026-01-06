/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from 'express';
import { Error } from 'mongoose';
import { ZodError } from 'zod';
import {
  handleCastError,
  handleDuplicateError,
  handleMongooseError,
  handleZodError,
} from '../errors';
import { IErrorSource } from '../types';
import AppError from './AppError';

import multer from 'multer';
import handleMulterError from '../errors/handleMulterErrorHandler';

const globalErrorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  let statusCode = 500;
  let message =
    typeof err === 'object' && err !== null && 'message' in err
      ? String(err.message)
      : 'Something went wrong!';
  let errors: IErrorSource[] = [
    {
      path: '',
      message: 'Something went wrong',
    },
  ];

  if (err instanceof ZodError) {
    const modifier = handleZodError(err);
    statusCode = modifier.statusCode;
    message = modifier.message;
    errors = modifier.errors.map((e) => ({
      path:
        typeof e.path === 'string' || typeof e.path === 'number'
          ? e.path
          : String(e.path),
      message: e.message,
    }));
  } else if (err instanceof Error.ValidationError) {
    const modifier = handleMongooseError(err);
    statusCode = modifier.statusCode;
    message = modifier.message;
    errors = modifier.errors;
  } else if (err instanceof Error.CastError) {
    const modifier = handleCastError(err);
    statusCode = modifier.statusCode;
    message = modifier.message;
    errors = modifier.errors;
  } else if (err instanceof multer.MulterError) {
    // Handle Multer Errors
    const modifier = handleMulterError(err);
    statusCode = modifier.statusCode;
    message = modifier.message;
    errors = modifier.errors;
  } else if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as any).code === 11000
  ) {
    const modifier = handleDuplicateError(err as any);
    statusCode = modifier.statusCode;
    message = modifier.message;
    errors = modifier.errors;
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = [
      {
        path: '',
        message: err.message,
      },
    ];
  } else if (err instanceof Error) {
    message = err.message;
    errors = [
      {
        path: '',
        message: err.message,
      },
    ];
  }

  const errorStatus =
    typeof err === 'object' && err !== null && 'status' in err
      ? (err as any).status
      : statusCode;
  const errorStack =
    typeof err === 'object' && err !== null && 'stack' in err
      ? (err as any).stack
      : undefined;

  return res.status(errorStatus).json({
    success: false,
    statusCode: errorStatus,
    message,
    errorMessages: errors,
    ...(process.env.NODE_ENV === 'development' &&
      errorStack && { stack: errorStack }),
  });
};

export default globalErrorHandler;
