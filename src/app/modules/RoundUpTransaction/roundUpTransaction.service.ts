/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose, { Types } from 'mongoose';
import httpStatus from 'http-status';

import { RoundUpTransactionModel } from './roundUpTransaction.model';
import { RoundUpModel, IRoundUpDocument } from '../RoundUp/roundUp.model';
import {
  IRoundUpTransaction,
  ITransactionProcessingResult,
  IEligibleTransactions,
  ITransactionFilter,
} from './roundUpTransaction.interface';
import { IPlaidTransaction } from '../BankConnection/bankConnection.interface';

import { StripeService } from '../Stripe/stripe.service';
import { Donation } from '../Donation/donation.model';
import { calculateAustralianFees } from '../Donation/donation.constant';

import Cause from '../Causes/causes.model';
import { CAUSE_STATUS_TYPE } from '../Causes/causes.constant';
import { AppError } from '../../utils';
import Client from '../Client/client.model';
import { Logger } from '../../utils/logger';
import { OrganizationModel } from '../Organization/organization.model';
import { StripeAccount } from '../OrganizationAccount/stripe-account.model';
import { createNotification } from '../Notification/notification.service';
import { NOTIFICATION_TYPE } from '../Notification/notification.constant';

// Check and reset monthly total at the beginning of each month
const checkAndResetMonthlyTotal = async (
  roundUpConfig: IRoundUpDocument
): Promise<void> => {
  const now = new Date();
  const lastReset = new Date(roundUpConfig.lastMonthReset);

  // Check if we're in a new month
  if (
    now.getMonth() !== lastReset.getMonth() ||
    now.getFullYear() !== lastReset.getFullYear()
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (roundUpConfig as any).resetMonthlyTotal();
  }
};

