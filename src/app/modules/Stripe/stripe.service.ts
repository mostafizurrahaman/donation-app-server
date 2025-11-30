import { Stripe } from 'stripe';
import { stripe } from '../../lib/stripeHelper';
import config from '../../config';
import { AppError } from '../../utils';
import httpStatus from 'http-status';
import { OrganizationModel } from '../Organization/organization.model';
import { Donation } from '../Donation/donation.model';
import { calculateTax } from '../Donation/donation.constant'; // Add import for calculateTax
import Cause from '../Causes/causes.model';
import { CAUSE_STATUS_TYPE } from '../Causes/causes.constant';
import Client from '../Client/client.model';
import { RoundUpModel } from '../RoundUp/roundUp.model'; // Add import for RoundUpModel
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

// 1. Create checkout session for one-time donation
const createCheckoutSession = async (
  payload: ICheckoutSessionRequest
): Promise<ICheckoutSessionResponse> => {
  const {
    amount,
    causeId,
    organizationId,
    userId,
    connectedAccountId,
    specialMessage,
    isTaxable = false,
    taxAmount = 0,
    totalAmount,
  } = payload;

  // Validate amount is reasonable
  if (totalAmount < 0.01 || totalAmount > 99999.99) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid donation amount!');
  }

  // Create Stripe Checkout Session
  const checkoutSessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    success_url:
      config.stripe.stripeSuccessUrl + `?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: config.stripe.stripeFailedUrl,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: causeId ? 'Donation for Cause' : 'General Donation',
            description: specialMessage || 'Thank you for your donation!',
          },
          unit_amount: Math.round(totalAmount * 100), // ✅ Use totalAmount (includes tax)
        },
        quantity: 1,
      },
    ],
    metadata: {
      causeId: causeId || '',
      organizationId,
      userId,
      baseAmount: amount.toString(),
      isTaxable: isTaxable.toString(),
      taxAmount: taxAmount.toString(),
      totalAmount: totalAmount.toString(),
    },
  };

  // Always include payment intent data to ensure metadata transfer to Payment Intent
  checkoutSessionParams.payment_intent_data = {
    metadata: {
      causeId: causeId || '',
      organizationId,
      userId,
      specialMessage: specialMessage || '',
      baseAmount: amount.toString(),
      isTaxable: isTaxable.toString(),
      taxAmount: taxAmount.toString(),
      totalAmount: totalAmount.toString(),
    },
  };

  // Add connected account for transfers if provided
  if (connectedAccountId) {
    checkoutSessionParams.payment_intent_data.transfer_data = {
      destination: connectedAccountId,
    };
  }

  // Create session with error handling
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(checkoutSessionParams);
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create checkout session: ${(error as Error).message}`
    );
  }

  return {
    sessionId: session.id,
    url: session.url!,
  };
};

// 2. Create checkout session with donation record
const createCheckoutSessionWithDonation = async (
  payload: ICheckoutSessionRequest,
  donationId: string
): Promise<ICheckoutSessionResponse> => {
  const {
    amount,
    causeId,
    organizationId,
    userId,
    connectedAccountId,
    specialMessage,
    isTaxable = false,
    taxAmount = 0,
    totalAmount,
  } = payload;

  // Validate amount is reasonable
  if (totalAmount < 0.01 || totalAmount > 99999.99) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid donation amount!');
  }

  // Create Stripe Checkout Session
  const checkoutSessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    success_url:
      config.stripe.stripeSuccessUrl + `?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: config.stripe.stripeFailedUrl,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: causeId ? 'Donation for Cause' : 'General Donation',
            description: specialMessage || 'Thank you for your donation!',
          },
          unit_amount: Math.round(totalAmount * 100), //  Use totalAmount (includes tax)
        },
        quantity: 1,
      },
    ],
    metadata: {
      donationId,
      causeId: causeId || '',
      organizationId,
      userId,
      baseAmount: amount.toString(),
      isTaxable: isTaxable.toString(),
      taxAmount: taxAmount.toString(),
      totalAmount: totalAmount.toString(),
    },
  };

  // Always include payment intent data to ensure metadata transfer to Payment Intent
  checkoutSessionParams.payment_intent_data = {
    metadata: {
      donationId,
      causeId: causeId || '',
      organizationId,
      userId,
      specialMessage: specialMessage || '',
      baseAmount: amount.toString(),
      isTaxable: isTaxable.toString(),
      taxAmount: taxAmount.toString(),
      totalAmount: totalAmount.toString(),
    },
  };

  // Add connected account for transfers if provided
  if (connectedAccountId) {
    checkoutSessionParams.payment_intent_data.transfer_data = {
      destination: connectedAccountId,
    };
  }

  // Create session with error handling
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(checkoutSessionParams);
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create checkout session: ${(error as Error).message}`
    );
  }

  console.log({ session }, { depth: Infinity });

  return {
    sessionId: session.id,
    url: session.url!,
  };
};

