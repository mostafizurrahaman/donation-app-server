/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import mongoose from 'mongoose';
import { Donation } from './donation.model';
import {
  CategoryData,
  IAnalyticsPeriod,
  IDonation,
  IDonationAnalytics,
  IDonationModel,
  IDonationTypeBreakdown,
  ICauseMonthlyStat,
  IOrganizationStatsResponse,
  IPercentageChange,
  IRecentDonor,
  ITopDonor,
  MonthlyTrend,
  TTimeFilter,
  IClientDonationStats,
  IDonationWithTracking,
} from './donation.interface';
import { TCreateOneTimeDonationPayload } from './donation.validation';
import { AppError } from '../../utils';
import httpStatus from 'http-status';
import { StripeService } from '../Stripe/stripe.service';
import { ICheckoutSessionResponse } from '../Stripe/stripe.interface';
import Organization from '../Organization/organization.model';
import { PaymentMethodService } from '../PaymentMethod/paymentMethod.service';
import Client from '../Client/client.model';
import QueryBuilder from '../../builders/QueryBuilder';
import {
  buildBaseQuery,
  calculatePercentageChange,
  calculateStreaks,
  formatCurrency,
  getDateRanges,
} from '../../lib/filter-helper';
import { IAuth } from '../Auth/auth.interface';
import Cause from '../Causes/causes.model';
import { CAUSE_STATUS_TYPE } from '../Causes/causes.constant';
import {
  calculateAustralianFees,
  monthAbbreviations,
  REFUND_WINDOW_DAYS,
} from './donation.constant';
import { ScheduledDonation } from '../ScheduledDonation/scheduledDonation.model';
import { RoundUpModel } from '../RoundUp/roundUp.model';
import { StripeAccount } from '../OrganizationAccount/stripe-account.model';
import { Subscription } from '../Subscription/subscription.model';
import { SubscriptionService } from '../Subscription/subscription.service';

// Helper function to generate unique idempotency key
const generateIdempotencyKey = (): string => {
  return `don-${new Types.ObjectId().toString()}-${Date.now()}`;
};

// 1. Create one-time donation with Payment Intent (Destination Charge)
const createOneTimeDonation = async (
  payload: TCreateOneTimeDonationPayload & {
    userId: string;
  }
) => {
  const {
    amount,
    coverFees = false,
    causeId,
    organizationId,
    userId,
    paymentMethodId,
    specialMessage,
  } = payload;

  // 1. Check if donor exists
  const donor = await Client.findOne({ auth: userId });
  if (!donor?._id) {
    throw new AppError(httpStatus.NOT_FOUND, 'Donor not found!');
  }

  // 2. Validate organization exists
  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
  }

  // 3. Get Stripe Account from dedicated model
  const stripeAccount = await StripeAccount.findOne({
    organization: organizationId,
    status: 'active',
  });

  if (!stripeAccount || !stripeAccount.chargesEnabled) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This organization is not set up to receive payments (Stripe account inactive).'
    );
  }

  // 4. Validate cause exists and is verified
  let cause = null;
  if (causeId) {
    cause = await Cause.findById(causeId);
    if (!cause) {
      throw new AppError(httpStatus.NOT_FOUND, 'Cause not found!');
    }
    if (cause.status !== CAUSE_STATUS_TYPE.VERIFIED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Cannot create donation for cause with status: ${cause.status}.`
      );
    }
  }

  // 5. Validate Payment Method
  const paymentMethod = await PaymentMethodService.getPaymentMethodById(
    paymentMethodId,
    userId
  );

  if (!paymentMethod.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment method is not active!');
  }

  // 6. Calculate Fees
  const financials = calculateAustralianFees(amount, coverFees);
  const applicationFee = financials.platformFeeWithStripe;
  console.log(`💰 Donation Breakdown (Destination Charge):`);
  console.log(`   Base: $${financials.baseAmount.toFixed(2)}`);
  console.log(`   App Fee: $${applicationFee.toFixed(2)}`);
  console.log(`   Stripe Fee: $${financials.stripeFee.toFixed(2)}`);
  console.log(`   Total Charged: $${financials.totalCharge.toFixed(2)}`);
  console.log(`   Net To Org: $${financials.netToOrg.toFixed(2)}`);
  // Generate idempotency key
  const idempotencyKey = generateIdempotencyKey();

  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const donationUniqueId = new Types.ObjectId();

    // 7. Create Donation Record
    const donation = new Donation({
      _id: donationUniqueId,
      donor: new Types.ObjectId(donor._id),
      organization: new Types.ObjectId(organizationId),
      cause: cause ? new Types.ObjectId(cause._id) : undefined,
      donationType: 'one-time',

      amount: financials.baseAmount,
      coverFees: financials.coverFees,
      platformFee: financials.platformFee,
      gstOnFee: financials.gstOnFee,
      stripeFee: financials.stripeFee,
      netAmount: financials.netToOrg,
      totalAmount: financials.totalCharge,

      currency: 'USD',
      status: 'pending',
      specialMessage,
      pointsEarned: Math.floor(financials.baseAmount * 100),

      stripeCustomerId: paymentMethod.stripeCustomerId,
      stripePaymentMethodId: paymentMethod.stripePaymentMethodId,
      idempotencyKey,
      createdAt: new Date(),
    });

    const savedDonation = await donation.save({ session });

    // 8. Create Payment Intent (Destination Charge)
    const paymentIntent = await StripeService.createPaymentIntentWithMethod({
      amount: financials.baseAmount,
      totalAmount: financials.totalCharge,
      applicationFee: applicationFee,

      orgStripeAccountId: stripeAccount.stripeAccountId,

      coverFees: financials.coverFees,
      platformFee: financials.platformFee,
      gstOnFee: financials.gstOnFee,
      stripeFee: financials.stripeFee,
      netToOrg: financials.netToOrg,

      currency: 'USD',
      customerId: paymentMethod.stripeCustomerId,
      paymentMethodId: paymentMethod.stripePaymentMethodId,
      donationId: donationUniqueId.toString(),
      organizationId,
      causeId: causeId || '',
      specialMessage,
    });

    savedDonation.stripePaymentIntentId = paymentIntent.payment_intent_id;
    savedDonation.status = 'processing';
    await savedDonation.save({ session });

    await session.commitTransaction();

    return {
      donation: savedDonation,
      paymentIntent,
    };
  } catch (error: unknown) {
    await session.abortTransaction();
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create donation: ${errorMessage}`
    );
  } finally {
    await session.endSession();
  }
};

