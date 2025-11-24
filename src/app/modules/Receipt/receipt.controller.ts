import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { asyncHandler, sendResponse, AppError } from '../../utils';

import { RECEIPT_MESSAGES } from './receipt.constant';
import { receiptServices } from './receipt.service';

/**
 * Generate receipt for a donation
 */
export const generateReceipt = asyncHandler(
  async (req: Request, res: Response) => {
    const receipt = await receiptServices.generateReceipt(req.body);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,

      message: RECEIPT_MESSAGES.GENERATION_SUCCESS,
      data: receipt,
    });
  }
);

/**
 * Get receipt by ID
 */
export const getReceiptById = asyncHandler(
  async (req: Request, res: Response) => {
    const receipt = await receiptServices.getReceiptById(req.params.id);

    sendResponse(res, {
      statusCode: httpStatus.OK,

      message: 'Receipt retrieved successfully',
      data: receipt,
    });
  }
);

/**
 * Get receipts by donor
 */
export const getReceiptsByDonor = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await receiptServices.getReceiptsByDonor(
      req.params.donorId,
      req.query
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,

      message: 'Donor receipts retrieved successfully',
      data: result,
    });
  }
);

/**
 * Get receipts by organization
 */
export const getReceiptsByOrganization = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await receiptServices.getReceiptsByOrganization(
      req.params.organizationId,
      req.query
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,

      message: 'Organization receipts retrieved successfully',
      data: result,
    });
  }
);

/**
 * Resend receipt email
 */
export const resendReceiptEmail = asyncHandler(
  async (req: Request, res: Response) => {
    await receiptServices.resendReceiptEmail(req.params.id);

    sendResponse(res, {
      statusCode: httpStatus.OK,

      message: RECEIPT_MESSAGES.EMAIL_SENT,
      data: null,
    });
  }
);

// /**
//  * Get receipt statistics
//  */
// export const getReceiptStats = asyncHandler(
//   async (req: Request, res: Response) => {
//     const stats = await receiptServices.getReceiptStats(req.query);

//     sendResponse(res, {
//       statusCode: httpStatus.OK,

//       message: 'Receipt statistics retrieved successfully',
//       data: stats,
//     });
//   }
// );

/**
 * Download receipt
 */
export const downloadReceipt = asyncHandler(
  async (req: Request, res: Response) => {
    const receipt = await receiptServices.getReceiptById(req.params.id);

    // Regenerate URL if expired
    let url = receipt.pdfUrl;
    if (!url || url.includes('Expires=')) {
      // Check if URL might be expired
      url = await receiptServices.regenerateReceiptURL(req.params.id);
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,

      message: 'Receipt download URL generated',
      data: { url },
    });
  }
);

// /**
//  * Export receipts as CSV
//  */
// export const exportReceipts = asyncHandler(
//   async (req: Request, res: Response) => {
//     const csv = await receiptServices.exportReceiptsAsCSV(req.query);

//     res.setHeader('Content-Type', 'text/csv');
//     res.setHeader('Content-Disposition', 'attachment; filename=receipts.csv');
//     res.status(httpStatus.OK).send(csv);
//   }
// );

/**
 * Regenerate receipt URL (for expired presigned URLs)
 */
export const regenerateReceiptURL = asyncHandler(
  async (req: Request, res: Response) => {
    const url = await receiptServices.regenerateReceiptURL(req.params.id);

    sendResponse(res, {
      statusCode: httpStatus.OK,

      message: 'Receipt URL regenerated successfully',
      data: { url },
    });
  }
);
