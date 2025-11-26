import { Document, Types } from 'mongoose';

export interface IReceipt {
  donation: Types.ObjectId;
  donor: Types.ObjectId;
  organization: Types.ObjectId;
  cause?: Types.ObjectId;

  receiptNumber: string;

  amount: number;
  currency: string;
  donationType: 'one-time' | 'recurring' | 'round-up';
  donationDate: Date;
  paymentMethod?: string;

  taxDeductible: boolean;
  abnNumber?: string;
  zakatEligible: boolean;

  pdfUrl: string;
  pdfKey: string;

  emailSent: boolean;
  emailSentAt?: Date;
  emailAttempts: number;
  lastEmailError?: string;

  donorName: string;
  donorEmail: string;

  organizationName: string;
  organizationEmail?: string;
  organizationAddress?: string;

  specialMessage?: string;

  status: 'pending' | 'generated' | 'sent' | 'failed';
  generatedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface IReceiptModel extends IReceipt, Document {}

export interface IReceiptGenerationPayload {
  donationId: Types.ObjectId | string;
  donorId: Types.ObjectId | string;
  organizationId: Types.ObjectId | string;
  causeId?: Types.ObjectId | string;
  amount: number;
  currency: string;
  donationType: 'one-time' | 'recurring' | 'round-up';
  donationDate: Date;
  paymentMethod?: string;
  specialMessage?: string;
}

export interface IReceiptEmailPayload {
  receiptId: Types.ObjectId | string;
  donorEmail: string;
  donorName: string;
  organizationName: string;
  pdfUrl: string;
  amount: number;
  currency: string;
  donationDate: Date;
}

export interface IReceiptFilterQuery {
  donor?: Types.ObjectId | string;
  organization?: Types.ObjectId | string;
  cause?: Types.ObjectId | string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  emailSent?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface IReceiptPDFData {
  receiptNumber: string;
  donorName: string;
  donorEmail: string;
  organizationName: string;
  organizationAddress?: string;
  organizationEmail?: string;
  abnNumber?: string;
  taxDeductible: boolean;
  zakatEligible: boolean;
  amount: number;
  currency: string;
  donationType: string;
  donationDate: Date;
  paymentMethod?: string;
  specialMessage?: string;
}
