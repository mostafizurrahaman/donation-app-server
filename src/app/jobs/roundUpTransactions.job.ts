import cron from 'node-cron';
import mongoose from 'mongoose';
import {
  RoundUpModel,
  IRoundUpDocument,
} from '../modules/RoundUp/roundUp.model';
import { roundUpService } from '../modules/RoundUp/roundUp.service';
import { roundUpTransactionService } from '../modules/RoundUpTransaction/roundUpTransaction.service';
import { cronJobTracker } from './cronJobTracker';
import { StripeService } from '../modules/Stripe/stripe.service';
import { RoundUpTransactionModel } from '../modules/RoundUpTransaction/roundUpTransaction.model';
import Donation from '../modules/Donation/donation.model';
import { calculateTax } from '../modules/Donation/donation.constant'; // Add import for calculateTax
import { IAuth } from '../modules/Auth/auth.interface';
import Client from '../modules/Client/client.model';
import { AppError } from '../utils';
import httpStatus from 'http-status';

interface IPopulatedRoundUpConfig extends Omit<IRoundUpDocument, 'user'> {
  user: IAuth;
}

/**
 * RoundUp Transactions Cron Job
 *
 * This job automates the process of syncing bank transactions and processing round-up donations.
 * It runs on a schedule to ensure user donations are handled in a timely manner.
 *
 * Schedule: '0 *\/4 * * *' = Every 4 hours at minute 0 (e.g., 00:00, 04:00, 08:00)
 */

let isProcessing = false; // Prevents overlapping executions
const JOB_NAME = 'roundup-transactions-main';

/**
 * Triggers end-of-month donations for users who have an accumulated balance
 * but haven't met their threshold, or have "no-limit" set.
 * This should only run on the first day of a new month.
 *
 * ✅ MODIFIED: Now creates Donation record BEFORE payment intent (matches threshold flow)
 */
