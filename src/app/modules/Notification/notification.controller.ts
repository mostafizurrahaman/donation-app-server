import httpStatus from 'http-status';
import { Request, Response } from 'express';
import { asyncHandler } from '../../utils';
import { sendResponse } from '../../utils';
import { notificationService } from './notification.service';

const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const data = await notificationService.getAllNotifications(
    req.user,
    req.query
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Notification seen successfully',
    data: data,
  });
});

const markAsSeen = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = await notificationService.markNotificationAsSeen(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Notification seen successfully',
    data: data,
  });
});

const getUnseenNotificationCount = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id?.toString();
    const count = await notificationService.getAllUnseenNotificationCount(
      userId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Unseen notification count fetched successfully',
      data: count,
    });
  }
);

export const notificationController = {
  getNotifications,
  markAsSeen,
  getUnseenNotificationCount,
};
