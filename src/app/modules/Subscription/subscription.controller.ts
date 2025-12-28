import { Response } from 'express';
import httpStatus from 'http-status';
import { asyncHandler, sendResponse } from '../../utils';
import { ExtendedRequest } from '../../types';
import { SubscriptionService } from './subscription.service';

const createSession = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const result = await SubscriptionService.createSubscriptionSession(
      req.user._id.toString(),
      req.body.planType
    );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Subscription session created',
      data: result,
    });
  }
);

const getMySubscription = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const result = await SubscriptionService.getMySubscription(
      req.user._id.toString()
    );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Subscription data retrieved',
      data: result,
    });
  }
);
const getAdminSubscriptionAndPaymentsStats = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const result =
      await SubscriptionService.getAdminSubscriptionAndPaymentsStats();
    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Subscription analytics retrieved successfully!',
      data: result,
    });
  }
);
const getAdminSubscriptionAndPayments = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const result = await SubscriptionService.getAdminSubscriptionAndPayments(
      req.query
    );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Subscriptions retrieved successfully!',
      data: result.data,
      meta: result.meta,
    });
  }
);
const getSubscriptionOverviewController = asyncHandler(async (req, res) => {
  const data = await SubscriptionService.getSubscriptionOverview();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Subscription overview retrieved successfully',
    data,
  });
});

const cancelSubscription = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const result = await SubscriptionService.cancelSubscription(
      req.user._id.toString()
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Subscription canceled successfully',
      data: result,
    });
  }
);

export const SubscriptionController = {
  createSession,
  getMySubscription,
  getAdminSubscriptionAndPaymentsStats,
  getAdminSubscriptionAndPayments,
  getSubscriptionOverviewController,
  cancelSubscription,
};
