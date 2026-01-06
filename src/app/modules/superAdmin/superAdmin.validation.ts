import { z } from 'zod';

const updateSuperAdminProfileSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    address: z.string().optional(),
    country: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
  }),
});

export const SuperAdminValidation = {
  updateSuperAdminProfileSchema,
};
