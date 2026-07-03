import { Request, Response } from 'express';
import { sendResponse } from '../../utils/ResponseHandler';
import { catchAsync } from '../../errors';
import { roundUpTransactionService } from './roundUpTransaction.service';


// Get transaction summary for a user
const getTransactionSummary = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user.id;

    const result = await roundUpTransactionService.getTransactionSummary(
      userId
    );

    return sendResponse(res, 200, {
      success: true,
      message: 'Transaction summary retrieved successfully',
      data: result,
    });
  }
);

// Get filtered transactions with pagination
const getTransactions = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { page = 1, limit = 50 } = req.query;

  // Build filter from query params
  const filter: Record<string,unknown> = {
    user: userId,
  };

  if (req.query.status) filter.status = req.query.status;
  if (req.query.bankConnection)
    filter.bankConnection = req.query.bankConnection;
  if (req.query.organization) filter.organization = req.query.organization;

  // Date range filtering
  if (req.query.startDate && req.query.endDate) {
    filter.transactionDate = {
      $gte: new Date(req.query.startDate as string),
      $lte: new Date(req.query.endDate as string),
    };
  } else if (req.query.month && req.query.year) {
    const month = String(req.query.month).padStart(2, '0');
    const startDate = new Date(`${req.query.year}-${month}-01`);
    const endDate = new Date(
      parseInt(req.query.year as string),
      parseInt(month),
      0,
      23,
      59,
      59
    );

    filter.transactionDate = {
      $gte: startDate,
      $lte: endDate,
    };
  }

  const transactions = await roundUpTransactionService.getTransactions(
    filter,
    parseInt(page as string),
    parseInt(limit as string)
  );

  return sendResponse(res, 200, {
    success: true,
    message: 'Transactions retrieved successfully',
    data: {
      transactions,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: transactions.length,
      },
    },
  });
});

// Get transaction details by ID
const getTransactionDetails = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user.id;
    const { transactionId } = req.params;

    // Get transaction with service helper
    const transaction = await roundUpTransactionService.getTransactionById(
      transactionId as string,
      userId
    );

    if (!transaction) {
      return sendResponse(res, 404, {
        success: false,
        message: 'Transaction not found',
        data: null,
      });
    }

    return sendResponse(res, 200, {
      success: true,
      message: 'Transaction details retrieved successfully',
      data: transaction,
    });
  }
);

// Get eligible transactions for admin (date range analysis)
const getEligibleTransactions = catchAsync(
  async (req: Request, res: Response) => {
    const { startDate, endDate, charityId } = req.query;

    if (!startDate || !endDate) {
      return sendResponse(res, 400, {
        success: false,
        message: 'Start date and end date are required',
        data: null,
      });
    }

    const transactions =
      await roundUpTransactionService.getEligibleTransactions(
        new Date(startDate as string),
        new Date(endDate as string),
        charityId as string
      );

    return sendResponse(res, 200, {
      success: true,
      message: 'Eligible transactions retrieved successfully',
      data: transactions,
    });
  }
);

// Get processing transactions (for webhook monitoring)
const getProcessingTransactions = catchAsync(
  async (req: Request, res: Response) => {
    const processingTransactions =
      await roundUpTransactionService.getTransactions(
        {
          status: 'processing',
        },
        1,
        100
      );

    return sendResponse(res, 200, {
      success: true,
      message: 'Processing transactions retrieved successfully',
      data: {
        transactions: processingTransactions,
        count: processingTransactions.length,
      },
    });
  }
);

// Retry failed transactions (admin function)
const retryFailedTransactions = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.body;

    // This would trigger re-processing of failed transactions
    // Implementation would be similar to manual cron trigger but focused on failed ones

    return sendResponse(res, 200, {
      success: true,
      message: 'Failed transactions retry initiated',
      data: {
        note: 'Failed transaction retry functionality to be implemented',
        userId,
      },
    });
  }
);

export const roundUpTransactionController = {
  getTransactionSummary,
  getTransactions,
  getTransactionDetails,
  getEligibleTransactions,
  getProcessingTransactions,
  retryFailedTransactions,
};
