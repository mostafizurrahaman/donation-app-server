import { Request, Response } from 'express';
import { AppError, asyncHandler, sendResponse } from '../../utils';
import httpStatus from 'http-status';
import { clientService } from './client.service';

const getRoundupStats = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user._id?.toString();

  if (!userId) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const result = await clientService.getRoundupStats(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Roundup stats fetched successfully!',
    data: result,
  });
});

const getOnetimeDonationStats = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user._id?.toString();

    if (!userId) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
    }

    const result = await clientService.getOnetimeDonationStats(userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'One time donation stats fetched successfully!',
      data: result,
    });
  }
);

const getRecurringDonationStats = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user._id?.toString();

    if (!userId) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
    }

    const result = await clientService.getRecurringDonationStats(userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Recurring donation stats fetched successfully!',
      data: result,
    });
  }
);

export const clientController = {
  getRoundupStats,
  getOnetimeDonationStats,
  getRecurringDonationStats,
};
