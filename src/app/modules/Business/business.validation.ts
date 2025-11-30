import { z } from 'zod';

// Update Business Profile Validation Schema
const updateBusinessProfileSchema = z.object({
  body: z.object({
    // Basic Business Information
    name: z
      .string({
        message: 'Business name must be a string.',
      })
      .trim()
      .min(2, { message: 'Business name must be at least 2 characters long.' })
      .max(100, { message: 'Business name cannot exceed 100 characters.' })
      .optional(),

    category: z
      .string({
        message: 'Category must be a string.',
      })
      .trim()
      .optional(),

    tagLine: z
      .string({
        message: 'Tagline must be a string.',
      })
      .trim()
      .min(1, { message: 'Tagline must be at least 5 characters long.' })
      .max(150, { message: 'Tagline cannot exceed 150 characters.' })
      .optional(),

    description: z
      .string({
        message: 'Description must be a string.',
      })
      .trim()
      .max(500, { message: 'Description cannot exceed 2000 characters.' })
      .optional(),

    // Contact & Online Presence
    businessPhoneNumber: z
      .string({
        message: 'Business phone number must be a string.',
      })
      .trim()
      .min(7, { message: 'Please enter a valid phone number.' })
      .max(20, { message: 'Phone number cannot exceed 20 characters.' })
      .optional(),

    businessEmail: z
      .string({
        message: 'Business email must be a string.',
      })
      .email({ message: 'Please provide a valid business email address.' })
      .optional(),

    businessWebsite: z
      .string({
        message: 'Business website must be a string.',
      })
      .url({
        message: 'Please provide a valid website URL.',
      })
      .optional(),

    // Location(s)
    locations: z
      .array(z.string().trim().min(1, 'Location cannot be an empty string.'))
      .min(
        1,
        'If provided, the locations array must contain at least one location.'
      )
      .optional(),
  }),
});

export const BusinessValidation = {
  updateBusinessProfileSchema,
};
