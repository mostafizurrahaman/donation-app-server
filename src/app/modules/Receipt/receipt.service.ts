import { Receipt } from './receipt.model';
import { Donation } from '../Donation/donation.model';
import Client from '../Client/client.model';
import { OrganizationModel } from '../Organization/organization.model';
import Cause from '../Causes/causes.model';
import { Types } from 'mongoose';

import {
  RECEIPT_NUMBER_PREFIX,
  RECEIPT_MESSAGES,
  RECEIPT_STATUS,
  AWS_S3_BUCKET_FOLDER,
  MAX_EMAIL_ATTEMPTS,
} from './receipt.constant';

import { AppError } from '../../utils';
import httpStatus from 'http-status';

// ✅ Import S3 utils
import { uploadToS3, getSignedS3Url } from '../../utils/s3.utils';

// ✅ Import PDF utils
import { generateReceiptPDF } from '../../utils/pdf.utils';

// ✅ Import email utility
import sendReceiptEmail from '../../utils/sendReceiptEmail';

import {
  IReceiptGenerationPayload,
  IReceiptPDFData,
  IReceiptFilterQuery,
} from './receipt.interface';

/* ----------------------------------------------
   HELPER FUNCTIONS
------------------------------------------------- */

const generateReceiptNumber = (): string => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');
  return `${RECEIPT_NUMBER_PREFIX}-${timestamp}-${random}`;
};

/* ----------------------------------------------
   INTERFACE FOR SEND EMAIL SERVICE
------------------------------------------------- */
interface ISendReceiptEmailServicePayload {
  receiptId: Types.ObjectId | string;
  donorEmail: string;
  donorName: string;
  organizationName: string;
  pdfUrl: string;
  amount: number;
  isTaxable: boolean;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  donationDate: Date;
  receiptNumber?: string;
  donationType?: string;
  specialMessage?: string;
}

