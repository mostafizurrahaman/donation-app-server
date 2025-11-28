import { model, Schema } from 'mongoose';
import { IBusiness } from './business.interface';

// Main Business Schema
const businessSchema = new Schema<IBusiness>(
  {
    auth: {
      type: Schema.Types.ObjectId,
      ref: 'Auth',
      required: true,
    },

    category: {
      type: String,
    },
    name: {
      type: String,
    },
    tagLine: {
      type: String,
    },
    description: {
      type: String,
    },

    coverImage: {
      type: String,
    },
    logoImage: {
      type: String,
    },

    businessPhoneNumber: {
      type: String,
    },
    businessEmail: {
      type: String,
    },
    businessWebsite: {
      type: String,
    },

    locations: {
      type: [String],
    },
  },
  { timestamps: true, versionKey: false }
);

const Business = model<IBusiness>('Business', businessSchema);

export default Business;
