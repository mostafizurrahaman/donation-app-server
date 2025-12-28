import { model, now, Schema } from 'mongoose';
import { IORGANIZATION } from './organization.interface';
import { organizationServiceTypeValues } from './organization.constants';

const organizationSchema = new Schema<IORGANIZATION>(
  {
    auth: {
      type: Schema.Types.ObjectId,
      ref: 'Auth',
      required: true,
      unique: true,
    },

    // orgnaization details:
    name: {
      type: String,
    },
    serviceType: {
      type: String,
      enum: organizationServiceTypeValues,
    },
    address: {
      type: String,
    },

    state: {
      type: String,
    },
    postalCode: {
      type: String,
    },
    website: {
      type: String,
    },

    phoneNumber: {
      type: String,
    },

    coverImage: {
      type: String,
    },
    logoImage: {
      type: String,
      optional: true,
    },

    tfnOrAbnNumber: {
      type: String,
    },
    acncNumber: {
      type: String,
    },
    zakatLicenseHolderNumber: {
      type: String,
      default: null,
    },

    country: {
      type: String,
      default: '',
    },
    aboutUs: {
      type: String,
      default: '',
    },
    dateOfEstablishment: {
      type: Date,
      default: now(),
    },

    registeredCharityName: {
      type: String,
      default: '',
    },
    isProfileVisible: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true }, // Enable virtuals
    toObject: { virtuals: true },
  }
);

organizationSchema.virtual('stripeAccount', {
  ref: 'StripeAccount',
  localField: '_id',
  foreignField: 'organization',
  justOne: true,
});

const Organization = model<IORGANIZATION>('Organization', organizationSchema);

export default Organization;
export { Organization as OrganizationModel };