// 3. Retrieve checkout session by ID
const retrieveCheckoutSession = async (
  sessionId: string
): Promise<Stripe.Checkout.Session> => {
  if (!sessionId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Session ID is required!');
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return session;
  } catch (error) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      `Checkout session not found: ${(error as Error).message}`
    );
  }
};

// 4. Create refund for payment intent
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

// 5. Create customer
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

// 6. Get payment intent details
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


// 7. Create payment intent for one-time donation
const createPaymentIntent = async (
  payload: IPaymentIntentRequest
): Promise<IPaymentIntentResponse> => {
  const {
    amount, // Base amount (before tax)
    isTaxable = false,
    taxAmount = 0,
    totalAmount, // Total amount to charge
    currency = 'usd',
    donorId,
    organizationId,
    causeId,
    connectedAccountId,
    specialMessage,
  } = payload;

  // Validate amount is reasonable
  if (totalAmount < 0.01 || totalAmount > 99999.99) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid donation amount!');
  }

  console.log(`💰 Creating Payment Intent with Tax:`);
  console.log(`   Base Amount: $${amount.toFixed(2)}`);
  console.log(`   Is Taxable: ${isTaxable}`);
  console.log(`   Tax Amount: $${taxAmount.toFixed(2)}`);
  console.log(`   Total Amount: $${totalAmount.toFixed(2)}`);

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
      isTaxable: isTaxable.toString(),
      taxAmount: taxAmount.toString(),
      totalAmount: totalAmount.toString(),
    },
    automatic_payment_methods: {
      enabled: true,
    },
  };

  // Add transfer data for connected accounts
  if (connectedAccountId) {
    paymentIntentParams.transfer_data = {
      destination: connectedAccountId,
    };
  }

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

// 8. Verify webhook signature
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

// 9. Create setup intent for saving payment method
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

// 10. Attach payment method to customer
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

// 11. Get payment method details
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

// 12. Detach payment method from customer
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


// 13. Create payment intent with saved payment method (for direct charges)
const createPaymentIntentWithMethod = async (
  payload: ICreatePaymentIntentWithMethodRequest
): Promise<IPaymentIntentResponse> => {
  const {
    amount, 
    isTaxable = false,
    taxAmount = 0,
    totalAmount, 
    currency = 'usd',
    customerId,
    paymentMethodId,
    donationId,
    organizationId,
    causeId,
    connectedAccountId,
    specialMessage,
  } = payload;

  // Validate amount
  if (totalAmount < 1 || totalAmount > 10000) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Invalid donation amount! Amount must be between $1 and $10,000.'
    );
  }

  console.log(`💳 Creating Payment Intent with Saved Method:`);
  console.log(`   Base Amount: $${amount.toFixed(2)}`);
  console.log(`   Is Taxable: ${isTaxable}`);
  console.log(`   Tax Amount: $${taxAmount.toFixed(2)}`);
  console.log(`   Total Amount: $${totalAmount.toFixed(2)}`);

  try {
    // Create payment intent with saved payment method
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: Math.round(totalAmount * 100), 
      currency,
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true, // Automatically confirm the payment
      return_url: config.stripe.stripeSuccessUrl, // Required for certain payment methods
      metadata: {
        donationId,
        organizationId,
        causeId,
        specialMessage: specialMessage || '',
        baseAmount: amount.toString(), // ✅ Store base amount
        isTaxable: isTaxable.toString(),
        taxAmount: taxAmount.toString(),
        totalAmount: totalAmount.toString(),
      },
    };

    // Add transfer data for connected accounts
    if (connectedAccountId) {
      paymentIntentParams.transfer_data = {
        destination: connectedAccountId,
      };
    }

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

// 14. List customer payment methods
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

// 15. Get or create customer by email
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

// 16. Create Stripe Connect account for organization
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
      type: 'express', // Express accounts are easier to onboard
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

// 17. Get Connect account details
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

// 18. Create new account link for re-onboarding
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


