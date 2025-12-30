import { Types, Model, Document } from 'mongoose';

export interface INotificationSetting {
  user: Types.ObjectId;
  pushNotifications: boolean;
  donations: boolean;
  rewardsAndPerks: boolean;
}

export type INotificationSettingDocument = INotificationSetting & Document;

export type INotificationSettingModel = Model<INotificationSettingDocument>;