// 2. Get donation by ID
const getDonationById = async (donationId: string): Promise<IDonation> => {
  if (!donationId || donationId.trim() === '') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Donation ID is required!');
  }

  const donation = await Donation.findById(donationId)
    .populate('donor', '_id name auth address state postalCode image ')
    .populate('organization', 'name')
    .populate('cause', 'name description')
    .populate('receiptId', '_id receiptNumber pdfKey pdfUrl');

  if (!donation) {
    throw new AppError(httpStatus.NOT_FOUND, 'Donation not found!');
  }

  if (!donation.donor) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Donor information not available.'
    );
  }

  return donation as IDonation;
};

// 3. Update donation status
const updateDonationStatus = async (
  donationId: string,
  status: 'completed' | 'failed' | 'refunded',
  stripePaymentIntentId?: string,
  stripeCustomerId?: string
): Promise<IDonation> => {
  const updateData: Record<string, unknown> = { status };

  if (stripePaymentIntentId) {
    updateData.stripePaymentIntentId = stripePaymentIntentId;
  }

  if (stripeCustomerId) {
    updateData.stripeCustomerId = stripeCustomerId;
  }

  const donation = await Donation.findByIdAndUpdate(
    donationId,
    { $set: updateData },
    { new: true }
  )
    .populate('donor', 'name email')
    .populate('organization', 'name')
    .populate('cause', 'name description');

  if (!donation) {
    throw new AppError(httpStatus.NOT_FOUND, 'Donation not found');
  }

  return donation;
};

// 4. Find donation by payment intent ID
const findDonationByPaymentIntentId = async (
  paymentIntentId: string
): Promise<IDonation | null> => {
  const donation = await Donation.findOne({
    stripePaymentIntentId: paymentIntentId,
  })
    .populate('donor', 'name email')
    .populate('organization', 'name')
    .populate('cause', 'name description');

  return donation ? (donation as IDonation) : null;
};

// 5. Update donation status by payment intent ID
const updateDonationStatusByPaymentIntent = async (
  paymentIntentId: string,
  status: 'completed' | 'failed' | 'refunded'
): Promise<IDonation | null> => {
  const donation = await findDonationByPaymentIntentId(paymentIntentId);

  if (!donation) {
    return null;
  }

  const updateData: Record<string, unknown> = { status };
  return await Donation.findOneAndUpdate(
    { stripePaymentIntentId: paymentIntentId },
    { $set: updateData },
    { new: true }
  )
    .populate('donor', 'name email')
    .populate('organization', 'name')
    .populate('cause', 'name description');
};

// 6. Get donations by user with filters
const getDonationsByUser = async (
  userId: string,
  query: Record<string, unknown>
) => {
  if (!userId || userId.trim() === '') {
    throw new AppError(httpStatus.BAD_REQUEST, 'User ID is required!');
  }

  const donor = await Client.findOne({ auth: userId });
  if (!donor?._id) {
    throw new AppError(httpStatus.NOT_FOUND, 'Donor not found!');
  }

  try {
    const modifiedQuery = { ...query };
    if (modifiedQuery.status === 'all') delete modifiedQuery.status;
    if (modifiedQuery.donationType === 'all') delete modifiedQuery.donationType;

    const baseQuery = Donation.find({ donor: donor._id })
      .populate('organization', 'name')
      .populate('cause', 'name');

    const donationSearchFields = ['specialMessage', 'status', 'donationType'];

    const donationQuery = new QueryBuilder<IDonationModel>(
      baseQuery,
      modifiedQuery
    )
      .search(donationSearchFields)
      .filter()
      .sort()
      .paginate()
      .fields();

    const donations = await donationQuery.modelQuery;
    const meta = await donationQuery.countTotal();

    return { donations, meta };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to retrieve donations: ${errorMessage}`
    );
  }
};

// 7. Get donations by organization with filters
const getDonationsByOrganization = async (
  organizationId: string,
  query: Record<string, unknown>
) => {
  if (!organizationId || organizationId.trim() === '') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Organization ID is required!');
  }

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
  }

  try {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;
    const sortBy = (query.sort as string) || '-createdAt';
    const searchTerm = (query.searchTerm as string) || '';

    // 1. Build the Match stage for primary filters
    const matchQuery: any = {
      organization: new Types.ObjectId(organizationId),
    };

    // Apply filters from query (excluding special keys)
    if (query.status && query.status !== 'all') {
      matchQuery.status = query.status;
    }
    if (query.donationType && query.donationType !== 'all') {
      matchQuery.donationType =
        query.donationType === 'roundup' ? 'round-up' : query.donationType;
    }

    const pipeline: any[] = [
      { $match: matchQuery },

      // 2. Lookup Donor (Client) details
      {
        $lookup: {
          from: 'clients',
          localField: 'donor',
          foreignField: '_id',
          as: 'donorData',
        },
      },
      { $unwind: { path: '$donorData', preserveNullAndEmptyArrays: true } },

      // 3. Lookup Donor Auth (for Email)
      {
        $lookup: {
          from: 'auths',
          localField: 'donorData.auth',
          foreignField: '_id',
          as: 'authData',
        },
      },
      { $unwind: { path: '$authData', preserveNullAndEmptyArrays: true } },

      // 4. Lookup Cause
      {
        $lookup: {
          from: 'causes',
          localField: 'cause',
          foreignField: '_id',
          as: 'causeData',
        },
      },
      { $unwind: { path: '$causeData', preserveNullAndEmptyArrays: true } },

      // 5. Lookup Receipt
      {
        $lookup: {
          from: 'receipts',
          localField: 'receiptId',
          foreignField: '_id',
          as: 'receiptData',
        },
      },
      { $unwind: { path: '$receiptData', preserveNullAndEmptyArrays: true } },

      // 6. Search Filter (Applies to Name, Email, and Special Message)
      ...(searchTerm
        ? [
            {
              $match: {
                $or: [
                  { 'donorData.name': { $regex: searchTerm, $options: 'i' } },
                  { 'authData.email': { $regex: searchTerm, $options: 'i' } },
                  { specialMessage: { $regex: searchTerm, $options: 'i' } },
                ],
              },
            },
          ]
        : []),

      // 7. Facet for pagination and total count
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            // Handle Sorting
            {
              $sort: {
                [sortBy.startsWith('-') ? sortBy.substring(1) : sortBy]:
                  sortBy.startsWith('-') ? -1 : 1,
              },
            },
            { $skip: skip },
            { $limit: limit },
            // Project into the exact structure expected by the frontend
            {
              $project: {
                _id: 1,
                amount: 1,
                totalAmount: 1,
                netAmount: 1,
                currency: 1,
                status: 1,
                donationType: 1,
                donationDate: 1,
                specialMessage: 1,
                coverFees: 1,
                platformFee: 1,
                gstOnFee: 1,
                stripeFee: 1,
                donor: {
                  _id: '$donorData._id',
                  name: '$donorData.name',
                  image: '$donorData.image',
                  auth: {
                    email: '$authData.email',
                  },
                },
                cause: {
                  _id: '$causeData._id',
                  name: '$causeData.name',
                },
                receiptId: '$receiptData',
              },
            },
          ],
        },
      },
    ];

    const aggregationResult = await Donation.aggregate(pipeline);

    const donations = aggregationResult[0]?.data || [];
    const total = aggregationResult[0]?.metadata[0]?.total || 0;

    return {
      donations,
      meta: {
        page,
        limit,
        total,
        totalPage: Math.ceil(total / limit),
      },
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to retrieve organization donations: ${errorMessage}`
    );
  }
};

