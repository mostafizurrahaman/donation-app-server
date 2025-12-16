import { model, now, Schema } from 'mongoose';
import { IORGANIZATION } from './organization.interface';
import {
  organizationServiceTypeValues,
  STRIPE_ACCOUNT_STATUS,
  STRIPE_ACCOUNT_STATUS_VALUES,
} from './organization.constants';

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

    // Verify Your registration
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

    // Stripe Connect account for receiving donations
    stripeConnectAccountId: {
      type: String,
      required: false,
    },

    //  Extra fields added:
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

    // Extra Access Fields :
    registeredCharityName: {
      type: String,
      default: '',
    },
    isProfileVisible: {
      type: Boolean,
      default: true,
    },

    stripeAccountStatus: {
      type: String,
      enum: STRIPE_ACCOUNT_STATUS_VALUES,
      default: STRIPE_ACCOUNT_STATUS.NOT_CONNECTED,
    },

    // Optional: Store why it's pending (e.g., "bank_account_missing")
    stripeAccountRequirements: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true, versionKey: false }
);

const Organization = model<IORGANIZATION>('Organization', organizationSchema);

export default Organization;
export { Organization as OrganizationModel };
