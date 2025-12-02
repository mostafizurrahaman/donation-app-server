import config from '../../config';

export const DONATION_STATUS = [
  'pending',
  'processing',
  'completed',
  'failed',
  'refunded',
  'canceled',
  'refunding',
  'renewed',
] as const;

export const DONATION_TYPE = ['one-time', 'recurring', 'round-up'] as const;

export const DEFAULT_CURRENCY = 'USD';

// Recurring donation frequency options
export const RECURRING_FREQUENCY = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
  'custom',
] as const;

// Round-up threshold options
export const ROUNDUP_THRESHOLD_OPTIONS = [
  '10',
  '20',
  '25',
  '40',
  '50',
  'custom',
  'none',
] as const;

// Auto donate trigger types
export const AUTODONATE_TRIGGER_TYPE = ['amount', 'days', 'both'] as const;

// Bank account status
export const BANK_ACCOUNT_STATUS = [
  'active',
  'login_required',
  'disconnected',
] as const;

export const REFUND_WINDOW_DAYS = config.paymentSetting.clearingPeriodDays;

export const monthAbbreviations = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

/**
 * Calculate tax amount and total amount for a donation
 * @param amount - Base donation amount (before tax)
 * @param isTaxable - Whether the donation is subject to tax
 * @returns Object with taxAmount and totalAmount
 */
export const calculateTax = (
  amount: number,
  isTaxable: boolean
): { taxAmount: number; totalAmount: number } => {
  if (!isTaxable) {
    return {
      taxAmount: 0,
      totalAmount: amount,
    };
  }

  // Get tax rate from environment
  const taxRate = Number(config.paymentSetting.taxPercentage) || 0;

  // Calculate tax amount and round to 2 decimal places
  const taxAmount = parseFloat((amount * taxRate).toFixed(2));

  // Calculate total amount and round to 2 decimal places
  const totalAmount = parseFloat((amount + taxAmount).toFixed(2));

  return {
    taxAmount,
    totalAmount,
  };
};

/**
 * Get current tax rate as a percentage string
 * @returns Tax rate as percentage (e.g., "10%")
 */
export const getTaxRateDisplay = (): string => {
  const taxRate = Number(process.env.TAX_PERCENTAGE) || 0;
  return `${(taxRate * 100).toFixed(0)}%`;
};
