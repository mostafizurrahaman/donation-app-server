import { Stripe } from 'stripe';
import { stripe } from '../../lib/stripeHelper';
import config from '../../config';
import { AppError } from '../../utils';
import httpStatus from 'http-status';
import { OrganizationModel } from '../Organization/organization.model';
import { Donation } from '../Donation/donation.model';
import Cause from '../Causes/causes.model';
import { CAUSE_STATUS_TYPE } from '../Causes/causes.constant';
import Client from '../Client/client.model';
import { RoundUpModel } from '../RoundUp/roundUp.model';
import {
  ICheckoutSessionRequest,
  ICheckoutSessionResponse,
  IPaymentIntentRequest,
  IPaymentIntentResponse,
  ISetupIntentRequest,
  ISetupIntentResponse,
  IAttachPaymentMethodRequest,
  ICreatePaymentIntentWithMethodRequest,
  ICreateRoundUpPaymentIntentRequest,
} from './stripe.interface';
import PaymentMethod from '../PaymentMethod/paymentMethod.model';

// 1. Create refund for payment intent
const createRefund = async (
  paymentIntentId: string,
  amount?: number
): Promise<Stripe.Refund> => {
  if (!paymentIntentId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Payment intent ID is required!'
    );
  }

  try {
    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: paymentIntentId,
    };

    // Add amount if specified (partial refund)
    if (amount && amount > 0) {
      refundParams.amount = Math.round(amount * 100); // Convert to cents
    }

    const refund = await stripe.refunds.create(refundParams);
    return refund;
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create refund: ${(error as Error).message}`
    );
  }
};

// 2. Create customer
const createCustomer = async (
  email: string,
  name?: string
): Promise<Stripe.Customer> => {
  if (!email) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Email is required!');
  }

  try {
    const customer = await stripe.customers.create({
      email,
      name,
    });
    return customer;
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create customer: ${(error as Error).message}`
    );
  }
};

// 3. Get payment intent details
const getPaymentIntent = async (
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> => {
  if (!paymentIntentId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Payment intent ID is required!'
    );
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      `Payment intent not found: ${(error as Error).message}`
    );
  }
};

// 4. Create payment intent for one-time donation
const createPaymentIntent = async (
  payload: IPaymentIntentRequest
): Promise<IPaymentIntentResponse> => {
  const {
    amount, // Base amount
    totalAmount, // Total amount to charge
    currency = 'usd',
    donorId,
    organizationId,
    causeId,
    specialMessage,

    // ✅ New Fields for Metadata
    coverFees = true,
    platformFee = 0,
    gstOnFee = 0,
    netToOrg = 0,
  } = payload;

  // Validate amount is reasonable
  if (totalAmount < 0.01 || totalAmount > 99999.99) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid donation amount!');
  }

  console.log(`💰 Creating Payment Intent:`);
  console.log(`   Base Amount: $${amount.toFixed(2)}`);
  console.log(`   Total Charge: $${totalAmount.toFixed(2)}`);
  console.log(`   Cover Fees: ${coverFees}`);

  // Create Stripe Payment Intent
  const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
    amount: Math.round(totalAmount * 100),
    currency: 'usd', // ✅ Add required currency
    metadata: {
      donorId,
      organizationId,
      causeId: causeId || '',
      specialMessage: specialMessage || '',
      baseAmount: amount.toString(),
      totalAmount: totalAmount.toString(),

      // ✅ Store fee breakdown for audit
      platformFee: platformFee.toString(),
      gstOnFee: gstOnFee.toString(),
      netToOrg: netToOrg.toString(),
      coverFees: coverFees.toString(),
    },
    automatic_payment_methods: {
      enabled: true,
    },
  };

  try {
    const paymentIntent = await stripe.paymentIntents.create(
      paymentIntentParams
    );

    return {
      client_secret: paymentIntent.client_secret || '',
      payment_intent_id: paymentIntent.id,
    };
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create payment intent: ${(error as Error).message}`
    );
  }
};

// 5. Verify webhook signature
const verifyWebhookSignature = (
  body: string,
  signature: string
): Stripe.Event => {
  try {
    const webhookSecret = config.stripe.webhookSecret;

    if (!webhookSecret) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Stripe webhook secret not configured'
      );
    }

    return stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Webhook signature verification failed: ${(error as Error).message}`
    );
  }
};

// 6. Create setup intent for saving payment method
const createSetupIntent = async (
  payload: ISetupIntentRequest
): Promise<ISetupIntentResponse> => {
  const { userId, email, paymentMethodType = 'card' } = payload;

  try {
    // Check if customer exists or create new one
    let customer: Stripe.Customer;
    const existingCustomers = await stripe.customers.list({
      email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await createCustomer(email);
    }

    // Create setup intent
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: [paymentMethodType],
      metadata: {
        userId,
      },
    });

    return {
      client_secret: setupIntent.client_secret || '',
      setup_intent_id: setupIntent.id,
    };
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create setup intent: ${(error as Error).message}`
    );
  }
};

// 7. Attach payment method to customer
const attachPaymentMethod = async (
  payload: IAttachPaymentMethodRequest
): Promise<Stripe.PaymentMethod> => {
  const { paymentMethodId, customerId } = payload;

  if (!paymentMethodId || !customerId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Payment method ID and customer ID are required!'
    );
  }

  try {
    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
    return paymentMethod;
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to attach payment method: ${(error as Error).message}`
    );
  }
};

