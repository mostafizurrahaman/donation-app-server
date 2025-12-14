import z from 'zod';
import { authStatusValues } from '../Auth/auth.constant';

const getDonorsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    searchTerm: z.string().optional(),
    toDate: z.string().optional(),
    fromDate: z.string().optional(),
    status: z
      .enum(authStatusValues, {
        message: `Status should be one of 'pending', 'verified'  or 'suspended'`,
      })
      .optional(),
  }),
});

export const AdminValidation = {
  getDonorsSchema,
};
