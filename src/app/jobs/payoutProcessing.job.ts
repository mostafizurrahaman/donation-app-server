/* eslint-disable @typescript-eslint/no-explicit-any */
import cron from 'node-cron';
import mongoose from 'mongoose';
import { Payout } from '../modules/Payout/payout.model';
import {
  OrganizationBalance,
  BalanceTransaction,
} from '../modules/Balance/balance.model';
import { StripeService } from '../modules/Stripe/stripe.service';
import { OrganizationModel } from '../modules/Organization/organization.model';
import { PAYOUT_STATUS } from '../modules/Payout/payout.constant';
import { cronJobTracker } from './cronJobTracker';

const JOB_NAME = 'payout-processing';

export const startPayoutProcessingCron = () => {
  // Run every day at 9:00 AM (Australia Time ideally, but server time here)
  const schedule = '0 9 * * *';

  cronJobTracker.registerJob(JOB_NAME, schedule);
  cronJobTracker.setJobStatus(JOB_NAME, true);

  const job = cron.schedule(schedule, async () => {
    console.log(
      `💸 Starting Payout Processing Job: ${new Date().toISOString()}`
    );
    cronJobTracker.startExecution(JOB_NAME);

    const session = await mongoose.startSession();
    let successCount = 0;
    let failureCount = 0;

    try {
      const today = new Date();

      // Find payouts scheduled for today (or past) that are still PENDING
      const duePayouts = await Payout.find({
        status: PAYOUT_STATUS.PENDING,
        scheduledDate: { $lte: today },
      });

      console.log(`Found ${duePayouts.length} payouts due for processing.`);

      for (const payout of duePayouts) {
        session.startTransaction();
        try {
          // 1. Get Org Details for Stripe ID
          const org = await OrganizationModel.findById(
            payout.organization
          ).session(session);

          if (!org || !org.stripeConnectAccountId) {
            throw new Error(
              'Organization not found or no Stripe Connect account linked'
            );
          }

          // 2. Mark as PROCESSING in DB
          payout.status = PAYOUT_STATUS.PROCESSING;
          payout.processedAt = new Date();
          await payout.save({ session });

          // 3. Execute Stripe Payout (Balance -> Bank)
          // Note: Since we use Destination Charges, funds are ALREADY in the Connect Account.
          // We just need to release them from the Stripe Balance to the Bank Account.
          const stripePayout = await StripeService.createPayout(
            org.stripeConnectAccountId, // Perform action ON BEHALF OF this account
            payout.netAmount, // Amount to send to bank
            payout.currency
          );

          // 4. Mark as COMPLETED in DB
          payout.status = PAYOUT_STATUS.COMPLETED;
          payout.completedAt = new Date();
          payout.stripePayoutId = stripePayout.id; // Store Payout ID
          await payout.save({ session });

          // 5. Update Internal Ledger (Reserved -> Paid Out)
          const balance = await OrganizationBalance.findOne({
            organization: payout.organization,
          }).session(session);

          if (balance) {
            // Gross amount removed from reserved (it was moved from available to reserved on request)
            balance.reservedBalance = Number(
              (balance.reservedBalance - payout.requestedAmount).toFixed(2)
            );
            balance.lifetimePaidOut = Number(
              (balance.lifetimePaidOut + payout.netAmount).toFixed(2)
            );

            // Note: Fees were already deducted during donation processing,
            // so we don't deduct them again here.
            balance.lastPayoutAt = new Date();

            // Safety check
            if (balance.reservedBalance < 0) balance.reservedBalance = 0;

            await balance.save({ session });

            // 6. Ledger Entry
            await BalanceTransaction.create(
              [
                {
                  organization: payout.organization,
                  type: 'debit',
                  category: 'payout_completed',
                  amount: payout.requestedAmount, // Amount leaving the system
                  balanceAfter_pending: balance.pendingBalance,
                  balanceAfter_available: balance.availableBalance,
                  balanceAfter_reserved: balance.reservedBalance,
                  balanceAfter_total: Number(
                    (
                      balance.pendingBalance +
                      balance.availableBalance +
                      balance.reservedBalance
                    ).toFixed(2)
                  ),
                  payout: payout._id,
                  description: `Payout completed: ${payout.payoutNumber}`,
                  metadata: {
                    stripePayoutId: stripePayout.id,
                    netAmountSent: payout.netAmount,
                    destinationBank: stripePayout.destination, // Bank ID usually
                  },
                  idempotencyKey: `pay_complete_${payout._id}`,
                },
              ],
              { session }
            );
          }

          await session.commitTransaction();
          successCount++;
          console.log(
            `✅ Payout ${payout.payoutNumber} processed successfully.`
          );
        } catch (error: any) {
          await session.abortTransaction();
          console.error(
            `❌ Failed to process payout ${payout.payoutNumber}:`,
            error.message
          );

          // Mark as Failed in DB so we don't retry immediately without review
          // In a production system, you might want to auto-retry X times or alert admins
          await Payout.findByIdAndUpdate(payout._id, {
            status: PAYOUT_STATUS.FAILED,
            failureReason: error.message,
            $inc: { retryCount: 1 },
          });

          // Logic to return funds to 'Available' could go here if the failure is permanent,
          // but usually, we keep it in 'Reserved' until an Admin investigates.

          failureCount++;
        }
      }

      cronJobTracker.completeExecution(JOB_NAME, {
        totalProcessed: duePayouts.length,
        successCount,
        failureCount,
      });
    } catch (error: any) {
      console.error('Critical error in payout processing job:', error);
      cronJobTracker.failExecution(JOB_NAME, error.message);
    } finally {
      session.endSession();
    }
  });

  job.start();
  return job;
};