// 8. Get payment method details
const getPaymentMethod = async (
  paymentMethodId: string
): Promise<Stripe.PaymentMethod> => {
  if (!paymentMethodId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Payment method ID is required!'
    );
  }

  try {
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    return paymentMethod;
  } catch (error) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      `Payment method not found: ${(error as Error).message}`
    );
  }
};

// 9. Detach payment method from customer
const detachPaymentMethod = async (
  paymentMethodId: string
): Promise<Stripe.PaymentMethod> => {
  if (!paymentMethodId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Payment method ID is required!'
    );
  }

  try {
    const paymentMethod = await stripe.paymentMethods.detach(paymentMethodId);
    return paymentMethod;
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to detach payment method: ${(error as Error).message}`
    );
  }
};

// 10. Create payment intent with saved payment method (for direct charges)
const createPaymentIntentWithMethod = async (
  payload: ICreatePaymentIntentWithMethodRequest
): Promise<IPaymentIntentResponse> => {
  const {
    amount, // Base
    totalAmount, // Total to charge
    currency = 'usd',
    customerId,
    paymentMethodId,
    donationId,
    organizationId,
    causeId,
    specialMessage,

    // ✅ New Fields
    coverFees = true,
    platformFee = 0,
    gstOnFee = 0,
    netToOrg = 0,
  } = payload;

  // Validate amount
  if (totalAmount < 1 || totalAmount > 10000) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Invalid donation amount! Amount must be between $1 and $10,000.'
    );
  }

  console.log(`💳 Creating Payment Intent with Saved Method:`);
  console.log(`   Base: $${amount.toFixed(2)}`);
  console.log(`   Total: $${totalAmount.toFixed(2)}`);

  try {
    // Create payment intent with saved payment method
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: Math.round(totalAmount * 100),
      currency,
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true, // Automatically confirm the payment
      return_url: config.stripe.stripeSuccessUrl,
      metadata: {
        donationId,
        organizationId,
        causeId,
        specialMessage: specialMessage || '',
        baseAmount: amount.toString(), // Base amount
        totalAmount: totalAmount.toString(), // Charged Amount

        // ✅ Fee Breakdown
        platformFee: platformFee.toString(),
        gstOnFee: gstOnFee.toString(),
        netToOrg: netToOrg.toString(),
        coverFees: coverFees.toString(),
      },
    };

    const paymentIntent = await stripe.paymentIntents.create(
      paymentIntentParams
    );

    return {
      client_secret: paymentIntent.client_secret || '',
      payment_intent_id: paymentIntent.id,
    };
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create payment intent: ${(error as Error).message}`
    );
  }
};

// 11. List customer payment methods
const listCustomerPaymentMethods = async (
  customerId: string,
  type: 'card' | 'us_bank_account' = 'card'
): Promise<Stripe.PaymentMethod[]> => {
  if (!customerId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Customer ID is required!');
  }

  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type,
    });
    return paymentMethods.data;
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to list payment methods: ${(error as Error).message}`
    );
  }
};

// 12. Get or create customer by email
const getOrCreateCustomer = async (
  email: string,
  name?: string
): Promise<Stripe.Customer> => {
  if (!email) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Email is required!');
  }

  try {
    // Check if customer exists
    const existingCustomers = await stripe.customers.list({
      email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      return existingCustomers.data[0];
    }

    // Create new customer
    return await createCustomer(email, name);
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to get or create customer: ${(error as Error).message}`
    );
  }
};

// 13. Create Stripe Connect account for organization
const createConnectAccount = async (
  email: string,
  organizationName: string,
  country: string = 'US'
): Promise<{ accountId: string; onboardingUrl: string }> => {
  if (!email) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Email is required!');
  }

  try {
    // Create Connect account
    const account = await stripe.accounts.create({
      type: 'express',
      country,
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'non_profit',
      business_profile: {
        name: organizationName,
      },
    });

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${config.stripe.stripeFailedUrl}?error=onboarding_failed`,
      return_url: `${config.stripe.stripeSuccessUrl}?onboarding=complete`,
      type: 'account_onboarding',
    });

    return {
      accountId: account.id,
      onboardingUrl: accountLink.url,
    };
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create Connect account: ${(error as Error).message}`
    );
  }
};

