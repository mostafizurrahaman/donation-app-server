import { Schema, model } from 'mongoose';
import { ISuperAdmin } from './superAdmin.interface';


const superAdminSchema = new Schema<ISuperAdmin>(
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
    },
    country: {
      type: String,
    },
    city: {
      type: String,
    },
    state: {
      type: String,
    },
    profileImage: {
      type: String,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const SuperAdmin = model<ISuperAdmin>('SuperAdmin', superAdminSchema);
export default SuperAdmin;