// 8. Get donation statistics
const getDonationStatistics = async (
  userId?: string,
  organizationId?: string
) => {
  const matchStage: Record<string, unknown> = {};
  if (userId) matchStage.donor = new Types.ObjectId(userId);
  if (organizationId)
    matchStage.organization = new Types.ObjectId(organizationId);

  const stats = await Donation.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalDonations: { $sum: 1 },
        totalAmount: { $sum: '$amount' }, // Summing Base Amount
        completedDonations: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
        },
        pendingDonations: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
        },
        failedDonations: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
        },
        refundedDonations: {
          $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] },
        },
        canceledDonations: {
          $sum: { $cond: [{ $eq: ['$status', 'canceled'] }, 1, 0] },
        },
        totalPointsEarned: { $sum: '$pointsEarned' },
        averageDonationAmount: { $avg: '$amount' },
      },
    },
  ]);

  return (
    stats[0] || {
      totalDonations: 0,
      totalAmount: 0,
      completedDonations: 0,
      pendingDonations: 0,
      failedDonations: 0,
      totalPointsEarned: 0,
      averageDonationAmount: 0,
    }
  );
};

// 9. Update donation with payment status
const updateDonationPaymentStatus = async (
  paymentIntentId: string,
  status: 'completed' | 'failed',
  paymentData?: {
    chargeId?: string;
    customerId?: string;
    failureReason?: string;
    failureCode?: string;
  }
): Promise<IDonation | null> => {
  const donation = await findDonationByPaymentIntentId(paymentIntentId);

  if (!donation) {
    return null;
  }

  const donationWithTracking = donation as IDonationWithTracking;

  const updateData: Record<string, unknown> = {
    status: status === 'completed' ? 'completed' : 'failed',
    paymentAttempts: (donationWithTracking.paymentAttempts || 0) + 1,
    lastPaymentAttempt: new Date(),
  };

  if (paymentData?.chargeId) {
    updateData.stripeChargeId = paymentData.chargeId;
  }

  if (paymentData?.customerId) {
    updateData.stripeCustomerId = paymentData.customerId;
  }

  if (status === 'failed' && paymentData?.failureReason) {
    updateData.specialMessage = `${
      donation.specialMessage || ''
    }\n[Payment Failed: ${paymentData.failureReason}]`;
  }

  return (await Donation.findByIdAndUpdate(
    String(donationWithTracking._id),
    { $set: updateData },
    { new: true }
  )
    .populate('donor', 'name email')
    .populate('organization', 'name')
    .populate('cause', 'name description')) as unknown as IDonation;
};

