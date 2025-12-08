import { Request, Response } from 'express';
import { sendResponse } from '../../utils/ResponseHandler';
import { catchAsync } from '../../errors';
import { roundUpService } from './roundUp.service';
import { manualTriggerRoundUpProcessing } from '../../jobs/roundUpTransactions.job';

// Controller functions that handle HTTP requests/responses and call service functions
const savePlaidConsent = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const payload = req.body;

  const result = await roundUpService.savePlaidConsent(userId, payload);

  return sendResponse(res, result.statusCode, {
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

const revokeConsent = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { bankConnectionId } = req.params;

  const result = await roundUpService.revokeConsent(userId, bankConnectionId);

  return sendResponse(res, result.statusCode, {
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

const syncTransactions = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { bankConnectionId } = req.params;
  const payload = req.body;

  const result = await roundUpService.syncTransactions(
    userId,
    bankConnectionId,
    payload
  );

  return sendResponse(res, result.statusCode, {
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

const processMonthlyDonation = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user.id;
    const payload = req.body;

    const result = await roundUpService.processMonthlyDonation(userId, payload);

    return sendResponse(res, result.statusCode, {
      success: result.success,
      message: result.message,
      data: result.data,
    });
  }
);

// Manual cron test endpoint for testing RoundUp processing
const testRoundUpProcessingCron = catchAsync(
  async (req: Request, res: Response) => {
    try {
      const result = await manualTriggerRoundUpProcessing();

      return sendResponse(res, 200, {
        success: result.success,
        message: result.success
          ? 'RoundUp processing completed successfully'
          : 'RoundUp processing failed',
        data: result.data || result,
      });
    } catch (error) {
      return sendResponse(res, 500, {
        success: false,
        message: 'Manual RoundUp processing failed',
        data: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }
);

const resumeRoundUp = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const payload = req.body;

  const result = await roundUpService.resumeRoundUp(userId, payload);

  return sendResponse(res, result.statusCode, {
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

const switchCharity = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const payload = req.body;

  const result = await roundUpService.switchCharity(userId, payload);

  return sendResponse(res, result.statusCode, {
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

const getUserDashboard = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;

  const result = await roundUpService.getUserDashboard(userId);

  return sendResponse(res, result.statusCode, {
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

export const roundUpController = {
  savePlaidConsent,
  revokeConsent,
  syncTransactions,
  processMonthlyDonation,
  testRoundUpProcessingCron,
  resumeRoundUp,
  switchCharity,
  getUserDashboard,
};
