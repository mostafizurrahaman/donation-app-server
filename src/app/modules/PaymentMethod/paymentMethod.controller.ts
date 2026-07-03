import { Response } from 'express';
import { asyncHandler, sendResponse } from '../../utils';
import httpStatus from 'http-status';
import { PaymentMethodService } from './paymentMethod.service';
import { ExtendedRequest } from '../../types';

// 1. Create setup intent for adding card payment method
const createSetupIntent = asyncHandler(async (req: ExtendedRequest, res: Response) => {
  const userId = req.user?._id.toString();
  const userEmail = req.user?.email;

  const result = await PaymentMethodService.createSetupIntent(
    userId,
    userEmail
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Setup intent created successfully for card payment!',
    data: result,
  });
});

// 2. Add payment method
const addPaymentMethod = asyncHandler(async (req: ExtendedRequest, res: Response) => {
  const userId = req.user?._id.toString();
  const payload = req.body;

  const result = await PaymentMethodService.addPaymentMethod(userId, payload);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: 'Payment method added successfully!',
    data: result,
  });
});

// 3. Get user's payment methods
const getUserPaymentMethods = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id.toString();
    const { includeInactive } = req.query;

    const result = await PaymentMethodService.getUserPaymentMethods(
      userId,
      includeInactive === 'true'
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Payment methods retrieved successfully!',
      data: result,
    });
  }
);

// 4. Get payment method by ID
const getPaymentMethodById = asyncHandler(async (req: ExtendedRequest, res: Response) => {
  const userId = req.user?._id.toString();
  const { id } = req.params;

  const result = await PaymentMethodService.getPaymentMethodById(id as string , userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Payment method retrieved successfully!',
    data: result,
  });
});

// 5. Set default payment method
const setDefaultPaymentMethod = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id.toString();
    const { id } = req.params;

    const result = await PaymentMethodService.setDefaultPaymentMethod(
      id as string,
      userId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Default payment method updated successfully!',
      data: result,
    });
  }
);

// 6. Delete payment method
const deletePaymentMethod = asyncHandler(async (req: ExtendedRequest, res: Response) => {
  const userId = req.user?._id.toString();
  const { id } = req.params;

  await PaymentMethodService.deletePaymentMethod(id as string, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Payment method deleted successfully!',
    data: null,
  });
});

// 7. Get default payment method
const getDefaultPaymentMethod = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id.toString();

    const result = await PaymentMethodService.getDefaultPaymentMethod(userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: result
        ? 'Default payment method retrieved successfully!'
        : 'No default payment method found!',
      data: result,
    });
  }
);

export const PaymentMethodController = {
  createSetupIntent,
  addPaymentMethod,
  getUserPaymentMethods,
  getPaymentMethodById,
  setDefaultPaymentMethod,
  deletePaymentMethod,
  getDefaultPaymentMethod,
};