// ==========================================
// ⚡ TRIGGER DONATION (Automatic - Destination Charge)
// ==========================================
const triggerDonation = async (
  roundUpConfig: IRoundUpDocument
): Promise<{ paymentIntentId: string; donationId: string }> => {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`;
  const previousMonthTotal = roundUpConfig.currentMonthTotal || 0;

  try {
    // 1. Fetch Organization to get Stripe ID
    const organization = await OrganizationModel.findById(
      roundUpConfig.organization
    );
    if (!organization) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Organization not found!');
    }

    // check is stripe account exists :
    const stripeAccount = await StripeAccount.findOne({
      organization: organization._id,
      status: 'active',
    });

    if (!stripeAccount || !stripeAccount.chargesEnabled) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'This organization is not set up to receive payments (Stripe account inactive).'
      );
    }

    // 2. Gather Transactions
    const pendingTransactions = await RoundUpTransactionModel.find({
      user: roundUpConfig.user,
      bankConnection: roundUpConfig.bankConnection,
      roundUp: roundUpConfig._id,
      status: 'processed',
      stripePaymentIntentId: { $in: [null, undefined] },
    });

    if (pendingTransactions.length === 0) {
      throw new Error('No processed transactions found for donation');
    }

    const baseAmount = pendingTransactions.reduce(
      (sum, transaction) => sum + (transaction as any).roundUpAmount,
      0
    );

    if (baseAmount <= 0) throw new Error('Invalid donation amount');

    // 3.  Calculate Fees (Destination Charge Logic)
    const financials = calculateAustralianFees(
      baseAmount,
      roundUpConfig.coverFees || false
    );

    // Platform Fee + GST
    const applicationFee = financials.platformFeeWithStripe;

    console.log(`\n🎯 Triggering RoundUp Donation (Destination Charge):`);
    console.log(`   Base: $${financials.baseAmount.toFixed(2)}`);
    console.log(`   App Fee: $${applicationFee.toFixed(2)}`);
    console.log(`   Total Charged: $${financials.totalCharge.toFixed(2)}`);
    console.log(`   Destination: ${stripeAccount.stripeAccountId}`);

    // 4. Validate Donor & Cause
    const cause = await Cause.findById(roundUpConfig.cause);
    if (!cause || cause.status !== CAUSE_STATUS_TYPE.VERIFIED) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Cause not valid.');
    }
    const idempotencyKey = `roundup_auto_${roundUpConfig._id}_${Date.now()}`;

    const donor = await Client.findOne({ auth: roundUpConfig.user });
    if (!donor?._id)
      throw new AppError(httpStatus.NOT_FOUND, 'Donor not found!');

    // 5. Create Donation Record
    const donation = await Donation.create({
      donor: donor._id,
      organization: roundUpConfig.organization,
      cause: roundUpConfig.cause,
      donationType: 'round-up',

      //  Store Breakdown
      amount: financials.baseAmount,
      coverFees: financials.coverFees,
      platformFee: financials.platformFee,
      gstOnFee: financials.gstOnFee,
      stripeFee: financials.stripeFee,
      netAmount: financials.netToOrg,
      totalAmount: financials.totalCharge,

      currency: 'USD',
      status: 'pending',
      donationDate: new Date(),
      specialMessage:
        roundUpConfig.specialMessage || `Round-up donation for ${currentMonth}`,
      pointsEarned: Math.round(financials.baseAmount * 100),
      roundUpId: roundUpConfig._id,
      roundUpTransactionIds: pendingTransactions.map((t) => t._id),
      receiptGenerated: false,
      idempotencyKey,
      metadata: {
        userId: String(roundUpConfig.user),
        roundUpId: String(roundUpConfig._id),
      },
    });

    let paymentResult;
    try {
      // 6. Create Payment Intent (Destination Charge)
      paymentResult = await StripeService.createRoundUpPaymentIntent({
        roundUpId: String(roundUpConfig._id),
        userId: String(roundUpConfig.user),
        charityId: String(roundUpConfig.organization),
        causeId: String(roundUpConfig.cause),

        amount: financials.baseAmount,
        totalAmount: financials.totalCharge,

        //  Destination Charge Params
        applicationFee: applicationFee,

        // Metadata Breakdown
        coverFees: financials.coverFees,
        platformFee: financials.platformFee,
        gstOnFee: financials.gstOnFee,
        stripeFee: financials.stripeFee,
        netToOrg: financials.netToOrg,

        month: currentMonth,
        year: now.getFullYear(),
        specialMessage: roundUpConfig.specialMessage as string,
        donationId: String(donation._id),
        paymentMethodId: roundUpConfig.paymentMethod as string,
      });
    } catch (error) {
      // Error Handling: Mark as failed and revert
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

      // Revert transactions to 'processed' so they are picked up again later
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

    // 7. Success Updates
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

    return {
      paymentIntentId: paymentResult.payment_intent_id,
      donationId: String(donation._id),
    };
  } catch (error) {
    console.log({ error });
    // Final safety catch: revert config total
    roundUpConfig.currentMonthTotal = previousMonthTotal;
    await roundUpConfig.save();
    throw error;
  }
};

// ==========================================
// 3. PROCESS TRANSACTIONS FROM PLAID (Core Engine)
// ==========================================
const processTransactionsFromPlaid = async (
  userId: string,
  bankConnectionId: string,
  plaidTransactions: IPlaidTransaction[]
): Promise<ITransactionProcessingResult> => {
  const result: ITransactionProcessingResult = {
    processed: 0,
    skipped: 0,
    failed: 0,
    roundUpsCreated: [],
  };

  try {
    // 1. Get user's active round-up configuration
    const roundUpConfig = await RoundUpModel.findOne({
      user: userId,
      bankConnection: bankConnectionId,
      isActive: true,
      enabled: true,
      status: 'pending',
    });

    if (!roundUpConfig) {
      // Not an error, just means no config active for this bank
      console.log('No active round-up configuration found');
      return result;
    }

    // 2. Reset monthly total if new month
    await checkAndResetMonthlyTotal(roundUpConfig);

    // 3. Check if monthly threshold is already met (Skip processing if cap reached)
    if (
      roundUpConfig.monthlyThreshold !== 'no-limit' &&
      typeof roundUpConfig.monthlyThreshold === 'number' &&
      roundUpConfig.currentMonthTotal >= roundUpConfig.monthlyThreshold
    ) {
      result.skipped = plaidTransactions.length;
      return result;
    }

    // 4. Process each transaction
    for (const plaidTransaction of plaidTransactions) {
      try {
        // Validation: Must have ID
        if (
          !plaidTransaction.transaction_id ||
          plaidTransaction.transaction_id.trim() === ''
        ) {
          result.skipped++;
          continue;
        }

        // Deduplication: Check if already processed
        const existingRoundUp = await RoundUpTransactionModel.findOne({
          transactionId: plaidTransaction.transaction_id,
        }).lean();

        if (existingRoundUp) {
          result.skipped++;
          continue;
        }

        // Eligibility Check: Must be a purchase/debit, not transfer/income
        if (!RoundUpTransactionModel.isTransactionEligible(plaidTransaction)) {
          result.skipped++;
          continue;
        }

        //  Calculate round-up (e.g., $4.50 -> $0.50)
        const roundUpAmount = RoundUpTransactionModel.calculateRoundUpAmount(
          plaidTransaction.amount
        );

        // Skip exact dollar amounts (0.00 round up)
        if (roundUpAmount === 0) {
          result.skipped++;
          continue;
        }

        // Limit Check: Will this specific transaction push over the monthly limit?
        const newMonthlyTotal = roundUpConfig.currentMonthTotal + roundUpAmount;
        if (
          roundUpConfig.monthlyThreshold !== 'no-limit' &&
          typeof roundUpConfig.monthlyThreshold === 'number' &&
          newMonthlyTotal > roundUpConfig.monthlyThreshold
        ) {
          result.skipped++;
          continue;
        }

        // Extract Categories for reporting
        const categories: string[] = [];
        if (plaidTransaction.personal_finance_category?.primary) {
          categories.push(plaidTransaction.personal_finance_category.primary);
        }
        if (plaidTransaction.personal_finance_category?.detailed) {
          categories.push(plaidTransaction.personal_finance_category.detailed);
        }

        // 5. Create the Record
        const roundUpTransaction = new RoundUpTransactionModel({
          user: userId,
          bankConnection: bankConnectionId,
          roundUp: roundUpConfig._id,
          transactionId: plaidTransaction.transaction_id,
          plaidTransactionId: plaidTransaction.transaction_id, // Legacy support
          originalAmount: plaidTransaction.amount,
          roundUpAmount,
          currency: plaidTransaction.iso_currency_code || 'USD', // Plaid US default
          organization: roundUpConfig.organization,
          transactionDate: new Date(plaidTransaction.date),
          transactionName: plaidTransaction.name,
          transactionCategory:
            categories.length > 0 ? categories : ['Uncategorized'],
          status: 'processed', // Ready for aggregation
        });

        await roundUpTransaction.save();

        // 6. Update Accumulator on Config
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const thresholdReached = (roundUpConfig as any).addRoundUpAmount(
          roundUpAmount
        );

        result.processed++;
        result.roundUpsCreated.push(roundUpTransaction as IRoundUpTransaction);

        // 7. Auto-Donate Trigger (If limit reached)
        if (thresholdReached && roundUpConfig.monthlyThreshold !== 'no-limit') {
          console.log(`\n🎯 THRESHOLD REACHED for user ${userId}!`);
          console.log(`   Current total: $${roundUpConfig.currentMonthTotal}`);
          console.log(`   Threshold: $${roundUpConfig.monthlyThreshold}`);

          result.thresholdReached = {
            roundUpId: String(roundUpConfig._id),
            amount: roundUpConfig.currentMonthTotal,
            charityId: String(roundUpConfig.organization),
          };

          // ⚡ Trigger Donation Immediately (Destination Charge)
          // This calls the refactored function we defined earlier
          await triggerDonation(roundUpConfig);
          console.log(`✅ Donation triggered successfully`);

          try {
            await createNotification(
              userId,
              NOTIFICATION_TYPE.THRESHOLD_REACHED,
              `Your Round-Up balance reached $${roundUpConfig.monthlyThreshold}. A donation has been triggered!`,
              roundUpConfig?._id!.toString()
            );
            console.log('✅ Round up Triggered notification sent');
          } catch (err) {
            console.log('❌ Failed to sent roundup triggered notification');
          }
          // Stop processing further transactions to prevent over-charging in this batch
          break;
        }
      } catch (error: any) {
        // Handle race condition on unique index (duplicate transaction ID)
        if (error?.code === 11000) {
          result.skipped++;
        } else {
          console.error('Error processing individual transaction:', error);
          result.failed++;
        }
      }
    }

    return result;
  } catch (error) {
    console.error('Error in processTransactionsFromPlaid:', error);
    throw error;
  }
};

// Get user's round-up transaction summary
const getTransactionSummary = async (userId: string): Promise<any> => {
  try {
    const pipeline = [
      {
        $match: { user: new Types.ObjectId(userId) },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$roundUpAmount' },
        },
      },
    ];

    const statusCounts = await RoundUpTransactionModel.aggregate(pipeline);

    // Get current month total
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const currentMonthTotal = await RoundUpTransactionModel.aggregate([
      {
        $match: {
          user: new Types.ObjectId(userId),
          transactionDate: { $gte: currentMonthStart },
          status: { $in: ['processed', 'donated'] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$roundUpAmount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const totalStats = await RoundUpTransactionModel.aggregate([
      {
        $match: { user: new Types.ObjectId(userId) },
      },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalDonated: { $sum: '$roundUpAmount' },
          averageRoundUp: { $avg: '$roundUpAmount' },
        },
      },
    ]);

    return {
      statusCounts: statusCounts.reduce((acc, curr) => {
        acc[curr._id] = { count: curr.count, amount: curr.totalAmount };
        return acc;
      }, {}),
      currentMonthTotal: currentMonthTotal[0]?.total || 0,
      currentMonthCount: currentMonthTotal[0]?.count || 0,
      totalStats: totalStats[0] || {
        totalTransactions: 0,
        totalDonated: 0,
        averageRoundUp: 0,
      },
    };
  } catch (error) {
    console.error('Error getting transaction summary:', error);
    throw error;
  }
};

// Get transactions with filtering
const getTransactions = async (
  filter: ITransactionFilter,
  page = 1,
  limit = 50
): Promise<IRoundUpTransaction[]> => {
  try {
    const query: Record<string, unknown> = {};

    if (filter.user) query.user = filter.user;
    if (filter.bankConnection) query.bankConnection = filter.bankConnection;
    if (filter.organization) query.organization = filter.organization;
    if (filter.status) query.status = filter.status;

    if (filter.dateRange) {
      query.transactionDate = {
        $gte: filter.dateRange.start,
        $lte: filter.dateRange.end,
      };
    } else if (filter.month && filter.year) {
      const month = String(filter.month).padStart(2, '0');
      const startDate = new Date(`${filter.year}-${month}-01`);
      const endDate = new Date(filter.year, parseInt(month), 0, 23, 59, 59);

      query.transactionDate = {
        $gte: startDate,
        $lte: endDate,
      };
    }

    return (await RoundUpTransactionModel.find(query)
      .sort({ transactionDate: -1 })
      .limit(limit)
      .skip((page - 1) * limit)) as IRoundUpTransaction[];
  } catch (error) {
    console.error('Error getting transactions:', error);
    throw error;
  }
};

// Get eligible transactions for date range (for admin purposes)
const getEligibleTransactions = async (
  startDate: Date,
  endDate: Date,
  charityId?: string
): Promise<IEligibleTransactions> => {
  try {
    const matchPipeline: any = {
      transactionDate: { $gte: startDate, $lte: endDate },
      status: { $in: ['processed', 'donated'] },
    };

    if (charityId) {
      matchPipeline.organization = charityId;
    }

    const pipeline = [
      { $match: matchPipeline },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalRoundUpAmount: { $sum: '$roundUpAmount' },
          averageRoundUpAmount: { $avg: '$roundUpAmount' },
        },
      },
    ];

    const stats = await RoundUpTransactionModel.aggregate(pipeline);
    const transactions = await RoundUpTransactionModel.find(matchPipeline)
      .sort({ transactionDate: -1 })
      .limit(100); // Limit for admin view

    return {
      totalTransactions: stats[0]?.totalTransactions || 0,
      eligibleTransactions: stats[0]?.totalTransactions || 0,
      totalRoundUpAmount: stats[0]?.totalRoundUpAmount || 0,
      averageRoundUpAmount: stats[0]?.averageRoundUpAmount || 0,
      transactions: transactions as any,
    };
  } catch (error) {
    console.error('Error getting eligible transactions:', error);
    throw error;
  }
};

// Get specific transaction by ID
const getTransactionById = async (
  transactionId: string,
  userId?: string
): Promise<IRoundUpTransaction | null> => {
  try {
    const query: any = { transactionId };
    if (userId) query.user = userId;

    const transaction = await RoundUpTransactionModel.findOne(query).lean();
    return transaction as IRoundUpTransaction;
  } catch (error) {
    console.error('Error getting transaction by ID:', error);
    throw error;
  }
};

// ==========================================
// 2. PROCESS MONTHLY DONATION (Manual - Destination Charge)
// ==========================================
const processMonthlyDonation = async (
  userId: string,
  payload: { roundUpId?: string; specialMessage?: string }
) => {
  const { roundUpId, specialMessage } = payload;

  // 1. Find and validate the RoundUp configuration
  const roundUpConfig = await RoundUpModel.findOne({
    _id: roundUpId,
    user: userId,
    isActive: true,
  });

  if (!roundUpConfig) {
    return {
      success: false,
      message: 'Round-up configuration not found',
      statusCode: httpStatus.NOT_FOUND,
      data: null,
    };
  }

  // Check if it's currently enabled (not paused)
  if (!roundUpConfig.enabled) {
    return {
      success: false,
      message:
        'Round-up is currently paused. Please resume it to process donation.',
      statusCode: httpStatus.BAD_REQUEST,
      data: null,
    };
  }

  // Prevent multiple donations if one is already in flight
  if (roundUpConfig.status === 'processing') {
    return {
      success: false,
      message: 'A donation is already being processed for this configuration.',
      statusCode: httpStatus.BAD_REQUEST,
      data: null,
    };
  }

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`;

  // 2. Check if this month's donation was already finalized
  if (
    await isDonationAlreadyProcessed(String(roundUpConfig._id), currentMonth)
  ) {
    return {
      success: false,
      message: 'Donation already processed for this month',
      statusCode: httpStatus.CONFLICT,
      data: null,
    };
  }

  // 3. Gather eligible transactions for this month/year that haven't been charged
  const processedTransactions = await getTransactions({
    user: userId,
    bankConnection: roundUpConfig.bankConnection,
    status: 'processed',
    month: String(now.getMonth() + 1),
    year: now.getFullYear(),
  });

  const eligibleTransactions = processedTransactions.filter(
    (transaction: IRoundUpTransaction) => !transaction.stripePaymentIntentId
  );

  if (eligibleTransactions.length === 0) {
    return {
      success: false,
      message: 'No processed transactions found for this month',
      statusCode: httpStatus.BAD_REQUEST,
      data: null,
    };
  }

  // 4. Calculate total base amount (sum of round-ups)
  const baseAmount = eligibleTransactions.reduce(
    (sum: number, transaction: IRoundUpTransaction) =>
      sum + transaction.roundUpAmount,
    0
  );

  // 5. ✅ Calculate Australian Fees & Split
  const financials = calculateAustralianFees(
    baseAmount,
    roundUpConfig.coverFees || false
  );

  // applicationFee = Platform Revenue + GST component
  const applicationFee = financials.platformFeeWithStripe;

  Logger.info(`\n💰 Manual RoundUp Breakdown (Destination Charge):`);
  Logger.info(`   Base: $${financials.baseAmount.toFixed(2)}`);
  Logger.info(`   App Fee: $${applicationFee.toFixed(2)}`);
  Logger.info(`   Total: $${financials.totalCharge.toFixed(2)}`);

  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    // 6. Fetch Org & Validate Stripe Connection
    const organization = await OrganizationModel.findById(
      roundUpConfig.organization
    ).session(session);

    if (!organization) {
      await session.abortTransaction();
      return {
        success: false,
        message: 'Organization not found!',
        statusCode: httpStatus.BAD_REQUEST,
        data: null,
      };
    }

    // check is stripe account exists :
    const stripeAccount = await StripeAccount.findOne({
      organization: organization._id,
      status: 'active',
    });

    if (!stripeAccount || !stripeAccount.chargesEnabled) {
      return {
        success: false,
        message:
          'This organization is not set up to receive payments (Stripe account inactive).',
        statusCode: httpStatus.BAD_REQUEST,
        data: null,
      };
    }

    // 7. Validate Cause
    const cause = await Cause.findById(roundUpConfig.cause).session(session);
    if (!cause || cause.status !== CAUSE_STATUS_TYPE.VERIFIED) {
      await session.abortTransaction();
      return {
        success: false,
        message: 'The selected cause is no longer verified or exists.',
        statusCode: httpStatus.BAD_REQUEST,
        data: null,
      };
    }

    // 8. Validate Donor
    const donor = await Client.findOne({ auth: userId }).session(session);
    if (!donor?._id) {
      await session.abortTransaction();
      return {
        success: false,
        message: 'Donor profile not found',
        statusCode: httpStatus.NOT_FOUND,
        data: null,
      };
    }

    const donationUniqueId = new Types.ObjectId();

    // 9. Create Main Donation Record
    const donation = new Donation({
      _id: donationUniqueId,
      donor: new Types.ObjectId(donor._id),
      organization: roundUpConfig.organization,
      cause: roundUpConfig.cause,
      donationType: 'round-up',

      //  Store Financial Breakdown
      amount: financials.baseAmount,
      coverFees: financials.coverFees,
      platformFee: financials.platformFee,
      gstOnFee: financials.gstOnFee,
      stripeFee: financials.stripeFee,
      netAmount: financials.netToOrg,
      totalAmount: financials.totalCharge,

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

    await donation.save({ session });

    // 10. Create Stripe Payment Intent (Destination Charge)
    const paymentResult = await StripeService.createRoundUpPaymentIntent({
      roundUpId: String(roundUpConfig._id),
      userId,
      charityId: String(roundUpConfig.organization),
      causeId: String(roundUpConfig.cause),

      amount: financials.baseAmount,
      totalAmount: financials.totalCharge,

      // Pass Destination Params
      applicationFee,

      coverFees: financials.coverFees,
      platformFee: financials.platformFee,
      gstOnFee: financials.gstOnFee,
      stripeFee: financials.stripeFee,
      netToOrg: financials.netToOrg,

      month: currentMonth,
      year: now.getFullYear(),
      specialMessage:
        specialMessage || `Manual round-up donation - ${currentMonth}`,
      donationId: String(donationUniqueId),
      paymentMethodId: roundUpConfig.paymentMethod as string,
    });

    // 11. Update Success States
    donation.stripePaymentIntentId = paymentResult.payment_intent_id;
    donation.status = 'processing';
    await donation.save({ session });

    roundUpConfig.status = 'processing';
    roundUpConfig.lastDonationAttempt = new Date();
    // Reduce current tracking balance by what was just charged
    roundUpConfig.currentMonthTotal = Math.max(
      (roundUpConfig.currentMonthTotal || 0) - baseAmount,
      0
    );
    await roundUpConfig.save({ session });

    // Link the Stripe PI to individual micro-transactions
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
        'Manual RoundUp donation initiated successfully. Payment is processing.',
      data: {
        donationId: String(donationUniqueId),
        paymentIntentId: paymentResult.payment_intent_id,
        baseAmount,
        totalAmount: financials.totalCharge,
        status: 'processing',
      },
      statusCode: httpStatus.OK,
    };
  } catch (error) {
    await session.abortTransaction();

    // Mark config as failed so user sees there was an issue
    await roundUpConfig.markAsFailed(
      error instanceof Error ? error.message : 'Unknown payment error'
    );

    return {
      success: false,
      message: 'Payment processing failed. Please check your payment method.',
      data: {
        roundUpId: String(roundUpConfig._id),
        status: 'failed',
        error: error instanceof Error ? error.message : 'Error',
      },
      statusCode: httpStatus.BAD_GATEWAY,
    };
  } finally {
    await session.endSession();
  }
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

export const roundUpTransactionService = {
  processTransactionsFromPlaid,
  getTransactionSummary,
  getTransactions,
  getEligibleTransactions,
  getTransactionById,
  triggerDonation,
  processMonthlyDonation,
};
