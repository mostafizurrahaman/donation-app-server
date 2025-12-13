import httpStatus from 'http-status';
import { Request, Response } from 'express';
import { StripeService } from './stripe.service';
import { asyncHandler, sendResponse, AppError } from '../../utils';



// 3. Create refund for payment
const createRefund = asyncHandler(async (req: Request, res: Response) => {
  // Get user from request
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }

  // Get payment intent ID and optional amount
  const { paymentIntentId, amount } = req.body;

  if (!paymentIntentId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment intent ID is required');
  }

  // Call Stripe service layer
  const refund = await StripeService.createRefund(paymentIntentId, amount);

  // Send standardized response
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Refund created successfully',
    data: refund,
  });
});

export const StripeController = {

  createRefund,
};
