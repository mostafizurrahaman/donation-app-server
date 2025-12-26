/* eslint-disable @typescript-eslint/no-explicit-any */
import httpStatus from 'http-status';
import { AppError, deleteFromS3, uploadToS3 } from '../../utils';
import Organization from './organization.model';
import Auth from '../Auth/auth.model';
import { StripeService } from '../Stripe/stripe.service';
import {
  TEditOrgTaxDetails,
  TEditProfileOrgDetails,
} from './organization.validation';
import { ROLE, AUTH_STATUS } from '../Auth/auth.constant';
import { IAuth } from '../Auth/auth.interface';
import { createAccessToken } from '../../lib';
import { searchableFields } from './organization.constants';
import QueryBuilder from '../../builders/QueryBuilder';
import Cause from '../Causes/causes.model';
import Donation from '../Donation/donation.model';
import { StripeAccount } from '../OrganizationAccount/stripe-account.model';
import { getS3KeyFromUrl } from '../../utils/s3.utils';
import { CAUSE_STATUS_TYPE } from '../Causes/causes.constant';
import { SubscriptionService } from '../Subscription/subscription.service';

/**
 * Start Stripe Connect onboarding for an organization
 * Checks for existing account first to prevent duplicates.
 */
const startStripeConnectOnboarding = async (
  userId: string
): Promise<{ onboardingUrl: string; accountId: string }> => {
  // 1. Find user to get email
  const user = await Auth.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  // 2. Find organization associated with this user
  const organization = await Organization.findOne({ auth: userId });
  if (!organization) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'Organization not found! Only organizations can onboard for payment receiving.'
    );
  }

  // 3. Check if a Stripe Account ALREADY exists for this org
  let stripeAccount = await StripeAccount.findOne({
    organization: organization._id,
  });

  let accountId = '';

  if (stripeAccount) {
    console.log(
      `♻️ Reusing existing Stripe Account: ${stripeAccount.stripeAccountId}`
    );
    accountId = stripeAccount.stripeAccountId;
  } else {
    console.log(`🆕 Creating new Stripe Connected Account...`);

    // Call Stripe API to create the Express account
    const stripeResponse = await StripeService.createConnectAccount(
      user.email,
      organization.name || 'Organization',
      'US'
    );

    // Save the new ID to our dedicated StripeAccount model
    stripeAccount = await StripeAccount.create({
      organization: organization._id,
      stripeAccountId: stripeResponse.accountId,
      status: 'pending',
      country: 'US',
      requirements: {
        currently_due: [],
        eventually_due: [],
      },
    });

    accountId = stripeResponse.accountId;
  }

  // 4. Generate a fresh Onboarding Link
  const { onboardingUrl } = await StripeService.createAccountLink(accountId);

  return {
    onboardingUrl,
    accountId,
  };
};

/**
 * Get Stripe Connect account status
 */

