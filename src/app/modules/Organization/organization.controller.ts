import httpStatus from 'http-status';
import { Response } from 'express';
import { asyncHandler, sendResponse, AppError } from '../../utils';
import { ExtendedRequest } from '../../types';
import { OrganizationService } from './organization.service';

/**
 * Start Stripe Connect onboarding
 * POST /api/v1/organization/stripe-connect/onboard
 */
const startStripeConnectOnboarding = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id.toString();
    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const result = await OrganizationService.startStripeConnectOnboarding(
      userId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Stripe Connect onboarding initiated successfully',
      data: result,
    });
  }
);

/**
 * Get Stripe Connect account status
 * GET /api/v1/organization/stripe-connect/status
 */
const getStripeConnectStatus = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id.toString();
    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const result = await OrganizationService.getStripeConnectStatus(userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Stripe Connect status retrieved successfully',
      data: result,
    });
  }
);

/**
 * Refresh Stripe Connect onboarding link
 * POST /api/v1/organization/stripe-connect/refresh
 */
const refreshStripeConnectOnboarding = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id.toString();
    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const result = await OrganizationService.refreshStripeConnectOnboarding(
      userId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Onboarding link refreshed successfully',
      data: result,
    });
  }
);

const getAllOrganization = asyncHandler(async (req, res) => {
  const result = await OrganizationService.getAllOrganizations(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'All organizations retrieved successfully!',
    data: result.data,
    meta: result.meta,
  });
});

/**
 * Edit Organization Profile Details (Tab 1 - Text fields only)
 * PATCH /api/v1/organization/profile-details
 */
const editProfileOrgDetails = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id.toString();
    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const result = await OrganizationService.editProfileOrgDetailsIntoDB(
      userId,
      req.body
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Organization profile updated successfully!',
      data: result,
    });
  }
);

/**
 * Update Organization Logo Image
 * PATCH /api/v1/organization/logo-image
 */

const updateLogoImage = asyncHandler(async (req, res) => {
  const result = await OrganizationService.updateLogoImageIntoDB(
    req.user,
    req.file
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Logo image updated successfully!',
    data: result,
  });
});
/**
 * Edit Organization Tax Details (Tab 2)
 * PATCH /api/v1/organization/tax-details
 */
const editOrgTaxDetails = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id.toString();
    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const result = await OrganizationService.editOrgTaxDetailsIntoDB(
      userId,
      req.body
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Organization tax details updated successfully!',
      data: result,
    });
  }
);
// Get Organization Details by ID
const getOrganizationDetails = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const organizationId = req.params.id;
    const result = await OrganizationService.getOrganizationDetailsById(
      organizationId as string
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Organization details retrieved successfully!',
      data: result,
    });
  }
);

export const OrganizationController = {
  startStripeConnectOnboarding,
  getStripeConnectStatus,
  refreshStripeConnectOnboarding,
  editProfileOrgDetails,
  editOrgTaxDetails,
  updateLogoImage,
  getAllOrganization,
  getOrganizationDetails,
};
