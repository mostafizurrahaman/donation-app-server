// src/app/jobs/updateRewardsStatus.job.ts
import cron from 'node-cron';
import { rewardService } from '../modules/Reward/reward.service';

/**
 * Run every hour to update reward statuses
 * Schedule: At minute 0 of every hour
 */
export const updateRewardsStatusJob = cron.schedule(
  '0 * * * *',
  async () => {
    console.log('🔄 Running reward status update job...');

    try {
      // Update expired rewards
      await rewardService.updateExpiredRewards();

      // Update upcoming rewards to active
      await rewardService.updateUpcomingRewards();

      console.log('✅ Reward status update completed successfully');
    } catch (error) {
      console.error('❌ Reward status update job failed:', error);
    }
  },
  {
    scheduled: true,
    timezone: 'UTC',
  }
);

// Start the job
export const startRewardJobs = () => {
  updateRewardsStatusJob.start();
  console.log('📅 Reward status update job scheduled');
};

// Stop the job
export const stopRewardJobs = () => {
  updateRewardsStatusJob.stop();
  console.log('⏹️ Reward status update job stopped');
};
