import { z } from 'zod';

const updateNotificationSettingValidation = z.object({
  body: z.object({
    pushNotifications: z.boolean().optional(),
    donations: z.boolean().optional(),
    rewardsAndPerks: z.boolean().optional(),
  }),
});

export const NotificationSettingValidations = {
  updateNotificationSettingValidation,
};
