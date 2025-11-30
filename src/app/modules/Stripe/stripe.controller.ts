import httpStatus from 'http-status';
import { Request, Response } from 'express';
import { StripeService } from './stripe.service';
import { asyncHandler, sendResponse, AppError } from '../../utils';
import { calculateTax } from '../Donation/donation.constant'; // Add import for calculateTax

// 1. Create checkout session for one-time donation
const createCheckoutSession = asyncHandler(
  async (req: Request, res: Response) => {
    // Get user from request
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    // Extract validated body (validated by middleware)
    const { amount, causeId, organizationId, specialMessage, isTaxable = true } = req.body; // Default to taxable for one-time donations

    // Calculate tax for one-time donation
    const { taxAmount, totalAmount } = calculateTax(amount, isTaxable);

    // Fetch organization to get Stripe Connect account
    const Organization = (await import('../Organization/organization.model'))
      .default;
    const organization = await Organization.findById(organizationId);

    if (!organization) {
      throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
    }

    const connectedAccountId = organization.stripeConnectAccountId;
    if (!connectedAccountId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'This organization has not set up payment receiving. Please contact the organization to complete their Stripe Connect onboarding.'
      );
    }

    // Prepare data for service with fetched connectedAccountId and tax info
    const checkoutData = {
      amount,
      isTaxable,
      taxAmount,
      totalAmount,
      causeId,
      organizationId,
      connectedAccountId,
      specialMessage,
      userId,
    };

    // Call Stripe service layer
    const session = await StripeService.createCheckoutSession(checkoutData);

    // Send standardized response
    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Checkout session created successfully',
      data: session,
    });
  }
);

// 2. Retrieve checkout session details
const retrieveCheckoutSession = asyncHandler(
  async (req: Request, res: Response) => {
    // Get user from request
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    // Get session ID from request
    const { sessionId } = req.params;
    if (!sessionId) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Session ID is required');
    }

    // Call Stripe service layer
    const session = await StripeService.retrieveCheckoutSession(sessionId);

    // Send standardized response
    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Checkout session retrieved successfully',
      data: session,
    });
  }
);

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
  createCheckoutSession,
  retrieveCheckoutSession,
  createRefund,
};
