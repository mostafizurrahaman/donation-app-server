import { z } from 'zod';
import { roleValues, ROLE } from './auth.constant';

// Email regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// URL regex
const urlRegex = /^(https?:\/\/)?([\w\-]+\.)+[a-zA-Z]{2,}(\/.*)?$/;

// Reusable validators
export const zodEnumFromObject = <T extends Record<string, string>>(obj: T) =>
  z.enum([...Object.values(obj)] as [string, ...string[]]);

// 1. createAuthSchema
const createAuthSchema = z.object({
  body: z.object({
    email: z
      .email({ message: 'Invalid email format!' }) // Ensure it's a valid email
      .transform((email) => email.toLowerCase()) // Convert email to lowercase
      .refine((email) => email !== '', { message: 'Email is required!' }) // Check that email is not empty
      .refine((value) => typeof value === 'string', {
        message: 'Email must be string!', // Check that email is string
      }),

    password: z
      .string({
        error: 'Password is required!',
      })
      .min(8, { message: 'Password must be at least 8 characters long!' })
      .max(20, { message: 'Password cannot exceed 20 characters!' })
      .regex(/[A-Z]/, {
        message: 'Password must contain at least one uppercase letter!',
      })
      .regex(/[a-z]/, {
        message: 'Password must contain at least one lowercase letter!',
      })
      .regex(/[0-9]/, { message: 'Password must contain at least one number!' })
      .regex(/[@$!%*?&#]/, {
        message: 'Password must contain at least one special character!',
      }),
  }),
});

// 2. sendSignupOtpAgainSchema
const sendSignupOtpAgainSchema = z.object({
  body: z.object({
    email: z
      .email({ message: 'Invalid email format!' }) // Ensure it's a valid email
      .transform((email) => email.toLowerCase()) // Convert email to lowercase
      .refine((email) => email !== '', { message: 'Email is required!' }) // Check that email is not empty
      .refine((value) => typeof value === 'string', {
        message: 'Email must be string!', // Check that email is string
      }),
  }),
});

// 3. verifySignupOtpSchema
const verifySignupOtpSchema = z.object({
  body: z.object({
    email: z
      .string()
      .email({ message: 'Invalid email format!' }) // Ensure it's a valid email
      .refine((email) => email !== '', { message: 'Email is required!' }) // Check that email is not empty
      .refine((value) => typeof value === 'string', {
        message: 'Email must be string!', // Check that email is string
      })
      .transform((email) => email.toLowerCase()), // Convert email to lowercase

    otp: z
      .string({
        error: 'OTP is required!',
      })
      .min(6, { message: 'OTP must be at least 6 characters long!' })
      .max(6, { message: 'OTP cannot exceed 6 characters!' }),
  }),
});

// 4. signinSchema
const signinSchema = z.object({
  body: z.object({
    email: z
      .email({ message: 'Invalid email format!' }) // Ensure it's a valid email
      .transform((email) => email.toLowerCase()) // Convert email to lowercase
      .refine((email) => email !== '', { message: 'Email is required!' }) // Check that email is not empty
      .refine((value) => typeof value === 'string', {
        message: 'Email must be string!', // Check that email is string
      }),

    password: z
      .string({
        error: 'Password is required!',
      })
      .min(8, { message: 'Password must be at least 8 characters long!' })
      .max(20, { message: 'Password cannot exceed 20 characters!' })
      .regex(/[A-Z]/, {
        message: 'Password must contain at least one uppercase letter!',
      })
      .regex(/[a-z]/, {
        message: 'Password must contain at least one lowercase letter!',
      })
      .regex(/[0-9]/, { message: 'Password must contain at least one number!' })
      .regex(/[@$!%*?&#]/, {
        message: 'Password must contain at least one special character!',
      }),
  }),
});

