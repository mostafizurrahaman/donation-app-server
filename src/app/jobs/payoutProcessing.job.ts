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
  // Run every day at 9:00 AM
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
      // In a real scenario, you might filter by 'approved' if you have an approval workflow
      const duePayouts = await Payout.find({
        status: PAYOUT_STATUS.PENDING,
        scheduledDate: { $lte: today },
      });
      console.log(duePayouts);

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
              'Organization not found or no Stripe Connect account'
            );
          }

          // 2. Mark as PROCESSING
          payout.status = PAYOUT_STATUS.PROCESSING;
          payout.processedAt = new Date();
          await payout.save({ session });

          // 3. Execute Stripe Transfer
          // Note: We use the netAmount (minus fees)
          // We assume StripeService has been updated to handle transfers from Platform -> Connect
          const transfer = await StripeService.transferFundsToConnectedAccount(
            org.stripeConnectAccountId,
            payout.netAmount,
            payout.currency,
            { payoutId: payout?._id?.toString() }
          );

          // 4. Mark as COMPLETED
          payout.status = PAYOUT_STATUS.COMPLETED;
          payout.completedAt = new Date();
          payout.stripeTransferId = transfer.id;
          await payout.save({ session });

          // 5. Update Balance (Reserved -> Paid Out)
          const balance = await OrganizationBalance.findOne({
            organization: payout.organization,
          }).session(session);

          if (balance) {
            balance.reservedBalance -= payout.requestedAmount; // Gross amount removed
            balance.lifetimePaidOut += payout.netAmount;
            balance.lifetimePlatformFees += payout.platformFeeAmount;
            balance.lifetimeTaxDeducted += payout.taxAmount;
            balance.lastPayoutAt = new Date();

            await balance.save({ session });

            // 6. Ledger Entry
            await BalanceTransaction.create(
              [
                {
                  organization: payout.organization,
                  type: 'debit',
                  category: 'payout_completed',
                  amount: payout.requestedAmount, // Gross amount leaves the system
                  balanceAfter_pending: balance.pendingBalance,
                  balanceAfter_available: balance.availableBalance,
                  balanceAfter_reserved: balance.reservedBalance,
                  balanceAfter_total:
                    balance.pendingBalance +
                    balance.availableBalance +
                    balance.reservedBalance,
                  payout: payout._id,
                  description: `Payout completed: ${payout.payoutNumber}`,
                  metadata: {
                    stripeTransferId: transfer.id,
                    netAmount: payout.netAmount,
                    fee: payout.platformFeeAmount,
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

          // Mark as Failed
          await Payout.findByIdAndUpdate(payout._id, {
            status: PAYOUT_STATUS.FAILED,
            failureReason: error.message,
            $inc: { retryCount: 1 },
          });

          // OPTIONAL: If max retries reached, return funds to 'available' automatically?
          // For now, we leave it as failed. Admin can cancel it to return funds.

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
