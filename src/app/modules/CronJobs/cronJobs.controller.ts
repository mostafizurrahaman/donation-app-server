import { Response } from 'express';
import httpStatus from 'http-status';
import { asyncHandler, sendResponse, AppError } from '../../utils';
import { ExtendedRequest } from '../../types';
import { CronJobsService } from './cronJobs.service';

/**
 * CronJobs Controller
 * 
 * Thin controller layer for cron job management
 */

// 1. Manually trigger scheduled donations processing
const triggerScheduledDonations = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const result = await CronJobsService.triggerScheduledDonations();

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: result.success 
        ? 'Scheduled donations processing completed' 
        : 'Scheduled donations processing failed',
      data: result,
    });
  }
);

// 2. Get cron job status (all or specific job)
const getCronJobStatus = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const { jobName, hours } = req.query;

    const jobNameStr = jobName ? String(jobName) : undefined;
    const hoursNum = hours ? parseInt(String(hours)) : undefined;

    const result = await CronJobsService.getCronJobStatus(jobNameStr, hoursNum);

    if (jobNameStr && !result) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        `Cron job '${jobNameStr}' not found`
      );
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: jobNameStr 
        ? 'Cron job status retrieved successfully'
        : 'All cron jobs status retrieved successfully',
      data: result,
    });
  }
);

// 3. Get execution history for a specific job
const getExecutionHistory = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const { jobName } = req.params;
    const { limit, hours } = req.query;

    const limitNum = limit ? parseInt(String(limit)) : undefined;
    const hoursNum = hours ? parseInt(String(hours)) : undefined;

    const result = await CronJobsService.getExecutionHistory(
      jobName as string,
      limitNum,
      hoursNum
    );

    if (!result) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        `Cron job '${jobName}' not found`
      );
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Execution history retrieved successfully',
      data: result,
    });
  }
);

// 4. Get cron jobs dashboard
const getDashboard = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const result = await CronJobsService.getDashboard();

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Dashboard data retrieved successfully',
      data: result,
    });
  }
);

// 5. Get health check for all cron jobs
const getHealthCheck = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const result = await CronJobsService.getHealthCheck();

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Health check completed',
      data: result,
    });
  }
);

export const CronJobsController = {
  triggerScheduledDonations,
  getCronJobStatus,
  getExecutionHistory,
  getDashboard,
  getHealthCheck,
};
