import { IClient } from './client.interface';
import { Schema, model } from 'mongoose';
import { defaultUserImage } from '../Auth/auth.constant';

const clientSchema = new Schema<IClient>(
  {
    auth: {
      type: Schema.Types.ObjectId,
      ref: 'Auth',
      required: true,
      unique: true,
    },

    name: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    postalCode: {
      type: String,
      required: true,
    },

    image: {
      type: String,
      default: defaultUserImage,
    },

    phoneNumber: {
      type: String,
    },
  },
  { timestamps: true, versionKey: false }
);

const Client = model<IClient>('Client', clientSchema);

export default Client;
