export const PAYOUT_STATUS = {
  PENDING: 'pending', // Requested by Org
  APPROVED: 'approved', // Approved by Admin (optional workflow)
  PROCESSING: 'processing', // Sent to Stripe, waiting
  COMPLETED: 'completed', // Money sent successfully
  FAILED: 'failed', // Stripe error
  CANCELLED: 'cancelled', // Cancelled by User or Admin
} as const;

export const PAYOUT_METHOD = {
  STRIPE_CONNECT: 'stripe_connect',
  BANK_TRANSFER: 'bank_transfer',
} as const;

export const PAYOUT_STATUS_VALUES = Object.values(PAYOUT_STATUS);
export const PAYOUT_METHOD_VALUES = Object.values(PAYOUT_METHOD);
