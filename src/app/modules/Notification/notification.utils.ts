import httpStatus from 'http-status';
import nodemailer from 'nodemailer';
import config from '../../config';
import { AppError } from '../../utils';
import getUserNotificationCount from '../../utils/getUnseenNotificationCount';
import { TNotification } from './notification.constant';
import {
  NotificationPayloads,
  // notificationTemplates,
} from './notification.template';
import { INotificationPayload } from './notification.interface';
import Notification from './notification.model';


export const sendNotificationBySocket = async (
  notificationData: INotificationPayload
) => {
  // TODO: Implement socket.io integration
  // const io = getSocketIO();
  await Notification.create(notificationData);

  const updatedNotification = await getUserNotificationCount(
    notificationData.receiver.toString()
  );

  // io.to(notificationData.receiver.toString()).emit(
  //   'notification',
  //   updatedNotification
  // );
  return updatedNotification;
};

export const sendPushNotification = async (
  fcmToken: string,
  data: {
    title: string;
    content: string;
    time: string;
  }
) => {
  try {
    // TODO: Implement Firebase Admin integration
    // const message = {
    //   notification: {
    //     title: data.title,
    //     body: data.content,
    //   },
    //   token: fcmToken,
    //   data: {
    //     time: data.time,
    //   },
    // };

    // const response = await firebaseAdmin.messaging().send(message);
    // return response;
    throw new AppError(
      httpStatus.NOT_IMPLEMENTED,
      'Push notifications not yet implemented'
    );
  } catch (error: unknown) {
    throw new AppError(
      httpStatus.NO_CONTENT,
      error instanceof Error ? error.message : String(error)
    );
  }
};
