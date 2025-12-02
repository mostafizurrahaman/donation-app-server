import { Request, Response } from 'express';
import { asyncHandler, sendResponse, AppError } from '../../utils';
import httpStatus from 'http-status';
import { BalanceService } from './balance.service';
import Organization from '../Organization/organization.model';
import { ROLE } from '../Auth/auth.constant';

const getMyBalance = asyncHandler(async (req: Request, res: Response) => {
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

  const result = await BalanceService.getBalanceSummary(organizationId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Balance summary retrieved successfully',
    data: result,
  });
});

const getMyTransactions = asyncHandler(async (req: Request, res: Response) => {
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

  const result = await BalanceService.getTransactionHistory(
    organizationId,
    req.query
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Transaction history retrieved successfully',
    data: result.transactions,
    meta: result.meta,
  });
});

export const BalanceController = {
  getMyBalance,
  getMyTransactions,
};
