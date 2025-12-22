import { Document, Model, Types } from 'mongoose';
import { TRole, TAuthStatus } from './auth.constant';

// Instance methods
export interface IAuth extends Document {
  _id: Types.ObjectId;
  email: string;
  password: string;
  passwordChangedAt?: Date;

  otp: string;
  otpExpiry: Date;
  isVerifiedByOTP: boolean;

  twoFactorSecret?: string;
  isTwoFactorEnabled: boolean;
  twoFactorBackupCodes: string[];

  isProfile: boolean;

  role: TRole;
  isActive: boolean;
  isDeleted: boolean;
  status: TAuthStatus;

  deactivationReason: string;
  deactivatedAt: Date;

  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  isPasswordMatched(plainTextPassword: string): Promise<boolean>;
  isJWTIssuedBeforePasswordChanged(
    jwtIssuedTimestamp: number | undefined
  ): boolean;
  ensureActiveStatus(): void;
}

// Static methods
export interface IAuthModel extends Model<IAuth> {
  isUserExistsByEmail(email: string): Promise<IAuth | null>;
}