// 18. Create payment intent for round-up donation (webhook-based approach)
const createRoundUpPaymentIntent = async (
  payload: ICreateRoundUpPaymentIntentRequest
): Promise<{ client_secret: string; payment_intent_id: string }> => {
  try {
    const {
      roundUpId,
      userId,
      charityId,
      causeId,
      amount, // Base amount (before tax)
      isTaxable = false,
      taxAmount = 0,
      totalAmount, // Total amount to charge
      month,
      year,
      specialMessage,
      paymentMethodId,
      donationId,
    } = payload;

    console.log(`🔄 Creating RoundUp Payment Intent with Tax:`);
    console.log(`   RoundUp ID: ${roundUpId}`);
    console.log(`   Base Amount: $${amount.toFixed(2)}`);
    console.log(`   Is Taxable: ${isTaxable}`);
    console.log(`   Tax Amount: $${taxAmount.toFixed(2)}`);
    console.log(`   Total Amount: $${totalAmount.toFixed(2)}`);
    console.log(`   Month: ${month} ${year}`);

    // Get charity's Stripe Connect account
    const charity = await OrganizationModel.findById(charityId);
    if (!charity || !charity.stripeConnectAccountId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Charity does not have a connected Stripe account'
      );
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
        isTaxable: isTaxable.toString(),
        taxAmount: taxAmount.toString(),
        totalAmount: totalAmount.toString(),
      },

      // For connected accounts
      transfer_data: {
        destination: charity.stripeConnectAccountId,
      },
    };

    const paymentIntent = await stripe.paymentIntents.create(
      paymentIntentParams
    );

    console.log(`✅ RoundUp payment intent created: ${paymentIntent.id}`);
    console.log(`   Donation ID: ${donationId}`);
    console.log(`   RoundUp ID: ${roundUpId}`);
    console.log(`   Base Amount: $${amount.toFixed(2)}`);
    console.log(`   Tax Amount: $${taxAmount.toFixed(2)}`);
    console.log(`   Total Charged: $${totalAmount.toFixed(2)}`);
    console.log(`   Charity: ${charityId}`);

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

// 19. Process round-up donation transfer to charity (legacy - for webhook completion)
const processRoundUpDonation = async (payload: {
  roundUpId: string;
  userId: string;
  charityId: string;
  causeId?: string;
  amount: number;
  month: string;
  year: number;
  specialMessage?: string;
}): Promise<{ donationId: string; transferId: string }> => {
  try {
    // Get round-up config to check tax settings
    const roundUpConfig = await RoundUpModel.findById(payload.roundUpId);
    const isTaxable = roundUpConfig?.isTaxable || false;
    
    // Calculate tax
    const { taxAmount, totalAmount } = calculateTax(payload.amount, isTaxable);
    
    const charity = await OrganizationModel.findById(payload.charityId);
    if (!charity || !charity.stripeConnectAccountId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Charity does not have a connected Stripe account'
      );
    }

    if (payload.causeId) {
      const cause = await Cause.findById(payload.causeId);
      if (!cause) {
        throw new AppError(httpStatus.NOT_FOUND, 'Cause not found!');
      }
      if (cause.status !== CAUSE_STATUS_TYPE.VERIFIED) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          `Cannot create donation for cause with status: ${cause.status}. Only verified causes can receive donations.`
        );
      }
    }

    const transfer = await stripe.transfers.create({
      amount: Math.round(payload.amount * 100),
      currency: 'usd',
      destination: charity.stripeConnectAccountId,
      source_transaction: 'tok_visa',
      description: `Round-up donation for ${payload.month} ${payload.year}`,
      metadata: {
        roundUpId: payload.roundUpId,
        userId: payload.userId,
        charityId: payload.charityId,
        month: payload.month,
        year: payload.year.toString(),
        type: 'roundup_donation',
      },
    });

    const donor = await Client.findOne({ auth: payload.userId });
    if (!donor?._id) {
      throw new AppError(httpStatus.NOT_FOUND, 'Donor not found!');
    }

    const mainDonation = await Donation.create({
      donor: donor._id,
      organization: payload.charityId,
      cause: payload.causeId,
      donationType: 'round-up',
      amount: payload.amount,
      isTaxable,
      taxAmount,
      totalAmount,
      currency: 'USD',
      status: 'completed',
      donationDate: new Date(),
      stripePaymentIntentId: transfer.id,
      specialMessage:
        payload.specialMessage ||
        `Round-up donation for ${payload.month} ${payload.year}`,
      pointsEarned: Math.round(payload.amount * 100), // Points based on base amount
      connectedAccountId: charity.stripeConnectAccountId,
      roundUpId: payload.roundUpId,
      receiptGenerated: false,
      metadata: {
        userId: payload.userId,
        month: payload.month,
        year: payload.year.toString(),
        type: 'roundup_donation',
        description: `Round-up donation for ${payload.month} ${payload.year}`,
      },
    });

    return {
      donationId: String(mainDonation._id),
      transferId: transfer.id,
    };
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to process round-up donation: ${(error as Error).message}`
    );
  }
};

// 19. Cancel payment intent for one-time donation
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

export const StripeService = {
  // Checkout session methods (existing)
  createCheckoutSession,
  createCheckoutSessionWithDonation,
  retrieveCheckoutSession,

  // Payment intent methods
  createPaymentIntent,
  createPaymentIntentWithMethod,
  getPaymentIntent,
  cancelPaymentIntent,
  createRoundUpPaymentIntent,
  processRoundUpDonation,

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
};
