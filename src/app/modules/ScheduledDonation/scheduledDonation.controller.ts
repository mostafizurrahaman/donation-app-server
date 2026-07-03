import httpStatus from 'http-status';
import { Response } from 'express';
import { asyncHandler, sendResponse, AppError } from '../../utils';
import { ExtendedRequest } from '../../types';
import { ScheduledDonationService } from './scheduledDonation.service';

// 1. Create scheduled donation
const createScheduledDonation = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id.toString();
    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const body = req.body;

    const result = await ScheduledDonationService.createScheduledDonation(
      userId,
      body
    );

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      message: 'Recurring donation scheduled successfully',
      data: result,
    });
  }
);

// 2. Get user's scheduled donations
const getUserScheduledDonations = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id.toString();
    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const query = req.query as Record<string, unknown>;

    const result = await ScheduledDonationService.getUserScheduledDonations(
      userId,
      query
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Scheduled donations retrieved successfully',
      data: result.scheduledDonations,
      meta: result.meta,
    });
  }
);

// 3. Get scheduled donation by ID
const getScheduledDonationById = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id.toString();
    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const { id } = req.params;

    const result = await ScheduledDonationService.getScheduledDonationById(
      userId,
      id as string
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Scheduled donation retrieved successfully',
      data: result,
    });
  }
);

// 4. Update scheduled donation
const updateScheduledDonation = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id.toString();
    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const { id } = req.params;
    const body = req.body;

    const result = await ScheduledDonationService.updateScheduledDonation(
      userId,
      id as string,
      body
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Scheduled donation updated successfully',
      data: result,
    });
  }
);

// 5. Pause scheduled donation
const pauseScheduledDonation = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id.toString();
    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const { id } = req.params;

    const result = await ScheduledDonationService.pauseScheduledDonation(
      userId,
      id as string
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Scheduled donation paused successfully',
      data: result,
    });
  }
);

// 6. Resume scheduled donation
const resumeScheduledDonation = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id.toString();
    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const { id } = req.params;

    const result = await ScheduledDonationService.resumeScheduledDonation(
      userId,
      id as string
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Scheduled donation resumed successfully',
      data: result,
    });
  }
);

// 7. Cancel (delete) scheduled donation
const cancelScheduledDonation = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id.toString();
    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const { id } = req.params;

    await ScheduledDonationService.cancelScheduledDonation(userId, id as string);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Scheduled donation cancelled successfully',
      data: null,
    });
  }
);

export const ScheduledDonationController = {
  createScheduledDonation,
  getUserScheduledDonations,
  getScheduledDonationById,
  updateScheduledDonation,
  pauseScheduledDonation,
  resumeScheduledDonation,
  cancelScheduledDonation,
};
