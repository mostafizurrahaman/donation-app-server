import cron from 'node-cron';
import { Types } from 'mongoose';
import { ScheduledDonationService } from '../modules/ScheduledDonation/scheduledDonation.service';
import { cronJobTracker } from './cronJobTracker';

/**
 * Scheduled Donations Cron Job
 *
 * Executes recurring donations that are due for processing.
 * Runs every hour to check for and process scheduled donations.
 *
 * Schedule: '0 * * * *' = Every hour at minute 0
 * Examples:
 * - 00:00, 01:00, 02:00, etc.
 */

let isProcessing = false; // Prevent overlapping executions

const JOB_NAME = 'scheduled-donations';

export const startScheduledDonationsCron = () => {
  const schedule = '0 * * * *';
  // const schedule = '*/1 * * * *';

  // Register job with tracker
  cronJobTracker.registerJob(JOB_NAME, schedule);
  cronJobTracker.setJobStatus(JOB_NAME, true);

  console.log('🔄 Scheduled Donations Cron Job initialized');
  console.log(`   Schedule: ${schedule} (Every hour)`);

  const job = cron.schedule(schedule, async () => {
    // Prevent overlapping executions
    if (isProcessing) {
      console.log(
        '⏭️  Skipping scheduled donations execution - previous run still in progress'
      );
      return;
    }

    isProcessing = true;
    const startTime = Date.now();

    // Start tracking execution
    cronJobTracker.startExecution(JOB_NAME);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🔄 Starting Hourly Scheduled Donations Check');
    console.log(`   Time: ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════════════════════');

    try {
      // Get all scheduled donations that are due for execution
      const dueDonations =
        await ScheduledDonationService.getScheduledDonationsDueForExecution();

      console.log(
        `📊 Found ${dueDonations.length} scheduled donation(s) due for execution`
      );

      if (dueDonations.length === 0) {
        console.log('✅ No scheduled donations to process');
        return;
      }

      // Track execution statistics
      let successCount = 0;
      let failureCount = 0;
      const errors: Array<{ id: string; error: string }> = [];

      // BEST PRACTICE: Process donations in batches to prevent memory issues
      const BATCH_SIZE = 50; // Process 50 donations at a time
      const batches = [];

      for (let i = 0; i < dueDonations.length; i += BATCH_SIZE) {
        batches.push(dueDonations.slice(i, i + BATCH_SIZE));
      }

      console.log(
        `📦 Processing in ${batches.length} batch(es) of max ${BATCH_SIZE} donations each`
      );

      // Process each batch
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(
          `\n📦 Processing batch ${batchIndex + 1}/${batches.length} (${
            batch.length
          } donations)`
        );

        // BEST PRACTICE: Use Promise.allSettled for parallel execution
        // This processes multiple donations concurrently instead of sequentially
        const results = await Promise.allSettled(
          batch.map(async (scheduledDonation) => {
            const donationId = (
              scheduledDonation._id as unknown as Types.ObjectId
            ).toString();

            console.log(`\n📝 Processing scheduled donation: ${donationId}`);
            console.log(`   User: ${scheduledDonation.user._id}`);
            console.log(
              `   Organization: ${
                (scheduledDonation.organization as unknown as { name: string })
                  .name
              }`
            );
            console.log(`   Amount: $${scheduledDonation.amount}`);
            console.log(`   Frequency: ${scheduledDonation.frequency}`);

            // Execute the scheduled donation
            const donation =
              await ScheduledDonationService.executeScheduledDonation(
                donationId
              );

            console.log(`✅ Success! Created donation record: ${donation._id}`);
            console.log(`   Status: ${donation.status}`);
            console.log(`   Points Earned: ${donation.pointsEarned}`);

            return { id: donationId, donation };
          })
        );

        // Process results
        results.forEach((result, index) => {
          const scheduledDonation = batch[index];
          const donationId = (
            scheduledDonation._id as unknown as Types.ObjectId
          ).toString();

          if (result.status === 'fulfilled') {
            successCount++;
          } else {
            failureCount++;
            const errorMessage = result.reason?.message || 'Unknown error';
            errors.push({ id: donationId, error: errorMessage });

            console.error(
              `❌ Failed to execute scheduled donation: ${donationId}`
            );
            console.error(`   Error: ${errorMessage}`);

            // Log more details for debugging
            if (result.reason?.stack) {
              console.error(`   Stack: ${result.reason.stack.split('\n')[0]}`);
            }
          }
        });

        // Add small delay between batches to avoid overwhelming the system
        if (batchIndex < batches.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
        }
      }

      // Summary report
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('\n═══════════════════════════════════════════════════════');
      console.log('📊 Execution Summary');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`   Total Processed: ${dueDonations.length}`);
      console.log(`   ✅ Successful: ${successCount}`);
      console.log(`   ❌ Failed: ${failureCount}`);
      console.log(`   ⏱️  Duration: ${duration}s`);

      if (errors.length > 0) {
        console.log('\n❌ Failed Donations:');
        errors.forEach(({ id, error }) => {
          console.log(`   - ${id}: ${error}`);
        });
      }

      console.log('═══════════════════════════════════════════════════════\n');

      // Complete tracking execution
      cronJobTracker.completeExecution(JOB_NAME, {
        totalProcessed: dueDonations.length,
        successCount,
        failureCount,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: unknown) {
      const err = error as Error;
      console.error('❌ Critical error in scheduled donations cron job:');
      console.error(error);

      // Mark execution as failed
      cronJobTracker.failExecution(JOB_NAME, err.message || 'Unknown error');
    } finally {
      isProcessing = false;
    }
  });

  // Start the cron job
  job.start();
  console.log('✅ Scheduled Donations Cron Job started successfully\n');

  return job;
};

/**
 * Manual trigger for testing/debugging
 * Can be called via API endpoint or console
 */
export const manualTriggerScheduledDonations = async () => {
  console.log('🔧 Manually triggering scheduled donations execution...');

  if (isProcessing) {
    console.log('⏭️  Cannot trigger - execution already in progress');
    return { success: false, message: 'Execution already in progress' };
  }

  isProcessing = true;
  try {
    const dueDonations =
      await ScheduledDonationService.getScheduledDonationsDueForExecution();

    console.log({
      dueDonations,
    });

    console.log(
      `Found ${dueDonations.length} scheduled donation(s) to process`
    );

    // BEST PRACTICE: Use Promise.allSettled for parallel processing
    const processResults = await Promise.allSettled(
      dueDonations.map(async (sd) => {
        const donation =
          await ScheduledDonationService.executeScheduledDonation(
            (sd._id as unknown as Types.ObjectId).toString()
          );
        return {
          success: true,
          donationId: (donation._id as unknown as Types.ObjectId).toString(),
        };
      })
    );

    // Transform results
    const results = processResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          scheduledDonationId: (
            dueDonations[index]._id as unknown as Types.ObjectId
          ).toString(),
          error: result.reason?.message || 'Unknown error',
        };
      }
    });

    return { success: true, results };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error in manual trigger:', error);
    return { success: false, error: err.message };
  } finally {
    isProcessing = false;
  }
};