// 10. Retry failed payment (Refactored for Destination Charge)
const retryFailedPayment = async (
  donationId: string
): Promise<{ donation: IDonation; session: ICheckoutSessionResponse }> => {
  const donation = await Donation.findById(donationId);

  if (!donation) {
    throw new AppError(httpStatus.NOT_FOUND, 'Donation not found!');
  }

  if (donation.status !== 'failed') {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Can only retry failed donations!'
    );
  }

  const donationWithTracking = donation as IDonationWithTracking;
  const maxRetries = 3;
  if (donationWithTracking.paymentAttempts >= maxRetries) {
    throw new AppError(
      httpStatus.TOO_MANY_REQUESTS,
      'Maximum payment retries reached!'
    );
  }

  if (!donation.stripeCustomerId || !donation.stripePaymentMethodId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'No payment method associated. Create a new donation.'
    );
  }

  // Fetch Organization to get Connected Account ID
  const organization = await Organization.findById(donation.organization);
  if (!organization) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Organization not found. Cannot process retry.'
    );
  }

  const stripeAccount = await StripeAccount.findOne({
    organization: organization._id,
    status: 'active',
  });

  if (!stripeAccount) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Stripe Account either not connected or exist!'
    );
  }

  //  Recalculate fees to ensure consistency
  const financials = calculateAustralianFees(
    donation.amount,
    donation.coverFees
  );

  // Platform Fee = Platform Revenue + GST + Stripe Fee
  const applicationFee = financials.platformFeeWithStripe;

  // Create a new payment intent for retry (Destination Charge)
  const paymentIntent = await StripeService.createPaymentIntentWithMethod({
    amount: financials.baseAmount,
    totalAmount: financials.totalCharge,

    // Fee Params for Destination Charge
    applicationFee: applicationFee,
    orgStripeAccountId: stripeAccount.stripeAccountId,

    // Pass existing metadata + Fee Breakdown
    coverFees: financials.coverFees,
    platformFee: financials.platformFee,
    gstOnFee: financials.gstOnFee,
    stripeFee: financials.stripeFee,
    netToOrg: financials.netToOrg,

    currency: 'usd',
    customerId: donation.stripeCustomerId,
    paymentMethodId: donation.stripePaymentMethodId,
    donationId: String(donation._id),
    organizationId: donation.organization.toString(),
    causeId: donation.cause?.toString() || '',
    specialMessage: donation.specialMessage,
  });

  donation.stripePaymentIntentId = paymentIntent.payment_intent_id;
  donation.status = 'processing';
  donation.stripeSessionId = undefined;
  await donation.save();

  return {
    donation,
    session: {
      sessionId: paymentIntent.payment_intent_id,
      url: '',
    } as ICheckoutSessionResponse,
  };
};

// 11. Get donation full status
const getDonationFullStatus = async (
  donationId: string
): Promise<{
  donation: IDonation;
  paymentStatus: {
    status: string;
    lastPaymentAttempt?: Date;
    paymentAttempts: number;
    canRetry: boolean;
    sessionId?: string;
    paymentIntentId?: string;
  };
}> => {
  const donation = await getDonationById(donationId);
  const donationWithTracking = donation as IDonationWithTracking;

  const paymentStatus = {
    status: donation.status,
    lastPaymentAttempt: donationWithTracking.lastPaymentAttempt,
    paymentAttempts: donationWithTracking.paymentAttempts || 0,
    canRetry:
      donation.status === 'failed' &&
      (donationWithTracking.paymentAttempts || 0) < 3,
    sessionId: donation.stripeSessionId,
    paymentIntentId: donation.stripePaymentIntentId,
  };

  return { donation, paymentStatus };
};

// 12. Cancel donation
const cancelDonation = async (
  donationId: string,
  userId: string
): Promise<IDonation> => {
  if (!donationId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Donation ID required!');
  }

  const donor = await Client.findOne({ auth: userId });
  if (!donor?._id) {
    throw new AppError(httpStatus.NOT_FOUND, 'Donor not found!');
  }

  const donation = await Donation.findById(donationId);
  if (!donation) {
    throw new AppError(httpStatus.NOT_FOUND, 'Donation not found!');
  }

  if (donation.donor.toString() !== donor._id.toString()) {
    throw new AppError(httpStatus.FORBIDDEN, 'Permission denied');
  }

  if (!['pending', 'processing'].includes(donation.status)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot cancel donation with status: ${donation.status}`
    );
  }

  if (donation.stripePaymentIntentId) {
    try {
      await StripeService.cancelPaymentIntent(donation.stripePaymentIntentId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Failed to cancel payment intent ${donation.stripePaymentIntentId}:`,
        error
      );
    }
  }

  donation.status = 'canceled';
  await donation.save();

  return donation;
};

// 13. Refund donation
const refundDonation = async (
  donationId: string,
  userId: string,
  reason?: string
): Promise<IDonation> => {
  if (!donationId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Donation ID required!');
  }

  // 1. Check if user exists
  const donor = await Client.findOne({ auth: userId });
  if (!donor?._id) {
    throw new AppError(httpStatus.NOT_FOUND, 'Donor not found!');
  }

  // 2. Find the donation
  const donation = await Donation.findById(donationId);
  if (!donation) {
    throw new AppError(httpStatus.NOT_FOUND, 'Donation not found!');
  }

  // 3. Permission Check (Only the donor can ask)
  if (donation.donor.toString() !== donor._id.toString()) {
    throw new AppError(httpStatus.FORBIDDEN, 'Permission denied');
  }

  // 4. Status Check
  if (donation.status === 'refunded') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Already refunded');
  }
  if (donation.status !== 'completed') {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Only completed donations can be refunded.'
    );
  }

  // 5. 7-Day Time Limit Check
  const now = new Date();
  const donationDate = new Date(donation.donationDate || donation.createdAt);

  // Calculate difference in time (milliseconds)
  const diffInTime = now.getTime() - donationDate.getTime();
  // Calculate difference in days
  const diffInDays = diffInTime / (1000 * 3600 * 24);

  if (diffInDays > REFUND_WINDOW_DAYS) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Refund period expired. Refunds are only allowed within ${REFUND_WINDOW_DAYS} days of donation.`
    );
  }

  if (!donation.stripePaymentIntentId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No payment intent found');
  }

  try {
    // Process Refund in Stripe
    await StripeService.createRefund(donation.stripePaymentIntentId);

    // Update Status
    donation.status = 'refunding'; // Will be 'refunded' via webhook
    if (reason) {
      donation.refundReason = reason;
    }
    await donation.save();

    return donation;
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to process refund: ${errorMessage}`
    );
  }
};

