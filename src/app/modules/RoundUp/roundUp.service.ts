import mongoose, { Types } from 'mongoose';
import { RoundUpModel } from './roundUp.model';
import { Donation } from '../Donation/donation.model';
import { OrganizationModel } from '../Organization/organization.model';
import { StripeService } from '../Stripe/stripe.service';
import bankConnectionService from '../BankConnection/bankConnection.service';
import { roundUpTransactionService } from '../RoundUpTransaction/roundUpTransaction.service';
import { RoundUpTransactionModel } from '../RoundUpTransaction/roundUpTransaction.model';
import { IRoundUpTransaction } from '../RoundUpTransaction/roundUpTransaction.interface';
import { StatusCodes } from 'http-status-codes';
import Cause from '../Causes/causes.model';
import { CAUSE_STATUS_TYPE } from '../Causes/causes.constant';
import { AppError } from '../../utils';
import httpStatus from 'http-status';
import Auth from '../Auth/auth.model';
import PaymentMethod from '../PaymentMethod/paymentMethod.model';
import Client from '../Client/client.model';
import { calculateAustralianFees } from '../Donation/donation.constant'; // ✅ Use new calculator
import { Logger } from '../../utils/logger';

const savePlaidConsent = async (
  userId: string,
  payload: Record<string, unknown>
) => {
  const {
    bankConnectionId,
    organizationId,
    causeId,
    monthlyThreshold,
    specialMessage,
    paymentMethodId,
    isTaxable = false, // Legacy
    // ✅ NEW
    coverFees = false, // Default false for RoundUp
  } = payload as {
    bankConnectionId?: string;
    organizationId?: string;
    causeId?: string;
    monthlyThreshold?: number | 'no-limit';
    specialMessage?: string;
    paymentMethodId?: string;
    isTaxable?: boolean;
    coverFees?: boolean;
  };

  const client = await Auth.findById(userId);

  if (!client) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const paymentMethod = await PaymentMethod.findById(paymentMethodId);

  if (!paymentMethod || paymentMethod.user.toString() !== userId) {
    throw new AppError(httpStatus.NOT_FOUND, 'Payment Method not found!');
  }

  if (!bankConnectionId) {
    return {
      success: false,
      message: 'Bank connection ID is required',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  const bankConnection = await bankConnectionService.getBankConnectionById(
    bankConnectionId
  );
  if (
    !bankConnection ||
    String(bankConnection.user as string) !== String(userId)
  ) {
    return {
      success: false,
      message: 'Bank connection not found',
      data: null,
      statusCode: StatusCodes.NOT_FOUND,
    };
  }

  const organization = await OrganizationModel.findById(organizationId);
  if (!organization) {
    return {
      success: false,
      message: 'Invalid organization selected',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  const cause = await Cause.findById(causeId);
  if (!cause) {
    return {
      success: false,
      message: 'Invalid cause selected',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  if (cause.organization.toString() !== organizationId) {
    return {
      success: false,
      message: 'Cause does not belong to the specified organization',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  if (cause.status !== CAUSE_STATUS_TYPE.VERIFIED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot create round-up for cause with status: ${cause.status}. Only verified causes can receive donations.`
    );
  }

  if (
    monthlyThreshold !== null &&
    monthlyThreshold !== undefined &&
    typeof monthlyThreshold === 'number' &&
    monthlyThreshold < 3
  ) {
    return {
      success: false,
      message:
        'Monthly threshold must be at least $3, "no-limit", or undefined',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  const existingRoundUp = await RoundUpModel.findOne({
    bankConnection: bankConnectionId,
    isActive: true,
  });

  if (existingRoundUp) {
    return {
      success: false,
      message: 'Round-up configuration already exists for this bank connection',
      data: existingRoundUp,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  const roundUpConfig = new RoundUpModel({
    user: userId,
    organization: organizationId,
    cause: causeId,
    bankConnection: bankConnectionId,
    paymentMethod: String(paymentMethod._id),
    monthlyThreshold: monthlyThreshold || undefined,

    // ✅ Store preferences
    coverFees,
    isTaxable, // Kept for legacy

    specialMessage: specialMessage || undefined,
    status: 'pending',
    isActive: true,
    enabled: true,
    totalAccumulated: 0,
    currentMonthTotal: 0,
    lastMonthReset: new Date(),
  });

  await roundUpConfig.save();

  return {
    success: true,
    message: 'Plaid consent saved and round-up configuration created',
    data: roundUpConfig,
    statusCode: StatusCodes.CREATED,
  };
};

const revokeConsent = async (userId: string, bankConnectionId: string) => {
  const bankConnection = await bankConnectionService.getBankConnectionById(
    bankConnectionId
  );
  if (!bankConnection || String(bankConnection.user) !== String(userId)) {
    return {
      success: false,
      message: 'Bank connection not found',
      data: null,
      statusCode: StatusCodes.NOT_FOUND,
    };
  }

  await RoundUpModel.updateMany(
    { bankConnection: bankConnectionId, isActive: true },
    {
      status: 'cancelled',
      isActive: false,
      enabled: false,
    }
  );

  await bankConnectionService.removeItem(bankConnection.itemId);

  return {
    success: true,
    message: 'Consent revoked and round-up deactivated',
    data: null,
    statusCode: StatusCodes.OK,
  };
};

const syncTransactions = async (
  userId: string,
  bankConnectionId: string,
  payload: { cursor?: string }
) => {
  const { cursor } = payload || {};

  const bankConnection = await bankConnectionService.getBankConnectionById(
    bankConnectionId
  );
  if (!bankConnection || String(bankConnection.user) !== String(userId)) {
    return {
      success: false,
      message: 'Bank connection not found',
      data: null,
      statusCode: StatusCodes.NOT_FOUND,
    };
  }

  const plaidSyncResponse = await bankConnectionService.syncTransactions(
    bankConnectionId,
    cursor
  );

  return {
    success: true,
    message:
      'Transactions synced successfully (RoundUp processing is automatic)',
    data: {
      plaidSync: plaidSyncResponse,
      hasMore: plaidSyncResponse.hasMore,
      nextCursor: plaidSyncResponse.nextCursor,
      note: 'RoundUp processing is handled automatically by background cron job every 4 hours',
    },
    statusCode: StatusCodes.OK,
  };
};

// Trigger Donation - Updated for Australian Financial Logic
const triggerDonation = async (
  roundUpConfig: any
): Promise<{ paymentIntentId: string; donationId: string }> => {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`;
  const previousMonthTotal = roundUpConfig.currentMonthTotal || 0;

  try {
    const pendingTransactions = await RoundUpTransactionModel.find({
      user: roundUpConfig.user,
      bankConnection: roundUpConfig.bankConnection,
      roundUp: roundUpConfig._id,
      status: 'processed',
      stripePaymentIntentId: { $in: [null, undefined] },
    });

    if (pendingTransactions.length === 0) {
      console.warn(
        `⚠️ No processed transactions found for RoundUp ${roundUpConfig._id}`
      );
      throw new Error('No processed transactions found for donation');
    }

    // Sum up the original round-up amounts (Base Amount)
    const baseAmount = pendingTransactions.reduce(
      (sum, transaction) => sum + (transaction as any).roundUpAmount,
      0
    );

    if (baseAmount <= 0) {
      throw new Error('Invalid donation amount');
    }

    // ✅ Apply Australian Fee Logic
    const financials = calculateAustralianFees(
      baseAmount,
      roundUpConfig.coverFees || false
    );

    console.log(
      `\n🎯 Creating donation record for RoundUp ${roundUpConfig._id}`
    );
    console.log(`   Base Amount: $${financials.baseAmount.toFixed(2)}`);
    console.log(`   Total Charged: $${financials.totalCharge.toFixed(2)}`);

    const cause = await Cause.findById(roundUpConfig.cause);
    if (!cause) {
      throw new AppError(httpStatus.NOT_FOUND, 'Cause not found!');
    }
    if (cause.status !== CAUSE_STATUS_TYPE.VERIFIED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Cannot create donation for cause with status: ${cause.status}.`
      );
    }

    const donor = await Client.findOne({ auth: roundUpConfig.user });
    if (!donor?._id) {
      throw new AppError(httpStatus.NOT_FOUND, 'Donor not found!');
    }

    const donation = await Donation.create({
      donor: donor._id,
      organization: roundUpConfig.organization,
      cause: roundUpConfig.cause,
      donationType: 'round-up',

      // ✅ Breakdown
      amount: financials.baseAmount,
      coverFees: financials.coverFees,
      platformFee: financials.platformFee,
      gstOnFee: financials.gstOnFee,
      netAmount: financials.netToOrg,
      totalAmount: financials.totalCharge,

      // Legacy
      isTaxable: roundUpConfig.isTaxable,
      taxAmount: financials.gstOnFee,

      currency: 'USD',
      status: 'pending',
      donationDate: new Date(),
      specialMessage:
        roundUpConfig.specialMessage || `Round-up donation for ${currentMonth}`,
      pointsEarned: Math.round(financials.baseAmount * 100),
      roundUpId: roundUpConfig._id,
      roundUpTransactionIds: pendingTransactions.map((t) => t._id),
      receiptGenerated: false,
      metadata: {
        userId: String(roundUpConfig.user),
        roundUpId: String(roundUpConfig._id),
        month: currentMonth,
        year: now.getFullYear().toString(),
        type: 'roundup_donation',
        transactionCount: pendingTransactions.length,
      },
    });

    let paymentResult;
    try {
      // hold amount into platform account
      paymentResult = await StripeService.createRoundUpPaymentIntent({
        roundUpId: String(roundUpConfig._id),
        userId: String(roundUpConfig.user),
        charityId: String(roundUpConfig.organization),
        causeId: String(roundUpConfig.cause),
        amount: financials.baseAmount,

        // ✅ Fee Breakdown
        coverFees: financials.coverFees,
        platformFee: financials.platformFee,
        gstOnFee: financials.gstOnFee,
        netToOrg: financials.netToOrg,
        totalAmount: financials.totalCharge,

        // Legacy
        isTaxable: roundUpConfig.isTaxable,
        taxAmount: financials.gstOnFee,

        month: currentMonth,
        year: now.getFullYear(),
        specialMessage: roundUpConfig.specialMessage,
        donationId: String(donation._id),
        paymentMethodId: roundUpConfig.paymentMethod,
      });

      console.log(
        `✅ PaymentIntent created: ${paymentResult.payment_intent_id}`
      );
    } catch (error) {
      const donationDoc = donation.toObject();
      await Donation.findByIdAndUpdate(donation._id, {
        status: 'failed',
        metadata: {
          ...(donationDoc.metadata || {}),
          failureReason:
            error instanceof Error
              ? error.message
              : 'Payment intent creation failed',
          failedAt: new Date(),
        },
      });

      await roundUpConfig.markAsFailed(
        error instanceof Error
          ? error.message
          : 'Payment intent creation failed'
      );

      await RoundUpTransactionModel.updateMany(
        {
          roundUp: roundUpConfig._id,
          _id: { $in: pendingTransactions.map((t) => t._id) },
        },
        {
          status: 'processed',
          lastPaymentFailure: new Date(),
          lastPaymentFailureReason:
            error instanceof Error ? error.message : 'Payment failed',
        }
      );

      throw error;
    }

    const donationDoc = donation.toObject();
    await Donation.findByIdAndUpdate(donation._id, {
      status: 'processing',
      stripePaymentIntentId: paymentResult.payment_intent_id,
      metadata: {
        ...(donationDoc.metadata || {}),
        paymentInitiatedAt: new Date(),
      },
    });

    await RoundUpTransactionModel.updateMany(
      {
        roundUp: roundUpConfig._id,
        _id: { $in: pendingTransactions.map((t) => t._id) },
      },
      {
        stripePaymentIntentId: paymentResult.payment_intent_id,
        donation: donation._id,
        donationAttemptedAt: new Date(),
      }
    );

    roundUpConfig.status = 'processing';
    roundUpConfig.lastDonationAttempt = new Date();
    roundUpConfig.currentMonthTotal = Math.max(
      previousMonthTotal - baseAmount,
      0
    );
    await roundUpConfig.save();
    console.log(
      `✅ RoundUp ${roundUpConfig._id} updated to 'processing' status`
    );

    Logger.info('\n🔄 RoundUp donation flow completed:');
    Logger.info(`   RoundUp ID: ${roundUpConfig._id}`);
    Logger.info(`   Donation ID: ${donation._id}`);
    Logger.info(`   Payment Intent ID: ${paymentResult.payment_intent_id}`);
    Logger.info(`   Base Amount: $${baseAmount.toFixed(2)}`);
    Logger.info(`   Total Charged: $${financials.totalCharge.toFixed(2)}`);
    Logger.info(`   Charity: ${roundUpConfig.organization}`);
    Logger.info(`   Status: Awaiting webhook confirmation...\n`);

    return {
      paymentIntentId: paymentResult.payment_intent_id,
      donationId: String(donation._id),
    };
  } catch (error) {
    console.error(
      `❌ Error triggering RoundUp donation for ${roundUpConfig._id}:`,
      error
    );

    roundUpConfig.currentMonthTotal = previousMonthTotal;
    await roundUpConfig.save();

    throw error;
  }
};

// Process Monthly Donation - Updated for Platform Holding
const processMonthlyDonation = async (
  userId: string,
  payload: { roundUpId?: string; specialMessage?: string }
) => {
  const { roundUpId, specialMessage } = payload;

  const roundUpConfig = await RoundUpModel.findOne({
    _id: roundUpId,
    user: userId,
    isActive: true,
  });

  if (!roundUpConfig) {
    return {
      success: false,
      message: 'Round-up configuration not found',
      data: null,
      statusCode: StatusCodes.NOT_FOUND,
    };
  }

  if (!roundUpConfig.enabled) {
    return {
      success: false,
      message:
        'Round-up is currently paused. Please resume it to process donation.',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  if (roundUpConfig.status === 'completed') {
    return {
      success: false,
      message:
        'Round-up donation already completed for this cycle. Please wait for next cycle.',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`;

  if (
    await isDonationAlreadyProcessed(String(roundUpConfig._id), currentMonth)
  ) {
    return {
      success: false,
      message: 'Donation already processed for this month',
      data: null,
      statusCode: StatusCodes.CONFLICT,
    };
  }

  const processedTransactions = await roundUpTransactionService.getTransactions(
    {
      user: userId,
      bankConnection: roundUpConfig.bankConnection,
      status: 'processed',
      month: String(now.getMonth() + 1),
      year: now.getFullYear(),
    }
  );

  const eligibleTransactions = processedTransactions.filter(
    (transaction: IRoundUpTransaction) => !transaction.stripePaymentIntentId
  );

  if (eligibleTransactions.length === 0) {
    return {
      success: false,
      message: 'No processed transactions found for this month',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  const baseAmount = eligibleTransactions.reduce(
    (sum: number, transaction: IRoundUpTransaction) =>
      sum + transaction.roundUpAmount,
    0
  );

  // ✅ Apply Fee Calculation
  const financials = calculateAustralianFees(
    baseAmount,
    roundUpConfig.coverFees || false
  );

  Logger.info(`\n💰 Manual RoundUp Donation Breakdown:`);
  Logger.info(`   Base Amount: $${financials.baseAmount.toFixed(2)}`);
  Logger.info(`   Total Charge: $${financials.totalCharge.toFixed(2)}`);

  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const organization = await OrganizationModel.findById(
      roundUpConfig.organization
    ).session(session);
    if (!organization) {
      await session.abortTransaction();
      return {
        success: false,
        message: 'Organization not found',
        data: null,
        statusCode: StatusCodes.NOT_FOUND,
      };
    }

    const cause = await Cause.findById(roundUpConfig.cause).session(session);
    if (!cause) {
      await session.abortTransaction();
      return {
        success: false,
        message: 'Cause not found!',
        data: null,
        statusCode: StatusCodes.NOT_FOUND,
      };
    }
    if (cause.status !== CAUSE_STATUS_TYPE.VERIFIED) {
      await session.abortTransaction();
      return {
        success: false,
        message: `Cannot create donation for cause with status: ${cause.status}.`,
        data: null,
        statusCode: StatusCodes.BAD_REQUEST,
      };
    }

    const donor = await Client.findOne({ auth: userId }).session(session);
    if (!donor?._id) {
      await session.abortTransaction();
      return {
        success: false,
        message: 'Donor not found!',
        data: null,
        statusCode: StatusCodes.NOT_FOUND,
      };
    }

    const donationUniqueId = new Types.ObjectId();

    const donation = new Donation({
      _id: donationUniqueId,
      donor: new Types.ObjectId(donor._id),
      organization: roundUpConfig.organization,
      cause: roundUpConfig.cause,
      donationType: 'round-up',

      // ✅ Breakdown
      amount: financials.baseAmount,
      coverFees: financials.coverFees,
      platformFee: financials.platformFee,
      gstOnFee: financials.gstOnFee,
      netAmount: financials.netToOrg,
      totalAmount: financials.totalCharge,

      // Legacy
      isTaxable: roundUpConfig.isTaxable || false,
      taxAmount: financials.gstOnFee,

      currency: 'USD',
      status: 'pending',
      specialMessage:
        specialMessage || `Manual round-up donation - ${currentMonth}`,
      pointsEarned: Math.round(baseAmount * 100),

      roundUpId: roundUpConfig._id,
      roundUpTransactionIds: eligibleTransactions.map(
        (t: IRoundUpTransaction) => t.transactionId
      ),
      receiptGenerated: false,
      createdAt: new Date(),
    });

    const savedDonation = await donation.save({ session });

    // NOTE: StripeService updated to hold funds in platform
    const paymentResult = await StripeService.createRoundUpPaymentIntent({
      roundUpId: String(roundUpConfig._id),
      userId,
      charityId: roundUpConfig.organization,
      causeId: roundUpConfig.cause,
      amount: baseAmount,

      // ✅ Pass Breakdown
      coverFees: financials.coverFees,
      platformFee: financials.platformFee,
      gstOnFee: financials.gstOnFee,
      netToOrg: financials.netToOrg,
      totalAmount: financials.totalCharge,

      // Legacy
      isTaxable: roundUpConfig.isTaxable,
      taxAmount: financials.gstOnFee,

      month: currentMonth,
      year: now.getFullYear(),
      specialMessage:
        specialMessage || `Manual round-up donation - ${currentMonth}`,
      donationId: String(donationUniqueId),
    });

    savedDonation.stripePaymentIntentId = paymentResult.payment_intent_id;
    savedDonation.status = 'processing';
    await savedDonation.save({ session });

    roundUpConfig.status = 'processing';
    roundUpConfig.lastDonationAttempt = new Date();
    roundUpConfig.currentMonthTotal = Math.max(
      (roundUpConfig.currentMonthTotal || 0) - baseAmount,
      0
    );
    await roundUpConfig.save({ session });

    await RoundUpTransactionModel.updateMany(
      {
        user: userId,
        bankConnection: roundUpConfig.bankConnection,
        transactionId: {
          $in: eligibleTransactions.map(
            (t: IRoundUpTransaction) => t.transactionId
          ),
        },
        status: 'processed',
      },
      {
        stripePaymentIntentId: paymentResult.payment_intent_id,
        donationAttemptedAt: new Date(),
        donation: donationUniqueId,
      },
      { session }
    );

    await session.commitTransaction();

    return {
      success: true,
      message:
        'Manual RoundUp donation initiated successfully. Payment processing in progress.',
      data: {
        donationId: String(donationUniqueId),
        paymentIntentId: paymentResult.payment_intent_id,
        baseAmount,
        taxAmount: financials.gstOnFee,
        totalAmount: financials.totalCharge,
        status: 'processing',
      },
      statusCode: StatusCodes.OK,
    };
  } catch (error) {
    await session.abortTransaction();

    await roundUpConfig.markAsFailed(
      error instanceof Error ? error.message : 'Unknown payment error'
    );

    return {
      success: false,
      message: 'Payment processing failed. Round-up marked as failed.',
      data: {
        roundUpId: String(roundUpConfig._id),
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown payment error',
      },
      statusCode: StatusCodes.BAD_GATEWAY,
    };
  } finally {
    await session.endSession();
  }
};

const resumeRoundUp = async (
  userId: string,
  payload: { roundUpId?: string }
) => {
  const { roundUpId } = payload;

  const roundUpConfig = await RoundUpModel.findOne({
    _id: roundUpId,
    user: userId,
    isActive: true,
  });

  if (!roundUpConfig) {
    return {
      success: false,
      message: 'Round-up configuration not found',
      data: null,
      statusCode: StatusCodes.NOT_FOUND,
    };
  }

  if (roundUpConfig.enabled) {
    return {
      success: false,
      message: 'Round-up is already active',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  if (roundUpConfig.status === 'cancelled') {
    return {
      success: false,
      message:
        'Cannot resume cancelled round-up. Please create a new round-up configuration.',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  roundUpConfig.enabled = true;
  if (roundUpConfig.status === 'failed') {
    roundUpConfig.status = 'pending';
  }
  await roundUpConfig.save();

  return {
    success: true,
    message: 'Round-up has been resumed successfully',
    data: {
      roundUpId: String(roundUpConfig._id),
      enabled: true,
    },
    statusCode: StatusCodes.OK,
  };
};

const switchCharity = async (
  userId: string,
  payload: {
    roundUpId?: string;
    newOrganizationId?: string;
    newCauseId?: string;
    reason?: string;
  }
) => {
  const { roundUpId, newOrganizationId, newCauseId } = payload;

  const roundUpConfig = await RoundUpModel.findOne({
    _id: roundUpId,
    user: userId,
  });

  if (!roundUpConfig) {
    return {
      success: false,
      message: 'Round-up configuration not found',
      data: null,
      statusCode: StatusCodes.NOT_FOUND,
    };
  }

  const newOrganization = await OrganizationModel.findById(newOrganizationId);
  if (!newOrganization) {
    return {
      success: false,
      message: 'Invalid organization selected',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  const newCause = await Cause.findById(newCauseId);
  if (!newCause) {
    return {
      success: false,
      message: 'Invalid cause selected',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  if (newCause.organization.toString() !== newOrganizationId) {
    return {
      success: false,
      message: 'Cause does not belong to the specified organization',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  const canSwitch = (roundUpConfig as any).canSwitchCharity();
  if (!canSwitch) {
    const daysSinceSwitch = roundUpConfig.lastCharitySwitch
      ? Math.floor(
          (Date.now() - roundUpConfig.lastCharitySwitch.getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : Infinity;
    const daysUntilNextSwitch = 30 - daysSinceSwitch;

    return {
      success: false,
      message: `Cannot switch charity yet. Wait ${daysUntilNextSwitch} more days`,
      data: {
        canSwitch: false,
        daysUntilNextSwitch,
      },
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  roundUpConfig.organization = newOrganizationId;
  roundUpConfig.cause = newCauseId || roundUpConfig.cause;
  roundUpConfig.lastCharitySwitch = new Date();
  await roundUpConfig.save();

  return {
    success: true,
    message: 'Charity switched successfully',
    data: {
      success: true,
      canSwitch: true,
      newOrganizationName: newOrganization.name,
      newCauseName: newCause.name,
    },
    statusCode: StatusCodes.OK,
  };
};

const getUserDashboard = async (userId: string) => {
  const roundUpConfig = await (RoundUpModel as any).findActiveByUserId(userId);

  if (!roundUpConfig) {
    return {
      success: true,
      message: 'No active round-up configuration',
      data: {
        hasRoundUp: false,
        config: null,
      },
      statusCode: StatusCodes.OK,
    };
  }

  const [bankConnection, organization, cause, transactionSummary] =
    await Promise.all([
      bankConnectionService.getBankConnectionById(roundUpConfig.bankConnection),
      OrganizationModel.findById(roundUpConfig.organization),
      Cause.findById(roundUpConfig.cause),
      roundUpTransactionService.getTransactionSummary(userId),
    ]);

  const userStats = {
    totalDonated: transactionSummary.totalStats.totalDonated,
    totalRoundUps: transactionSummary.totalStats.totalTransactions,
    monthsDonated: 0,
    currentMonthTotal: transactionSummary.currentMonthTotal,
    currentCharity: {
      name: `${organization?.name || 'Unknown'} - ${
        cause?.name || 'Selected Cause'
      }`,
      totalFromUser: transactionSummary.totalStats.totalDonated,
    },
  };

  return {
    success: true,
    message: 'User dashboard retrieved successfully',
    data: {
      hasRoundUp: true,
      config: roundUpConfig,
      stats: userStats,
      bankConnection,
      organization,
      cause,
    },
    statusCode: StatusCodes.OK,
  };
};

const isDonationAlreadyProcessed = async (
  roundUpId: string,
  month: string
): Promise<boolean> => {
  const year = new Date().getFullYear();
  const existingDonation = await Donation.findOne({
    roundUpId,
    donationType: 'round-up',
    donationDate: {
      $gte: new Date(`${year}-${month}-01`),
      $lt: new Date(`${year}-${month}-31`),
    },
  });
  return !!existingDonation;
};

export const roundUpService = {
  savePlaidConsent,
  revokeConsent,
  syncTransactions,
  processMonthlyDonation,
  resumeRoundUp,
  switchCharity,
  getUserDashboard,
};
