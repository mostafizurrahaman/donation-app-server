import { model, Schema } from 'mongoose';
import {
  INotificationSetting,
  INotificationSettingModel,
} from './notificationSetting.interface';

const notificationSettingSchema = new Schema<
  INotificationSetting,
  INotificationSettingModel
>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Auth',
      required: true,
      unique: true,
    },
    pushNotifications: {
      type: Boolean,
      default: true,
    },
    donations: {
      type: Boolean,
      default: true,
    },
    rewardsAndPerks: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true, versionKey: false }
);

export const NotificationSetting = model<
  INotificationSetting,
  INotificationSettingModel
>('NotificationSetting', notificationSettingSchema);
