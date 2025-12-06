/* eslint-disable @typescript-eslint/no-explicit-any */
import cron from 'node-cron';
import mongoose from 'mongoose';
import {
  OrganizationBalance,
  BalanceTransaction,
} from '../modules/Balance/balance.model';
import { cronJobTracker } from './cronJobTracker';

const JOB_NAME = 'balance-clearing';

/**
 * Move funds from Pending -> Available
 * Logic: Find credit transactions (donation_received) older than X days that haven't been cleared yet.
 * Note: For simplicity in this architecture, we calculate the clearing sum based on a date cutoff.
 * A more robust ledger might track 'cleared' status on individual transactions.
 */
export const startBalanceClearingCron = () => {
  // Run every day at midnight (00:00)
  const schedule = '0 0 * * *';

  cronJobTracker.registerJob(JOB_NAME, schedule);
  cronJobTracker.setJobStatus(JOB_NAME, true);

  const job = cron.schedule(schedule, async () => {
    console.log(
      `🔄 Starting Balance Clearing Job: ${new Date().toISOString()}`
    );
    cronJobTracker.startExecution(JOB_NAME);

    const session = await mongoose.startSession();
    let successCount = 0;
    let failureCount = 0;

    try {
      const balances = await OrganizationBalance.find({});

      for (const balance of balances) {
        const clearingDays = balance.clearingPeriodDays ?? 7;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - clearingDays);

        session.startTransaction();
        try {
          const unclearedTransactions = await BalanceTransaction.find({
            organization: balance.organization,
            category: 'donation_received',
            createdAt: { $lte: cutoffDate },
            'metadata.isClear': { $ne: true },
          }).session(session);

          if (unclearedTransactions.length > 0) {
            let clearedAmount = 0;

            let clearedOneTime = 0;
            let clearedRecurring = 0;
            let clearedRoundUp = 0;

            for (const tx of unclearedTransactions) {
              // ✅ FIX: Round to 2 decimals on every addition
              clearedAmount = Number((clearedAmount + tx.amount).toFixed(2));

              if (tx.donationType === 'one-time') {
                clearedOneTime = Number(
                  (clearedOneTime + tx.amount).toFixed(2)
                );
              } else if (tx.donationType === 'recurring') {
                clearedRecurring = Number(
                  (clearedRecurring + tx.amount).toFixed(2)
                );
              } else if (tx.donationType === 'round-up') {
                clearedRoundUp = Number(
                  (clearedRoundUp + tx.amount).toFixed(2)
                );
              }

              await BalanceTransaction.findByIdAndUpdate(
                tx._id,
                { $set: { 'metadata.isClear': true } },
                { session }
              );
            }

            if (clearedAmount > 0) {
              // ✅ FIX: Update Total Balances with Rounding
              balance.pendingBalance = Number(
                (balance.pendingBalance - clearedAmount).toFixed(2)
              );
              balance.availableBalance = Number(
                (balance.availableBalance + clearedAmount).toFixed(2)
              );

              // ✅ FIX: Update Breakdown Balances with Rounding

              // One-Time
              balance.pendingByType_oneTime = Number(
                (balance.pendingByType_oneTime - clearedOneTime).toFixed(2)
              );
              balance.availableByType_oneTime = Number(
                (balance.availableByType_oneTime + clearedOneTime).toFixed(2)
              );

              // Recurring
              balance.pendingByType_recurring = Number(
                (balance.pendingByType_recurring - clearedRecurring).toFixed(2)
              );
              balance.availableByType_recurring = Number(
                (balance.availableByType_recurring + clearedRecurring).toFixed(
                  2
                )
              );

              // Round-Up
              balance.pendingByType_roundUp = Number(
                (balance.pendingByType_roundUp - clearedRoundUp).toFixed(2)
              );
              balance.availableByType_roundUp = Number(
                (balance.availableByType_roundUp + clearedRoundUp).toFixed(2)
              );

              // Safety Checks (Prevent -0 or -0.01 issues)
              if (balance.pendingBalance < 0) balance.pendingBalance = 0;
              if (balance.pendingByType_oneTime < 0)
                balance.pendingByType_oneTime = 0;
              if (balance.pendingByType_recurring < 0)
                balance.pendingByType_recurring = 0;
              if (balance.pendingByType_roundUp < 0)
                balance.pendingByType_roundUp = 0;

              await balance.save({ session });

              await BalanceTransaction.create(
                [
                  {
                    organization: balance.organization,
                    type: 'credit',
                    category: 'donation_cleared',
                    amount: clearedAmount, // This is now a clean number (e.g. 14.44)
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
                    description: `Cleared ${unclearedTransactions.length} transactions older than ${clearingDays} days`,
                    metadata: {
                      clearedOneTime,
                      clearedRecurring,
                      clearedRoundUp,
                    },
                    idempotencyKey: `clear_${
                      balance.organization
                    }_${Date.now()}`,
                  },
                ],
                { session }
              );

              successCount++;
            }
          }
          await session.commitTransaction();
        } catch (err) {
          await session.abortTransaction();
          console.error(
            `Failed to clear balance for org ${balance.organization}:`,
            err
          );
          failureCount++;
        }
      }

      cronJobTracker.completeExecution(JOB_NAME, {
        totalProcessed: balances.length,
        successCount,
        failureCount,
      });
    } catch (error: any) {
      console.error('Critical error in balance clearing job:', error);
      cronJobTracker.failExecution(JOB_NAME, error.message);
    } finally {
      session.endSession();
    }
  });

  job.start();
  return job;
};