// 5. createProfileSchema
const createProfileSchema = z.object({
  body: z
    .object({
      role: z
        .enum(roleValues, {
          error: 'Role is required!',
        })
        .refine((val) => roleValues.includes(val), {
          message: `Role must be one of: ${roleValues.join(', ')}!`,
        }),
      name: z.string().optional(),

      // For CLIENT
      address: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),

      // For BUSINESS
      category: z.string().optional(),
      tagLine: z.string().optional(),
      description: z.string().optional(),
      businessPhoneNumber: z.string().optional(),
      businessEmail: z.string().email('Invalid email address!').optional(),
      businessWebsite: z.string().url('Invalid website URL!').optional(),
      locations: z.array(z.string()).optional(),

      // For ORGANIZATION
      serviceType: z.string().optional(),
      website: z.string().url('Invalid website URL!').optional(),
      phoneNumber: z.string().optional(),
      boardMemberName: z.string().optional(),
      boardMemberEmail: z.string().email('Invalid email address!').optional(),
      boardMemberPhoneNumber: z.string().optional(),
      tfnOrAbnNumber: z.string().optional(),
      zakatLicenseHolderNumber: z.string().nullable().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.role === ROLE.CLIENT) {
        if (!data.name) {
          ctx.addIssue({
            path: ['name'],
            code: z.ZodIssueCode.custom,
            message: 'Name is required!',
          });
        }

        if (!data.address) {
          ctx.addIssue({
            path: ['address'],
            code: z.ZodIssueCode.custom,
            message: 'Address is required!',
          });
        }

        if (!data.state) {
          ctx.addIssue({
            path: ['state'],
            code: z.ZodIssueCode.custom,
            message: 'State is required!',
          });
        }

        if (!data.postalCode) {
          ctx.addIssue({
            path: ['postalCode'],
            code: z.ZodIssueCode.custom,
            message: 'Postal code is required!',
          });
        }
      }

      if (data.role === ROLE.BUSINESS) {
        if (!data.name) {
          ctx.addIssue({
            path: ['name'],
            code: z.ZodIssueCode.custom,
            message: 'Business name is required!',
          });
        }

        if (!data.category) {
          ctx.addIssue({
            path: ['category'],
            code: z.ZodIssueCode.custom,
            message: 'Category is required!',
          });
        }

        if (!data.tagLine) {
          ctx.addIssue({
            path: ['tagLine'],
            code: z.ZodIssueCode.custom,
            message: 'Tag line is required!',
          });
        }

        if (!data.description) {
          ctx.addIssue({
            path: ['description'],
            code: z.ZodIssueCode.custom,
            message: 'Description is required!',
          });
        }

        if (!data.businessPhoneNumber) {
          ctx.addIssue({
            path: ['businessPhoneNumber'],
            code: z.ZodIssueCode.custom,
            message: 'Business phone number is required!',
          });
        }

        if (!data.businessEmail) {
          ctx.addIssue({
            path: ['businessEmail'],
            code: z.ZodIssueCode.custom,
            message: 'Business email is required!',
          });
        }

        if (!data.businessWebsite) {
          ctx.addIssue({
            path: ['businessWebsite'],
            code: z.ZodIssueCode.custom,
            message: 'Business website is required!',
          });
        }

        if (!data.locations || data.locations.length === 0) {
          ctx.addIssue({
            path: ['locations'],
            code: z.ZodIssueCode.custom,
            message: 'At least one location is required!',
          });
        }
      }

      if (data.role === ROLE.ORGANIZATION) {
        if (!data.name) {
          ctx.addIssue({
            path: ['name'],
            code: z.ZodIssueCode.custom,
            message: 'Organization name is required!',
          });
        }

        if (!data.serviceType) {
          ctx.addIssue({
            path: ['serviceType'],
            code: z.ZodIssueCode.custom,
            message: 'Service type is required!',
          });
        }

        if (!data.address) {
          ctx.addIssue({
            path: ['address'],
            code: z.ZodIssueCode.custom,
            message: 'Address is required!',
          });
        }

        if (!data.state) {
          ctx.addIssue({
            path: ['state'],
            code: z.ZodIssueCode.custom,
            message: 'State is required!',
          });
        }

        if (!data.postalCode) {
          ctx.addIssue({
            path: ['postalCode'],
            code: z.ZodIssueCode.custom,
            message: 'Postal code is required!',
          });
        }

        if (!data.website) {
          ctx.addIssue({
            path: ['website'],
            code: z.ZodIssueCode.custom,
            message: 'Website is required!',
          });
        }

        if (!data.phoneNumber) {
          ctx.addIssue({
            path: ['phoneNumber'],
            code: z.ZodIssueCode.custom,
            message: 'Phone number is required!',
          });
        }

        if (!data.boardMemberName) {
          ctx.addIssue({
            path: ['boardMemberName'],
            code: z.ZodIssueCode.custom,
            message: 'Board member name is required!',
          });
        }

        if (!data.boardMemberEmail) {
          ctx.addIssue({
            path: ['boardMemberEmail'],
            code: z.ZodIssueCode.custom,
            message: 'Board member email is required!',
          });
        }

        if (!data.boardMemberPhoneNumber) {
          ctx.addIssue({
            path: ['boardMemberPhoneNumber'],
            code: z.ZodIssueCode.custom,
            message: 'Board member phone number is required!',
          });
        }

        if (!data.tfnOrAbnNumber) {
          ctx.addIssue({
            path: ['tfnOrAbnNumber'],
            code: z.ZodIssueCode.custom,
            message: 'TFN or ABN number is required!',
          });
        }

        if (!data.zakatLicenseHolderNumber) {
          ctx.addIssue({
            path: ['zakatLicenseHolderNumber'],
            code: z.ZodIssueCode.custom,
            message: 'Zakat license holder number is required!',
          });
        }
      }
    }),
});

