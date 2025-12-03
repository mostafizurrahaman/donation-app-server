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
export const calculateAustralianFees = (
  baseAmount: number,
  coverFees: boolean
): {
  baseAmount: number;
  platformFee: number;
  gstOnFee: number;
  stripeFee: number; // ✅ NEW
  totalFeeCost: number; // Platform + GST + Stripe
  totalCharge: number; // Amount sent to Stripe
  netToOrg: number; // Amount credited to Organization Balance
  coverFees: boolean;
} => {
  const platformFeePercent =
    Number(config.paymentSetting.platformFeePercent) || 0.05; // 5%
  const gstRate = Number(config.paymentSetting.gstPercentage) || 0.1; // 10%
  const stripeFeePercent =
    Number(config.paymentSetting.stripeFeePercent) || 0.0175; // 1.75%
  const stripeFixedFee = Number(config.paymentSetting.stripeFixedFee) || 0.3; // $0.30

  // 1. Calculate Platform Fee & GST (Always based on Base Amount)
  const platformFee = Number((baseAmount * platformFeePercent).toFixed(2));
  const gstOnFee = Number((platformFee * gstRate).toFixed(2));
  const ourFees = platformFee + gstOnFee;

  let totalCharge = 0;
  let stripeFee = 0;
  let netToOrg = 0;

  if (coverFees) {
    // Scenario A: Donor pays extra (Gross-Up)
    // We need: Total - (Total * Stripe%) - StripeFixed = Base + OurFees
    // Total * (1 - Stripe%) = Base + OurFees + StripeFixed
    // Total = (Base + OurFees + StripeFixed) / (1 - Stripe%)

    const numerator = baseAmount + ourFees + stripeFixedFee;
    const denominator = 1 - stripeFeePercent;

    totalCharge = Number((numerator / denominator).toFixed(2));

    // Calculate actual Stripe Fee based on the Total Charge
    stripeFee = Number(
      (totalCharge * stripeFeePercent + stripeFixedFee).toFixed(2)
    );

    // Organization gets the full base amount
    netToOrg = baseAmount;
  } else {
    // Scenario B: Donor refuses fees (Deduction)
    totalCharge = baseAmount;

    // Stripe Fee is calculated on the total charge (which is just the base)
    stripeFee = Number(
      (totalCharge * stripeFeePercent + stripeFixedFee).toFixed(2)
    );

    // Organization gets whatever is left
    netToOrg = Number((baseAmount - ourFees - stripeFee).toFixed(2));
  }

  const totalFeeCost = Number((platformFee + gstOnFee + stripeFee).toFixed(2));

  return {
    baseAmount,
    platformFee,
    gstOnFee,
    stripeFee,
    totalFeeCost,
    totalCharge,
    netToOrg,
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