const getStripeConnectStatus = async (
  userId: string
): Promise<{
  hasAccount: boolean;
  accountId?: string;
  isActive: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements: string[];
  status: string;
}> => {
  // 1. Find Organization
  const organization = await Organization.findOne({ auth: userId });
  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
  }

  // 2. Find the Stripe Account record
  const stripeAccount = await StripeAccount.findOne({
    organization: organization._id,
  });

  // 3. Return early if no account exists
  if (!stripeAccount) {
    return {
      hasAccount: false,
      isActive: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requirements: [],
      status: 'not_connected',
    };
  }

  // 4. Fetch LATEST details directly from Stripe API (Source of Truth)
  try {
    const account = await StripeService.getConnectAccount(
      stripeAccount.stripeAccountId
    );

    // 5. Determine Database Status based on Stripe Flags
    let newStatus = 'pending';
    if (account.requirements?.disabled_reason) {
      newStatus = 'rejected';
    } else if (account.charges_enabled && account.payouts_enabled) {
      newStatus = 'active';
    } else if ((account.requirements?.currently_due || []).length > 0) {
      newStatus = 'restricted';
    }

    // 6. SYNC: Update local database with fresh data (Self-healing)
    stripeAccount.chargesEnabled = account.charges_enabled;
    stripeAccount.payoutsEnabled = account.payouts_enabled;
    stripeAccount.detailsSubmitted = account.details_submitted;
    stripeAccount.status = newStatus as any;
    stripeAccount.requirements = {
      currently_due: account.requirements?.currently_due || [],
      eventually_due: account.requirements?.eventually_due || [],
      disabled_reason: account.requirements?.disabled_reason! || null,
    };
    await stripeAccount.save();

    return {
      hasAccount: true,
      accountId: account.id,
      isActive: account.charges_enabled && account.payouts_enabled,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirements: account.requirements?.currently_due || [],
      status: newStatus,
    };
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to fetch Stripe Connect status: ${(error as Error).message}`
    );
  }
};

/**
 * Refresh Stripe Connect onboarding link
 * Used when a user's link expires or they return to finish the process.
 */
const refreshStripeConnectOnboarding = async (
  userId: string
): Promise<{ onboardingUrl: string }> => {
  // 1. Find Organization
  const organization = await Organization.findOne({ auth: userId });
  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
  }

  // 2. Find Stripe Account
  const stripeAccount = await StripeAccount.findOne({
    organization: organization._id,
  });

  if (!stripeAccount || !stripeAccount.stripeAccountId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'No Stripe Connect account found! Please start onboarding first.'
    );
  }

  // 3. Create new account link using the existing ID
  const { onboardingUrl } = await StripeService.createAccountLink(
    stripeAccount.stripeAccountId
  );

  return { onboardingUrl };
};

export const updateOrganizationImage = async (
  user: IAuth,
  file: Express.Multer.File | undefined,
  imageField: 'coverImage' | 'logoImage'
) => {
  // 1. Validation: Since we use memoryStorage, check for the file object
  if (!file) {
    throw new AppError(httpStatus.BAD_REQUEST, 'File is required!');
  }

  // 2. Find the organization
  const organization = await Organization.findOne({ auth: user?._id });

  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
  }

  // 3. Cleanup: Delete the old image from S3 if it exists
  const oldImageUrl = organization[imageField];
  if (oldImageUrl) {
    const oldKey = getS3KeyFromUrl(oldImageUrl);
    if (oldKey) {
      // Delete from S3 (fire and forget or await)
      await deleteFromS3(oldKey).catch((err) =>
        console.error('Failed to delete old organization image from S3:', err)
      );
    }
  }

  // 4. Upload new image to S3
  const folderPath = `profiles/organizations`;
  const fileName = `${user._id}-${Date.now()}`;

  const uploadResult = await uploadToS3({
    buffer: file.buffer,
    key: fileName,
    contentType: file.mimetype,
    folder: folderPath,
  });

  const updatedOrganization = await Organization.findOneAndUpdate(
    { auth: user?._id },
    { [imageField]: uploadResult.url },
    { new: true }
  ).select('name coverImage logoImage');

  if (!updatedOrganization) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to update organization image in database'
    );
  }

  if (imageField === 'coverImage') {
    const accessTokenPayload = {
      id: user?._id.toString(),
      name: updatedOrganization?.name,
      image: updatedOrganization?.coverImage || '',
      email: user?.email,
      role: user?.role,
      isProfile: user?.isProfile,
      isActive: user?.isActive,
      status: user?.status,
    };

    const accessToken = createAccessToken(accessTokenPayload);

    return { accessToken, organization: updatedOrganization };
  }

  return { organization: updatedOrganization };
};

/**
 * Edit Organization Profile Details (Tab 1 - Text fields only)
 * PATCH /api/v1/organization/profile-details
 */
const editProfileOrgDetailsIntoDB = async (
  userId: string,
  payload: TEditProfileOrgDetails
) => {
  // Find user
  const user = await Auth.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  if (user.role !== ROLE.ORGANIZATION) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Only organizations can update these details!'
    );
  }

  // Find organization
  const organization = await Organization.findOne({ auth: userId });
  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
  }

  // Update organization
  const updatedOrganization = await Organization.findOneAndUpdate(
    { auth: userId },
    { $set: payload },
    { new: true, runValidators: true }
  ).populate({
    path: 'auth',
    select: 'email role isProfile',
  });

  if (!updatedOrganization) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to update organization profile!'
    );
  }

  return {
    organization: updatedOrganization,
  };
};

/**
 * Update Organization Logo Image
 * PATCH /api/v1/organization/logo-image
 */
const updateLogoImageIntoDB = async (
  user: IAuth,
  file: Express.Multer.File | undefined
) => {
  if (user.role !== ROLE.ORGANIZATION) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Only organizations can update logo image!'
    );
  }

  return updateOrganizationImage(user, file, 'logoImage');
};

/**
 * Edit Organization Tax Details (Tab 2)
 * PATCH /api/v1/organization/tax-details
 */
const editOrgTaxDetailsIntoDB = async (
  userId: string,
  payload: TEditOrgTaxDetails
) => {
  // Find user
  const user = await Auth.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  if (user.role !== ROLE.ORGANIZATION) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Only organizations can update tax details!'
    );
  }

  // Find organization
  const organization = await Organization.findOne({ auth: userId });
  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
  }

  // Update tax details
  const updatedOrganization = await Organization.findOneAndUpdate(
    { auth: userId },
    { $set: payload },
    { new: true, runValidators: true }
  ).populate({
    path: 'auth',
    select: 'email role isProfile',
  });

  if (!updatedOrganization) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to update tax details!'
    );
  }

  return {
    organization: updatedOrganization,
  };
};

/**
 * Get verified Charities/ Organizations list
 */
const getAllOrganizations = async (query: Record<string, unknown>) => {
  // Extract special filters
  const {
    dateFrom,
    dateTo,
    dateOfEstablishment,
    status,
    isProfileVisible,
    populateCauses, // Add this to control whether to populate causes
    ...restQuery
  } = query;

  // Build base conditions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: any = {};

  if (dateOfEstablishment) {
    conditions.dateOfEstablishment = new Date(dateOfEstablishment as string);
  }

  if (isProfileVisible) {
    conditions.isProfileVisible = Boolean(isProfileVisible);
  }

  // Handle date range filters
  if (dateFrom || dateTo) {
    conditions.createdAt = {};
    if (dateFrom) {
      conditions.createdAt.$gte = new Date(dateFrom as string);
    }
    if (dateTo) {
      conditions.createdAt.$lte = new Date(dateTo as string);
    }
  }

  // Handle status filter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let authIdArray: any[] = [];
  if (status) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authQuery: any = { role: ROLE.ORGANIZATION };

    if (status) {
      authQuery.status = status;
      // Map active status to isActive flag for legacy support if needed
      authQuery.isActive = status === AUTH_STATUS.VERIFIED;
    }

    const authIds = await Auth.find(authQuery).select('_id');
    authIdArray = authIds.map((auth) => auth._id);
    conditions.auth = { $in: authIdArray };
  }

  // Create base query with conditions
  const organizationQuery = Organization.find(conditions).populate({
    path: 'auth',
    select: 'email role isActive status',
  });

  // Apply QueryBuilder
  const queryBuilder = new QueryBuilder(organizationQuery, restQuery)
    .search(searchableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  // Execute query
  const result = await queryBuilder.modelQuery;
  const meta = await queryBuilder.countTotal();

  // Populate causes after QueryBuilder execution (if requested)
  if (populateCauses === 'true' || populateCauses === true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizationIds = result.map((org: any) => org._id);

    // Get causes for all organizations in one query
    const causes = await Cause.find({
      organization: { $in: organizationIds },
    });

    // Map causes to their organizations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resultWithCauses = result.map((org: any) => {
      const orgObject = org.toObject();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orgObject.causes = causes.filter(
        (cause: any) => cause.organization.toString() === org._id.toString()
      );
      return orgObject;
    });

    return {
      data: resultWithCauses,
      meta,
    };
  }

  return {
    data: result,
    meta,
  };
};

/**
 * Get Organization Details by ID
 */
const getOrganizationDetailsById = async (organizationId: string) => {
  // Find organization by ID
  const organization = await Organization.findById(organizationId)
    .select(
      'name registeredCharityName logoImage coverImage aboutUs serviceType address state postalCode website phoneNumber'
    )
    .populate('auth', 'email role isActive status');

  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
  }

  const hasSubscription = await SubscriptionService.checkHasSubscription(
    organization._id.toString()
  );

  const organizationDonationStats = await Donation.aggregate([
    {
      $match: {
        organization: organization._id,
        status: 'completed',
      },
    },
    {
      $facet: {
        totalDonations: [{ $count: 'count' }],
        totalDonationAmount: [
          {
            $group: {
              _id: null,
              totalAmount: { $sum: '$amount' },
            },
          },
        ],
        recentDonors: [
          { $sort: { donationDate: -1 } },
          {
            $group: {
              _id: '$donor',
              lastDonationDate: { $first: '$donationDate' },
              lastDonationAmount: { $first: '$amount' },
            },
          },
          { $limit: 5 },
          {
            $lookup: {
              from: 'clients',
              localField: '_id',
              foreignField: '_id',
              as: 'donorDetails',
            },
          },
          { $unwind: '$donorDetails' },
          {
            $project: {
              donorId: '$_id',
              lastDonationDate: 1,
              lastDonationAmount: 1,
              donorName: '$donorDetails.name',
              donorImage: '$donorDetails.image',
              donorAddress: '$donorDetails.address',
              _id: 0,
            },
          },
        ],
      },
    },
  ]);

  // supported causes:
  const causes = await Cause.find({
    organization: organization?._id,
    status: CAUSE_STATUS_TYPE.VERIFIED,
  }).select('name category status description');

  const organizationStats = organizationDonationStats[0];

  const totalDonation = organizationStats?.totalDonations?.[0]?.count || 0;
  const totalDonationAmount =
    organizationStats?.totalDonationAmount?.[0]?.totalAmount || 0;
  const recentDonors = organizationStats?.recentDonors || [];

  return {
    ...organization.toObject(),
    totalDonation,
    totalDonationAmount,
    recentDonors,
    causes,
    isOnetime: true,
    isRecurring: hasSubscription,
    isRoundup: hasSubscription,
  };
};

export const OrganizationService = {
  startStripeConnectOnboarding,
  getStripeConnectStatus,
  refreshStripeConnectOnboarding,
  editProfileOrgDetailsIntoDB,
  updateLogoImageIntoDB,
  editOrgTaxDetailsIntoDB,
  getAllOrganizations,
  getOrganizationDetailsById,
};
