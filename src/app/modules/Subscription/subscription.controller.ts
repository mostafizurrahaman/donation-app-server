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

export const SubscriptionController = {
  createSession,
  getMySubscription,
};