// Analytics functions (kept as is)
const getTotalDonatedAmount = async (
  current: IAnalyticsPeriod,
  previous: IAnalyticsPeriod,
  organizationId?: string,
  donationType?: string
): Promise<IPercentageChange> => {
  const baseQuery = buildBaseQuery(organizationId, donationType);

  const [currentResult, previousResult] = await Promise.all([
    Donation.aggregate([
      {
        $match: {
          ...baseQuery,
          donationDate: { $gte: current.startDate, $lte: current.endDate },
        },
      },
      { $group: { _id: null, total: { $sum: '$netAmount' } } },
    ]),
    Donation.aggregate([
      {
        $match: {
          ...baseQuery,
          donationDate: { $gte: previous.startDate, $lte: previous.endDate },
        },
      },
      { $group: { _id: null, total: { $sum: '$netAmount' } } },
    ]),
  ]);

  const currentTotal = currentResult[0]?.total || 0;
  const previousTotal = previousResult[0]?.total || 0;
  const change = calculatePercentageChange(currentTotal, previousTotal);

  return {
    value: formatCurrency(currentTotal),
    ...change,
  };
};

const getAverageDonationPerUser = async (
  current: IAnalyticsPeriod,
  previous: IAnalyticsPeriod,
  organizationId?: string,
  donationType?: string
): Promise<IPercentageChange> => {
  const baseQuery = buildBaseQuery(organizationId, donationType);

  const [currentResult, previousResult] = await Promise.all([
    Donation.aggregate([
      {
        $match: {
          ...baseQuery,
          donationDate: { $gte: current.startDate, $lte: current.endDate },
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$netAmount' },
          uniqueDonors: { $addToSet: '$donor' },
        },
      },
      {
        $project: {
          average: {
            $cond: [
              { $gt: [{ $size: '$uniqueDonors' }, 0] },
              { $divide: ['$totalAmount', { $size: '$uniqueDonors' }] },
              0,
            ],
          },
        },
      },
    ]),
    Donation.aggregate([
      {
        $match: {
          ...baseQuery,
          donationDate: { $gte: previous.startDate, $lte: previous.endDate },
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$netAmount' },
          uniqueDonors: { $addToSet: '$donor' },
        },
      },
      {
        $project: {
          average: {
            $cond: [
              { $gt: [{ $size: '$uniqueDonors' }, 0] },
              { $divide: ['$totalAmount', { $size: '$uniqueDonors' }] },
              0,
            ],
          },
        },
      },
    ]),
  ]);

  const currentAvg = currentResult[0]?.average || 0;
  const previousAvg = previousResult[0]?.average || 0;
  const change = calculatePercentageChange(currentAvg, previousAvg);

  return {
    value: formatCurrency(currentAvg),
    ...change,
  };
};

const getTotalDonors = async (
  current: IAnalyticsPeriod,
  previous: IAnalyticsPeriod,
  organizationId?: string,
  donationType?: string
): Promise<IPercentageChange> => {
  const baseQuery = buildBaseQuery(organizationId, donationType);

  const [currentResult, previousResult] = await Promise.all([
    Donation.aggregate([
      {
        $match: {
          ...baseQuery,
          donationDate: { $gte: current.startDate, $lte: current.endDate },
        },
      },
      { $group: { _id: '$donor' } },
      { $count: 'count' },
    ]),
    Donation.aggregate([
      {
        $match: {
          ...baseQuery,
          donationDate: { $gte: previous.startDate, $lte: previous.endDate },
        },
      },
      { $group: { _id: '$donor' } },
      { $count: 'count' },
    ]),
  ]);

  const currentCount = currentResult[0]?.count || 0;
  const previousCount = previousResult[0]?.count || 0;
  const change = calculatePercentageChange(currentCount, previousCount);

  return {
    value: currentCount,
    ...change,
  };
};

const getTopCause = async (
  current: IAnalyticsPeriod,
  organizationId?: string
) => {
  const baseQuery = buildBaseQuery(organizationId);

  const result = await Donation.aggregate([
    {
      $match: {
        ...baseQuery,
        donationDate: { $gte: current.startDate, $lte: current.endDate },
        cause: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: '$cause',
        totalAmount: { $sum: '$netAmount' },
      },
    },
    { $sort: { totalAmount: -1 } },
    { $limit: 1 },
    {
      $lookup: {
        from: 'causes',
        localField: '_id',
        foreignField: '_id',
        as: 'causeDetails',
      },
    },
    { $unwind: '$causeDetails' },
    {
      $project: {
        _id: 1,
        name: '$causeDetails.name',
        totalAmount: { $round: ['$totalAmount', 2] },
      },
    },
  ]);

  return result[0] || null;
};

const getDonationTypeBreakdown = async (
  current: IAnalyticsPeriod,
  previous: IAnalyticsPeriod,
  organizationId?: string
) => {
  const baseQuery = buildBaseQuery(organizationId);

  const [currentData, previousData] = await Promise.all([
    Donation.aggregate([
      {
        $match: {
          ...baseQuery,
          donationDate: { $gte: current.startDate, $lte: current.endDate },
        },
      },
      {
        $group: {
          _id: '$donationType',
          total: { $sum: '$netAmount' },
        },
      },
    ]),
    Donation.aggregate([
      {
        $match: {
          ...baseQuery,
          donationDate: { $gte: previous.startDate, $lte: previous.endDate },
        },
      },
      {
        $group: {
          _id: '$donationType',
          total: { $sum: '$netAmount' },
        },
      },
    ]),
  ]);

  const currentMap = new Map(currentData.map((d) => [d._id, d.total]));
  const previousMap = new Map(previousData.map((d) => [d._id, d.total]));

  const types = ['round-up', 'recurring', 'one-time'];
  const breakdown: IDonationTypeBreakdown = {
    'round-up': { value: 0, percentageChange: 0, isIncrease: false },
    recurring: { value: 0, percentageChange: 0, isIncrease: false },
    'one-time': { value: 0, percentageChange: 0, isIncrease: false },
  };

  types.forEach((type) => {
    const currentAmount = currentMap.get(type) || 0;
    const previousAmount = previousMap.get(type) || 0;

    const change = calculatePercentageChange(currentAmount, previousAmount);

    breakdown[type as keyof IDonationTypeBreakdown] = {
      value: formatCurrency(currentAmount),
      ...change,
    };
  });

  return breakdown;
};

