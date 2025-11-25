import httpStatus from 'http-status';
import { asyncHandler, sendResponse } from '../../utils';
import { AdminService } from './admin.service';

const getAdminStates = asyncHandler(async (req, res) => {
  // Implementation for fetching admin states goes here
//   const user = req.user as IAuth;
  const result = await AdminService.getAdminStatesFromDb(req.query.time as string );
  
    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      message: 'Cause created successfully!',
      data: result,
    });
});

const getDonationsReport = asyncHandler(async (req, res) => {
  const { page, limit, searchTerm, donationType, startDate, endDate, sortBy, sortOrder } = req.query;
  
  const result = await AdminService.getDonationsReportFromDb({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    search: searchTerm as string,
    donationType: donationType as string,
    startDate: startDate as string,
    endDate: endDate as string,
    sortBy: sortBy as string,
    sortOrder: sortOrder as 'asc' | 'desc',
  });
  
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Donations report fetched successfully!',
    data: result,
  });
});

const getSubscriptionsReport = asyncHandler(async (req, res) => {
  const { page, limit, searchTerm, status, startDate, endDate, sortBy, sortOrder } = req.query;
  
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

const getRewardsReport = asyncHandler(async (req, res) => {
  const result = await AdminService.getRewardsReportFromDb();
  
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Rewards report fetched successfully!',
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
  const { page, limit, searchTerm, role, status, isActive, startDate, endDate, sortBy, sortOrder } = req.query;
  
  const result = await AdminService.getUsersReportFromDb({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    search: searchTerm as string,
    role: role as string,
    status: status as string,
    isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    startDate: startDate as string,
    endDate: endDate as string,
    sortBy: sortBy as string,
    sortOrder: sortOrder as 'asc' | 'desc',
  });
  
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Users report fetched successfully!',
    data: result,
  });
});

const getPendingUsersReport = asyncHandler(async (req, res) => {
  const { page, limit, searchTerm, role, startDate, endDate, sortBy, sortOrder } = req.query;
  
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
    data: result,
  });
});

const getUsersEngagementReport = asyncHandler(async (req, res) => {
  // const { startDate, endDate } = req.query;
  const result = await AdminService.getUsersEngagementReportFromDb();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: 'Users engagement report fetched successfully!',
    data: result,
  });
});

const getDonationsEngagementReport = asyncHandler(async (req, res) => {
  const result = await AdminService.getDonationsEngagementReportFromDb();
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
    data: result,
  });
});

const getOrganizationsReport = asyncHandler(async (req, res) => {
  const result = await AdminService.getOrganizationsReportFromDb();
  sendResponse(res, { 
    statusCode: httpStatus.OK,
    message: 'Organizations report fetched successfully!',
    data: result,
  });
});

const getCausesReport = asyncHandler(async (req, res) => {
  const result = await AdminService.getCausesReportFromDb();
    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Causes report fetched successfully!',
      data: result,
    });
});

const getBusinessesReport = asyncHandler(async (req, res) => {
  const result = await AdminService.getBusinessesReportFromDb();
    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Businesses report fetched successfully!',
      data: result,
    });
});

const updateAdminProfile = asyncHandler(async (req, res) => {

  const result = await AdminService.updateAdminProfileInDb(req.params.id, req.body );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Admin profile updated successfully!',
      data: result,
    });
});


export const AdminController = {
    getAdminStates,
    getDonationsReport,
    getSubscriptionsReport,
    getRewardsReport,
    getUsersStatesReport,
    getUsersReport,
    getPendingUsersReport,
    getUsersEngagementReport,
    getDonationsEngagementReport,
    getClauseWisePercentagesReport,
    getOrganizationsReport,
    getCausesReport,
    getBusinessesReport,
    updateAdminProfile
};
