import { Document, Types } from 'mongoose';
import { STRIPE_ACCOUNT_STATUS } from './organization.constants';

export type TOrganizationAccountStatusType =
  (typeof STRIPE_ACCOUNT_STATUS)[keyof typeof STRIPE_ACCOUNT_STATUS];

export interface IORGANIZATION extends Document {
  _id: Types.ObjectId;
  auth: Types.ObjectId;

  name: string;
  aboutUs?: string;
  serviceType: 'non-profit' | 'charity' | 'mosque';
  address: string;
  country?: string;
  state: string;
  postalCode: string;
  website: string;

  phoneNumber: string;
  coverImage: string;
  logoImage?: string;

  boardMemberName: string;
  boardMemberEmail: string;
  boardMemberPhoneNumber: string;
  drivingLicenseURL: string;

  tfnOrAbnNumber: string;
  acncNumber: string;
  zakatLicenseHolderNumber: string | null;
  stripeConnectAccountId?: string;
  dateOfEstablishment: Date;
  registeredCharityName: string;
  isProfileVisible?: boolean;
  stripeAccountStatus: TOrganizationAccountStatusType;
  stripeAccountRequirements?: string[];
}
