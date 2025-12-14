import httpStatus from 'http-status';
import { asyncHandler, sendResponse } from '../../utils';
import { AdminService } from './admin.service';

const getAdminStates = asyncHandler(async (req, res) => {
  const { timeFilter } = req.query;

  const result = await AdminService.getAdminStatesFromDb({
    timeFilter: timeFilter as 'today' | 'week' | 'month' | undefined,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Admin states fetched successfully!',
    data: result,
  });
});

const getDonationsReport = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    searchTerm,
    donationType,
    startDate,
    endDate,
    sortBy,
    sortOrder,
    timeFilter,
  } = req.query;

  const result = await AdminService.getDonationsReportFromDb({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    search: searchTerm as string,
    donationType: donationType as string,
    startDate: startDate as string,
    endDate: endDate as string,
    sortBy: sortBy as string,
    sortOrder: sortOrder as 'asc' | 'desc',
    timeFilter: timeFilter as 'today' | 'week' | 'month' | undefined,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Donations report fetched successfully!',
    data: result,
  });
});

const getSubscriptionsReport = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    searchTerm,
    status,
    startDate,
    endDate,
    sortBy,
    sortOrder,
  } = req.query;

  const result = await AdminService.getSubscriptionsReportFromDb({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    search: searchTerm as string,
    status: status as string,
    startDate: startDate as string,
    endDate: endDate as string,
    sortBy: sortBy as string,
    sortOrder: sortOrder as 'asc' | 'desc',
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Subscriptions report fetched successfully!',
    data: result,
  });
});

const getUsersStatesReport = asyncHandler(async (req, res) => {
  const result = await AdminService.getUsersStatesReportFromDb();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Users states report fetched successfully!',
    data: result,
  });
});

const getUsersReport = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    searchTerm,
    role,
    status,
    isActive,
    startDate,
    endDate,
    sortBy,
    sortOrder,
  } = req.query;

  const result = await AdminService.getUsersReportFromDb({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    search: searchTerm as string,
    role: role as string,
    status: status as string,
    isActive:
      isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    startDate: startDate as string,
    endDate: endDate as string,
    sortBy: sortBy as string,
    sortOrder: sortOrder as 'asc' | 'desc',
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Users report fetched successfully!',
    data: result.users,
    meta: {
      limit: result.meta.limit,
      page: result.meta.page,
      total: result.meta.total,
      totalPage: result.meta.totalPages,
    },
  });
});

const changeUserStatus = asyncHandler(async (req, res) => {
  const result = await AdminService.changeUserStatusInDb(
    req.params.id,
    req.body.status
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'User status changed successfully!',
    data: result,
  });
});

const deleteUser = asyncHandler(async (req, res) => {
  const result = await AdminService.deleteUserFromDb(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'User deleted successfully!',
    data: result,
  });
});

const getPendingUsersReport = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    searchTerm,
    role,
    startDate,
    endDate,
    sortBy,
    sortOrder,
  } = req.query;

  const result = await AdminService.getPendingUsersReportFromDb({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    search: searchTerm as string,
    role: role as string,
    startDate: startDate as string,
    endDate: endDate as string,
    sortBy: sortBy as string,
    sortOrder: sortOrder as 'asc' | 'desc',
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Pending users report fetched successfully!',
    data: result.pendingUsers,
    meta: {
      limit: result.meta.limit,
      page: result.meta.page,
      total: result.meta.total,
      totalPage: result.meta.totalPages,
    },
  });
});

const getUsersEngagementReport = asyncHandler(async (req, res) => {
  const { timeFilter, role } = req.query;

  const result = await AdminService.getUsersEngagementReportFromDb({
    timeFilter: timeFilter as 'today' | 'week' | 'month' | undefined,
    role: role as 'CLIENT' | 'BUSINESS' | 'ORGANIZATION' | undefined,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Users engagement report fetched successfully!',
    data: result,
  });
});

const getDonationsEngagementReport = asyncHandler(async (req, res) => {
  const { donationType, year } = req.query;

  const result = await AdminService.getDonationsEngagementReportFromDb({
    donationType: donationType as 'one-time' | 'recurring' | undefined,
    year: year ? Number(year) : undefined,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Donations engagement report fetched successfully!',
    data: result,
  });
});

const getClauseWisePercentagesReport = asyncHandler(async (req, res) => {
  const result = await AdminService.getClauseWisePercentagesReportFromDb();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Clause wise percentages report fetched successfully!',
    data: result.clauseWisePercentages,
  });
});

const getOrganizationsReport = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    searchTerm,
    status,
    isActive,
    serviceType,
    startDate,
    endDate,
    sortBy,
    sortOrder,
  } = req.query;

  const result = await AdminService.getOrganizationsReportFromDb({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    search: searchTerm as string,
    status: status as string,
    isActive:
      isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    serviceType: serviceType as string,
    startDate: startDate as string,
    endDate: endDate as string,
    sortBy: sortBy as string,
    sortOrder: sortOrder as 'asc' | 'desc',
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Organizations report fetched successfully!',
    data: result.organizations,
    meta: {
      limit: result.meta.limit,
      page: result.meta.page,
      total: result.meta.total,
      totalPage: result.meta.totalPages,
    },
  });
});

const getCausesReport = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    searchTerm,
    status,
    category,
    startDate,
    endDate,
    sortBy,
    sortOrder,
  } = req.query;

  const result = await AdminService.getCausesReportFromDb({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    search: searchTerm as string,
    status: status as string,
    category: category as string,
    startDate: startDate as string,
    endDate: endDate as string,
    sortBy: sortBy as string,
    sortOrder: sortOrder as 'asc' | 'desc',
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Causes report fetched successfully!',
    data: result.causes,
    meta: {
      limit: result.meta.limit,
      page: result.meta.page,
      total: result.meta.total,
      totalPage: result.meta.totalPages,
    },
  });
});

const getBusinessesReport = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    searchTerm,
    status,
    isActive,
    startDate,
    endDate,
    sortBy,
    sortOrder,
  } = req.query;

  const result = await AdminService.getBusinessesReportFromDb({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    search: searchTerm as string,
    status: status as string,
    isActive:
      isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    startDate: startDate as string,
    endDate: endDate as string,
    sortBy: sortBy as string,
    sortOrder: sortOrder as 'asc' | 'desc',
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Businesses report fetched successfully!',
    data: result.businesses,
    meta: {
      limit: result.meta.limit,
      page: result.meta.page,
      total: result.meta.total,
      totalPage: result.meta.totalPages,
    },
  });
});

const updateAdminProfile = asyncHandler(async (req, res) => {
  const result = await AdminService.updateAdminProfileInDb(
    req.params.id,
    req.body
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Admin profile updated successfully!',
    data: result,
  });
});

const getDonors = asyncHandler(async (req, res) => {
  const result = await AdminService.getDonorsFromDB(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Donors retrived successfully!',
    data: result.data,
    meta: result.meta,
  });
});

export const AdminController = {
  getAdminStates,
  getDonationsReport,
  getSubscriptionsReport,
  getUsersStatesReport,
  getUsersReport,
  changeUserStatus,
  deleteUser,
  getPendingUsersReport,
  getUsersEngagementReport,
  getDonationsEngagementReport,
  getClauseWisePercentagesReport,
  getOrganizationsReport,
  getCausesReport,
  getBusinessesReport,
  updateAdminProfile,
  getDonors,
};