/* ----------------------------------------------
   MAIN FUNCTION: GENERATE RECEIPT
------------------------------------------------- */
const generateReceipt = async (payload: IReceiptGenerationPayload) => {
  try {
    // Check if receipt already exists
    const existing = await Receipt.findOne({ donation: payload.donationId });
    if (existing) {
      throw new AppError(httpStatus.CONFLICT, RECEIPT_MESSAGES.ALREADY_EXISTS);
    }

    // Fetch donor
    const donor = await Client.findById(payload.donorId).populate('auth');
    if (!donor) throw new AppError(httpStatus.NOT_FOUND, 'Donor not found');

    // Fetch organization
    const organization = await OrganizationModel.findById(
      payload.organizationId
    ).populate('auth');
    if (!organization)
      throw new AppError(httpStatus.NOT_FOUND, 'Organization not found');

    // Fetch cause (optional) - not used but kept for potential future use
    if (payload.causeId) {
      await Cause.findById(payload.causeId);
    }

    const receiptNumber = generateReceiptNumber();

    // Prepare PDF data
    const pdfData: IReceiptPDFData = {
      receiptNumber,
      donorName: donor.name,
      donorEmail: (donor.auth as unknown as { email: string }).email,
      organizationName: organization.name,
      organizationAddress: organization.address,
      organizationEmail: (organization.auth as unknown as { email: string })
        .email,
      abnNumber: organization.tfnOrAbnNumber,
      taxDeductible: true,
      zakatEligible: !!organization.zakatLicenseHolderNumber,
      amount: payload.amount,
      isTaxable: payload.isTaxable,
      taxAmount: payload.taxAmount,
      totalAmount: payload.totalAmount,
      currency: payload.currency,
      donationType: payload.donationType,
      donationDate: payload.donationDate,
      paymentMethod: payload.paymentMethod,
      specialMessage: payload.specialMessage,
    };

    // ✅ Generate PDF using utils
    const pdfBuffer = await generateReceiptPDF(pdfData);

    // ✅ Upload to S3 using utils
    const { url, key } = await uploadToS3({
      buffer: pdfBuffer,
      key: `${receiptNumber}.pdf`,
      contentType: 'application/pdf',
      folder: AWS_S3_BUCKET_FOLDER,
      metadata: {
        receiptNumber,
        generatedAt: new Date().toISOString(),
      },
    });

    // Create receipt record
    const receipt = await Receipt.create({
      donation: payload.donationId,
      donor: payload.donorId,
      organization: payload.organizationId,
      cause: payload.causeId,
      receiptNumber,
      amount: payload.amount,
      isTaxable: payload.isTaxable,
      taxAmount: payload.taxAmount,
      totalAmount: payload.totalAmount,
      currency: payload.currency,
      donationType: payload.donationType,
      donationDate: payload.donationDate,
      paymentMethod: payload.paymentMethod,
      taxDeductible: pdfData.taxDeductible,
      abnNumber: pdfData.abnNumber,
      zakatEligible: pdfData.zakatEligible,
      pdfUrl: url,
      pdfKey: key,
      donorName: pdfData.donorName,
      donorEmail: pdfData.donorEmail,
      organizationName: pdfData.organizationName,
      organizationEmail: pdfData.organizationEmail,
      organizationAddress: pdfData.organizationAddress,
      specialMessage: payload.specialMessage,
      status: RECEIPT_STATUS.GENERATED,
      generatedAt: new Date(),
      emailSent: false,
      emailAttempts: 0,
    });

    // Update donation record
    await Donation.findByIdAndUpdate(payload.donationId, {
      receiptGenerated: true,
      receiptId: receipt._id,
    });

    // Send email asynchronously using the email service function
    sendReceiptEmailService({
      receiptId: receipt._id as Types.ObjectId,
      donorEmail: pdfData.donorEmail,
      donorName: pdfData.donorName,
      organizationName: pdfData.organizationName,
      pdfUrl: url,
      amount: payload.amount,
      isTaxable: payload.isTaxable,
      taxAmount: payload.taxAmount,
      totalAmount: payload.totalAmount,
      currency: payload.currency,
      donationDate: payload.donationDate,
      receiptNumber: receipt.receiptNumber,
      donationType: receipt.donationType,
      specialMessage: receipt.specialMessage,
    }).catch((error: Error) => {
      // eslint-disable-next-line no-console
      console.error('Email sending failed:', error);
    });

    return receipt;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Receipt generation error:', error);
    if (error instanceof AppError) throw error;

    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      RECEIPT_MESSAGES.GENERATION_FAILED
    );
  }
};

/* ----------------------------------------------
   SEND EMAIL SERVICE FUNCTION
------------------------------------------------- */
const sendReceiptEmailService = async (
  payload: ISendReceiptEmailServicePayload
) => {
  try {
    const receipt = await Receipt.findById(payload.receiptId);
    if (!receipt)
      throw new AppError(httpStatus.NOT_FOUND, RECEIPT_MESSAGES.NOT_FOUND);

    if (receipt.emailAttempts >= MAX_EMAIL_ATTEMPTS)
      throw new AppError(
        httpStatus.TOO_MANY_REQUESTS,
        'Maximum email attempts reached'
      );

    // ✅ Use the receipt email utility
    await sendReceiptEmail({
      donorEmail: payload.donorEmail,
      donorName: payload.donorName,
      organizationName: payload.organizationName,
      receiptNumber: payload.receiptNumber || receipt.receiptNumber,
      amount: payload.amount,
      isTaxable: payload.isTaxable,
      taxAmount: payload.taxAmount,
      totalAmount: payload.totalAmount,
      currency: payload.currency,
      donationDate: payload.donationDate,
      pdfUrl: payload.pdfUrl,
      donationType: payload.donationType || receipt.donationType,
      specialMessage: payload.specialMessage || receipt.specialMessage,
    });

    // Update receipt status
    await Receipt.findByIdAndUpdate(payload.receiptId, {
      emailSent: true,
      emailSentAt: new Date(),
      status: RECEIPT_STATUS.SENT,
      $inc: { emailAttempts: 1 },
    });

    // eslint-disable-next-line no-console
    console.log(
      `✅ Receipt email sent successfully for: ${receipt.receiptNumber}`
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Email sending error:', error);

    await Receipt.findByIdAndUpdate(payload.receiptId, {
      $inc: { emailAttempts: 1 },
      lastEmailError: (error as Error).message || 'Unknown error',
      status: RECEIPT_STATUS.FAILED,
    });

    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      RECEIPT_MESSAGES.EMAIL_FAILED
    );
  }
};

