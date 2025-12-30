import { INotificationSetting } from './notificationSetting.interface';
import { NotificationSetting } from './notificationSetting.model';

const getNotificationSettings = async (
  userId: string
): Promise<INotificationSetting> => {
  let settings = await NotificationSetting.findOne({ user: userId });

  if (!settings) {
    // If no settings exist, create default settings
    settings = await NotificationSetting.create({
      user: userId,
      pushNotifications: true,
      donations: true,
      rewardsAndPerks: true,
    });
  }

  return settings;
};

const updateNotificationSettings = async (
  userId: string,
  payload: Partial<INotificationSetting>
): Promise<INotificationSetting | null> => {
  const settings = await NotificationSetting.findOneAndUpdate(
    { user: userId },
    payload,
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return settings;
};

export const NotificationSettingService = {
  getNotificationSettings,
  updateNotificationSettings,
};