const getTopDonors = async (
  current: IAnalyticsPeriod,
  previous: IAnalyticsPeriod,
  organizationId?: string,
  limit: number = 10
): Promise<ITopDonor[]> => {
  const baseQuery = buildBaseQuery(organizationId);

  const [currentDonors, previousDonors] = await Promise.all([
    Donation.aggregate([
      {
        $match: {
          ...baseQuery,
          donationDate: { $gte: current.startDate, $lte: current.endDate },
        },
      },
      {
        $group: {
          _id: '$donor',
          totalAmount: { $sum: '$netAmount' },
          donationCount: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: limit },
    ]),
    Donation.aggregate([
      {
        $match: {
          ...baseQuery,
          donationDate: { $gte: previous.startDate, $lte: previous.endDate },
        },
      },
      {
        $group: {
          _id: '$donor',
          totalAmount: { $sum: '$netAmount' },
        },
      },
    ]),
  ]);

  const previousMap = new Map(
    previousDonors.map((d) => [d._id.toString(), d.totalAmount])
  );

  const donorIds = currentDonors.map((d) => d._id);
  const clients = await Client.find({ _id: { $in: donorIds } }).populate(
    'auth',
    'email'
  );

  const clientMap = new Map(clients.map((c) => [c._id.toString(), c]));

  return currentDonors.map((donor) => {
    const donorId = donor._id.toString();
    const client = clientMap.get(donorId);
    const previousAmount = previousMap.get(donorId) || 0;
    const change = calculatePercentageChange(donor.totalAmount, previousAmount);

    return {
      donor: {
        _id: donorId,
        name: client?.name as string,
        email: (client?.auth as unknown as IAuth)?.email as string,
        image: client?.image,
      },
      totalAmount: formatCurrency(donor.totalAmount),
      donationCount: donor.donationCount,
      previousAmount: formatCurrency(previousAmount),
      ...change,
    };
  });
};

const getRecentDonors = async (
  current?: IAnalyticsPeriod,
  organizationId?: string,
  limit: number = 10
): Promise<IRecentDonor[]> => {
  const baseQuery = buildBaseQuery(organizationId);

  if (current?.startDate || current?.endDate) {
    if (current.startDate) {
      baseQuery.donationDate = { $gte: current.startDate };
    }
    if (current.endDate) {
      baseQuery.donationDate = {
        ...baseQuery.donationDate,
        $lte: current.endDate,
      };
    }
  }

  const recentDonations = await Donation.aggregate([
    {
      $match: {
        ...baseQuery,
      },
    },
    { $sort: { donationDate: -1 } },
    {
      $group: {
        _id: '$donor',
        lastDonationDate: { $first: '$donationDate' },
        lastDonationAmount: { $first: '$netAmount' },
      },
    },
    { $sort: { lastDonationDate: -1 } },
    { $limit: limit },
  ]);

  const donorIds = recentDonations.map((d) => d._id);
  const clients = await Client.find({ _id: { $in: donorIds } }).populate(
    'auth',
    'email'
  );

  const clientMap = new Map(clients.map((c) => [c._id.toString(), c]));

  return recentDonations.map((donation) => {
    const donorId = donation._id.toString();
    const client = clientMap.get(donorId);

    return {
      donor: {
        _id: donorId,
        name: client?.name as string,
        email: (client?.auth as unknown as IAuth)?.email as string,
        image: client?.image,
      },
      lastDonationDate: donation.lastDonationDate,
      lastDonationAmount: formatCurrency(donation.lastDonationAmount),
    };
  });
};

const getOrganizationCauseStats = async (
  organizationId: string
): Promise<IOrganizationStatsResponse> => {
  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found');
  }

  const donationsByCause = await Donation.aggregate([
    {
      $match: {
        organization: new mongoose.Types.ObjectId(organizationId),
        status: 'completed',
        cause: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: '$cause',
        totalAmount: { $sum: '$netAmount' },
      },
    },
    {
      $lookup: {
        from: 'causes',
        localField: '_id',
        foreignField: '_id',
        as: 'causeDetails',
      },
    },
    {
      $unwind: '$causeDetails',
    },
    {
      $match: {
        'causeDetails.organization': new mongoose.Types.ObjectId(
          organizationId
        ),
      },
    },
    {
      $project: {
        causeId: '$_id',
        causeName: '$causeDetails.name',
        category: '$causeDetails.category',
        totalAmount: 1,
      },
    },
  ]);

  const categoryMap = new Map<string, CategoryData>();
  let totalDonationAmount = 0;

  donationsByCause.forEach((item) => {
    const category = item.category;
    const amount = parseFloat(item.totalAmount.toFixed(2));

    totalDonationAmount += amount;

    if (!categoryMap.has(category)) {
      categoryMap.set(category, {
        category,
        totalDonationAmount: 0,
        causes: [],
      });
    }

    const categoryData = categoryMap.get(category)!;
    categoryData.totalDonationAmount += amount;
    categoryData.causes.push({
      causeId: item.causeId.toString(),
      causeName: item.causeName,
      totalDonationAmount: amount,
    });
  });

  const categories: CategoryData[] = Array.from(categoryMap.values())
    .map((category) => ({
      category: category.category,
      totalDonationAmount: parseFloat(category.totalDonationAmount.toFixed(2)),
      causes: category.causes.sort(
        (a, b) => b.totalDonationAmount - a.totalDonationAmount
      ),
    }))
    .sort((a, b) => b.totalDonationAmount - a.totalDonationAmount);

  return {
    totalDonationAmount: parseFloat(totalDonationAmount.toFixed(2)),
    categories,
  };
};

type CauseMonthlyAggregateResult = {
  _id: { month: number };
  totalAmount: number;
};

