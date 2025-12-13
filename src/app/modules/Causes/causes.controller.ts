// src/app/modules/Causes/causes.controller.ts
import httpStatus from 'http-status';
import { asyncHandler, sendResponse } from '../../utils';
import { CauseService } from './causes.service';
import { AppError } from '../../utils';
import { IAuth } from '../Auth/auth.interface';
import Organization from '../Organization/organization.model';
import { ROLE } from '../Auth/auth.constant';

// Create cause
const createCause = asyncHandler(async (req, res) => {
  const user = req.user as IAuth;
  let organizationId = req.body.organizationId;
  console.log({
    a: req.body,
  });

  // If user is an organization, use their own ID
  if (user.role === ROLE.ORGANIZATION) {
    const organization = await Organization.findOne({ auth: user._id });
    if (!organization) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Organization profile not found!'
      );
    }
    organizationId = organization._id.toString();
  }

  const result = await CauseService.createCauseIntoDB({
    name: req.body.name,
    description: req.body.description,
    category: req.body.category,
    organization: organizationId,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: 'Cause created successfully!',
    data: result,
  });
});

// Get all causes with filtering, searching, sorting and pagination
const getCauses = asyncHandler(async (req, res) => {
  // Pass the entire query object to service - QueryBuilder will handle it
  const result = await CauseService.getCausesFromDB(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Causes retrieved successfully!',
    data: result.causes,
    meta: {
      page: result.meta.page,
      limit: result.meta.limit,
      total: result.meta.total,
      totalPage: result.meta.totalPage,
    },
  });
});

// Get cause by ID
const getCauseById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await CauseService.getCauseByIdFromDB(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Cause retrieved successfully!',
    data: result,
  });
});

// Get causes by organization
const getCausesByOrganization = asyncHandler(async (req, res) => {
  const { organizationId } = req.params;
  const result = await CauseService.getCausesByOrganizationFromDB(
    organizationId,
    req.query
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Organization causes retrieved successfully!',
    data: result.causes,
    meta: {
      page: result.meta.page,
      limit: result.meta.limit,
      total: result.meta.total,
      totalPage: result.meta.totalPage,
    },
  });
});

const getRaisedCausesByOrganization = asyncHandler(async (req, res) => {
  const { organizationId } = req.params;
  const {
    startMonth,
    endMonth,
    page = '1',
    limit = '10',
    sortBy = 'totalDonationAmount',
    sortOrder = 'desc',
  } = req.query as {
    startMonth: string;
    endMonth: string;
    page?: string;
    limit?: string;
    sortBy?: 'totalDonationAmount' | 'name' | 'category';
    sortOrder?: 'asc' | 'desc';
  };

  const result = await CauseService.getRaisedCausesByOrganizationFromDB(
    organizationId,
    startMonth,
    endMonth,
    {
      page: Number(page),
      limit: Number(limit),
      sortBy,
      sortOrder,
    }
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Raised causes retrieved successfully!',
    data: result.raisedCauses,
    meta: {
      page: result.meta.page,
      limit: result.meta.limit,
      total: result.meta.total,
      totalPage: result.meta.totalPage,
    },
  });
});

// Update cause
const updateCause = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user as IAuth;

  // Check if user is authorized to update
  if (user.role === ROLE.ORGANIZATION) {
    const cause = await CauseService.getCauseByIdFromDB(id);
    const organization = await Organization.findOne({ auth: user._id });

    if (cause.organization?._id.toString() !== organization?._id.toString()) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'You are not authorized to update this cause!'
      );
    }
  }

  const result = await CauseService.updateCauseIntoDB(id, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Cause updated successfully!',
    data: result,
  });
});

// Delete cause
const deleteCause = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user as IAuth;

  // Check if user is authorized to delete
  if (user.role === ROLE.ORGANIZATION) {
    const cause = await CauseService.getCauseByIdFromDB(id);
    const organization = await Organization.findOne({ auth: user._id });

    if (cause.organization?._id.toString() !== organization?._id.toString()) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'You are not authorized to delete this cause!'
      );
    }
  }

  const result = await CauseService.deleteCauseFromDB(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Cause deleted successfully!',
    data: result,
  });
});

// Get cause categories
const getCauseCategories = asyncHandler(async (req, res) => {
  const result = await CauseService.getCauseCategoriesFromDB();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Cause categories retrieved successfully!',
    data: result,
  });
});

// Update cause status (Admin only)
const updateCauseStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const result = await CauseService.updateCauseStatusIntoDB(id, status);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Cause status updated successfully!',
    data: result,
  });
});

export const CauseController = {
  createCause,
  getCauses,
  getCauseById,
  getCausesByOrganization,
  getRaisedCausesByOrganization,
  updateCause,
  deleteCause,
  getCauseCategories,
  updateCauseStatus,
};
