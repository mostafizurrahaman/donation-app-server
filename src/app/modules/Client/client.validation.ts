import z from 'zod';

const getUserRecurringDonationsForSpecificOrganizationSchema = z.object({
  query: z.object({
    organizationId: z.string({
      error: 'OrganizationId is required!',
    }),
  }),
});

export const clientValidationSchema = {
  getUserRecurringDonationsForSpecificOrganizationSchema,
};
