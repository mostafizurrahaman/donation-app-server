import { Types } from 'mongoose';
import httpStatus from 'http-status';
import { ScheduledDonation } from './scheduledDonation.model';
import { IScheduledDonationModel } from '../Donation/donation.interface';
import {
  TCreateScheduledDonation,
  TUpdateScheduledDonation,
} from './scheduledDonation.validation';
import { AppError } from '../../utils';
import Client from '../Client/client.model';
import Organization from '../Organization/organization.model';
import Cause from '../Causes/causes.model';
import { CAUSE_STATUS_TYPE } from '../Causes/causes.constant';
import { PaymentMethodService } from '../PaymentMethod/paymentMethod.service';
import QueryBuilder from '../../builders/QueryBuilder';
import { Donation } from '../Donation/donation.model';
import { stripe } from '../../lib/stripeHelper';
import { IDonationModel } from '../Donation/donation.interface';
import { IPaymentMethodModel } from '../PaymentMethod/paymentMethod.interface';
import { IORGANIZATION } from '../Organization/organization.interface';
import { calculateTax } from '../Donation/donation.constant'; // ✅ NEW import

// Helper function to calculate next donation date
const calculateNextDonationDate = (
  currentDate: Date,
  frequency: string,
  customInterval?: { value: number; unit: 'days' | 'weeks' | 'months' }
): Date => {
  const nextDate = new Date(currentDate);

  switch (frequency) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'quarterly':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case 'yearly':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
    case 'custom':
      if (!customInterval) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Custom interval is required for custom frequency'
        );
      }
      switch (customInterval.unit) {
        case 'days':
          nextDate.setDate(nextDate.getDate() + customInterval.value);
          break;
        case 'weeks':
          nextDate.setDate(nextDate.getDate() + customInterval.value * 7);
          break;
        case 'months':
          nextDate.setMonth(nextDate.getMonth() + customInterval.value);
          break;
      }
      break;
    default:
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid frequency');
  }

  return nextDate;
};