const organizationSignupWithProfileSchema = z.object({
  body: z.object({
    // Auth fields (Required)
    email: z
      .string()
      .email({ message: 'Invalid email format!' })
      .transform((email) => email.toLowerCase()),

    password: z
      .string()
      .min(8, { message: 'Password must be at least 8 characters long!' })
      .max(20, { message: 'Password cannot exceed 20 characters!' })
      .regex(/[A-Z]/, {
        message: 'Password must contain at least one uppercase letter!',
      })
      .regex(/[a-z]/, {
        message: 'Password must contain at least one lowercase letter!',
      })
      .regex(/[0-9]/, { message: 'Password must contain at least one number!' })
      .regex(/[@$!%*?&#]/, {
        message: 'Password must contain at least one special character!',
      }),

    // Organization Profile Fields (Required)
    name: z.string().min(1, 'Organization name is required!'),
    serviceType: z.string().min(1, 'Service type is required!'),
    address: z.string().min(1, 'Address is required!'),
    state: z.string().min(1, 'State is required!'),
    postalCode: z.string().min(1, 'Postal code is required!'),
    website: z.string().optional(),
    phoneNumber: z.string().min(1, 'Phone number is required!').optional(),

    // Registration Details (Required)
    tfnOrAbnNumber: z.string().min(1, 'TFN or ABN number is required!'),
    zakatLicenseHolderNumber: z.string().optional().nullable(),
    registeredCharityName: z.string().optional(),

    // Board Member Details (Required)
    boardMemberName: z.string().min(1, 'Board member name is required!'),
    boardMemberEmail: z.string().email('Invalid board member email!'),
    boardMemberPhoneNumber: z
      .string()
      .min(1, 'Board member phone is required!'),

    aboutUs: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    dateOfEstablishment: z.string().optional().nullable(), // Expecting ISO date string
  }),
});

// 6. changePasswordSchema
const changePasswordSchema = z.object({
  body: z.object({
    oldPassword: z
      .string({
        error: 'Old password is required',
      })
      .min(8, { message: 'Old password must be at least 8 characters long' })
      .max(20, { message: 'Old password cannot exceed 20 characters' })
      .regex(/[A-Z]/, {
        message: 'Old password must contain at least one uppercase letter',
      })
      .regex(/[a-z]/, {
        message: 'Old password must contain at least one lowercase letter',
      })
      .regex(/[0-9]/, { message: 'Password must contain at least one number' })
      .regex(/[@$!%*?&#]/, {
        message: 'Old password must contain at least one special character',
      }),

    newPassword: z
      .string({
        error: 'New password is required',
      })
      .min(8, { message: 'New password must be at least 8 characters long' })
      .max(20, { message: 'New password cannot exceed 20 characters' })
      .regex(/[A-Z]/, {
        message: 'New password must contain at least one uppercase letter',
      })
      .regex(/[a-z]/, {
        message: 'New password must contain at least one lowercase letter',
      })
      .regex(/[0-9]/, { message: 'Password must contain at least one number' })
      .regex(/[@$!%*?&#]/, {
        message: 'New password must contain at least one special character',
      }),
  }),
});

// 7. forgotPasswordSchema
const forgotPasswordSchema = z.object({
  body: z.object({
    email: z
      .string({
        error: 'Email is required',
      })
      .email({ message: 'Invalid email format' }),
  }),
});

// 8. sendForgotPasswordOtpAgainSchema
const sendForgotPasswordOtpAgainSchema = z.object({
  body: z.object({
    token: z.string({ error: 'Token is required' }),
  }),
});

