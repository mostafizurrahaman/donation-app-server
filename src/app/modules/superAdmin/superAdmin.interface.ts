import { Document, Types } from 'mongoose';

export interface ISuperAdmin extends Document {
  _id: Types.ObjectId;
  auth: Types.ObjectId;
  name: string;
  address?: string;
  phoneNumber?: string;
  country?: string;
  city?: string;
  state?: string;
  profileImage?: string;
  createdAt: Date;
  updatedAt: Date;
}