const getOrganizationCauseMonthlyStats = async (
  organizationId: string,
  causeId: string,
  year: number
): Promise<ICauseMonthlyStat[]> => {
  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Year must be a valid integer between 1970 and 2100!'
    );
  }

  const [organization, cause] = await Promise.all([
    Organization.findById(organizationId),
    Cause.findById(causeId),
  ]);

  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found');
  }

  if (!cause) {
    throw new AppError(httpStatus.NOT_FOUND, 'Cause not found');
  }

  if (cause.organization.toString() !== organization._id.toString()) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Cause does not belong to the specified organization'
    );
  }

  const startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const stats = (await Donation.aggregate([
    {
      $match: {
        organization: organization._id,
        cause: cause._id,
        status: 'completed',
        donationDate: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: { month: { $month: '$donationDate' } },
        totalAmount: { $sum: '$netAmount' },
      },
    },
  ])) as CauseMonthlyAggregateResult[];

  const monthTotals = new Map<number, number>();
  stats.forEach((stat) => {
    monthTotals.set(stat._id.month, stat.totalAmount);
  });

  return monthAbbreviations.map((month, index) => {
    const monthIndex = index + 1;
    const amount = monthTotals.get(monthIndex) ?? 0;
    return {
      month: `${month}-${year}`,
      totalAmount: Number(amount.toFixed(2)),
    };
  });
};

const getDonationAnalytics = async (
  filter: 'today' | 'this_week' | 'this_month',
  organizationId?: string,
  year?: number,
  donationType: 'all' | 'one-time' | 'recurring' | 'roundup' = 'all'
): Promise<IDonationAnalytics> => {
  const { current, previous } = getDateRanges(filter, year);

  const donationTypeFilter =
    donationType === 'all'
      ? undefined
      : donationType === 'roundup'
      ? 'round-up'
      : donationType;

  if (
    ['round-up', 'recurring'].includes(
      donationTypeFilter as 'round-up' | 'recurring'
    )
  ) {
    const hasSubscription = await SubscriptionService.checkHasSubscription(
      organizationId!
    );

    if (!hasSubscription) {
      throw new AppError(
        httpStatus.PAYMENT_REQUIRED,
        'This organization is not eligible for RoundUp or recurring donations because it has no active subscription.'
      );
    }
  }

  const [
    totalDonatedAmount,
    averageDonationPerUser,
    totalDonors,
    topCause,
    donationTypeBreakdown,
    topDonors,
    recentDonors,
    breakDownByCause,
  ] = await Promise.all([
    getTotalDonatedAmount(
      current,
      previous,
      organizationId,
      donationTypeFilter
    ),
    getAverageDonationPerUser(
      current,
      previous,
      organizationId,
      donationTypeFilter
    ),
    getTotalDonors(current, previous, organizationId, donationTypeFilter),
    getTopCause(current, organizationId),
    getDonationTypeBreakdown(current, previous, organizationId),
    getTopDonors(current, previous, organizationId),
    getRecentDonors(current, organizationId),
    getOrganizationCauseStats(organizationId!),
  ]);

  return {
    totalDonatedAmount,
    averageDonationPerUser,
    totalDonors,
    topCause,
    donationTypeBreakdown,
    topDonors,
    recentDonors,
    breakDownByCause,
  };
};

