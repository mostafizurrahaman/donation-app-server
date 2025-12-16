/* eslint-disable @typescript-eslint/no-explicit-any */
import httpStatus from 'http-status';
import { AppError } from '../../utils';
import Organization from './organization.model';
import Auth from '../Auth/auth.model';
import { StripeService } from '../Stripe/stripe.service';
import {
  TEditOrgTaxDetails,
  TEditProfileOrgDetails,
} from './organization.validation';
import { ROLE, AUTH_STATUS } from '../Auth/auth.constant';
import { IAuth } from '../Auth/auth.interface';
import fs from 'fs';
import { createAccessToken } from '../../lib';
import { searchableFields } from './organization.constants';
import QueryBuilder from '../../builders/QueryBuilder';
import Cause from '../Causes/causes.model';
import Donation from '../Donation/donation.model';

/**
 * Start Stripe Connect onboarding for an organization
 * Creates a Stripe Connect account and returns onboarding URL
 *
 * Refactored for Australia (AU) & Manual Payouts
 */
const startStripeConnectOnboarding = async (
  userId: string
): Promise<{ onboardingUrl: string; accountId: string }> => {
  // Find user
  const user = await Auth.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  // Find organization
  const organization = await Organization.findOne({ auth: userId });
  if (!organization) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'Organization not found! Only organizations can onboard for payment receiving.'
    );
  }

  // Check if already has Stripe Connect account
  if (organization.stripeConnectAccountId) {
    // Account exists, create new onboarding link (in case they didn't finish)
    const { onboardingUrl } = await StripeService.createAccountLink(
      organization.stripeConnectAccountId
    );

    return {
      onboardingUrl,
      accountId: organization.stripeConnectAccountId,
    };
  }

  // Create new Stripe Connect account
  // ✅ Refactored: Pass 'AU' as country code for Australian Platform
  // The StripeService must be updated to set `settings.payouts.schedule.interval = 'manual'`
  // based on this creation call to ensure funds are held for manual payout.
  const { accountId, onboardingUrl } = await StripeService.createConnectAccount(
    user.email,
    organization.name || 'Organization',
    'AU' // Australian Company
  );

  // Save account ID to organization
  organization.stripeConnectAccountId = accountId;
  await organization.save();

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
}> => {
  // Find organization
  const organization = await Organization.findOne({ auth: userId });
  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
  }

  // Check if has Stripe Connect account
  if (!organization.stripeConnectAccountId) {
    return {
      hasAccount: false,
      isActive: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    };
  }

  // Fetch account details from Stripe
  try {
    const account = await StripeService.getConnectAccount(
      organization.stripeConnectAccountId
    );

    return {
      hasAccount: true,
      accountId: account.id,
      isActive: account.charges_enabled && account.payouts_enabled,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    };
  } catch (error) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to fetch Stripe Connect account status: ${
        (error as Error).message
      }`
    );
  }
};

/**
 * Refresh Stripe Connect onboarding link
 */
const refreshStripeConnectOnboarding = async (
  userId: string
): Promise<{ onboardingUrl: string }> => {
  // Find organization
  const organization = await Organization.findOne({ auth: userId });
  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
  }

  if (!organization.stripeConnectAccountId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'No Stripe Connect account found! Please start onboarding first.'
    );
  }

  // Create new account link
  const { onboardingUrl } = await StripeService.createAccountLink(
    organization.stripeConnectAccountId
  );

  return { onboardingUrl };
};

const deleteOldImage = async (imagePath: string | undefined) => {
  if (imagePath) {
    try {
      await fs.promises.unlink(imagePath);
    } catch (error: unknown) {
      // eslint-disable-next-line no-console
      console.error('Error deleting old file:', error);
    }
  }
};

export const updateOrganizationImage = async (
  user: IAuth,
  file: Express.Multer.File | undefined,
  imageField: 'coverImage' | 'logoImage'
) => {
  if (!file?.path) {
    throw new AppError(httpStatus.BAD_REQUEST, 'File is required!');
  }

  // Find the organization
  const organization = await Organization.findOne({ auth: user?._id });

  if (!organization) {
    await fs.promises.unlink(file?.path);
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
  }

  // Delete the old image if it exists
  await deleteOldImage(organization?.[imageField]);

  // Update the image field with the new file path
  const updatedOrganization = await Organization.findOneAndUpdate(
    { auth: user?._id },
    { [imageField]: file.path.replace(/\\/g, '/') }, // Ensure correct path format
    { new: true }
  ).select('name coverImage logoImage');

  if (!updatedOrganization) {
    await fs.promises.unlink(file?.path); // Clean up if update fails
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Something went wrong!'
    );
  }

  // Prepare JWT payload with updated image
  // Only return access token if coverImage is updated (since it's in JWT payload)
  if (imageField === 'coverImage') {
    const accessTokenPayload = {
      id: user?._id.toString(),
      name: updatedOrganization?.name,
      image: updatedOrganization?.coverImage || '',
      email: user?.email,
      role: user?.role,
      isProfile: user?.isProfile,
      isActive: user?.isActive,
    };

    const accessToken = createAccessToken(accessTokenPayload);

    return { accessToken, organization: updatedOrganization };
  }

  // For logoImage, just return the updated organization
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
