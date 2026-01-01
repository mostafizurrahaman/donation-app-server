import { Request, Response } from 'express';
import { sendResponse } from '../../utils/ResponseHandler';
import { catchAsync } from '../../errors';
import { roundUpService } from './roundUp.service';
import { manualTriggerRoundUpProcessing } from '../../jobs/roundUpTransactions.job';
import httpStatus from 'http-status';
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

const updateRoundUp = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user._id?.toString();
  const { id } = req.params;
  const result = await roundUpService.updateRoundUp(userId, id, req.body);

  return sendResponse(res, 200, {
    success: true,
    message: 'Round-up updated successfully',
    data: result,
  });
});

const cancelRoundUp = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user._id?.toString();
  const { id } = req.params;
  const { reason } = req.body;
  const result = await roundUpService.cancelRoundUp(userId, id, reason);

  return sendResponse(res, 200, {
    success: true,
    message: 'Round-up cancelled successfully',
    data: result,
  });
});

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

const getActiveRoundup = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user._id;

  const result = await roundUpService.getActiveRoundup(userId?.toString());

  return sendResponse(res, httpStatus.OK, {
    success: true,
    message: 'Round config fetched successfully!',
    data: result,
  });
});

export const roundUpController = {
  savePlaidConsent,
  revokeConsent,
  syncTransactions,
  testRoundUpProcessingCron,
  resumeRoundUp,
  switchCharity,
  getUserDashboard,
  updateRoundUp,
  cancelRoundUp,
  getActiveRoundup,
};
