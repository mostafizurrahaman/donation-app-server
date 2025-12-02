import config from '../config';

/**
 * Calculates the breakdown of a donation based on Australian Logic.
 * @param baseAmount The amount the charity should receive (if coverFees is true) OR the amount the user enters.
 * @param coverFees Whether the donor agreed to pay the fees on top.
 */
export const calculateAustralianFees = (
  baseAmount: number,
  coverFees: boolean
) => {
  const platformFeePercent = config.paymentSetting.platformFeePercent || 0;
  const gstRate = config.paymentSetting.gstPercentage || 0;

  // 1. Calculate the Service Fee (e.g. 5% of base)
  const platformFee = Number((baseAmount * platformFeePercent).toFixed(2));

  // 2. Calculate GST on the Service Fee (10% of the fee)
  const gstOnFee = Number((platformFee * gstRate).toFixed(2));

  // 3. Total Fee Cost
  const totalFeeCost = platformFee + gstOnFee;

  let totalCharge = 0;
  let netToOrg = 0;

  if (coverFees) {
    // Scenario: Donor pays extra. Charity gets full baseAmount.
    // User pays: $100 + $5.50 = $105.50
    totalCharge = Number((baseAmount + totalFeeCost).toFixed(2));
    netToOrg = baseAmount;
  } else {
    // Scenario: Donor refuses fees. Fees deducted from baseAmount.
    // User pays: $100. Charity gets: $100 - $5.50 = $94.50
    totalCharge = baseAmount;
    netToOrg = Number((baseAmount - totalFeeCost).toFixed(2));
  }

  return {
    baseAmount, // For Receipt (Tax Deductible amount)
    platformFee, // Platform Revenue
    gstOnFee, // Tax Liability (To hold for ATO)
    totalFeeCost, // Total Fees
    totalCharge, // Amount to Stripe
    netToOrg, // Amount to Balance/Ledger
    coverFees,
  };
};
