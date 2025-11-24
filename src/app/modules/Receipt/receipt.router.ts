import express from 'express';

import { ROLE } from '../Auth/auth.constant';

import * as receiptController from './receipt.controller';
import * as receiptValidation from './receipt.validation';
import { auth, validateRequest } from '../../middlewares';

const router = express.Router();

/**
 * @route   POST /api/receipts/generate
 * @desc    Generate a new receipt (Admin/System only)
 * @access  Private (Admin/Super Admin)
 */
router.post(
  '/generate',
  auth(ROLE.ADMIN, ROLE.ADMIN),
  validateRequest(receiptValidation.generateReceiptSchema),
  receiptController.generateReceipt
);

/**
 * @route   GET /api/receipts/:id
 * @desc    Get receipt by ID
 * @access  Private (Owner, Org Admin, Super Admin)
 */
router.get(
  '/:id',
  auth(ROLE.CLIENT, ROLE.ORGANIZATION, ROLE.ADMIN, ROLE.ADMIN),
  validateRequest(receiptValidation.getReceiptByIdSchema),
  receiptController.getReceiptById
);

/**
 * @route   GET /api/receipts/donor/:donorId
 * @desc    Get all receipts for a specific donor
 * @access  Private (Owner, Admin, Super Admin)
 */
router.get(
  '/donor/:donorId',
  auth(ROLE.CLIENT, ROLE.ADMIN, ROLE.ADMIN),
  validateRequest(receiptValidation.getReceiptsByDonorSchema),
  receiptController.getReceiptsByDonor
);

/**
 * @route   GET /api/receipts/organization/:organizationId
 * @desc    Get all receipts for a specific organization
 * @access  Private (Org Admin, Super Admin)
 */
router.get(
  '/organization/:organizationId',
  auth(ROLE.ORGANIZATION, ROLE.ADMIN, ROLE.ADMIN),
  validateRequest(receiptValidation.getReceiptsByOrganizationSchema),
  receiptController.getReceiptsByOrganization
);

/**
 * @route   POST /api/receipts/:id/resend-email
 * @desc    Resend receipt email
 * @access  Private (Owner, Org Admin, Super Admin)
 */
router.post(
  '/:id/resend-email',
  auth(ROLE.CLIENT, ROLE.ORGANIZATION, ROLE.ADMIN, ROLE.ADMIN),
  validateRequest(receiptValidation.resendReceiptEmailSchema),
  receiptController.resendReceiptEmail
);

// /**
//  * @route   GET /api/receipts/stats
//  * @desc    Get receipt statistics
//  * @access  Private (Admin, Super Admin)
//  */
// router.get(
//   '/stats',
//   auth(ROLE.ADMIN, ROLE.ADMIN),
//   validateRequest(receiptValidation.getReceiptStatsSchema),
//   receiptController.getReceiptStats
// );

/**
 * @route   GET /api/receipts/:id/download
 * @desc    Download receipt PDF
 * @access  Private (Owner, Org Admin, Super Admin)
 */
router.get(
  '/:id/download',
  auth(ROLE.CLIENT, ROLE.ORGANIZATION, ROLE.ADMIN, ROLE.ADMIN),
  validateRequest(receiptValidation.downloadReceiptSchema),
  receiptController.downloadReceipt
);

// /**
//  * @route   GET /api/receipts/export
//  * @desc    Export receipts as CSV
//  * @access  Private (Admin, Super Admin)
//  */
// router.get(
//   '/export',
//   auth(ROLE.ADMIN, ROLE.ADMIN),
//   validateRequest(receiptValidation.bulkExportReceiptsSchema),
//   receiptController.exportReceipts
// );

/**
 * @route   POST /api/receipts/:id/regenerate-url
 * @desc    Regenerate presigned URL for expired receipt
 * @access  Private (Owner, Org Admin, Super Admin)
 */
router.post(
  '/:id/regenerate-url',
  auth(ROLE.CLIENT, ROLE.ORGANIZATION, ROLE.ADMIN, ROLE.ADMIN),
  validateRequest(receiptValidation.getReceiptByIdSchema),
  receiptController.regenerateReceiptURL
);

export const ReceiptRoutes = router;
