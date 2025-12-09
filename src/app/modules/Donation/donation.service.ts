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
} from './donation.interface';
import { TCreateOneTimeDonationPayload } from './donation.validation';
import { AppError } from '../../utils';
import httpStatus from 'http-status';
import { StripeService } from '../Stripe/stripe.service';
import { ICheckoutSessionResponse } from '../Stripe/stripe.interface';
import { IDonationWithTracking } from './donation.interface';
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
  calculateAustralianFees, //
  monthAbbreviations,
  REFUND_WINDOW_DAYS,
} from './donation.constant';
import { ScheduledDonation } from '../ScheduledDonation/scheduledDonation.model';

// Helper function to generate unique idempotency key
const generateIdempotencyKey = (): string => {
  return `don-${new Types.ObjectId().toString()}-${Date.now()}`;
};

// 1. Create one-time donation with Payment Intent (direct charge with saved payment method)
const createOneTimeDonation = async (
  payload: TCreateOneTimeDonationPayload & {
    userId: string;
  }
): Promise<{
  donation: IDonation;
  paymentIntent: {
    client_secret: string;
    payment_intent_id: string;
  };
}> => {
  const {
    amount,
    coverFees = false, // Default to true (Opt-out model)
    causeId,
    organizationId,
    userId,
    paymentMethodId,
    specialMessage,
  } = payload;

  // ✅ Apply Australian Financial Logic (Includes Stripe Fee)
  const financials = calculateAustralianFees(amount, coverFees);

  console.log(`💰 Donation Amount Breakdown:`);
  console.log(`   Base Amount: $${financials.baseAmount.toFixed(2)}`);
  console.log(`   Platform Fee: $${financials.platformFee.toFixed(2)}`);
  console.log(`   GST on Fee: $${financials.gstOnFee.toFixed(2)}`);
  console.log(`   Stripe Fee: $${financials.stripeFee.toFixed(2)}`);
  console.log(`   Total Charged: $${financials.totalCharge.toFixed(2)}`);
  console.log(`   Net To Org: $${financials.netToOrg.toFixed(2)}`);

  // Generate idempotency key on backend
  const idempotencyKey = generateIdempotencyKey();

  // Check if donor exists
  const donor = await Client?.findOne({
    auth: userId,
  });
  if (!donor?._id) {
    throw new AppError(httpStatus.NOT_FOUND, 'Donor not found!');
  }

  // Validate organization exists
  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
  }

  // Validate causeId is provided
  if (!causeId || causeId.trim() === '') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Cause ID is required!');
  }

  // Validate cause exists and is verified
  const cause = await Cause.findById(causeId);
  if (!cause) {
    throw new AppError(httpStatus.NOT_FOUND, 'Cause not found!');
  }
  if (cause.status !== CAUSE_STATUS_TYPE.VERIFIED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot create donation for cause with status: ${cause.status}. Only verified causes can receive donations.`
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

  // Start mongoose session for transaction
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    // Generate unique ID for the donation
    const donationUniqueId = new Types.ObjectId();

    // Create donation record with financial breakdown
    const donation = new Donation({
      _id: donationUniqueId,
      donor: new Types.ObjectId(donor?._id),
      organization: new Types.ObjectId(organizationId),
      cause: new Types.ObjectId(causeId),
      donationType: 'one-time',

      // ✅ Financials
      amount: financials.baseAmount,
      coverFees: financials.coverFees,
      platformFee: financials.platformFee,
      gstOnFee: financials.gstOnFee,
      stripeFee: financials.stripeFee, // ✅ NEW
      netAmount: financials.netToOrg,
      totalAmount: financials.totalCharge,

      currency: 'USD',
      status: 'pending',
      specialMessage,
      pointsEarned: Math.floor(financials.baseAmount * 100), // Points based on base amount

      stripeCustomerId: paymentMethod.stripeCustomerId,
      stripePaymentMethodId: paymentMethod.stripePaymentMethodId,
      idempotencyKey,
      createdAt: new Date(),
    });

    // Save donation within transaction
    const savedDonation = await donation.save({ session });

    // Create payment intent with TOTAL AMOUNT
    const paymentIntent = await StripeService.createPaymentIntentWithMethod({
      amount: financials.baseAmount,
      totalAmount: financials.totalCharge,

      // Pass breakdown to Stripe for metadata
      coverFees: financials.coverFees,
      platformFee: financials.platformFee,
      gstOnFee: financials.gstOnFee,
      stripeFee: financials.stripeFee, // ✅ NEW
      netToOrg: financials.netToOrg,

      currency: 'usd',
      customerId: paymentMethod.stripeCustomerId,
      paymentMethodId: paymentMethod.stripePaymentMethodId,
      donationId: donationUniqueId.toString(),
      organizationId,
      causeId,
      specialMessage,
    });

    // Update donation with payment intent ID
    savedDonation.stripePaymentIntentId = paymentIntent.payment_intent_id;
    savedDonation.status = 'processing';
    await savedDonation.save({ session });

    // Commit transaction
    await session.commitTransaction();

    console.log(`✅ One-time donation created successfully:`);
    console.log(`   Donation ID: ${savedDonation._id}`);

    return {
      donation: savedDonation,
      paymentIntent,
    };
  } catch (error: unknown) {
    // Rollback on any error
    await session.abortTransaction();

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create donation and process payment: ${errorMessage}`
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
    .populate('donor', '_id name auth address state postalCode image')
    .populate('organization', 'name')
    .populate('cause', 'name description');

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
    const modifiedQuery = { ...query };
    if (modifiedQuery.status === 'all') delete modifiedQuery.status;
    if (modifiedQuery.donationType === 'all') delete modifiedQuery.donationType;

    const baseQuery = Donation.find({ organization: organizationId })
      .populate({
        path: 'donor',
        select: '_id name auth image',
        populate: {
          path: 'auth',
          select: 'email',
        },
      })
      .populate('cause', 'name')
      .populate(
        'receiptId',
        'receiptNumber amount currency donationType pdfUrl pdfKey emailSent emailAttempts createdAt updatedAt generatedAt'
      );

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

// 10. Retry failed payment
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

  const organization = await Organization.findById(donation.organization);
  if (!organization?.stripeConnectAccountId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Organization payment setup not found'
    );
  }

  // Create a new payment intent for retry
  // ✅ Reuse the calculated values from the failed donation
  const paymentIntent = await StripeService.createPaymentIntentWithMethod({
    amount: donation.amount,
    totalAmount: donation.totalAmount, // Use existing total

    // Pass existing metadata
    coverFees: donation.coverFees,
    platformFee: donation.platformFee,
    gstOnFee: donation.gstOnFee,
    stripeFee: donation.stripeFee || 0, // ✅ Pass Stripe Fee
    netToOrg: donation.netAmount,

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

  // 5. ✅ NEW: 7-Day Time Limit Check
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
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Donation.aggregate([
      {
        $match: {
          ...baseQuery,
          donationDate: { $gte: previous.startDate, $lte: previous.endDate },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
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
          totalAmount: { $sum: '$amount' },
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
          totalAmount: { $sum: '$amount' },
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
        totalAmount: { $sum: '$amount' },
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
          total: { $sum: '$amount' },
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
          total: { $sum: '$amount' },
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
          totalAmount: { $sum: '$amount' },
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
          totalAmount: { $sum: '$amount' },
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
        lastDonationAmount: { $first: '$amount' },
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
        totalAmount: { $sum: '$amount' },
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
        totalAmount: { $sum: '$amount' },
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
            $cond: [{ $eq: ['$donationType', 'one-time'] }, '$amount', 0],
          },
        },
        recurringCount: {
          $sum: { $cond: [{ $eq: ['$donationType', 'recurring'] }, 1, 0] },
        },
        recurringTotal: {
          $sum: {
            $cond: [{ $eq: ['$donationType', 'recurring'] }, '$amount', 0],
          },
        },
        roundupCount: {
          $sum: { $cond: [{ $eq: ['$donationType', 'round-up'] }, 1, 0] },
        },
        roundUpTotal: {
          $sum: {
            $cond: [{ $eq: ['$donationType', 'round-up'] }, '$amount', 0],
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

// Cient Dashboard Stats :
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

  // 3. Aggregate Donations
  const stats = await Donation.aggregate([
    {
      $match: {
        donor: donor._id,
        status: 'completed',
        donationDate: { $gte: start, $lte: end },
      },
    },
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
            $cond: [{ $eq: ['$donationType', 'recurring'] }, '$amount', 0],
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
  ]);

  const result = stats[0] || {
    totalAmount: 0,
    count: 0,
    roundUpAmount: 0,
    recurringAmount: 0,
    oneTimeAmount: 0,
    dates: [],
    donationList: [],
  };

  // 4. Calculate Streaks
  // Note: Streaks are usually calculated based on ALL history, or just the range?
  // Requirement implies "consistency within range" or general consistency.
  // I will calculate streaks based on the *filtered* dates to match "consistency within top filter".
  const { maxStreak, currentStreak } = calculateStreaks(result.dates);

  // 5. Get Upcoming Donations (Scheduled)
  // This is future data, so we don't filter by the past date range usually,
  // but we filter for the *current* active schedules.
  const upcomingDonations = await ScheduledDonation.find({
    user: donor._id,
    isActive: true,
    nextDonationDate: { $gte: new Date() },
  })
    .populate('cause', 'name')
    .populate('organization', 'name')
    .sort({ nextDonationDate: 1 })
    .limit(5)
    .lean();

  const formattedUpcoming = upcomingDonations.map((sd: any) => ({
    _id: sd._id.toString(),
    amount: sd.amount,
    nextDate: sd.nextDonationDate,
    causeName: sd.cause?.name || 'Unknown Cause',
    organizationName: sd.organization?.name || 'Unknown Organization',
  }));

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
    currentStreak: currentStreak, // Often 0 if filter is 'last year' etc.
    donationDates: result.donationList.sort(
      (a: any, b: any) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    ), // Descending
    upcomingDonations: formattedUpcoming,
  } as any; // Type casting to match strict interface if needed
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
