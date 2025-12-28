import { Response } from 'express';
import { ExtendedRequest } from '../../types';
import { asyncHandler, sendResponse } from '../../utils';
import { SubscriptionService } from './subscriptionHistory.service';
import httpStatus from 'http-status';

const getBillingHistory = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const result = await SubscriptionService.getMyBillingHistory(
      req.user._id.toString(),
      req.query
    );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Billing history retrieved successfully',
      data: result.result,
      meta: result.meta,
    });
  }
);

export const SubscriptionController = {
  getBillingHistory,
};
