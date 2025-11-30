import { RoundUpTransactionModel } from './roundUpTransaction.model';
import { RoundUpModel } from '../RoundUp/roundUp.model';

import {
  IRoundUpTransaction,
  ITransactionProcessingResult,
  IEligibleTransactions,
  ITransactionFilter,
} from './roundUpTransaction.interface';
import { IPlaidTransaction } from '../BankConnection/bankConnection.interface';
import { IRoundUpDocument } from '../RoundUp/roundUp.model';

import { StripeService } from '../Stripe/stripe.service';
import { Donation } from '../Donation/donation.model';
// ✅ Import calculateTax
import { calculateTax } from '../Donation/donation.constant';

import Cause from '../Causes/causes.model';
import { CAUSE_STATUS_TYPE } from '../Causes/causes.constant';
import { AppError } from '../../utils';
import Client from '../Client/client.model';
import httpStatus from 'http-status';
import { handleDuplicateError } from '../../errors';

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

// Trigger donation when threshold is met (webhook-based approach with Donation record first)

const triggerDonation = async (
  roundUpConfig: IRoundUpDocument
): Promise<{ paymentIntentId: string; donationId: string }> => {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}`;
  const previousMonthTotal = roundUpConfig.currentMonthTotal || 0;

  console.log({ roundUpConfig });

  try {
    // Get all pending round-up transactions for this user/month AND specific roundUp config
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

    // Calculate total amount for donation
    const totalAmount = pendingTransactions.reduce(
      (sum, transaction) => sum + (transaction as any).roundUpAmount,
      0
    );

    if (totalAmount <= 0) {
      console.warn(
        `⚠️ Invalid donation amount: $${totalAmount} for RoundUp ${roundUpConfig._id}`
      );
      throw new Error('Invalid donation amount');
    }

    console.log(
      `\n🎯 Creating donation record for RoundUp ${roundUpConfig._id}`
    );
    console.log(`   User: ${roundUpConfig.user}`);
    console.log(`   Organization: ${roundUpConfig.organization}`);
    const cause = await Cause.findById(roundUpConfig.cause);
    if (!cause) {
      throw new AppError(httpStatus.NOT_FOUND, 'Cause not found!');
    }
    if (cause.status !== CAUSE_STATUS_TYPE.VERIFIED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Cannot create donation for cause with status: ${cause.status}. Only verified causes can receive donations.`
      );
    }

    // ✅ Find Client by auth ID (roundUpConfig.user is Auth._id)
    const donor = await Client.findOne({ auth: roundUpConfig.user });
    if (!donor?._id) {
      throw new AppError(httpStatus.NOT_FOUND, 'Donor not found!');
    }

    // Calculate tax and total amount
    const { taxAmount, totalAmount: donationTotalAmount } = calculateTax(
      totalAmount,
      roundUpConfig.isTaxable || false
    );

    console.log(`   Base Amount: $${totalAmount.toFixed(2)}`);
    console.log(`   Is Taxable: ${roundUpConfig.isTaxable || false}`);
    if (roundUpConfig.isTaxable) {
      console.log(`   Tax Amount: $${taxAmount.toFixed(2)}`);
      console.log(`   Total Charged: $${donationTotalAmount.toFixed(2)}`);
    }
    console.log(`   Transaction Count: ${pendingTransactions.length}`);
    console.log(`   Month: ${currentMonth}`);

    // STEP 1: Create Donation record with PENDING status
    const donation = await Donation.create({
      donor: donor._id,
      organization: roundUpConfig.organization,
      cause: roundUpConfig.cause,
      donationType: 'round-up',
      amount: totalAmount,
      isTaxable: roundUpConfig.isTaxable || false,
      taxAmount,
      totalAmount: donationTotalAmount,
      currency: 'USD',
      status: 'pending',
      donationDate: new Date(),
      specialMessage:
        roundUpConfig.specialMessage || `Round-up donation for ${currentMonth}`,
      pointsEarned: Math.round(totalAmount * 100), // $1 = 100 points
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

    console.log(`✅ Donation record created with ID: ${donation._id}`);
    console.log(`   Status: ${donation.status}`);

    // STEP 2: Create Stripe Payment Intent with donationId in metadata
    let paymentResult;
    try {
      paymentResult = await StripeService.createRoundUpPaymentIntent({
        roundUpId: String(roundUpConfig._id),
        userId: String(roundUpConfig.user),
        charityId: String(roundUpConfig.organization),
        causeId: String(roundUpConfig.cause),
        amount: totalAmount,
        // Additional tax fields for metadata
        isTaxable: roundUpConfig.isTaxable || false,
        taxAmount: taxAmount,
        totalAmount: donationTotalAmount,
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
      // If PaymentIntent creation fails, update donation to failed
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

      // Also mark round-up as failed
      await roundUpConfig.markAsFailed(
        error instanceof Error
          ? error.message
          : 'Payment intent creation failed'
      );

      // Update transactions back to 'processed' status so they can be retried
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

    // STEP 3: Update Donation status to PROCESSING after PaymentIntent created
    const donationDoc = donation.toObject();
    await Donation.findByIdAndUpdate(donation._id, {
      status: 'processing',
      stripePaymentIntentId: paymentResult.payment_intent_id,
      metadata: {
        ...(donationDoc.metadata || {}),
        paymentInitiatedAt: new Date(),
      },
    });

    console.log(`✅ Donation ${donation._id} updated to 'processing' status`);

    // STEP 4: Mark transactions as processing (payment initiated)
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

    console.log(
      `✅ ${pendingTransactions.length} transactions updated to 'processing' status`
    );

    // STEP 5: Update round-up configuration book-keeping
    roundUpConfig.status = 'processing';
    roundUpConfig.lastDonationAttempt = new Date();
    roundUpConfig.currentMonthTotal = Math.max(
      previousMonthTotal - totalAmount,
      0
    );
    await roundUpConfig.save();

    console.log(
      `✅ RoundUp ${roundUpConfig._id} updated to 'processing' status with ${roundUpConfig.currentMonthTotal} remaining`
    );

    console.log('\n🔄 RoundUp donation flow completed:');
    console.log(`   RoundUp ID: ${roundUpConfig._id}`);
    console.log(`   Donation ID: ${donation._id}`);
    console.log(`   Payment Intent ID: ${paymentResult.payment_intent_id}`);
    console.log(`   Base Amount: $${totalAmount.toFixed(2)}`);
    if (roundUpConfig.isTaxable) {
      console.log(`   Tax Amount: $${taxAmount.toFixed(2)}`);
      console.log(`   Total Charged: $${donationTotalAmount.toFixed(2)}`);
    }
    console.log(`   Charity: ${roundUpConfig.organization}`);
    console.log(`   Status: Awaiting webhook confirmation...\n`);

    return {
      paymentIntentId: paymentResult.payment_intent_id,
      donationId: String(donation._id),
    };
  } catch (error) {
    console.error(
      `❌ Error triggering RoundUp donation for ${roundUpConfig._id}:`,
      error
    );

    // Restore the tracked month total so threshold math stays accurate if donation setup fails
    roundUpConfig.currentMonthTotal = previousMonthTotal;
    await roundUpConfig.save();

    throw error;
  }
};

// Process Plaid transactions and create round-up entries
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
    // Get user's round-up configuration
    const roundUpConfig = await RoundUpModel.findOne({
      user: userId,
      bankConnection: bankConnectionId,
      isActive: true,
      enabled: true,
    });

    if (!roundUpConfig) {
      throw new Error('No active round-up configuration found');
    }

    // Reset monthly total if needed
    await checkAndResetMonthlyTotal(roundUpConfig);

    // Check if monthly threshold is already met
    if (
      roundUpConfig.monthlyThreshold !== 'no-limit' &&
      typeof roundUpConfig.monthlyThreshold === 'number' &&
      roundUpConfig.currentMonthTotal >= roundUpConfig.monthlyThreshold
    ) {
      result.skipped = plaidTransactions.length;
      return result;
    }

    // Process each transaction
    for (const plaidTransaction of plaidTransactions) {
      try {
        // Skip transactions without a valid transaction_id
        if (
          !plaidTransaction.transaction_id ||
          plaidTransaction.transaction_id.trim() === ''
        ) {
          console.warn(
            `Skipping transaction without transaction_id: ${
              plaidTransaction.name || 'Unknown'
            } (Date: ${plaidTransaction.date})`
          );
          result.skipped++;
          continue;
        }

        // Check if transaction already processed
        const existingRoundUp = await RoundUpTransactionModel.findOne({
          transactionId: plaidTransaction.transaction_id,
        }).lean();

        if (existingRoundUp) {
          console.log(
            `⏭️ Skipping duplicate transaction (found in DB): ${
              plaidTransaction.transaction_id
            } - ${plaidTransaction.name || 'Unknown'}`
          );
          result.skipped++;
          continue;
        }

        // Check if transaction is eligible for round-up
        if (!RoundUpTransactionModel.isTransactionEligible(plaidTransaction)) {
          result.skipped++;
          continue;
        }

        // console.log(`========== Eligible Transaction ==========`);
        // console.log(plaidTransaction, { depth: Infinity });
        // console.log(`==========================================`);

        // Calculate round-up amount
        const roundUpAmount = RoundUpTransactionModel.calculateRoundUpAmount(
          plaidTransaction.amount
        );

        // Skip if no round-up needed (exact dollar amount)
        if (roundUpAmount === 0) {
          result.skipped++;
          continue;
        }

        // Check if adding this would exceed monthly threshold
        const newMonthlyTotal = roundUpConfig.currentMonthTotal + roundUpAmount;
        if (
          roundUpConfig.monthlyThreshold !== 'no-limit' &&
          typeof roundUpConfig.monthlyThreshold === 'number' &&
          newMonthlyTotal > roundUpConfig.monthlyThreshold
        ) {
          result.skipped++;
          continue;
        }

        // Extract Categories
        const categories: string[] = [];
        if (plaidTransaction.personal_finance_category?.primary) {
          categories.push(plaidTransaction.personal_finance_category.primary);
        }
        if (plaidTransaction.personal_finance_category?.detailed) {
          categories.push(plaidTransaction.personal_finance_category.detailed);
        }

        // Create round-up transaction
        const roundUpTransaction = new RoundUpTransactionModel({
          user: userId,
          bankConnection: bankConnectionId,
          roundUp: roundUpConfig._id,
          transactionId: plaidTransaction.transaction_id,
          plaidTransactionId: plaidTransaction.transaction_id, // Legacy field
          originalAmount: plaidTransaction.amount,
          roundUpAmount,
          currency: plaidTransaction.iso_currency_code || 'USD',
          organization: roundUpConfig.organization,
          transactionDate: new Date(plaidTransaction.date),
          transactionName: plaidTransaction.name,
          transactionCategory:
            categories.length > 0 ? categories : ['Uncategorized'],
          status: 'processed',
        });

        await roundUpTransaction.save();

        // Update round-up configuration totals
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const thresholdReached = (roundUpConfig as any).addRoundUpAmount(
          roundUpAmount
        );

        result.processed++;
        result.roundUpsCreated.push(roundUpTransaction as IRoundUpTransaction);

        // If threshold reached, trigger donation
        if (thresholdReached && roundUpConfig.monthlyThreshold !== 'no-limit') {
          console.log(`\n🎯 THRESHOLD REACHED for user ${userId}!`);
          console.log(`   Current total: $${roundUpConfig.currentMonthTotal}`);
          console.log(`   Threshold: $${roundUpConfig.monthlyThreshold}`);
          console.log(`   Triggering donation process...\n`);

          result.thresholdReached = {
            roundUpId: String(roundUpConfig._id),
            amount: roundUpConfig.currentMonthTotal,
            charityId: String(roundUpConfig.organization),
          };

          // Trigger immediate donation processing with Donation record creation
          const donationResult = await triggerDonation(roundUpConfig);

          console.log(`✅ Donation triggered successfully`);
          console.log(`   Donation ID: ${donationResult.donationId}`);
          console.log(`   Payment Intent: ${donationResult.paymentIntentId}`);

          break; // Stop processing further transactions
        }
      } catch (error: unknown) {
        console.log({ error });
        // Handle duplicate key errors specifically
        const isMongoDuplicateKeyError = (
          err: unknown
        ): err is { code?: number; codeName?: string } => {
          if (!err || typeof err !== 'object') return false;
          const e = err as any;
          return (
            (typeof e.code === 'number' && e.code === 11000) ||
            (typeof e.codeName === 'string' && e.codeName === 'DuplicateKey')
          );
        };

        if (isMongoDuplicateKeyError(error)) {
          console.warn(
            `Duplicate transaction detected (skipping): ${
              plaidTransaction.transaction_id || 'N/A'
            } - ${plaidTransaction.name || 'Unknown'}`
          );
          result.skipped++;
        } else {
          console.error('Error processing transaction:', error);
          result.failed++;
        }
      }
    }

    console.log('✅ Finished processing Plaid transactions for RoundUp');

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
        $match: { user: userId },
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
          user: userId,
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
        $match: { user: userId },
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

export const roundUpTransactionService = {
  processTransactionsFromPlaid,
  getTransactionSummary,
  getTransactions,
  getEligibleTransactions,
  getTransactionById,
};
