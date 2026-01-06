import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import sendResponse from '../../utils/sendResponse';
import httpStatus from 'http-status';
import { NotificationSettingService } from './notificationSetting.service';

const getNotificationSettings = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await NotificationSettingService.getNotificationSettings(
      req?.user._id?.toString()
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Notification settings retrieved successfully',
      data: result,
    });
  }
);

const updateNotificationSettings = asyncHandler(
  async (req: Request, res: Response) => {
    console.log(req.user);

    const result = await NotificationSettingService.updateNotificationSettings(
      req?.user._id?.toString(),
      req.body
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Notification settings updated successfully',
      data: result,
    });
  }
);

export const NotificationSettingController = {
  getNotificationSettings,
  updateNotificationSettings,
};