// 14. Get Connect account details
const getConnectAccount = async (
  accountId: string
): Promise<Stripe.Account> => {
  if (!accountId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Account ID is required!');
  }

  try {
    return await stripe.accounts.retrieve(accountId);
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to retrieve Connect account: ${(error as Error).message}`
    );
  }
};

// 15. Create new account link for re-onboarding
const createAccountLink = async (
  accountId: string
): Promise<{ onboardingUrl: string }> => {
  if (!accountId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Account ID is required!');
  }

  try {
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${config.stripe.stripeFailedUrl}?error=onboarding_failed`,
      return_url: `${config.stripe.stripeSuccessUrl}?onboarding=complete`,
      type: 'account_onboarding',
    });

    return {
      onboardingUrl: accountLink.url,
    };
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create account link: ${(error as Error).message}`
    );
  }
};

// 16. Create payment intent for round-up donation (webhook-based approach)
const createRoundUpPaymentIntent = async (
  payload: ICreateRoundUpPaymentIntentRequest
): Promise<{ client_secret: string; payment_intent_id: string }> => {
  try {
    const {
      roundUpId,
      userId,
      charityId,
      causeId,
      amount, // Base amount
      totalAmount, // Total charge
      month,
      year,
      specialMessage,
      paymentMethodId,
      donationId,
      // ✅ New fields
      coverFees = false,
      platformFee = 0,
      gstOnFee = 0,
      netToOrg = 0,
    } = payload;

    console.log(`🔄 Creating RoundUp Payment Intent:`);
    console.log(`   Base: $${amount.toFixed(2)}`);
    console.log(`   Total: $${totalAmount.toFixed(2)}`);

    // Get charity's Stripe Connect account
    const charity = await OrganizationModel.findById(charityId);
    if (!charity) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Charity not found!');
    }

    // Check if payment method exists for user
    if (!paymentMethodId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Payment method ID is required for round-up donation'
      );
    }

    const paymentMethod = await PaymentMethod.findById(paymentMethodId);

    if (!paymentMethod) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Payment method not found');
    }

    if (String(paymentMethod.user) !== userId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Payment method does not belong to the specified user'
      );
    }

    if (!paymentMethod.isActive) {
      throw new AppError(httpStatus.BAD_REQUEST, "Payment method isn't active");
    }

    // Create Stripe Payment Intent for off-session round-up donation
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: Math.round(totalAmount * 100),
      currency: 'usd',

      // Off-session settings
      confirm: true,
      off_session: true,

      // Must specify customer + saved PM for off-session
      customer: paymentMethod.stripeCustomerId,
      payment_method: paymentMethod.stripePaymentMethodId,

      metadata: {
        donationId: String(donationId || ''),
        roundUpId: String(roundUpId),
        userId: String(userId),
        organizationId: String(charityId),
        causeId: String(causeId || ''),
        month: String(month),
        year: String(year),
        type: 'roundup_donation',
        donationType: 'roundup',
        specialMessage:
          specialMessage || `Round-up donation for ${month} ${year}`,
        baseAmount: amount.toString(),
        totalAmount: totalAmount.toString(),
        // ✅ Fee Breakdown
        platformFee: platformFee.toString(),
        gstOnFee: gstOnFee.toString(),
        netToOrg: netToOrg.toString(),
        coverFees: coverFees.toString(),
      },
    };

    const paymentIntent = await stripe.paymentIntents.create(
      paymentIntentParams
    );

    return {
      client_secret: paymentIntent.client_secret || '',
      payment_intent_id: paymentIntent.id,
    };
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create RoundUp payment intent: ${(error as Error).message}`
    );
  }
};

// 18. Cancel payment intent for one-time donation
const cancelPaymentIntent = async (
  paymentIntentId: string
): Promise<{ canceled: boolean; status: string }> => {
  try {
    // Cancel the existing PaymentIntent
    const canceledIntent = await stripe.paymentIntents.cancel(paymentIntentId);

    return {
      canceled: true,
      status: canceledIntent.status,
    };
  } catch (error) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Failed to cancel payment intent: ${(error as Error).message}`
    );
  }
};

// ==========================================
// 19. Transfer Funds to Connected Account (Manual Payout)
// ==========================================
const transferFundsToConnectedAccount = async (
  destinationAccountId: string,
  amount: number,
  currency: string = 'usd',
  metadata: Record<string, string> = {}
): Promise<Stripe.Transfer> => {
  if (!destinationAccountId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Destination account ID is required!'
    );
  }

  try {
    // Create a Transfer from the Platform to the Connected Account
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      destination: destinationAccountId,
      metadata,
    });

    return transfer;
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to transfer funds: ${(error as Error).message}`
    );
  }
};

export const StripeService = {
  // Payment intent methods
  createPaymentIntent,
  createPaymentIntentWithMethod,
  getPaymentIntent,
  cancelPaymentIntent,
  createRoundUpPaymentIntent,

  // Payment method methods
  createSetupIntent,
  attachPaymentMethod,
  getPaymentMethod,
  detachPaymentMethod,
  listCustomerPaymentMethods,

  // Customer methods
  createCustomer,
  getOrCreateCustomer,

  // Refund methods
  createRefund,

  // Webhook methods
  verifyWebhookSignature,

  // Stripe Connect methods
  createConnectAccount,
  getConnectAccount,
  createAccountLink,

  // Transfer methods
  transferFundsToConnectedAccount,
};
