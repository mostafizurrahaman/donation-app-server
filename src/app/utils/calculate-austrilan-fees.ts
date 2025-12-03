import config from '../config';

/**
 * Calculates the breakdown of a donation based on Australian Logic.
 *
 * Logic:
 * 1. Platform Fee (e.g. 5%) is calculated on the Base Amount.
 * 2. GST (e.g. 10%) is calculated on the Platform Fee.
 * 3. Stripe Fee (e.g. 1.75% + 30c) is calculated on the TOTAL charged amount.
 *
 * @param baseAmount The amount the charity should receive (if coverFees is true) OR the amount the user enters.
 * @param coverFees Whether the donor agreed to pay the fees on top.
 */
export const calculateAustralianFees = (
  baseAmount: number,
  coverFees: boolean
) => {
  const platformFeePercent =
    Number(config.paymentSetting.platformFeePercent) || 0.05;
  const gstRate = Number(config.paymentSetting.gstPercentage) || 0.1;
  const stripeFeePercent =
    Number(config.paymentSetting.stripeFeePercent) || 0.0175;
  const stripeFixedFee = Number(config.paymentSetting.stripeFixedFee) || 0.3;

  // 1. Calculate Platform Fee & GST (Always based on Base Amount)
  const platformFee = Number((baseAmount * platformFeePercent).toFixed(2));
  const gstOnFee = Number((platformFee * gstRate).toFixed(2));
  const ourFees = platformFee + gstOnFee;

  let totalCharge = 0;
  let stripeFee = 0;
  let netToOrg = 0;

  if (coverFees) {
    // Scenario A: Donor pays extra (Gross-Up)
    // Formula: Total = (Base + OurFees + StripeFixed) / (1 - StripePercent)
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

    // Organization gets whatever is left after all fees are deducted
    netToOrg = Number((baseAmount - ourFees - stripeFee).toFixed(2));
  }

  // Total internal cost (Platform + GST + Stripe)
  const totalFeeCost = Number((platformFee + gstOnFee + stripeFee).toFixed(2));

  return {
    baseAmount, // Tax Deductible amount
    platformFee, // Platform Revenue
    gstOnFee, // GST Liability
    stripeFee, // Stripe Cost
    totalFeeCost, // Total Fees
    totalCharge, // Amount to Charge Card
    netToOrg, // Amount to Credit Organization
    coverFees,
  };
};
