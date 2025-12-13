import { z } from 'zod';
import {
  DONATION_TYPE_VALUES,
  RECEIPT_STATUS_VALUES,
} from './receipt.constant';

export const generateReceiptSchema = z.object({
  body: z.object({
    donationId: z.string().min(1, 'Donation ID is required'),
    donorId: z.string().min(1, 'Donor ID is required'),
    organizationId: z.string().min(1, 'Organization ID is required'),
    causeId: z.string().optional(),

    // Financials
    amount: z.number().min(0.01, 'Amount must be at least 0.01'),
    coverFees: z.boolean().default(false),
    platformFee: z.number().default(0),
    gstOnFee: z.number().default(0),
    stripeFee: z.number().default(0), 
    totalAmount: z.number().min(0.01, 'Total amount is required'),

    currency: z.string().default('USD'),
    donationType: z.enum(DONATION_TYPE_VALUES as [string, ...string[]]),
    donationDate: z.coerce.date(),
    paymentMethod: z.string().optional(),
    specialMessage: z.string().max(500).optional(),
  }),
});

export const getReceiptByIdSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Receipt ID is required'),
  }),
});

export const getReceiptsByDonorSchema = z.object({
  params: z.object({
    donorId: z.string().min(1, 'Donor ID is required'),
  }),
  query: z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(10),
    sortBy: z.string().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const getReceiptsByOrganizationSchema = z.object({
  params: z.object({
    organizationId: z.string().min(1, 'Organization ID is required'),
  }),
  query: z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(10),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    status: z.enum(RECEIPT_STATUS_VALUES as [string, ...string[]]).optional(),
    sortBy: z.string().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const resendReceiptEmailSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Receipt ID is required'),
  }),
});

export const getReceiptStatsSchema = z.object({
  query: z.object({
    organizationId: z.string().optional(),
    donorId: z.string().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  }),
});

export const downloadReceiptSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Receipt ID is required'),
  }),
});

export const bulkExportReceiptsSchema = z.object({
  query: z.object({
    organizationId: z.string().optional(),
    donorId: z.string().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    format: z.enum(['csv', 'json']).default('csv'),
  }),
});
