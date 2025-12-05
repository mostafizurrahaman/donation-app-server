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
import { calculateAustralianFees } from '../Donation/donation.constant';

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

// Create scheduled donation with tax calculation
const createScheduledDonation = async (
  userId: string,
  payload: TCreateScheduledDonation
): Promise<IScheduledDonationModel> => {
  const {
    organizationId,
    causeId,
    amount,
    coverFees = false, // Default to true
    frequency,
    customInterval,
    specialMessage,
    paymentMethodId,
  } = payload;

  // ✅ Calculate purely for logging/checking
  const financials = calculateAustralianFees(amount, coverFees);

  console.log(` Scheduled Donation Created:`);
  console.log(`   Base Amount: $${financials.baseAmount.toFixed(2)}`);
  console.log(`   Total Charge: $${financials.totalCharge.toFixed(2)}`);
  console.log(`   Cover Fees: ${coverFees}`);

  const user = await Client.findOne({ auth: userId });
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
  }

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

  const paymentMethod = await PaymentMethodService.getPaymentMethodById(
    paymentMethodId,
    userId
  );

  if (!paymentMethod.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment method is not active!');
  }

  const stripeCustomerId = paymentMethod.stripeCustomerId;
  const startDate = new Date();
  const nextDonationDate = calculateNextDonationDate(
    startDate,
    frequency,
    customInterval
  );

  const scheduledDonation = await ScheduledDonation.create({
    user: user._id,
    organization: new Types.ObjectId(organizationId),
    cause: new Types.ObjectId(causeId),

    amount: financials.baseAmount, // Save Base Amount
    coverFees, // Save preference

    // We don't save calculated totals here anymore as per model update

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

  let newAmount = scheduledDonation.amount;
  let newCoverFees = scheduledDonation.coverFees;

  if (payload.amount !== undefined) {
    scheduledDonation.amount = payload.amount;
    newAmount = payload.amount;
  }

  if (payload.coverFees !== undefined) {
    scheduledDonation.coverFees = payload.coverFees;
    newCoverFees = payload.coverFees;
  }

  // Log calculation for debugging (not saved to DB)
  const financials = calculateAustralianFees(newAmount, newCoverFees);
  console.log(`📝 Scheduled Donation Updated:`);
  console.log(`   Base: $${newAmount.toFixed(2)}`);
  console.log(`   Cover Fees: ${newCoverFees}`);
  console.log(`   Projected Total: $${financials.totalCharge.toFixed(2)}`);

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

const getScheduledDonationsDueForExecution = async (): Promise<
  IScheduledDonationModel[]
> => {
  const now = new Date();
  console.log({ now });

  const scheduledDonations = await ScheduledDonation.find({
    isActive: true,
    // nextDonationDate: { $lte: now },
  })
    .populate('user')
    .populate('organization')
    .populate('cause');

  return scheduledDonations;
};

// Execute scheduled donation (Cron Job Logic)
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

  //  Recalculate Fees at Execution Time
  // Rates might have changed, but user's preference (coverFees) remains
  const financials = calculateAustralianFees(
    scheduledDonation.amount,
    scheduledDonation.coverFees
  );

  console.log(`🔄 Executing Scheduled Donation:`);
  console.log(`   ID: ${scheduledDonationId}`);
  console.log(`   Base: $${financials.baseAmount.toFixed(2)}`);
  console.log(`   Total Charge: $${financials.totalCharge.toFixed(2)}`);
  console.log(`   Cover Fees: ${financials.coverFees}`);

  const idempotencyKey = `scheduled_${scheduledDonationId}_${Date.now()}_${Math.random()
    .toString(36)
    .substring(7)}`;

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }

      // Create payment intent with TOTAL CHARGE
      const paymentIntentParams: {
        amount: number;
        currency: string;
        customer: string;
        payment_method: string;
        confirm: boolean;
        off_session: boolean;
        metadata: Record<string, string>;
        description: string;
      } = {
        amount: Math.round(financials.totalCharge * 100),
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
          baseAmount: financials.baseAmount.toString(),
          totalAmount: financials.totalCharge.toString(),

          // ✅ Fee Breakdown for Stripe Audit
          coverFees: financials.coverFees.toString(),
          platformFee: financials.platformFee.toString(),
          gstOnFee: financials.gstOnFee.toString(),
          stripeFee: financials.stripeFee.toString(),
          netToOrg: financials.netToOrg.toString(),
        },
        description: scheduledDonation.specialMessage || 'Recurring donation',
      };

      const paymentIntent = await stripe.paymentIntents.create(
        paymentIntentParams,
        {
          idempotencyKey,
        }
      );

      // Create Donation record
      const donation = await Donation.create({
        donor: userId,
        organization: organizationId,
        cause: causeId,
        donationType: 'recurring',

        amount: financials.baseAmount,
        coverFees: financials.coverFees,
        platformFee: financials.platformFee,
        gstOnFee: financials.gstOnFee,
        stripeFee: financials.stripeFee,
        netAmount: financials.netToOrg,
        totalAmount: financials.totalCharge,

        currency: scheduledDonation.currency,
        status: 'processing',
        donationDate: new Date(),
        stripePaymentIntentId: paymentIntent.id,
        stripeChargeId: paymentIntent.latest_charge as string,
        stripeCustomerId: scheduledDonation.stripeCustomerId,
        stripePaymentMethodId: stripePaymentMethodId,
        specialMessage: scheduledDonation.specialMessage,
        pointsEarned: 0,
        scheduledDonationId: scheduledDonationId,
        idempotencyKey,
        paymentAttempts: attempt,
        lastPaymentAttempt: new Date(),
        receiptGenerated: false,
      });

      console.log(
        `✅ Created payment intent for donation ${donation._id} (status: processing)`
      );

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
        break;
      }

      if (attempt === MAX_RETRIES || !isRetryable) {
        try {
          await Donation.create({
            donor: userId,
            organization: organizationId,
            cause: causeId,
            donationType: 'recurring',
            amount: financials.baseAmount,
            coverFees: financials.coverFees,
            platformFee: financials.platformFee,
            gstOnFee: financials.gstOnFee,
            stripeFee: financials.stripeFee,
            netAmount: financials.netToOrg,
            totalAmount: financials.totalCharge,

            currency: scheduledDonation.currency,
            status: 'failed',
            donationDate: new Date(),
            stripeCustomerId: scheduledDonation.stripeCustomerId,
            stripePaymentMethodId: stripePaymentMethodId,
            specialMessage: scheduledDonation.specialMessage,
            pointsEarned: 0,

            scheduledDonationId: scheduledDonationId,
            idempotencyKey: `${idempotencyKey}_failed_${attempt}`,
            paymentAttempts: attempt,
            lastPaymentAttempt: new Date(),
            receiptGenerated: false,
          });
        } catch (createError) {
          // ignore
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
