import { Types, Document } from 'mongoose';
import Notification from './notification.model';
import QueryBuilder from '../../builders/QueryBuilder';
import { IAuth } from '../Auth/auth.interface';
import { sendPushNotification } from '../../utils/fcm.utils';
import { NotificationSetting } from '../NotificationSetting/notificationSetting.model';
import { NOTIFICATION_TYPE } from './notification.constant';

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
        meta: {
          ...data,
        },
      },
    ],
    { session }
  );

  // 2. Check Notification Settings before sending Push
  const settings = await NotificationSetting.findOne({ user: receiverId });

  // Default to true if no settings found (opt-in by default as per model)
  const isPushEnabled = settings ? settings.pushNotifications : true;
  const isDonationEnabled = settings ? settings.donations : true;
  const isRewardsEnabled = settings ? settings.rewardsAndPerks : true;

  let shouldSendPush = isPushEnabled;

  if (shouldSendPush) {
    switch (type) {
      case NOTIFICATION_TYPE.DONATION_SUCCESS:
      case NOTIFICATION_TYPE.DONATION_FAILED:
      case NOTIFICATION_TYPE.DONATION_CANCELLED:
      case NOTIFICATION_TYPE.DONATION_REFUNDED:
      case NOTIFICATION_TYPE.NEW_DONATION:
      case NOTIFICATION_TYPE.RECURRING_PLAN_STARTED:
      case NOTIFICATION_TYPE.RECURRING_STATUS_CHANGED:
      case NOTIFICATION_TYPE.THRESHOLD_REACHED:
        shouldSendPush = isDonationEnabled;
        break;

      case NOTIFICATION_TYPE.REWARD_CLAIMED:
      case NOTIFICATION_TYPE.CLAIM_EXPIRING:
      case NOTIFICATION_TYPE.REWARD_REDEEMED:
      case NOTIFICATION_TYPE.NEW_REWARD:
      case NOTIFICATION_TYPE.REWARD_SOLD_OUT:
      case NOTIFICATION_TYPE.BADGE_UNLOCKED:
        shouldSendPush = isRewardsEnabled;
        break;

      default:
        // For other types (system, security, etc.), respect the global push switch
        break;
    }
  }

  if (shouldSendPush) {
    await sendPushNotification(receiverId, title, message, {
      ...data,
      type,
      redirectId: relatedId || '',
    });
  }

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
