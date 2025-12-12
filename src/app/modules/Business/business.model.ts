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
    websiteViews: {
      type: Number,
      default: 0,
    },
    views: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true, versionKey: false }
);

interface IBusinessViews {
  business: Schema.Types.ObjectId;
  user: Schema.Types.ObjectId;
}
interface IBusinessWebsiteViews {
  business: Schema.Types.ObjectId;
  user: Schema.Types.ObjectId;
}

const businessViewsSchema = new Schema<IBusinessViews>(
  {
    business: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Auth',
      required: true,
    },
  },
  { timestamps: true, versionKey: false }
);

const businessWebsiteViewSchema = new Schema<IBusinessWebsiteViews>(
  {
    business: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Auth',
      required: true,
    },
  },
  { timestamps: true, versionKey: false }
);

const Business = model<IBusiness>('Business', businessSchema);

export const BusinessView = model<IBusinessViews>(
  'BusinessView',
  businessViewsSchema
);
export const BusinessWebsiteView = model<IBusinessWebsiteViews>(
  'BusinessWebsiteView',
  businessWebsiteViewSchema
);

export default Business;
