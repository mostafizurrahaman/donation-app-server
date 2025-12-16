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
) => {
  const platformFeePercent =
    Number(config.paymentSetting.platformFeePercent) || 0.05;
  const gstRate = Number(config.paymentSetting.gstPercentage) || 0.1;
  // Stripe AU: 1.75% + 30c
  const stripeFeePercent =
    Number(config.paymentSetting.stripeFeePercent) || 0.029;
  const stripeFixedFee = Number(config.paymentSetting.stripeFixedFee) || 0.3;
   console.log({ stripeFeePercent });

  // 1. Platform Revenue + GST
  const platformFee = Number((baseAmount * platformFeePercent).toFixed(2));
  const gstOnFee = Number((platformFee * gstRate).toFixed(2));
  const applicationFee = platformFee + gstOnFee; // This is what the Platform keeps

  let totalCharge = 0;
  let stripeFee = 0;
  let netToOrg = 0;

  if (coverFees) {
    // Scenario A: Donor pays everything. Org gets exactly baseAmount.
    // Formula to Gross Up: Total = (Base + AppFee + StripeFixed) / (1 - StripePercent)
    const numerator = baseAmount + applicationFee + stripeFixedFee;
    const denominator = 1 - stripeFeePercent;
    totalCharge = Number((numerator / denominator).toFixed(2));

    // Calculate actual Stripe Fee on the total
    stripeFee = Number(
      (totalCharge * stripeFeePercent + stripeFixedFee).toFixed(2)
    );

    // Net to Org should ideally be baseAmount, but slight rounding diffs may occur
    netToOrg = Number((totalCharge - stripeFee - applicationFee).toFixed(2));
  } else {
    // Scenario B: Donor pays Base. Org pays fees (deducted).
    totalCharge = baseAmount;

    stripeFee = Number(
      (totalCharge * stripeFeePercent + stripeFixedFee).toFixed(2)
    );

    // Org gets: Base - Stripe - Platform - GST
    netToOrg = Number((totalCharge - stripeFee - applicationFee).toFixed(2));
  }

  console.log({
    baseAmount, // Tax Deductible amount
    platformFee, // Platform Revenue
    gstOnFee, // GST Liability
    stripeFee, // Stripe Cost
    applicationFee, // Total Fees
    totalCharge, // Amount to Charge Card
    netToOrg, // Amount to Credit Organization
    coverFees,
  });

  return {
    baseAmount,
    platformFee,
    gstOnFee,
    stripeFee,
    totalCharge, // Amount to charge the card
    applicationFee, // Amount passed to Stripe as application_fee_amount
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