const processEndOfMonthDonations = async () => {
  console.log('\n🎯 Checking for end-of-month donations to process...');

  // Find users with a balance from the previous month who are ready for donation
  const configsForDonation = await RoundUpModel.find<IPopulatedRoundUpConfig>({
    isActive: true,
    enabled: true,
    status: 'pending', // Ensure we don't re-process donations
    currentMonthTotal: { $gt: 0 }, // Must have a balance to donate
  }).populate('user');

  if (configsForDonation.length === 0) {
    console.log('✅ No users with pending balances for month-end processing.');
    return { processed: 0, success: 0, failed: 0 };
  }

  console.log(
    `📊 Found ${configsForDonation.length} user(s) for month-end donation processing.`
  );

  let successCount = 0;
  let failureCount = 0;

  for (const config of configsForDonation) {
    const userId = config.user._id.toString();
    if (!userId) {
      failureCount++;
      console.log(
        `   ⏭️ Skipping config ${config._id}: Invalid user reference.`
      );
      continue;
    }

    const session = await mongoose.startSession();

    try {
      const totalAmount = config.currentMonthTotal;
      const isTaxable = config.isTaxable || false; // Get tax setting from config
      
      // Calculate tax
      const { taxAmount, totalAmount: donationTotalAmount } = calculateTax(totalAmount, isTaxable);
      
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const monthStr = String(lastMonth.getMonth() + 1).padStart(2, '0');
      const year = lastMonth.getFullYear();

      console.log(
        `   Initiating month-end donation of $${totalAmount} for user ${userId}...`
      );
      console.log(`   Base Amount: $${totalAmount.toFixed(2)}`);
      console.log(`   Tax Amount: $${taxAmount.toFixed(2)}`);
      console.log(`   Total Charged: $${donationTotalAmount.toFixed(2)}`);

      // Get all processed transactions for this round-up config for the month
      const monthTransactions = await RoundUpTransactionModel.find({
        roundUp: config._id,
        user: userId,
        status: 'processed',
        stripePaymentIntentId: { $in: [null, undefined] },
        transactionDate: {
          $gte: new Date(year, lastMonth.getMonth(), 1),
          $lt: new Date(year, lastMonth.getMonth() + 1, 1),
        },
      });

      if (monthTransactions.length === 0) {
        console.warn(
          `   ⚠️ No transactions found for RoundUp ${config._id} in ${monthStr}/${year}`
        );
        failureCount++;
        continue;
      }

      // ✅ Find Client by auth ID (userId is Auth._id)
      const donor = await Client.findOne({ auth: userId }).session(session);
      if (!donor?._id) {
        console.error(
          `   ❌ Donor not found for user ${userId} in RoundUp ${config._id}`
        );
        await session.abortTransaction();
        failureCount++;
        continue;
      }

      // STEP 1: Create Donation record with PENDING status
      const donation = await Donation.create({
        donor: donor._id,
        organization: config.organization,
        cause: config.cause,
        donationType: 'round-up',
        amount: totalAmount,
        isTaxable,
        taxAmount,
        totalAmount: donationTotalAmount,
        currency: 'USD',
        status: 'pending', // ⭐ Start with PENDING
        donationDate: new Date(),
        specialMessage:
          config.specialMessage ||
          `Automatic monthly round-up for ${monthStr}/${year}`,
        pointsEarned: Math.round(totalAmount * 100),
        roundUpId: config._id,
        roundUpTransactionIds: monthTransactions.map((t) => t._id),
        receiptGenerated: false,
        metadata: {
          userId: String(userId),
          roundUpId: String(config._id),
          month: `${year}-${monthStr}`,
          year: year.toString(),
          type: 'roundup_donation',
          isMonthEnd: true, // ⭐ Flag for month-end donation
          transactionCount: monthTransactions.length,
        },
      });

      console.log(`   ✅ Donation record created: ${donation._id}`);

      // STEP 2: Create Stripe PaymentIntent
      const paymentResult = await StripeService.createRoundUpPaymentIntent({
        roundUpId: String(config._id),
        userId: String(userId),
        charityId: String(config.organization),
        causeId: String(config.cause),
        amount: totalAmount,
        isTaxable,
        taxAmount,
        totalAmount: donationTotalAmount,
        month: `${year}-${monthStr}`,
        year: year,
        specialMessage: `Automatic monthly round-up for ${monthStr}/${year}`,
        donationId: String(donation._id), // ⭐ Include donationId
      });

      // STEP 3: Update Donation to PROCESSING
      const donationDoc = donation.toObject();
      await Donation.findByIdAndUpdate(donation._id, {
        status: 'processing',
        stripePaymentIntentId: paymentResult.payment_intent_id,
        metadata: {
          ...(donationDoc.metadata || {}),
          paymentInitiatedAt: new Date(),
        },
      });

      // STEP 4: Update RoundUp config
      config.status = 'processing';
      config.lastDonationAttempt = new Date();
      config.currentMonthTotal = 0; // Reset balance for the new month
      config.lastMonthReset = new Date();
      await config.save();

      // STEP 5: Update transactions
      await RoundUpTransactionModel.updateMany(
        {
          roundUp: config._id,
          _id: { $in: monthTransactions.map((t) => t._id) },
        },
        {
          stripePaymentIntentId: paymentResult.payment_intent_id,
          donation: donation._id,
          donationAttemptedAt: new Date(),
        }
      );

      console.log(
        `   ✅ Month-end donation initiated for RoundUp ${config._id}`
      );
      successCount++;
    } catch (error) {
      await session.abortTransaction();
      failureCount++;
      console.error(
        `❌ Error processing month-end donation for RoundUp ${config._id}:`,
        error
      );
      await config.markAsFailed('Month-end donation trigger failed');
    } finally {
      await session.endSession();
    }
  }

  return {
    processed: configsForDonation.length,
    success: successCount,
    failed: failureCount,
  };
};