/* ----------------------------------------------
   OTHER FUNCTIONS
------------------------------------------------- */

const resendReceiptEmail = async (receiptId: string) => {
  const receipt = await Receipt.findById(receiptId);
  if (!receipt)
    throw new AppError(httpStatus.NOT_FOUND, RECEIPT_MESSAGES.NOT_FOUND);

  return sendReceiptEmailService({
    receiptId: receipt._id as Types.ObjectId,
    donorEmail: receipt.donorEmail,
    donorName: receipt.donorName,
    organizationName: receipt.organizationName,
    pdfUrl: receipt.pdfUrl,
    amount: receipt.amount,
    isTaxable: receipt.isTaxable,
    taxAmount: receipt.taxAmount,
    totalAmount: receipt.totalAmount,
    currency: receipt.currency,
    donationDate: receipt.donationDate,
    receiptNumber: receipt.receiptNumber,
    donationType: receipt.donationType,
    specialMessage: receipt.specialMessage,
  });
};

const getReceiptById = async (receiptId: string) => {
  const receipt = await Receipt.findById(receiptId)
    .populate('donor', 'name image')
    .populate('organization', 'name logoImage')
    .populate('cause', 'name category');

  if (!receipt)
    throw new AppError(httpStatus.NOT_FOUND, RECEIPT_MESSAGES.NOT_FOUND);

  return receipt;
};

const getReceiptsByDonor = async (
  donorId: string,
  query: IReceiptFilterQuery
) => {
  const {
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = query;

  const skip = (Number(page) - 1) * Number(limit);
  const sortDirection = sortOrder === 'asc' ? 1 : -1;
  const sortOptions: Record<string, 1 | -1> = {
    [sortBy]: sortDirection,
  };

  const [receipts, total] = await Promise.all([
    Receipt.find({ donor: donorId })
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit))
      .populate('organization', 'name logoImage')
      .populate('cause', 'name category'),
    Receipt.countDocuments({ donor: donorId }),
  ]);

  return { receipts, total, page: Number(page), limit: Number(limit) };
};

const getReceiptsByOrganization = async (
  organizationId: string,
  query: IReceiptFilterQuery
) => {
  const { page = 1, limit = 10, startDate, endDate, status } = query;

  const filter: Record<string, unknown> = { organization: organizationId };

  if (startDate || endDate) {
    filter.donationDate = {} as Record<string, Date>;
    if (startDate)
      (filter.donationDate as Record<string, Date>).$gte = new Date(startDate);
    if (endDate)
      (filter.donationDate as Record<string, Date>).$lte = new Date(endDate);
  }

  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);

  const [receipts, total] = await Promise.all([
    Receipt.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('donor', 'name image')
      .populate('cause', 'name category'),
    Receipt.countDocuments(filter),
  ]);

  return { receipts, total, page: Number(page), limit: Number(limit) };
};

const regenerateReceiptURL = async (receiptId: string): Promise<string> => {
  const receipt = await Receipt.findById(receiptId);
  if (!receipt)
    throw new AppError(httpStatus.NOT_FOUND, RECEIPT_MESSAGES.NOT_FOUND);

  // ✅ Use S3 utils to regenerate URL
  const url = await getSignedS3Url({
    key: receipt.pdfKey,
    expiresIn: 7 * 24 * 60 * 60, // 7 days
  });

  await Receipt.findByIdAndUpdate(receiptId, { pdfUrl: url });
  return url;
};

/* ----------------------------------------------
   EXPORT SERVICES
------------------------------------------------- */

export const receiptServices = {
  generateReceipt,
  resendReceiptEmail,
  getReceiptById,
  getReceiptsByDonor,
  getReceiptsByOrganization,
  regenerateReceiptURL,
};
