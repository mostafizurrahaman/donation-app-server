export interface IErrorSource {
  path: string | number;
  message: string;
}

export interface IMeta {
  page: number;
  limit: number;
  total: number;
  totalPage: number;
}

export type TProfileFileFields = {
  clientImage?: Express.Multer.File[];
  businessImage?: Express.Multer.File[];
  organizationImage?: Express.Multer.File[];
  drivingLincenseURL?: Express.Multer.File[];
  adminImage?: Express.Multer.File[];
};

export type TDeactiveAccountPayload = {
  email: string;
  password: string;
  deactivationReason: string;
};

// Extended Request type with user
import type { Request } from 'express';
import type { IAuth } from '../modules/Auth/auth.interface';

export interface ExtendedRequest extends Request {
  user: IAuth;
}
