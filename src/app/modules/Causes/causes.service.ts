// src/app/modules/Causes/causes.service.ts
import httpStatus from 'http-status';
import { startSession, Types } from 'mongoose';
import { AppError } from '../../utils';
import QueryBuilder from '../../builders/QueryBuilder';
import Cause from './causes.model';
import {
  ICause,
  CauseCategoryType,
  CauseStatusType,
  IRaisedCauseSummary,
} from './causes.interface';
import Organization from '../Organization/organization.model';
import { CAUSE_CATEGORY_TYPE } from './causes.constant';
import Donation from '../Donation/donation.model';

const parseMonthInput = (month: string, boundary: 'start' | 'end') => {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr);

  if (
    !yearStr ||
    !monthStr ||
    Number.isNaN(year) ||
    Number.isNaN(monthIndex) ||
    monthIndex < 1 ||
    monthIndex > 12
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Month must be in YYYY-MM format!'
    );
  }

  if (boundary === 'start') {
    return new Date(Date.UTC(year, monthIndex - 1, 1, 0, 0, 0, 0));
  }

  // end boundary -> set to last moment of month
  const endDate = new Date(Date.UTC(year, monthIndex, 0, 23, 59, 59, 999));
  return endDate;
};

const formatMonthLabel = (date: Date) =>
  date.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

type RaisedCausesSortField = 'totalDonationAmount' | 'name' | 'category';

type RaisedCausesQueryOptions = {
  page?: number;
  limit?: number;
  sortBy?: RaisedCausesSortField;
  sortOrder?: 'asc' | 'desc';
};

type RaisedCauseAggregateResult = {
  causeId: Types.ObjectId;
  name: string;
  category: CauseCategoryType;
  totalDonationAmount: number;
};

const getRaisedCausesByOrganizationFromDB = async (
  organizationId: string,
  startMonth: string,
  endMonth: string,
  options: RaisedCausesQueryOptions = {}
): Promise<{
  raisedCauses: IRaisedCauseSummary[];
  meta: { page: number; limit: number; total: number; totalPage: number };
}> => {
  // Validate organization
  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
  }

  const startDate = parseMonthInput(startMonth, 'start');
  const endDate = parseMonthInput(endMonth, 'end');

  if (startDate > endDate) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Start month must be before end month!'
    );
  }

  const page = options.page && options.page > 0 ? options.page : 1;
  const limit = options.limit && options.limit > 0 ? options.limit : 10;

  const allowedSortFields: RaisedCausesSortField[] = [
    'totalDonationAmount',
    'name',
    'category',
  ];
  const isValidSortField = (field: unknown): field is RaisedCausesSortField =>
    typeof field === 'string' &&
    allowedSortFields.includes(field as RaisedCausesSortField);

  const sortField: RaisedCausesSortField = isValidSortField(options.sortBy)
    ? options.sortBy!
    : 'totalDonationAmount';
  const sortDirection = options.sortOrder === 'asc' ? 1 : -1;
  const skip = (page - 1) * limit;

  const aggregatedCauses = await Donation.aggregate([
    {
      $match: {
        organization: new Types.ObjectId(organizationId),
        status: 'completed',
        donationDate: { $gte: startDate, $lte: endDate },
        cause: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: '$cause',
        totalDonationAmount: { $sum: '$amount' },
      },
    },
    {
      $lookup: {
        from: 'causes',
        localField: '_id',
        foreignField: '_id',
        as: 'cause',
      },
    },
    { $unwind: '$cause' },
    {
      $project: {
        causeId: '$_id',
        name: '$cause.name',
        category: '$cause.category',
        totalDonationAmount: 1,
      },
    },
    { $sort: { [sortField]: sortDirection } },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const data =
    (aggregatedCauses[0]?.data as RaisedCauseAggregateResult[]) ?? [];
  const total = aggregatedCauses[0]?.total?.[0]?.count ?? 0;

  const raisedCauses = data.map((cause) => ({
    causeId: cause.causeId.toString(),
    name: cause.name,
    category: cause.category,
    totalDonationAmount: cause.totalDonationAmount,
    startMonth: formatMonthLabel(startDate),
    endMonth: formatMonthLabel(endDate),
  }));

  const meta = {
    page,
    limit,
    total,
    totalPage: total > 0 ? Math.ceil(total / limit) : 0,
  };

  return { raisedCauses, meta };
};

// Define searchable fields (fixed from 'notes' to 'description')
const causeSearchableFields = ['name', 'description'];

// Create cause
const createCauseIntoDB = async (payload: {
  name: string;
  description?: string;
  category: CauseCategoryType;
  organization: string;
}) => {
  const session = await startSession();

  try {
    session.startTransaction();

    // Verify organization exists
    const organization = await Organization.findById(
      payload.organization
    ).session(session);

    if (!organization) {
      throw new AppError(httpStatus.NOT_FOUND, 'Organization not found!');
    }

    // Cause with same category:
    const isAlreadyExists = await Cause.find({
      category: payload.category,
      organization: organization?._id,
    });

    if (isAlreadyExists) {
      throw new AppError(
        httpStatus.CONFLICT,
        'A cause already exists in this category.'
      );
    }

    // Create cause
    const [cause] = await Cause.create([payload], { session });

    await session.commitTransaction();
    await session.endSession();

    // Populate organization
    const populatedCause = await Cause.findById(cause._id).populate(
      'organization',
      'name serviceType coverImage'
    );

    return populatedCause;
  } catch (error) {
    await session.abortTransaction();
    await session.endSession();

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to create cause!'
    );
  }
};

