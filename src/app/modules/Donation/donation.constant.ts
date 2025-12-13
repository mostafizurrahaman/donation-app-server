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
 * Calculate Australian Fees (Donor Optional + GST on Fee + Stripe Fee)
 *
 * Logic:
 * 1. Donation itself is GST-Free.
 * 2. Platform Fee (5%) attracts 10% GST.
 * 3. Stripe Fee (e.g., 1.75% + 30c) is charged on the TOTAL amount.
 *
 * If Donor covers fees (Gross-Up):
 *    We calculate a Total Charge such that after Stripe takes its cut,
 *    and we take our Platform Fee + GST, the Charity gets the exact Base Amount.
 *    Formula: Total = (Base + PlatformFee + GST + StripeFixed) / (1 - StripePercent)
 *
 * If Donor refuses fees (Deduction):
 *    Total Charge = Base Amount.
 *    Stripe Fee, Platform Fee, and GST are deducted from the Base.
 *    Net to Org = Base - StripeFee - PlatformFee - GST.
 *
 * @param baseAmount - The intended donation amount (e.g., $100)
 * @param coverFees - Whether the donor wants to cover the platform fees
 */
/**
 * Calculate Fees (New Logic)
 * 1. Stripe Fee is ALWAYS paid by the donor (added on top).
 * 2. Platform Fee is optional (added on top ONLY if coverFees is true).
 */
export const calculateAustralianFees = (
  baseAmount: number,
  coverFees: boolean
): {
  baseAmount: number;
  platformFee: number;
  gstOnFee: number;
  stripeFee: number;
  totalFeeCost: number;
  totalCharge: number;
  netToOrg: number;
  coverFees: boolean;
} => {
  const platformFeePercent =
    Number(config.paymentSetting.platformFeePercent) || 0.05;
  const gstRate = Number(config.paymentSetting.gstPercentage) || 0.1;
  const stripeFeePercent =
    Number(config.paymentSetting.stripeFeePercent) || 0.0175; // 1.75%
  const stripeFixedFee = Number(config.paymentSetting.stripeFixedFee) || 0.3; // $0.30

  // 1. Calculate Internal Fees (Platform + GST)
  const platformFee = Number((baseAmount * platformFeePercent).toFixed(2));
  const gstOnFee = Number((platformFee * gstRate).toFixed(2));
  const internalFees = platformFee + gstOnFee;

  // 2. Determine the "Pre-Stripe" Target Amount
  // If coverFees is TRUE: We need to collect Base + Internal Fees.
  // If coverFees is FALSE: We only need to collect Base (Internal fees will be deducted from Org later).
  let targetAmount = baseAmount;

  if (coverFees) {
    targetAmount += internalFees;
  }

  // 3. ALWAYS Gross Up for Stripe
  // Formula: Total = (Target + Fixed) / (1 - Percent)
  // This ensures the Donor pays the Stripe fee on top of the Target.
  const totalCharge = Number(
    ((targetAmount + stripeFixedFee) / (1 - stripeFeePercent)).toFixed(2)
  );

  // 4. Calculate the actual Stripe Fee
  const stripeFee = Number((totalCharge - targetAmount).toFixed(2));

  // 5. Calculate Net to Organization
  // Net = Total Collected - Stripe Fee - Internal Fees
  // If coverFees was TRUE: (Base + Internal + Stripe) - Stripe - Internal = Base.
  // If coverFees was FALSE: (Base + Stripe) - Stripe - Internal = Base - Internal.
  const netToOrg = Number((totalCharge - stripeFee - internalFees).toFixed(2));

  const totalFeeCost = Number((internalFees + stripeFee).toFixed(2));

  return {
    baseAmount,
    platformFee,
    gstOnFee,
    stripeFee,
    totalFeeCost,
    totalCharge, // Donor pays this
    netToOrg, // Charity gets this
    coverFees,
  };
};

/**
 * Get current GST rate as a percentage string
 */
export const getTaxRateDisplay = (): string => {
  const gstRate = Number(config.paymentSetting.gstPercentage) || 0.1;
  return `${(gstRate * 100).toFixed(0)}%`;
};