// 9. verifyOtpForForgotPasswordSchema
const verifyOtpForForgotPasswordSchema = z.object({
  body: z.object({
    token: z.string({ error: 'Token is required' }),
    otp: z
      .string({
        error: 'OTP is required',
      })
      .regex(/^\d+$/, { message: 'OTP must be a number' })
      .length(6, { message: 'OTP must be exactly 6 digits' }),
  }),
});

// 10. resetPasswordSchema
const resetPasswordSchema = z.object({
  body: z.object({
    newPassword: z
      .string({
        error: 'New password is required',
      })
      .min(8, { message: 'New password must be at least 8 characters long' })
      .max(20, { message: 'New password cannot exceed 20 characters' })
      .regex(/[A-Z]/, {
        message: 'New password must contain at least one uppercase letter',
      })
      .regex(/[a-z]/, {
        message: 'New password must contain at least one lowercase letter',
      })
      .regex(/[0-9]/, {
        message: 'New password must contain at least one number',
      })
      .regex(/[@$!%*?&#]/, {
        message: 'New password must contain at least one special character',
      }),
    resetPasswordToken: z.string({ error: 'Token is required' }),
  }),
});

// 11. deactivateUserAccountSchema
const deactivateUserAccountSchema = z.object({
  body: z
    .object({
      email: z.string().email('Invalid email'),
      password: z.string(),
      deactivationReason: z
        .string()
        .min(3, 'Reason must be at least 3 characters'),
    })
    .strict(),
});

// 12. getNewAccessTokenSchema
const getNewAccessTokenSchema = z.object({
  cookies: z.object({
    refreshToken: z.string({
      error: 'Refresh token is required!',
    }),
  }),
});

// 13. updateAuthDataSchema
const updateAuthDataSchema = z.object({
  body: z.object({
    name: z
      .string()
      .refine((value) => value !== '', { message: 'Name is required!' })
      .refine((value) => typeof value === 'string', {
        message: 'Name must be string!',
      }),
  }),
});

// 14:  BUSINESS ACCOUNT PROFILE AND SINGUP AT A TIME:
const businessSignupWithProfileSchema = z.object({
  body: z.object({
    // Auth fields (Required)
    email: z
      .string()
      .email({ message: 'Invalid email format!' })
      .transform((email) => email.toLowerCase()),

    password: z
      .string()
      .min(8, { message: 'Password must be at least 8 characters long!' })
      .max(20, { message: 'Password cannot exceed 20 characters!' })
      .regex(/[A-Z]/, {
        message: 'Password must contain at least one uppercase letter!',
      })
      .regex(/[a-z]/, {
        message: 'Password must contain at least one lowercase letter!',
      })
      .regex(/[0-9]/, { message: 'Password must contain at least one number!' })
      .regex(/[@$!%*?&#]/, {
        message: 'Password must contain at least one special character!',
      }),

    // Business profile fields (Required)
    category: z.string().min(1, 'Category is required!'),
    name: z.string().min(1, 'Business name is required!'),
    tagLine: z.string().min(1, 'Tag line is required!'),
    description: z.string().min(1, 'Description is required!'),

    // Business profile fields (Optional)
    businessPhoneNumber: z
      .string()
      .transform((val) => (val === '' ? undefined : val))
      .optional(),

    businessEmail: z
      .string()
      .optional()
      .transform((val) => (val === '' ? undefined : val))
      .refine((val) => !val || emailRegex.test(val), {
        message: 'Invalid business email format!',
      }),

    businessWebsite: z
      .string()
      .optional()
      .transform((val) => (val === '' ? undefined : val))
      .refine((val) => !val || urlRegex.test(val), {
        message: 'Invalid website URL format!',
      }),

    locations: z.array(z.string()).optional(),
  }),
});

export type TProfilePayload = z.infer<typeof createProfileSchema.shape.body>;

export const AuthValidation = {
  createAuthSchema,
  sendSignupOtpAgainSchema,
  verifySignupOtpSchema,
  signinSchema,
  createProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  sendForgotPasswordOtpAgainSchema,
  verifyOtpForForgotPasswordSchema,
  resetPasswordSchema,
  deactivateUserAccountSchema,
  getNewAccessTokenSchema,
  updateAuthDataSchema,
  businessSignupWithProfileSchema,
  organizationSignupWithProfileSchema,
};
