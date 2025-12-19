import { Types, Document } from 'mongoose';
import Notification from './notification.model';
import QueryBuilder from '../../builders/QueryBuilder';
import { IAuth } from '../Auth/auth.interface';
import { sendPushNotification } from '../../utils/fcm.utils';

interface INotification extends Document {
  _id: Types.ObjectId;
  title: string;
  message: string;
  receiver: Types.ObjectId;
  sender?: Types.ObjectId;
  type: string;
  relatedId?: Types.ObjectId;
  isSeen: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const getAllNotifications = async (
  user: IAuth,
  query: Record<string, unknown>
) => {
  const baseQuery = Notification.find({ receiver: user.id });

  const builder = new QueryBuilder(baseQuery, query);

  builder.search(['title', 'message']).filter().sort().paginate().fields();

  const data = await builder.modelQuery.exec();

  const meta = await builder.countTotal();

  return {
    meta: {
      page: meta.page,
      limit: meta.limit,
      total: meta.total,
      totalPages: meta.totalPage,
    },
    data,
  };
};

const markNotificationAsSeen = async (notificationId: string) => {
  const updated = await Notification.findByIdAndUpdate(
    notificationId,
    { isSeen: true },
    { new: true }
  );
  return updated;
};

const getAllUnseenNotificationCount = async (userId: string) => {
  const result = await Notification.aggregate([
    {
      $match: {
        receiver: new Types.ObjectId(userId),
        isSeen: false,
      },
    },
    {
      $count: 'unseenCount',
    },
  ]);

  return result[0]?.unseenCount || 0;
};

const createNotification = async (
  receiverId: string,
  type: string,
  message: string,
  relatedId?: string,
  data?: Record<string, unknown>,
  session?: any
) => {
  const title = type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // 1. Save In-App Notification (as you already do)
  const notification = await Notification.create(
    [
      {
        receiver: receiverId,
        type,
        message,
        title,
        redirectId: relatedId,
      },
    ],
    { session }
  );

  // 2. Trigger Push (Fire and forget)
 await sendPushNotification(receiverId, title, message, {
    ...data,
    type,
    redirectId: relatedId || '',
  });

  return notification[0];
};

export const notificationService = {
  getAllNotifications,
  markNotificationAsSeen,
  getAllUnseenNotificationCount,
  createNotification,
};

// Export createNotification for direct import
export { createNotification };
