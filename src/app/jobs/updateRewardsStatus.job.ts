// src/app/jobs/updateRewardsStatus.job.ts
import cron from 'node-cron';
import { rewardService } from '../modules/Reward/reward.service';

/**
 * Run every 5 minutes to handle claim expirations and reward status updates
 * Schedule: Every 5 minutes
 */
export const rewardMaintenanceJob = cron.schedule(
  '*/5 * * * *',
  async () => {
    console.log('🔄 Running reward maintenance job (every 5 minutes)...');
    const startTime = Date.now();

    try {
      // 1. Expire old claims with full restoration (most important - runs every 5 minutes)
      console.log('📋 Processing expired claims...');
      const expirationResult =
        await rewardService.expireOldClaimsWithFullRestoration();
      console.log(
        `✅ Expired claims: ${expirationResult.expiredCount}, Points refunded: ${expirationResult.pointsRefunded}, Errors: ${expirationResult.errors.length}`
      );

      // 2. Update expired rewards (less critical - runs every 5 minutes)
      console.log('⏰ Updating expired rewards...');
      const expiredCount = await rewardService.updateExpiredRewards();
      console.log(`✅ Updated ${expiredCount} expired rewards`);

      // 3. Update upcoming rewards to active (less critical - runs every 5 minutes)
      console.log('🚀 Activating upcoming rewards...');
      const activatedCount = await rewardService.updateUpcomingRewards();
      console.log(`✅ Activated ${activatedCount} upcoming rewards`);

      const duration = Date.now() - startTime;
      console.log(`✅ Reward maintenance job completed in ${duration}ms`);
    } catch (error) {
      console.error('❌ Reward maintenance job failed:', error);

      // Log detailed error information
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
        });
      }
    }
  },
  {
    timezone: 'UTC',
  }
);

/**
 * Manual trigger for reward maintenance (used for testing/one-time execution)
 */
export const runRewardMaintenanceManual = async () => {
           
  const startTime = Date.now();

  try {
    // Call the same logic directly to avoid CronJob.invoke() issues
    console.log('🔄 Running manual reward maintenance...');
    
    // 1. Expire old claims with full restoration
    console.log('📋 Processing expired claims...');
    const expirationResult = await rewardService.expireOldClaimsWithFullRestoration();
    console.log(
      `✅ Expired claims: ${expirationResult.expiredCount}, Points refunded: ${expirationResult.pointsRefunded}, Errors: ${expirationResult.errors.length}`
    );

    // 2. Update expired rewards
    console.log('⏰ Updating expired rewards...');
    const expiredCount = await rewardService.updateExpiredRewards();
    console.log(`✅ Updated ${expiredCount} expired rewards`);

    // 3. Update upcoming rewards to active
    console.log('🚀 Activating upcoming rewards...');
    const activatedCount = await rewardService.updateUpcomingRewards();
    console.log(`✅ Activated ${activatedCount} upcoming rewards`);

    const duration = Date.now() - startTime;
    console.log(`✅ Manual reward maintenance completed in ${duration}ms`);
    
    return {
      expiredClaims: expirationResult.expiredCount,
      pointsRefunded: expirationResult.pointsRefunded,
      errors: expirationResult.errors.length,
      expiredRewards: expiredCount,
      activatedRewards: activatedCount,
      duration,
    };
  } catch (error) {
    console.error('❌ Manual reward maintenance failed:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
      });
    }
    
    throw error;
  }
};

// Start the jobs
export const startRewardJobs = () => {
  try {
    // Check if job is already running, if not, start it
    if (rewardMaintenanceJob.getStatus() === 'scheduled') {
      console.log('📅 Reward maintenance jobs already started (every 5 minutes)');
    } else {
      rewardMaintenanceJob.start();
      console.log('📅 Reward maintenance jobs started (every 5 minutes)');
    }
  } catch (error) {
    console.error('❌ Failed to start reward maintenance jobs:', error);
    throw error;
  }
};

// Stop the jobs
export const stopRewardJobs = () => {
  rewardMaintenanceJob.stop();
  console.log('⏹️ Reward maintenance jobs stopped');
};