//  Create scheduled donation with tax calculation
const createScheduledDonation = async (
  userId: string,
  payload: TCreateScheduledDonation
): Promise<IScheduledDonationModel> => {
  const {
    organizationId,
    causeId,
    amount,
    isTaxable = false, 
    frequency,
    customInterval,
    specialMessage,
    paymentMethodId,
  } = payload;

  // Calculate tax and total amount for template
  const { taxAmount, totalAmount } = calculateTax(amount, isTaxable);

  console.log(`📅 Scheduled Donation Created:`);
  console.log(`   Base Amount: $${amount.toFixed(2)}`);
  console.log(`   Tax Amount: $${taxAmount.toFixed(2)}`);
  console.log(`   Total Amount: $${totalAmount.toFixed(2)}`);
  console.log(`   Is Taxable: ${isTaxable}`);
  console.log(`   Frequency: ${frequency}`);

  // Validate user exists
  const user = await Client.findOne({ auth: userId });
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  // Validate organization exists
  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
  }

  // Validate cause exists and is verified
  const cause = await Cause.findById(causeId);
  if (!cause) {
    throw new AppError(httpStatus.NOT_FOUND, 'Cause not found!');
  }
  if (cause.status !== CAUSE_STATUS_TYPE.VERIFIED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot create scheduled donation for cause with status: ${cause.status}. Only verified causes can receive donations.`
    );
  }

  // Verify payment method exists and belongs to user
  const paymentMethod = await PaymentMethodService.getPaymentMethodById(
    paymentMethodId,
    userId
  );

  if (!paymentMethod.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment method is not active!');
  }

  // Get Stripe customer ID from payment method
  const stripeCustomerId = paymentMethod.stripeCustomerId;

  // Set start date to current date
  const startDate = new Date();

  // Calculate next donation date
  const nextDonationDate = calculateNextDonationDate(
    startDate,
    frequency,
    customInterval
  );

  //  Create scheduled donation with tax fields
  const scheduledDonation = await ScheduledDonation.create({
    user: user._id,
    organization: new Types.ObjectId(organizationId),
    cause: new Types.ObjectId(causeId),
    amount, // Base amount
    isTaxable,
    taxAmount,
    totalAmount,

    currency: 'USD',
    frequency,
    customInterval,
    startDate,
    nextDonationDate,
    isActive: true,
    totalExecutions: 0,
    specialMessage,
    stripeCustomerId,
    paymentMethod,
  });

  return scheduledDonation;
};

// 2. Get user's scheduled donations with filters and pagination 
const getUserScheduledDonations = async (
  userId: string,
  query: Record<string, unknown>
): Promise<{
  scheduledDonations: IScheduledDonationModel[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPage: number;
  };
}> => {
  const user = await Client.findOne({ auth: userId });
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const baseQuery: Record<string, unknown> = { user: user._id };

  if (query.isActive && query.isActive !== 'all') {
    baseQuery.isActive = query.isActive === 'true';
  }

  if (query.frequency && query.frequency !== 'all') {
    baseQuery.frequency = query.frequency;
  }

  const queryBuilderQuery = { ...query };
  delete queryBuilderQuery.isActive;
  delete queryBuilderQuery.frequency;

  const searchableFields = ['specialMessage'];

  const scheduledDonationQuery = new QueryBuilder(
    ScheduledDonation.find(baseQuery)
      .populate('organization', 'name email logo')
      .populate('cause', 'name description icon'),
    queryBuilderQuery
  )
    .search(searchableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  const scheduledDonations = await scheduledDonationQuery.modelQuery;
  const meta = await scheduledDonationQuery.countTotal();

  return {
    scheduledDonations,
    meta,
  };
};

// 3. Get scheduled donation by ID 
const getScheduledDonationById = async (
  userId: string,
  scheduledDonationId: string
): Promise<IScheduledDonationModel> => {
  const user = await Client.findOne({ auth: userId });
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const scheduledDonation = await ScheduledDonation.findOne({
    _id: scheduledDonationId,
    user: user._id,
  })
    .populate('organization', 'name email logo')
    .populate('cause', 'name description icon');

  if (!scheduledDonation) {
    throw new AppError(httpStatus.NOT_FOUND, 'Scheduled donation not found!');
  }

  return scheduledDonation;
};

// Update scheduled donation - recalculate tax if amount or isTaxable changes
const updateScheduledDonation = async (
  userId: string,
  scheduledDonationId: string,
  payload: TUpdateScheduledDonation
): Promise<IScheduledDonationModel> => {
  const user = await Client.findOne({ auth: userId });
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const scheduledDonation = await ScheduledDonation.findOne({
    _id: scheduledDonationId,
    user: user._id,
  });

  if (!scheduledDonation) {
    throw new AppError(httpStatus.NOT_FOUND, 'Scheduled donation not found!');
  }

  // Track if we need to recalculate tax
  let needsTaxRecalculation = false;
  let newAmount = scheduledDonation.amount;
  let newIsTaxable = scheduledDonation.isTaxable;

  // Update amount if provided
  if (payload.amount !== undefined) {
    scheduledDonation.amount = payload.amount;
    newAmount = payload.amount;
    needsTaxRecalculation = true;
  }

  // Update isTaxable if provided
  if (payload.isTaxable !== undefined) {
    scheduledDonation.isTaxable = payload.isTaxable;
    newIsTaxable = payload.isTaxable;
    needsTaxRecalculation = true;
  }

  // Recalculate tax if needed
  if (needsTaxRecalculation) {
    const { taxAmount, totalAmount } = calculateTax(newAmount, newIsTaxable);
    scheduledDonation.taxAmount = taxAmount;
    scheduledDonation.totalAmount = totalAmount;

    console.log(`📝 Scheduled Donation Updated with new tax calculation:`);
    console.log(`   Base Amount: $${newAmount.toFixed(2)}`);
    console.log(`   Tax Amount: $${taxAmount.toFixed(2)}`);
    console.log(`   Total Amount: $${totalAmount.toFixed(2)}`);
  }

  // Update other fields
  if (payload.frequency !== undefined) {
    scheduledDonation.frequency = payload.frequency;
  }

  if (payload.customInterval !== undefined) {
    scheduledDonation.customInterval = payload.customInterval;
  }

  if (payload.specialMessage !== undefined) {
    scheduledDonation.specialMessage = payload.specialMessage;
  }

  if (payload.isActive !== undefined) {
    scheduledDonation.isActive = payload.isActive;
  }

  // Recalculate next donation date if frequency or customInterval changed
  if (payload.frequency !== undefined || payload.customInterval !== undefined) {
    const nextDate = calculateNextDonationDate(
      new Date(),
      scheduledDonation.frequency,
      scheduledDonation.customInterval
    );
    scheduledDonation.nextDonationDate = nextDate;
  }

  await scheduledDonation.save();

  return scheduledDonation;
};

// 5. Pause scheduled donation 
const pauseScheduledDonation = async (
  userId: string,
  scheduledDonationId: string
): Promise<IScheduledDonationModel> => {
  const user = await Client.findOne({ auth: userId });
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const scheduledDonation = await ScheduledDonation.findOneAndUpdate(
    { _id: scheduledDonationId, user: user._id },
    { isActive: false },
    { new: true }
  )
    .populate('organization', 'name email logo')
    .populate('cause', 'name description icon');

  if (!scheduledDonation) {
    throw new AppError(httpStatus.NOT_FOUND, 'Scheduled donation not found!');
  }

  return scheduledDonation;
};

// 6. Resume scheduled donation 
const resumeScheduledDonation = async (
  userId: string,
  scheduledDonationId: string
): Promise<IScheduledDonationModel> => {
  const user = await Client.findOne({ auth: userId });
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const scheduledDonation = await ScheduledDonation.findOne({
    _id: scheduledDonationId,
    user: user._id,
  });

  if (!scheduledDonation) {
    throw new AppError(httpStatus.NOT_FOUND, 'Scheduled donation not found!');
  }

  const nextDate = calculateNextDonationDate(
    new Date(),
    scheduledDonation.frequency,
    scheduledDonation.customInterval
  );

  scheduledDonation.isActive = true;
  scheduledDonation.nextDonationDate = nextDate;

  await scheduledDonation.save();

  await scheduledDonation.populate('organization', 'name email logo');
  await scheduledDonation.populate('cause', 'name description');

  return scheduledDonation;
};

// 7. Cancel scheduled donation 
const cancelScheduledDonation = async (
  userId: string,
  scheduledDonationId: string
): Promise<void> => {
  const user = await Client.findOne({ auth: userId });
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const result = await ScheduledDonation.findOneAndDelete({
    _id: scheduledDonationId,
    user: user._id,
  });

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Scheduled donation not found!');
  }
};

// 8. Get scheduled donations due for execution 
const getScheduledDonationsDueForExecution = async (): Promise<
  IScheduledDonationModel[]
> => {
  const now = new Date();

  const scheduledDonations = await ScheduledDonation.find({
    isActive: true,
    nextDonationDate: { $lte: now },
  })
    .populate('user')
    .populate('organization')
    .populate('cause');

  return scheduledDonations;
};

// Execute scheduled donation - use stored tax values
const executeScheduledDonation = async (
  scheduledDonationId: string
): Promise<IDonationModel> => {
  const scheduledDonation = await ScheduledDonation.findById(
    scheduledDonationId
  )
    .populate('user')
    .populate('organization')
    .populate('cause')
    .populate('paymentMethod');

  if (!scheduledDonation) {
    throw new AppError(httpStatus.NOT_FOUND, 'Scheduled donation not found!');
  }

  if (!scheduledDonation.isActive) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Scheduled donation is not active!'
    );
  }

  if (!scheduledDonation.paymentMethod) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment method not found!');
  }

  const userId = (
    scheduledDonation.user._id || scheduledDonation.user
  ).toString();
  const organizationId = (
    scheduledDonation.organization._id || scheduledDonation.organization
  ).toString();
  const causeId = (
    scheduledDonation.cause._id || scheduledDonation.cause
  ).toString();

  const paymentMethod =
    scheduledDonation.paymentMethod as unknown as IPaymentMethodModel;

  if (!paymentMethod.isActive) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Payment method is not active! Please update your payment method.'
    );
  }

  const stripePaymentMethodId = paymentMethod.stripePaymentMethodId;

  if (!stripePaymentMethodId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Invalid payment method configuration!'
    );
  }

  const organization =
    scheduledDonation.organization as unknown as IORGANIZATION;
  const connectedAccountId = organization.stripeConnectAccountId;

  if (!connectedAccountId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Organization "${organization.name}" has not set up payment receiving. Scheduled donation paused.`
    );
  }

  if (
    !scheduledDonation.user ||
    !scheduledDonation.organization ||
    !scheduledDonation.cause
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Scheduled donation has invalid references. Missing user, organization, or cause.'
    );
  }

  const cause = await Cause.findById(causeId);
  if (!cause) {
    throw new AppError(httpStatus.NOT_FOUND, 'Cause not found!');
  }
  if (cause.status !== CAUSE_STATUS_TYPE.VERIFIED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot execute scheduled donation for cause with status: ${cause.status}. Only verified causes can receive donations.`
    );
  }

  // ✅  Use stored tax values from scheduled donation template
  const amount = scheduledDonation.amount;
  const isTaxable = scheduledDonation.isTaxable;
  const taxAmount = scheduledDonation.taxAmount;
  const totalAmount = scheduledDonation.totalAmount;

  console.log(`🔄 Executing Scheduled Donation:`);
  console.log(`   Scheduled Donation ID: ${scheduledDonationId}`);
  console.log(`   Base Amount: $${amount.toFixed(2)}`);
  console.log(`   Tax Amount: $${taxAmount.toFixed(2)}`);
  console.log(`   Total Amount to Charge: $${totalAmount.toFixed(2)}`);
  console.log(`   Is Taxable: ${isTaxable}`);

  const idempotencyKey = `scheduled_${scheduledDonationId}_${Date.now()}_${Math.random()
    .toString(36)
    .substring(7)}`;

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        console.log(
          `🔄 Retry attempt ${attempt}/${MAX_RETRIES} for donation ${scheduledDonationId}`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }

      // Create payment intent with TOTAL AMOUNT (tax included)
      const paymentIntentParams: {
        amount: number;
        currency: string;
        customer: string;
        payment_method: string;
        confirm: boolean;
        off_session: boolean;
        metadata: Record<string, string>;
        description: string;
        transfer_data: { destination: string };
      } = {
        amount: Math.round(totalAmount * 100), 
        currency: scheduledDonation.currency.toLowerCase(),
        customer: scheduledDonation.stripeCustomerId,
        payment_method: stripePaymentMethodId,
        confirm: true,
        off_session: true,
        metadata: {
          scheduledDonationId: scheduledDonationId.toString(),
          userId: userId,
          organizationId: organizationId,
          causeId: causeId,
          donationType: 'recurring',
          specialMessage: scheduledDonation.specialMessage || '',
          baseAmount: amount.toString(),
          isTaxable: isTaxable.toString(),
          taxAmount: taxAmount.toString(),
          totalAmount: totalAmount.toString(),
        },
        description: scheduledDonation.specialMessage || 'Recurring donation',
        transfer_data: {
          destination: connectedAccountId,
        },
      };

      const paymentIntent = await stripe.paymentIntents.create(
        paymentIntentParams,
        {
          idempotencyKey,
        }
      );

      // Create Donation record with tax fields
      const donation = await Donation.create({
        donor: userId,
        organization: organizationId,
        cause: causeId,
        donationType: 'recurring',
        amount, // Base amount
        isTaxable,
        taxAmount,
        totalAmount, // Total amount charged

        currency: scheduledDonation.currency,
        status: 'processing',
        donationDate: new Date(),
        stripePaymentIntentId: paymentIntent.id,
        stripeChargeId: paymentIntent.latest_charge as string,
        stripeCustomerId: scheduledDonation.stripeCustomerId,
        stripePaymentMethodId: stripePaymentMethodId,
        specialMessage: scheduledDonation.specialMessage,
        pointsEarned: 0, 
        connectedAccountId,
        scheduledDonationId: scheduledDonationId,
        idempotencyKey,
        paymentAttempts: attempt,
        lastPaymentAttempt: new Date(),
        receiptGenerated: false,
      });

      console.log(
        `✅ Created payment intent for donation ${donation._id} (status: processing)`
      );
      console.log(`   Payment Intent ID: ${paymentIntent.id}`);
      console.log(`   Total Charged: $${totalAmount.toFixed(2)}`);
      console.log(
        `   Points will be awarded on webhook: ${Math.floor(
          amount * 100
        )} (based on base amount)`
      );
      console.log(`   Waiting for webhook confirmation...`);

      return donation;
    } catch (error: unknown) {
      const err = error as Error & {
        code?: string;
        type?: string;
        message: string;
      };
      lastError = err;
      console.error(
        `❌ Attempt ${attempt}/${MAX_RETRIES} failed for donation ${scheduledDonationId}: ${err.message}`
      );

      const isRetryable =
        err.code === 'card_declined' ||
        err.code === 'insufficient_funds' ||
        err.type === 'api_connection_error' ||
        err.type === 'api_error';

      if (!isRetryable && attempt < MAX_RETRIES) {
        console.log(
          `⏭️  Error not retryable, stopping attempts for ${scheduledDonationId}`
        );
        break;
      }

      if (attempt === MAX_RETRIES || !isRetryable) {
        try {
          await Donation.create({
            donor: userId,
            organization: organizationId,
            cause: causeId,
            donationType: 'recurring',

            //  Include tax fields in failed donation
            amount,
            isTaxable,
            taxAmount,
            totalAmount,

            currency: scheduledDonation.currency,
            status: 'failed',
            donationDate: new Date(),
            stripeCustomerId: scheduledDonation.stripeCustomerId,
            stripePaymentMethodId: stripePaymentMethodId,
            specialMessage: scheduledDonation.specialMessage,
            pointsEarned: 0,
            connectedAccountId,
            scheduledDonationId: scheduledDonationId,
            idempotencyKey: `${idempotencyKey}_failed_${attempt}`,
            paymentAttempts: attempt,
            lastPaymentAttempt: new Date(),
            receiptGenerated: false,
          });
        } catch (createError: unknown) {
          const createErr = createError as Error;
          console.error(
            `⚠️  Failed to create failed donation record: ${createErr.message}`
          );
        }

        throw new AppError(
          httpStatus.BAD_REQUEST,
          `Failed to process recurring donation after ${attempt} attempts: ${err.message}`
        );
      }
    }
  }

  throw new AppError(
    httpStatus.INTERNAL_SERVER_ERROR,
    `Unexpected error processing donation: ${
      lastError?.message || 'Unknown error'
    }`
  );
};

// 10. Update scheduled donation after execution 
const updateScheduledDonationAfterExecution = async (
  scheduledDonationId: string,
  success: boolean
): Promise<void> => {
  const scheduledDonation = await ScheduledDonation.findById(
    scheduledDonationId
  );

  if (!scheduledDonation) {
    throw new AppError(httpStatus.NOT_FOUND, 'Scheduled donation not found!');
  }

  if (success) {
    scheduledDonation.lastExecutedDate = new Date();
    scheduledDonation.totalExecutions += 1;

    const nextDate = calculateNextDonationDate(
      new Date(),
      scheduledDonation.frequency,
      scheduledDonation.customInterval
    );
    scheduledDonation.nextDonationDate = nextDate;

    if (scheduledDonation.endDate && nextDate > scheduledDonation.endDate) {
      scheduledDonation.isActive = false;
    }

    await scheduledDonation.save();
  }
};

export const ScheduledDonationService = {
  createScheduledDonation,
  getUserScheduledDonations,
  getScheduledDonationById,
  updateScheduledDonation,
  pauseScheduledDonation,
  resumeScheduledDonation,
  cancelScheduledDonation,
  getScheduledDonationsDueForExecution,
  executeScheduledDonation,
  updateScheduledDonationAfterExecution,
};