// Get cause by ID
const getCauseByIdFromDB = async (causeId: string) => {
  const cause = await Cause.findById(causeId).populate(
    'organization',
    'name serviceType coverImage'
  );

  if (!cause) {
    throw new AppError(httpStatus.NOT_FOUND, 'Cause not found!');
  }

  return cause;
};

// Get all causes with filters, search, pagination and sorting
const getCausesFromDB = async (query: Record<string, unknown>) => {
  const baseQuery = Cause.find().populate(
    'organization',
    'name registeredCharityName coverImage logoImage aboutUs serviceType isProfileVisible dateOfEstablishment'
  );

  // Apply QueryBuilder for search, filter, sort, pagination
  const causeQuery = new QueryBuilder<ICause>(baseQuery, query)
    .search(causeSearchableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await causeQuery.modelQuery;
  const meta = await causeQuery.countTotal();

  // Get all cause IDs from result
  const causeIds = result.map((cause) => cause._id);

  // Get donation statistics for all causes in one query
  const donationStats = await Donation.aggregate([
    {
      $match: {
        cause: { $in: causeIds },
        status: 'completed', // Only count completed donations
      },
    },
    {
      $group: {
        _id: '$cause',
        totalDonationAmount: { $sum: '$amount' },
        totalDonors: { $addToSet: '$donor' },
        totalDonations: { $sum: 1 }, // Count total number of donations
      },
    },
    {
      $project: {
        _id: 1,
        totalDonationAmount: 1,
        totalDonors: { $size: '$totalDonors' },
        totalDonations: 1,
      },
    },
  ]);

  // Get recent 5 donors for each cause with user information
  const recentDonors = await Donation.aggregate([
    {
      $match: {
        cause: { $in: causeIds },
        status: 'completed',
      },
    },
    {
      $lookup: {
        from: 'clients',
        localField: 'donor',
        foreignField: '_id',
        as: 'donorInfo',
      },
    },
    { $unwind: '$donorInfo' },
    {
      $group: {
        _id: '$donor',
        name: { $first: '$donorInfo.name' },
        image: { $first: '$donorInfo.image' },
        donationDate: { $first: '$donationDate' },
        amount: { $first: '$amount' },
        cause: { $first: '$cause' },
      },
    },

    {
      $sort: { donationDate: -1 },
    },
    {
      $limit: 5,
    },
  ]);

  console.log('Recent Donors:', recentDonors);

  // Create maps for quick lookup
  const statsMap = new Map(
    donationStats.map((stat) => [stat._id.toString(), stat])
  );
  const recentDonorsMap = new Map(
    recentDonors?.map((donor) => {
      console.log('Mapping donor for cause:', donor);
      return [donor?.cause?.toString(), recentDonors];
    })
  );

  console.log(recentDonorsMap);

  // Add stats and recent donors to each cause
  const causesWithStats = result.map((cause) => {
    const causeObject = cause.toObject();
    const stats = statsMap.get(cause._id.toString());
    const recentDonorList = recentDonorsMap.get(cause._id.toString());

    causeObject.totalDonationAmount = stats?.totalDonationAmount || 0;
    causeObject.totalDonors = stats?.totalDonors || 0;
    causeObject.totalDonations = stats?.totalDonations || 0;
    causeObject.recentDonors = recentDonorList || [];

    return causeObject;
  });

  return { causes: causesWithStats, meta };
};

// Get causes by organization with filters
const getCausesByOrganizationFromDB = async (
  organizationId: string,
  query: Record<string, unknown> = {}
) => {
  // Add organization filter to query
  const modifiedQuery = { ...query, organization: organizationId };

  const baseQuery = Cause.find({ organization: organizationId }).populate(
    'organization',
    'name serviceType coverImage'
  );

  const causeQuery = new QueryBuilder<ICause>(baseQuery, modifiedQuery)
    .search(causeSearchableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await causeQuery.modelQuery;
  const meta = await causeQuery.countTotal();

  return { causes: result, meta };
};

// Update cause
const updateCauseIntoDB = async (
  causeId: string,
  payload: {
    name?: string;
    description?: string;
    category?: CauseCategoryType;
  }
) => {
  // Check if cause exists
  const existingCause = await Cause.findById(causeId);
  if (!existingCause) {
    throw new AppError(httpStatus.NOT_FOUND, 'Cause not found!');
  }

  if (payload.category !== existingCause.category) {
    // check for same category
    const isSameCategoryHasCause = await Cause.find({
      category: payload.category,
      organization: existingCause?.organization,
    });

    // check for same category
    if (isSameCategoryHasCause) {
      throw new AppError(
        httpStatus.CONFLICT,
        'A cause already exists in this category!'
      );
    }
  }

  const cause = await Cause.findByIdAndUpdate(causeId, payload, {
    new: true,
    runValidators: true,
  }).populate('organization', 'name serviceType coverImage');

  if (!cause) {
    throw new AppError(httpStatus.NOT_FOUND, 'Cause not found!');
  }

  return cause;
};

// Delete cause
const deleteCauseFromDB = async (causeId: string) => {
  const cause = await Cause.findByIdAndDelete(causeId);

  if (!cause) {
    throw new AppError(httpStatus.NOT_FOUND, 'Cause not found!');
  }

  return { message: 'Cause deleted successfully!' };
};

// Get cause categories (for dropdown/filter purposes)
const getCauseCategoriesFromDB = async () => {
  const causeCategories = Object.entries(CAUSE_CATEGORY_TYPE).map(
    ([key, value]) => ({
      label: key
        .replace(/_/g, ' ')
        .split('/')
        .map((word) =>
          word
            .split(' ')
            .map(
              (subword) =>
                subword.charAt(0).toUpperCase() + subword.slice(1).toLowerCase()
            )
            .join(' ')
        )
        .join(' / '),
      value: value,
    })
  );

  return causeCategories;
};

// Update cause status (Admin only)
const updateCauseStatusIntoDB = async (
  causeId: string,
  status: CauseStatusType
) => {
  // Validate status
  if (!['pending', 'suspended', 'verified'].includes(status)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid status value!');
  }

  const cause = await Cause.findByIdAndUpdate(
    causeId,
    { status },
    { new: true, runValidators: true }
  ).populate('organization', 'name serviceType coverImage');

  if (!cause) {
    throw new AppError(httpStatus.NOT_FOUND, 'Cause not found!');
  }

  return cause;
};

export const CauseService = {
  createCauseIntoDB,
  getCauseByIdFromDB,
  getCausesFromDB,
  getCausesByOrganizationFromDB,
  getRaisedCausesByOrganizationFromDB,
  updateCauseIntoDB,
  deleteCauseFromDB,
  getCauseCategoriesFromDB,
  updateCauseStatusIntoDB,
};
