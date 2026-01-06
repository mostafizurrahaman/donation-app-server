import z from 'zod';
import {
  ORGANIZATION_STATUS,
  organizationServiceTypeValues,
} from './organization.constants';

// Tab 1: Organization Details (without images)
const editProfileOrgDetailsSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    dateOfEstablishment: z
      .string()
      .or(z.date())
      .transform((val) => (typeof val === 'string' ? new Date(val) : val))
      .optional(),
    address: z.string().optional(),
    website: z.string().url('Invalid website URL!').optional(),
    phoneNumber: z.string().optional(),
    country: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    isProfileVisible: z.boolean().optional(),
    aboutUs: z.string().optional(),
  }),
});

// Tab 2: Tax Details
const editOrgTaxDetailsSchema = z.object({
  body: z.object({
    registeredCharityName: z.string().optional(),
    tfnOrAbnNumber: z.string().optional(),
    zakatLicenseHolderNumber: z.string().nullable().optional(),
  }),
});

/**
 * Query validation for getting all organizations
 */
const getAllOrganizationsSchema = z.object({
  query: z
    .object({
      // Search term
      searchTerm: z.string().trim().optional(),

      // Status filter (from Auth model)
      status: z
        .enum(organizationServiceTypeValues as [string, ...string[]], {
          message: `Status must be one of: ${organizationServiceTypeValues.join(
            ', '
          )}`,
        })

        .optional(),

      // Location filters
      country: z.string().trim().optional(),
      state: z.string().trim().optional(),
      postalCode: z.string().trim().optional(),
      address: z.string().trim().optional(),

      // Organization type filters
      serviceType: z.enum(organizationServiceTypeValues).optional(),

      // Visibility filter
      isProfileVisible: z
        .string()
        .transform((val) => val === 'true')
        .or(z.boolean())
        .optional(),
      populateCauses: z
        .string()
        .transform((val) => val === 'true')
        .optional(),

      // Date range filters for establishment date
      dateFrom: z
        .string()
        .refine((date) => !isNaN(Date.parse(date)), {
          message: 'Invalid date format for dateFrom',
        })
        .optional(),
      dateTo: z
        .string()
        .refine((date) => !isNaN(Date.parse(date)), {
          message: 'Invalid date format for dateTo',
        })
        .optional(),

      // Pagination
      page: z
        .string()
        .regex(/^\d+$/, 'Page must be a number')
        .transform((val) => parseInt(val, 10))
        .refine((val) => val > 0, 'Page must be greater than 0')
        .optional()
        .default(1),

      limit: z
        .string()
        .regex(/^\d+$/, 'Limit must be a number')
        .transform((val) => parseInt(val, 10))
        .refine(
          (val) => val > 0 && val <= 100,
          'Limit must be between 1 and 100'
        )
        .optional()
        .default(10),

      // Sorting
      sort: z
        .string()
        .regex(
          /^-?[a-zA-Z]+(,-?[a-zA-Z]+)*$/,
          'Invalid sort format. Use field names with optional - prefix for descending order'
        )
        .optional(),

      // Field selection
      fields: z
        .string()
        .regex(
          /^[a-zA-Z]+(,[a-zA-Z]+)*$/,
          'Invalid fields format. Use comma-separated field names'
        )
        .optional(),
    })
    .refine(
      (data) => {
        // Validate date ranges
        if (data.dateFrom && data.dateTo) {
          return new Date(data.dateFrom) <= new Date(data.dateTo);
        }
        return true;
      },
      {
        message: 'dateFrom must be before or equal to dateTo',
        path: ['dateFrom'],
      }
    ),
});

export const OrganizationValidation = {
  editProfileOrgDetailsSchema,
  editOrgTaxDetailsSchema,
  getAllOrganizationsSchema,
};

// Type inference for the query parameters
export type TGetAllOrganizationsQuery = z.infer<
  typeof getAllOrganizationsSchema.shape.query
>;

export type TEditProfileOrgDetails = z.infer<
  typeof editProfileOrgDetailsSchema.shape.body
>;
export type TEditOrgTaxDetails = z.infer<
  typeof editOrgTaxDetailsSchema.shape.body
>;