// corn
export const startRoundUpProcessingCron = () => {
  const schedule = '0 */4 * * *'; // Every 4 hours

  cronJobTracker.registerJob(JOB_NAME, schedule);
  cronJobTracker.setJobStatus(JOB_NAME, true);

  console.log('🔄 RoundUp Transactions Cron Job initialized');
  console.log(`   Schedule: ${schedule}`);

  const job = cron.schedule(schedule, async () => {
    if (isProcessing) {
      console.log(
        '⏭️ Skipping RoundUp processing: previous run still in progress.'
      );
      return;
    }

    isProcessing = true;
    const startTime = Date.now();
    cronJobTracker.startExecution(JOB_NAME);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🔄 Starting RoundUp Transaction Sync & Processing');
    console.log(`   Time: ${new Date().toLocaleString()}`);
    console.log('═══════════════════════════════════════════════════════');

    try {
      // Step 1: Handle End-of-Month donations if it's the first day of the month
      const today = new Date();
      if (today.getDate() === 1) {
        const donationResults = await processEndOfMonthDonations();
        console.log('--- Month-End Donation Summary ---');
        console.log(
          `   Processed: ${donationResults.processed}, Success: ${donationResults.success}, Failed: ${donationResults.failed}`
        );
        console.log('---------------------------------');
      }

      // Step 2: Perform regular transaction sync for all active users
      const activeRoundUpConfigs =
        await RoundUpModel.find<IPopulatedRoundUpConfig>({
          isActive: true,
          enabled: true,
          bankConnection: { $ne: null },
        }).populate('user');

      if (activeRoundUpConfigs.length === 0) {
        console.log('✅ No active round-ups to sync.');
        // No need to continue if there are no active users.
        isProcessing = false;
        cronJobTracker.completeExecution(JOB_NAME, {
          totalProcessed: 0,
          successCount: 0,
          failureCount: 0,
        });
        return;
      }

      console.log(
        `\n📊 Found ${activeRoundUpConfigs.length} active round-up configuration(s) for transaction syncing.`
      );

      let successCount = 0;
      let failureCount = 0;

      for (const config of activeRoundUpConfigs) {
        // We check the status again in case the month-end job just processed this user
        if (config.status === 'processing') {
          console.log(
            `\n⏭️ Skipping sync for user ${config.user._id}: donation is already processing.`
          );
          continue;
        }

        const userId = config.user._id.toString();
        const bankConnectionId = config.bankConnection.toString();

        if (!userId || !bankConnectionId) {
          console.log(
            `⏭️ Skipping round-up with invalid user or bank connection reference.`
          );
          failureCount++;
          continue;
        }

        try {
          console.log(`\n📝 Syncing transactions for user: ${userId}`);

          // A. Sync new transactions from Plaid
          const syncResult = await roundUpService.syncTransactions(
            String(userId),
            String(bankConnectionId),
            {}
          );

          const newTransactions = syncResult.data?.plaidSync?.added || [];

          if (newTransactions.length === 0) {
            console.log(
              `   No new transactions to process for user ${userId}.`
            );
            successCount++;
            continue;
          }

          console.log(
            `   Synced ${newTransactions.length} new transaction(s).`
          );

          // B. Process newly synced transactions to create round-ups
          const processingResult =
            await roundUpTransactionService.processTransactionsFromPlaid(
              String(userId),
              String(bankConnectionId),
              newTransactions
            );

          console.log(
            `   Processed ${processingResult.processed} round-up(s). Skipped ${processingResult.skipped}.`
          );

          // C. Check if a threshold was met and donation was triggered by the service
          if (processingResult.thresholdReached) {
            console.log(
              `   🎯 THRESHOLD MET! Donation of $${processingResult.thresholdReached.amount} was triggered for user ${userId}.`
            );
          }

          successCount++;
        } catch (error) {
          failureCount++;
          console.error(`❌ Failed to process sync for user ${userId}:`, error);
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('📊 RoundUp Sync & Processing Summary');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`   Total Users Synced: ${activeRoundUpConfigs.length}`);
      console.log(`   ✅ Successful Syncs: ${successCount}`);
      console.log(`   ❌ Failed Syncs: ${failureCount}`);
      console.log(`   ⏱️ Duration: ${duration}s`);
      console.log('═══════════════════════════════════════════════════════\n');

      cronJobTracker.completeExecution(JOB_NAME, {
        totalProcessed: activeRoundUpConfigs.length,
        successCount,
        failureCount,
      });
    } catch (error: unknown) {
      console.error('❌ Critical error in RoundUp processing cron job:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      cronJobTracker.failExecution(JOB_NAME, errorMessage);
    } finally {
      isProcessing = false;
    }
  });

  job.start();
  console.log('✅ RoundUp Transactions Cron Job started successfully.\n');
  return job;
};

// Manual trigger function for testing
export const manualTriggerRoundUpProcessing = async (
  _userId?: string
): Promise<{ success: boolean; data?: Record<string, unknown> }> => {
  if (isProcessing) {
    console.log(
      '⏭️ Skipping RoundUp processing: previous run still in progress.'
    );
    return {
      success: false,
      data: { message: 'Processing already in progress' },
    };
  }

  isProcessing = true;
  const startTime = Date.now();
  cronJobTracker.startExecution(JOB_NAME);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🔄 Starting RoundUp Transaction Sync & Processing');
  console.log(`   Time: ${new Date().toLocaleString()}`);
  console.log('═══════════════════════════════════════════════════════');

  try {
    // Step 1: Handle End-of-Month donations if it's the first day of the month
    const today = new Date();
    if (today.getDate() === 1) {
      const donationResults = await processEndOfMonthDonations();
      console.log('--- Month-End Donation Summary ---');
      console.log(
        `   Processed: ${donationResults.processed}, Success: ${donationResults.success}, Failed: ${donationResults.failed}`
      );
      console.log('---------------------------------');
    }

    // Step 2: Perform regular transaction sync for all active users
    const activeRoundUpConfigs =
      await RoundUpModel.find<IPopulatedRoundUpConfig>({
        isActive: true,
        enabled: true,
        bankConnection: { $ne: null },
      }).populate('user');

    if (activeRoundUpConfigs.length === 0) {
      console.log('✅ No active round-ups to sync.');
      // No need to continue if there are no active users.
      isProcessing = false;
      cronJobTracker.completeExecution(JOB_NAME, {
        totalProcessed: 0,
        successCount: 0,
        failureCount: 0,
      });
      return {
        success: true,
        data: { message: 'No active round-ups to sync' },
      };
    }

    console.log(
      `\n📊 Found ${activeRoundUpConfigs.length} active round-up configuration(s) for transaction syncing.`
    );

    let successCount = 0;
    let failureCount = 0;

    for (const config of activeRoundUpConfigs) {
      // We check the status again in case the month-end job just processed this user
      if (config.status === 'processing') {
        console.log(
          `\n⏭️ Skipping sync for user ${config.user._id}: donation is already processing.`
        );
        continue;
      }

      const userId = config.user._id.toString();
      const bankConnectionId = config.bankConnection.toString();

      if (!userId || !bankConnectionId) {
        console.log(
          `⏭️ Skipping round-up with invalid user or bank connection reference.`
        );
        failureCount++;
        continue;
      }

      try {
        console.log(`\n📝 Syncing transactions for user: ${userId}`);

        // A. Sync new transactions from Plaid
        const syncResult = await roundUpService.syncTransactions(
          String(userId),
          String(bankConnectionId),
          {}
        );

        const newTransactions = syncResult.data?.plaidSync?.added || [];

        if (newTransactions.length === 0) {
          console.log(`   No new transactions to process for user ${userId}.`);
          successCount++;
          continue;
        }

        console.log(`   Synced ${newTransactions.length} new transaction(s).`);

        // B. Process newly synced transactions to create round-ups
        const processingResult =
          await roundUpTransactionService.processTransactionsFromPlaid(
            String(userId),
            String(bankConnectionId),
            newTransactions
          );

        console.log(
          `   Processed ${processingResult.processed} round-up(s). Skipped ${processingResult.skipped}.`
        );

        // C. Check if a threshold was met and donation was triggered by the service
        if (processingResult.thresholdReached) {
          console.log(
            `   🎯 THRESHOLD MET! Donation of $${processingResult.thresholdReached.amount} was triggered for user ${userId}.`
          );
        }

        successCount++;
      } catch (error) {
        failureCount++;
        console.error(`❌ Failed to process sync for user ${userId}:`, error);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 RoundUp Sync & Processing Summary');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   Total Users Synced: ${activeRoundUpConfigs.length}`);
    console.log(`   ✅ Successful Syncs: ${successCount}`);
    console.log(`   ❌ Failed Syncs: ${failureCount}`);
    console.log(`   ⏱️ Duration: ${duration}s`);
    console.log('═══════════════════════════════════════════════════════\n');

    cronJobTracker.completeExecution(JOB_NAME, {
      totalProcessed: activeRoundUpConfigs.length,
      successCount,
      failureCount,
    });

    return {
      success: true,
      data: {
        totalProcessed: activeRoundUpConfigs.length,
        successCount,
        failureCount,
      },
    };
  } catch (error: unknown) {
    console.error('❌ Critical error in RoundUp processing cron job:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    cronJobTracker.failExecution(JOB_NAME, errorMessage);
    return {
      success: false,
      data: { error: errorMessage },
    };
  } finally {
    isProcessing = false;
  }
};
