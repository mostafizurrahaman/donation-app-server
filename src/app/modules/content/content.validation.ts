import { z } from 'zod';

const updateContentValidationSchema = z.object({
  body: z.object({
    terms: z.string().optional(),
    privacyPolicy: z.string().optional(),
    aboutUs: z.string().optional(),
  }),
});

export const contentValidation = {
  updateContentValidationSchema,
};
