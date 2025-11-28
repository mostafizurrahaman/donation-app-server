import { Document, Types } from 'mongoose';

export interface IBusiness extends Document {
  _id: Types.ObjectId;
  auth: Types.ObjectId;

  category: string;
  name: string;
  tagLine: string;
  description: string;

  coverImage: string;
  logoImage: string;
  businessPhoneNumber: string;
  businessEmail: string;
  businessWebsite: string;

  locations: string[];
}
