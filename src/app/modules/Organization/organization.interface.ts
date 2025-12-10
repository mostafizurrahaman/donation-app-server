import { Document, Types } from 'mongoose';

export interface IORGANIZATION extends Document {
  _id: Types.ObjectId;
  auth: Types.ObjectId;

  name: string;
  aboutUs?: string;
  serviceType: string;
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
  zakatLicenseHolderNumber: string | null;
  stripeConnectAccountId?: string;
  dateOfEstablishment: Date;
  registeredCharityName: string;
  isProfileVisible?: boolean;
}

