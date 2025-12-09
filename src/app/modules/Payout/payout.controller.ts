import { Request, Response } from 'express';
import { asyncHandler, sendResponse, AppError } from '../../utils';
import httpStatus from 'http-status';
import { PayoutService } from './payout.service';
import Organization from '../Organization/organization.model';
import { ROLE } from '../Auth/auth.constant';
import { Date } from 'mongoose';

const requestPayout = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const userRole = req.user?.role;
  const { amount, scheduledDate } = req.body;

  let organizationId;

  if (userRole === ROLE.ORGANIZATION) {
    const org = await Organization.findOne({ auth: userId });
    if (!org)
      throw new AppError(httpStatus.NOT_FOUND, 'Organization not found');
    organizationId = org._id.toString();
  } else {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Only organizations can request payouts'
    );
  }

  const result = await PayoutService.requestPayout(
    organizationId,
    userId,
    amount,
    scheduledDate
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: 'Payout requested successfully',
    data: result,
  });
});

const cancelPayout = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { id } = req.params;

  const result = await PayoutService.cancelPayout(id, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Payout cancelled successfully',
    data: result,
  });
});

const getPayouts = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const userRole = req.user?.role;

  let organizationId;

  if (userRole === ROLE.ORGANIZATION) {
    const org = await Organization.findOne({ auth: userId });
    if (!org)
      throw new AppError(httpStatus.NOT_FOUND, 'Organization not found');
    organizationId = org._id.toString();
  } else if (userRole === ROLE.ADMIN && req.query.organizationId) {
    organizationId = req.query.organizationId as string;
  } else {
    throw new AppError(httpStatus.FORBIDDEN, 'Organization ID required');
  }

  const result = await PayoutService.getAllPayouts(organizationId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Payouts retrieved successfully',
    data: result.data,
    meta: result.meta,
  });
});

const getOrganizationNextPayoutDate = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;

    const payoutDate = await PayoutService.getOrganizationNextPayoutDate(
      userId!
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Next scheduled payout date retrieved successfully',
      data: { nextPayoutDate: payoutDate },
    });
  }
);

export const PayoutController = {
  requestPayout,
  cancelPayout,
  getPayouts,
  getOrganizationNextPayoutDate,
};
