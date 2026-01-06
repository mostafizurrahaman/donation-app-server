/* eslint-disable @typescript-eslint/no-explicit-any */
import cron from 'node-cron';
import mongoose from 'mongoose';
import { Payout } from '../modules/Payout/payout.model';
import { BalanceTransaction } from '../modules/Balance/balance.model';
import { StripeService } from '../modules/Stripe/stripe.service';
import { OrganizationModel } from '../modules/Organization/organization.model';
import { PAYOUT_STATUS } from '../modules/Payout/payout.constant';
import { cronJobTracker } from './cronJobTracker';
import { AppError } from '../utils';
import { STRIPE_ACCOUNT_STATUS } from '../modules/Organization/organization.constants';
import httpStatus from 'http-status';
import { StripeAccount } from '../modules/OrganizationAccount/stripe-account.model';
import { createNotification } from '../modules/Notification/notification.service';
import { NOTIFICATION_TYPE } from '../modules/Notification/notification.constant';

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

          if (!org) {
            throw new Error('Organization not found!');
          }

          const stripeAccount = await StripeAccount.findOne({
            organization: org._id,
            status: 'active',
          });

          if (!stripeAccount) {
            throw new AppError(
              httpStatus.BAD_REQUEST,
              'Stripe Account either not connected or exist!'
            );
          }

          // 2. Mark as PROCESSING in DB
          payout.status = PAYOUT_STATUS.PROCESSING;
          payout.processedAt = new Date();
          await payout.save({ session });

          // 3. Execute Stripe Payout (Connected Account Balance -> External Bank)
          // Note: This relies on Stripe to throw an error if funds are insufficient.
          const stripePayout = await StripeService.createPayout(
            stripeAccount.stripeAccountId, // Perform action ON BEHALF OF this account
            payout.netAmount, // Amount to send to bank
            payout.currency
          );

          // 4. Mark as COMPLETED in DB
          payout.status = PAYOUT_STATUS.COMPLETED;
          payout.completedAt = new Date();
          payout.stripePayoutId = stripePayout.id; // Store Payout ID
          await payout.save({ session });

          // 5. Create Ledger Entry (History Only)
          // We no longer update a local balance model. We just record that this event happened.
          const [balanceTx] = await BalanceTransaction.create(
            [
              {
                organization: payout.organization,
                type: 'debit',
                category: 'payout_completed',
                amount: payout.netAmount,
                payout: payout._id,
                description: `Payout completed: ${payout.payoutNumber}`,
                metadata: {
                  stripePayoutId: stripePayout.id,
                  destinationBank: stripePayout.destination,
                  currency: payout.currency,
                },
                idempotencyKey: `pay_complete_${payout._id}`,
              },
            ],
            { session }
          );

          try {
            await createNotification(
              org?.auth?.toString(),
              NOTIFICATION_TYPE.PAYOUT_COMPLETED,
              `Your payout of $${payout.netAmount} has been successfully completed.`,
              payout._id?.toString(),
              {
                payoutId: payout._id,
                ...balanceTx,
              }
            );
            console.log('✅ Notification sent for payout completion');
          } catch (error) {
            console.log('❌ Failed to send notification for payout completion');
          }

          await session.commitTransaction();
          successCount++;
          console.log(
            `✅ Payout ${payout.payoutNumber} processed successfully.`
          );
        } catch (error: any) {
          // Abort the transaction that tried to mark it as COMPLETED
          await session.abortTransaction();

          console.error(
            `❌ Failed to process payout ${payout.payoutNumber}:`,
            error.message
          );

          // Start a NEW transaction to mark it as FAILED
          const failureSession = await mongoose.startSession();
          failureSession.startTransaction();
          try {
            await Payout.findByIdAndUpdate(
              payout._id,
              {
                status: PAYOUT_STATUS.FAILED,
                failureReason: error.message,
                $inc: { retryCount: 1 },
              },
              { session: failureSession }
            );

            // Optional: Log the failure in the ledger for visibility
            const [balanceTx] = await BalanceTransaction.create(
              [
                {
                  organization: payout.organization,
                  type: 'credit', // Neutral/Info entry (amount didn't leave)
                  category: 'payout_failed',
                  amount: payout.netAmount,
                  payout: payout._id,
                  description: `Payout attempt failed: ${error.message}`,
                  metadata: {
                    failureReason: error.message,
                  },
                  idempotencyKey: `pay_fail_attempt_${
                    payout._id
                  }_${Date.now()}`,
                },
              ],
              { session: failureSession }
            );

            try {
              const org = await OrganizationModel.findById(
                payout.organization
              ).session(session);

              if (!org) {
                throw new Error('Organization not found!');
              }
              await createNotification(
                org?.auth?.toString(),
                NOTIFICATION_TYPE.PAYOUT_FAILED,
                `Your payout of $${payout.netAmount} could not be completed. Please try again later.`,
                payout._id?.toString(),
                {
                  payoutId: payout._id,
                  ...balanceTx,
                }
              );
              console.log('✅ Notification sent for payout failure');
            } catch (error) {
              console.log('❌ Failed to send notification for payout failure');
            }

            await failureSession.commitTransaction();
          } catch (innerErr) {
            console.error('Failed to save payout failure status', innerErr);
            await failureSession.abortTransaction();
          } finally {
            failureSession.endSession();
          }

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
