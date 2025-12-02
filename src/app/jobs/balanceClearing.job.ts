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
      // Find all balances to check clearing settings
      const balances = await OrganizationBalance.find({});

      for (const balance of balances) {
        // Default 7 days if not set
        const clearingDays = balance.clearingPeriodDays || 7;

        // Calculate cutoff date
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - clearingDays);

        // Find uncleared income (This logic implies we need a flag on transactions,
        // OR we simply assume pendingBalance represents uncleared funds.
        // Real-world: We query transactions where category='donation_received' AND createdAt <= cutoffDate AND cleared=false)

        // SIMPLIFIED APPROACH for this request:
        // We will query "donation_received" transactions created before cutoffDate
        // that have NOT been marked as cleared.
        // *Requires adding a 'isCleared' boolean to BalanceTransaction schema or tracking it differently.*

        // To stick to the provided schema, we will iterate and update.
        // We need to find transactions that contributed to pendingBalance.

        session.startTransaction();
        try {
          const unclearedTransactions = await BalanceTransaction.find({
            organization: balance.organization,
            category: 'donation_received',
            createdAt: { $lte: cutoffDate },
            // Assuming we add a metadata flag or similar to track status,
            // otherwise we might double-clear.
            // Let's assume we add `metadata: { cleared: false }` to the original transaction.
            'metadata.cleared': { $ne: true },
          }).session(session);

          if (unclearedTransactions.length > 0) {
            let clearedAmount = 0;

            for (const tx of unclearedTransactions) {
              clearedAmount += tx.amount;

              // Mark original tx as cleared (using metadata update)
              await BalanceTransaction.findByIdAndUpdate(tx._id, {
                $set: { 'metadata.cleared': true },
              }).session(session);
            }

            if (clearedAmount > 0) {
              // Update Balance
              balance.pendingBalance -= clearedAmount;
              balance.availableBalance += clearedAmount;

              // Prevent negative pending (floating point safety)
              if (balance.pendingBalance < 0) balance.pendingBalance = 0;

              await balance.save({ session });

              // Create Ledger Entry for the batch clearing
              await BalanceTransaction.create(
                [
                  {
                    organization: balance.organization,
                    type: 'credit', // Credit to available (technically a transfer)
                    category: 'donation_cleared',
                    amount: clearedAmount,
                    balanceAfter_pending: balance.pendingBalance,
                    balanceAfter_available: balance.availableBalance,
                    balanceAfter_reserved: balance.reservedBalance,
                    balanceAfter_total:
                      balance.pendingBalance +
                      balance.availableBalance +
                      balance.reservedBalance,
                    description: `Cleared ${unclearedTransactions.length} transactions older than ${clearingDays} days`,
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
