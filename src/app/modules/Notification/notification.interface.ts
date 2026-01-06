import { Types } from 'mongoose';
import { TNotification } from './notification.constant';

export interface INotification {
  title: string;
  message: string;
  isSeen: boolean;
  receiver: Types.ObjectId;
  type: TNotification;
  redirectId?: string;
  meta: {};

  createdAt: string;
  updatedAt: string;
}

export interface INotificationPayload {
  title: string;
  message: string;
  receiver: string;
  type: TNotification;
  redirectId?: string;
}