const getOrganizationYearlyTrends = async (
  year: number,
  organizationId: string
): Promise<MonthlyTrend[]> => {
  const currentYear = new Date().getFullYear();
  if (year < 2020 || year > currentYear + 1) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Invalid year. Please provide a year between 2020 and next year'
    );
  }

  const organization = await Organization.findOne({
    auth: organizationId,
  });
  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found');
  }

  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

  const monthlyData = await Donation.aggregate([
    {
      $match: {
        organization: organization?._id,
        donationDate: {
          $gte: startDate,
          $lte: endDate,
        },
        status: 'completed',
      },
    },
    {
      $group: {
        _id: { $month: '$donationDate' },
        totalAmount: { $sum: '$amount' },
        totalCount: { $sum: 1 },
        oneTimeCount: {
          $sum: { $cond: [{ $eq: ['$donationType', 'one-time'] }, 1, 0] },
        },
        oneTimeTotal: {
          $sum: {
            $cond: [{ $eq: ['$donationType', 'one-time'] }, '$netAmount', 0],
          },
        },
        recurringCount: {
          $sum: { $cond: [{ $eq: ['$donationType', 'recurring'] }, 1, 0] },
        },
        recurringTotal: {
          $sum: {
            $cond: [{ $eq: ['$donationType', 'recurring'] }, '$netAmount', 0],
          },
        },
        roundupCount: {
          $sum: { $cond: [{ $eq: ['$donationType', 'round-up'] }, 1, 0] },
        },
        roundUpTotal: {
          $sum: {
            $cond: [{ $eq: ['$donationType', 'round-up'] }, '$netAmount', 0],
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const monthlyTrends: MonthlyTrend[] = monthAbbreviations.map((month) => ({
    month,
    totalAmount: 0,
    totalCount: 0,
    oneTimeCount: 0,
    recurringCount: 0,
    roundupCount: 0,
    oneTimeTotal: 0,
    recurringTotal: 0,
    roundUpTotal: 0,
  }));

  monthlyData.forEach((data) => {
    const monthIndex = data._id - 1;
    monthlyTrends[monthIndex] = {
      month: monthAbbreviations[monthIndex],
      totalAmount: parseFloat(data.totalAmount.toFixed(2)),
      totalCount: data.totalCount,
      oneTimeCount: data.oneTimeCount,
      recurringCount: data.recurringCount,
      roundupCount: data.roundupCount,
      oneTimeTotal: parseFloat(data.oneTimeTotal.toFixed(2)),
      recurringTotal: parseFloat(data.recurringTotal.toFixed(2)),
      roundUpTotal: parseFloat(data.roundUpTotal.toFixed(2)),
    };
  });

  return monthlyTrends;
};

// Client Dashboard Stats :
const getClientStats = async (
  userId: string,
  timeFilter: TTimeFilter
): Promise<IClientDonationStats> => {
  // 1. Get User
  const donor = await Client.findOne({ auth: userId });
  if (!donor) {
    throw new AppError(httpStatus.NOT_FOUND, 'Donor profile not found!');
  }

  // 2. Determine Date Range
  const {
    current: { startDate: start, endDate: end },
  } = getDateRanges(timeFilter);

  // 3. Aggregate Donations using $facet for parallel processing
  const stats = await Donation.aggregate([
    {
      $match: {
        donor: donor._id,
        status: 'completed',
        donationDate: { $gte: start, $lte: end },
      },
    },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalAmount: { $sum: '$amount' }, // Using base amount (tax deductible)
              count: { $sum: 1 },
              roundUpAmount: {
                $sum: {
                  $cond: [{ $eq: ['$donationType', 'round-up'] }, '$amount', 0],
                },
              },
              recurringAmount: {
                $sum: {
                  $cond: [
                    { $eq: ['$donationType', 'recurring'] },
                    '$amount',
                    0,
                  ],
                },
              },
              oneTimeAmount: {
                $sum: {
                  $cond: [{ $eq: ['$donationType', 'one-time'] }, '$amount', 0],
                },
              },
              dates: { $push: '$donationDate' }, // For streak calc
              donationList: {
                $push: {
                  date: '$donationDate',
                  amount: '$amount',
                  type: '$donationType',
                },
              },
            },
          },
        ],

        dailyStats: [
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$donationDate' },
              },
              totalAmount: { $sum: '$amount' },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
          {
            $project: {
              _id: 0,
              date: '$_id',
              totalAmount: { $round: ['$totalAmount', 2] },
              count: 1,
            },
          },
        ],
      },
    },
  ]);

  // Extract results from facet
  const result = stats[0].summary[0] || {
    totalAmount: 0,
    count: 0,
    roundUpAmount: 0,
    recurringAmount: 0,
    oneTimeAmount: 0,
    dates: [],
    donationList: [],
  };

  const dailyStats = stats[0].dailyStats || [];

  // 4. Calculate Streaks
  const { maxStreak, currentStreak } = calculateStreaks(result.dates);

  // 5. Get Upcoming Donations (Scheduled)
  const upcomingDonations = await ScheduledDonation.find({
    user: donor._id,
    isActive: true,
    nextDonationDate: { $gte: new Date() },
  })
    .populate('cause', 'name')
    .populate(
      'organization',
      'name registeredCharityName logoImage coverImage country postalCode address state'
    )
    .sort({ nextDonationDate: 1 })
    .limit(5)
    .lean();

  const formattedUpcoming = upcomingDonations.map((sd: any) => ({
    _id: sd._id.toString(),
    amount: sd.amount,
    nextDate: sd.nextDonationDate,
    causeName: sd.cause?.name,
    organizationName: sd.organization?.name,
    organizationLogo: sd.organization?.logoImage,
    organizationCoverImage: sd.organization?.coverImage,
    organizationRegisteredName: sd.organization?.registeredCharityName,
    organizationCountry: sd.organization?.country,
    organizationPostalCode: sd.organization?.postalCode,
    organizationAddress: sd.organization?.address,
    organizationState: sd.organization?.state,
  }));

  // Active Roundup configs:
  const activeRoundUp = await RoundUpModel.findOne({
    user: userId,
    isActive: true,
    enabled: true,
  }).populate('organization', 'name registeredCharityName ');

  let roundUpStatusData: Record<string, unknown> = {
    isEnabled: false,
    organizationName: null,
    registeredCharityName: null,
    daysRemaining: null,
    nextDate: null,
  };

  if (activeRoundUp) {
    const now = new Date();
    // Calculate the 1st day of the NEXT month (Standard RoundUp Cycle)
    const nextDonationDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Calculate days remaining
    const diffTime = nextDonationDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    roundUpStatusData = {
      isEnabled: true,
      organizationName: (activeRoundUp?.organization as any)?.name,
      registeredCharityName: (activeRoundUp?.organization as any)
        ?.registeredCharityName,
      daysRemaining: daysRemaining,
      nextDate: nextDonationDate,
    };
  }

  // 6. Assemble Response
  return {
    roundUpAmount: Number(result.roundUpAmount.toFixed(2)),
    recurringAmount: Number(result.recurringAmount.toFixed(2)),
    oneTimeAmount: Number(result.oneTimeAmount.toFixed(2)),
    totalDonationAmount: Number(result.totalAmount.toFixed(2)),
    averageDonation:
      result.count > 0
        ? Number((result.totalAmount / result.count).toFixed(2))
        : 0,
    maxConsistencyStreak: maxStreak,
    currentStreak: currentStreak,

    // Detailed list sorted descending
    donationDates: result.donationList.sort(
      (a: any, b: any) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    ),

    // Unique dates set
    uniqueDonationDates: Array.from(
      new Set(
        result.donationList.map(
          (d: any) => new Date(d.date).toISOString().split('T')[0]
        )
      )
    ).sort((a: any, b: any) => (a > b ? -1 : 1)),

    // ✅ NEW: Daily aggregated stats
    dailyStats: dailyStats,

    upcomingDonations: formattedUpcoming,
    roundUpStatusData,
  } as any;
};

export const DonationService = {
  createOneTimeDonation,
  getDonationById,
  getDonationFullStatus,
  retryFailedPayment,
  cancelDonation,
  refundDonation,
  updateDonationStatus,
  updateDonationPaymentStatus,
  updateDonationStatusByPaymentIntent,
  findDonationByPaymentIntentId,
  getDonationsByUser,
  getDonationsByOrganization,
  getDonationStatistics,
  getDonationAnalytics,
  getOrganizationCauseMonthlyStats,
  getTotalDonatedAmount,
  getAverageDonationPerUser,
  getTotalDonors,
  getTopCause,
  getDonationTypeBreakdown,
  getTopDonors,
  getRecentDonors,
  getOrganizationYearlyTrends,
  getClientStats,
};
