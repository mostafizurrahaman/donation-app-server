// src/app/modules/Causes/causes.validation.ts
import { z } from 'zod';
import {
  causeCategoryTypeValues,
  causeStatusTypeValues,
} from './causes.constant';

// Create cause schema
const createCauseSchema = z.object({
  body: z.object({
    name: z
      .string({
        message: 'Cause name is required!',
      })
      .min(1)
      .max(100),
    description: z.string().max(500).optional(),
    category: z.enum(causeCategoryTypeValues as [string, ...string[]], {
      message: 'Invalid cause category!',
    }),
    organizationId: z
      .string({
        message: 'Organization ID is required!',
      })
      .optional(), // Optional because organization can set their own
  }),
});

// Update cause schema
const updateCauseSchema = z.object({
  body: z
    .object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      category: z
        .enum(causeCategoryTypeValues as [string, ...string[]], {
          message: 'Invalid cause category!',
        })
        .optional(),
    })
    .strict(),
  params: z.object({
    id: z.string({
      message: 'Cause ID is required!',
    }),
  }),
});

// Get cause by ID schema
const getCauseByIdSchema = z.object({
  params: z.object({
    id: z.string({
      message: 'Cause ID is required!',
    }),
  }),
});

// Get causes by organization schema with query params
const getCausesByOrganizationSchema = z.object({
  params: z.object({
    organizationId: z.string({
      message: 'Organization ID is required!',
    }),
  }),
  query: z
    .object({
      searchTerm: z.string().optional(),
      category: z
        .enum(causeCategoryTypeValues as [string, ...string[]])
        .optional(),
      status: z.enum(causeStatusTypeValues as [string, ...string[]]).optional(),
      page: z.coerce.number().int().positive().default(1).optional(),
      limit: z.coerce.number().int().positive().max(100).default(10).optional(),
      sort: z.string().optional(),
      fields: z.string().optional(),
    })
    .optional(),
});

const getRaisedCausesSchema = z.object({
  params: z.object({
    organizationId: z.string({
      message: 'Organization ID is required!',
    }),
  }),
  query: z
    .object({
      startMonth: z
        .string({
          message: 'startMonth is required in YYYY-MM format',
        })
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
          message: 'startMonth must be in YYYY-MM format',
        }),
      endMonth: z
        .string({
          message: 'endMonth is required in YYYY-MM format',
        })
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
          message: 'endMonth must be in YYYY-MM format',
        }),
      page: z.coerce.number().int().positive().default(1).optional(),
      limit: z.coerce.number().int().positive().max(100).default(10).optional(),
      sortBy: z
        .enum(['totalDonationAmount', 'name', 'category'] as const)
        .optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    })
    .strict(),
});

// Get causes query schema with all filters
const getCausesQuerySchema = z.object({
  query: z
    .object({
      searchTerm: z.string().optional(), // For searching by name or description
      category: z
        .enum(causeCategoryTypeValues as [string, ...string[]], {
          message: 'Invalid cause category!',
        })
        .optional(),
      status: z
        .enum(causeStatusTypeValues as [string, ...string[]], {
          message: 'Invalid cause status!',
        })
        .optional(),
      organization: z.string().optional(), // Filter by organization ID
      page: z.coerce.number().int().positive().default(1).optional(),
      limit: z.coerce.number().int().positive().max(100).default(10).optional(),
      sort: z.string().optional(), // e.g., 'name', '-createdAt'
      fields: z.string().optional(), // Select specific fields
    })
    .optional(),
});

// Update cause status schema
const updateCauseStatusSchema = z.object({
  params: z.object({
    id: z.string({
      message: 'Cause ID is required!',
    }),
  }),
  body: z.object({
    status: z.enum(causeStatusTypeValues as [string, ...string[]], {
      message: 'Invalid cause status! Must be pending, suspended, or verified.',
    }),
  }),
});

export const CauseValidation = {
  createCauseSchema,
  updateCauseSchema,
  getCauseByIdSchema,
  getCausesByOrganizationSchema,
  getRaisedCausesSchema,
  getCausesQuerySchema,
  updateCauseStatusSchema,
};
