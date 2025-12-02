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
 * Calculate Australian Fees (Donor Optional + GST on Fee)
 *
 * Logic:
 * 1. Donation itself is GST-Free (No isTaxable check needed).
 * 2. Platform Fee (e.g. 5%) attracts 10% GST.
 * 3. If Donor covers fees: They pay Base + Fee + GST. Org gets Base.
 * 4. If Donor refuses fees: They pay Base. Org gets Base - Fee - GST.
 *
 * @param baseAmount - The intended donation amount (e.g., $100)
 * @param coverFees - Whether the donor wants to cover the platform fees
 * @returns Breakdown of fees, tax, total charge, and net amount for org
 */
export const calculateAustralianFees = (
  baseAmount: number,
  coverFees: boolean
): {
  baseAmount: number;
  platformFee: number;
  gstOnFee: number; // This is the only tax we track now
  totalFeeCost: number; // Fee + GST
  totalCharge: number; // Amount sent to Stripe
  netToOrg: number; // Amount credited to Organization Balance
  coverFees: boolean;
} => {
  const platformFeePercent = config.paymentSetting.platformFeePercent || 0.05;
  const gstRate = config.paymentSetting.gstPercentage || 0.1; // 10% GST

  // 1. Calculate Platform Fee (Revenue)
  // Example: $100 * 0.05 = $5.00
  const platformFee = Number((baseAmount * platformFeePercent).toFixed(2));

  // 2. Calculate GST on the Fee (Liability)
  // Example: $5.00 * 0.10 = $0.50
  const gstOnFee = Number((platformFee * gstRate).toFixed(2));

  // 3. Total Fee Liability (Revenue + GST)
  // Example: $5.00 + $0.50 = $5.50
  const totalFeeCost = platformFee + gstOnFee;

  let totalCharge = 0;
  let netToOrg = 0;

  if (coverFees) {
    // Scenario A: Donor pays extra. Charity gets full baseAmount.
    // User pays: $100 (Base) + $5.50 (Fees) = $105.50
    // Org gets: $100
    totalCharge = Number((baseAmount + totalFeeCost).toFixed(2));
    netToOrg = baseAmount;
  } else {
    // Scenario B: Donor refuses fees. Fees deducted from baseAmount.
    // User pays: $100
    // Org gets: $100 - $5.50 = $94.50
    totalCharge = baseAmount;
    netToOrg = Number((baseAmount - totalFeeCost).toFixed(2));
  }

  return {
    baseAmount,
    platformFee,
    gstOnFee,
    totalFeeCost,
    totalCharge,
    netToOrg,
    coverFees,
  };
};

/**
 * Get current GST rate as a percentage string
 * @returns Tax rate as percentage (e.g., "10%")
 */
export const getTaxRateDisplay = (): string => {
  const gstRate = Number(config.paymentSetting.gstPercentage) || 0.1;
  return `${(gstRate * 100).toFixed(0)}%`;
};
