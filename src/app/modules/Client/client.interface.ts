import { Document } from 'mongoose';
import { Types } from 'mongoose';

export interface IClient extends Document {
  _id: Types.ObjectId;
  auth: Types.ObjectId;

  // _id: Types.ObjectId;
  name: string;
  address: string;
  state: string;
  postalCode: string;
  phoneNumber: string;

  image: string;

  // phoneNumber: string;
}
