import z from 'zod';
import { auth } from '../../middlewares';

const getUserRecurringDonationsForSpecificOrganizationSchema = z.object({
  query: z.object({
    organizationId: z.string({
      error: 'OrganizationId is required!',
    }),
  }),
});

const getHistorySchema = z.object({
  query: z.object({
    page: z.coerce.number().min(1).optional(),
    limit: z.coerce.number().min(1).max(100).optional(),
  }),
});

const updateClientProfileSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    address: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    phoneNumber: z.string().optional(),
  }),
});

export const clientValidationSchema = {
  getUserRecurringDonationsForSpecificOrganizationSchema,
  getHistorySchema,
  updateClientProfileSchema,
};
