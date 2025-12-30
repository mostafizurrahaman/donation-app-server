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
 * Calculate Australian Fees
 *
 * Logic:
 * 1. Donation itself is GST-Free.
 * 2. Platform Fee (5%) attracts 10% GST.
 * 3. Stripe Fee is ALWAYS paid by the donor (added on top).
 * 4. coverFees flag determines if Platform Fee + GST are also added on top or deducted.
 *
 * If coverFees = true:
 *    Donor pays: Base + Stripe Fee + Platform Fee + GST
 *    Org receives: Base Amount
 *
 * If coverFees = false:
 *    Donor pays: Base + Stripe Fee
 *    Org receives: Base - Platform Fee - GST
 *
 * @param baseAmount - The intended donation amount (e.g., $100)
 * @param coverFees - Whether the donor wants to cover the platform fees (not Stripe fees)
 */

export const calculateAustralianFees = (
  baseAmount: number,
  coverFees: boolean
) => {
  const platformFeePercent =
    Number(config.paymentSetting.platformFeePercent) || 0.05;
  const gstRate = Number(config.paymentSetting.gstPercentage) || 0.1;
  const stripeFeePercent =
    Number(config.paymentSetting.stripeFeePercent) || 0.029;
  const stripeFixedFee = Number(config.paymentSetting.stripeFixedFee) || 0.3;

  // 1. Calculate Platform Fee + GST (based on baseAmount)
  const platformFee = Number((baseAmount * platformFeePercent).toFixed(2));
  const gstOnFee = Number((platformFee * gstRate).toFixed(2));
  const applicationFee = platformFee + gstOnFee; // This is what the Platform keeps

  let totalCharge = 0;
  let stripeFee = 0;
  let netToOrg = 0;

  if (coverFees) {
    // Scenario A: Donor covers ALL fees (Stripe + Platform + GST)
    // Total = (Base + AppFee + StripeFixed) / (1 - StripePercent)
    const numerator = baseAmount + applicationFee + stripeFixedFee;
    const denominator = 1 - stripeFeePercent;
    totalCharge = Number((numerator / denominator).toFixed(2));

    // Calculate actual Stripe Fee on the total
    stripeFee = Number(
      (totalCharge * stripeFeePercent + stripeFixedFee).toFixed(2)
    );

    // Org receives the full base amount
    netToOrg = Number((totalCharge - stripeFee - applicationFee).toFixed(2));
  } else {
    // Scenario B: Donor ONLY pays Stripe Fee (Platform Fee + GST deducted)
    // First calculate what amount + stripe fee equals baseAmount
    // Formula: baseWithoutPlatform = Base - ApplicationFee
    // Then: Total = (baseWithoutPlatform + StripeFixed) / (1 - StripePercent)
    const numerator = baseAmount + stripeFixedFee;
    const denominator = 1 - stripeFeePercent;
    totalCharge = Number((numerator / denominator).toFixed(2));

    // Calculate Stripe Fee on the total
    stripeFee = Number(
      (totalCharge * stripeFeePercent + stripeFixedFee).toFixed(2)
    );

    // Org receives: Base - Application Fee (Platform + GST deducted)
    netToOrg = Number((totalCharge - stripeFee - applicationFee).toFixed(2));
  }

  const platformFeeWithStripe = stripeFee + applicationFee;

  console.log({
    baseAmount, // Tax Deductible amount
    platformFee, // Platform Revenue
    gstOnFee, // GST Liability
    stripeFee, // Stripe Cost
    applicationFee, // Platform Fee + GST
    totalCharge, // Amount to Charge Card
    netToOrg, // Amount to Credit Organization
    coverFees,
    platformFeeWithStripe, // Total fees (Stripe + Platform + GST)
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
    platformFeeWithStripe, // platformFee + Application Fee
  };
};

/**
 * Get current GST rate as a percentage string
 */
export const getTaxRateDisplay = (): string => {
  const gstRate = Number(config.paymentSetting.gstPercentage) || 0.1;
  return `${(gstRate * 100).toFixed(0)}%`;
};
