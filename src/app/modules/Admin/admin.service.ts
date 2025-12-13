import Auth from '../Auth/auth.model';
import Donation from '../Donation/donation.model';
import Organization from '../Organization/organization.model';
import { Connection, Model } from 'mongoose';
import Cause from '../Causes/causes.model';
import Business from '../Business/business.model';

// Utility function to get date ranges based on filter type
const getDateRange = (filter?: 'today' | 'week' | 'month') => {
  const now = new Date();
  let startDate: Date;
  const endDate: Date = now;

  switch (filter) {
    case 'today': {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    }
    case 'week': {
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as start of week
      startDate = new Date(now);
      startDate.setDate(now.getDate() - diff);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case 'month': {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    }
    default:
      // If no filter, return null to indicate no date filtering
      return null;
  }

  return { startDate, endDate };
};

// Utility function to get previous period date range for comparison
const getPreviousPeriodRange = (filter?: 'today' | 'week' | 'month') => {
  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  switch (filter) {
    case 'today': {
      // Yesterday
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate.setMilliseconds(-1); // End of yesterday
      break;
    }
    case 'week': {
      // Previous week (same day range)
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      startDate = new Date(now);
      startDate.setDate(now.getDate() - diff - 7); // Previous week start
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setDate(now.getDate() - 7); // Previous week same day
      break;
    }
    case 'month': {
      // Previous month
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate.setMilliseconds(-1); // End of previous month
      break;
    }
    default:
      // Default to previous month for comparison
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate.setMilliseconds(-1);
  }

  return { startDate, endDate };
};

type AdminStatesParams = {
  timeFilter?: 'today' | 'week' | 'month';
};

const getAdminStatesFromDb = async (params?: AdminStatesParams) => {
  const { timeFilter } = params || {};

  // Get date range based on filter
  const dateRange = getDateRange(timeFilter);
  const previousDateRange = getPreviousPeriodRange(timeFilter);

  // Determine comparison label based on filter
  const getComparisonLabel = () => {
    switch (timeFilter) {
      case 'today':
        return 'vs yesterday';
      case 'week':
        return 'vs last week';
      case 'month':
        return 'vs last month';
      default:
        return 'vs last month';
    }
  };
  const comparisonLabel = getComparisonLabel();

  const formatPct = (pct: number | null) =>
    pct === null
      ? null
      : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% ${comparisonLabel}`;

  const calcPct = (prev: number | null, curr: number) => {
    if (prev === null) return null;
    if (prev === 0) return curr === 0 ? 0 : 100;
    return ((curr - prev) / prev) * 100;
  };

  // Build filter for donations (all time total)
  // time windows for comparison
  const now = new Date();

  // Get current and previous period dates
  let currentPeriodStart: Date;
  let currentPeriodEnd: Date;
  let previousPeriodStart: Date;
  let previousPeriodEnd: Date;

  if (dateRange) {
    currentPeriodStart = dateRange.startDate;
    currentPeriodEnd = dateRange.endDate;
    previousPeriodStart = previousDateRange.startDate;
    previousPeriodEnd = previousDateRange.endDate;
  } else {
    // Default to month comparison
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const previousMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    currentPeriodStart = new Date(currentYear, currentMonth, 1);
    currentPeriodEnd = new Date(currentYear, currentMonth + 1, 1);
    previousPeriodStart = new Date(previousMonthYear, previousMonth, 1);
    previousPeriodEnd = new Date(previousMonthYear, previousMonth + 1, 1);
  }

  // total active organizations (current snapshot)
  const totalActiveOrganizations = await Organization.countDocuments({});

  // active organizations created in current vs previous period
  const currentPeriodActiveOrgs = await Organization.countDocuments({
    createdAt: { $gte: currentPeriodStart, $lt: currentPeriodEnd },
  });
  const previousPeriodActiveOrgs = await Organization.countDocuments({
    createdAt: { $gte: previousPeriodStart, $lt: previousPeriodEnd },
  });
  const orgChangePct = calcPct(previousPeriodActiveOrgs, currentPeriodActiveOrgs);
  const orgChangeText = formatPct(orgChangePct);

  // donation amounts for current vs previous period
  const currentPeriodAmountAgg = await Donation.aggregate([
    { $match: { createdAt: { $gte: currentPeriodStart, $lt: currentPeriodEnd } } },
    { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
  ]);
  const previousPeriodAmountAgg = await Donation.aggregate([
    {
      $match: {
        createdAt: { $gte: previousPeriodStart, $lt: previousPeriodEnd },
      },
    },
    { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
  ]);
  const currentPeriodAmount = (currentPeriodAmountAgg[0]?.totalAmount ??
    0) as number;
  const previousPeriodAmount = (previousPeriodAmountAgg[0]?.totalAmount ??
    0) as number;
  const totalDonation = currentPeriodAmount;
  const donationAmountChangePct = calcPct(
    previousPeriodAmount,
    currentPeriodAmount
  );
  const donationAmountChangeText = formatPct(donationAmountChangePct);

  // donations for the selected year (Jan-Dec) with month-over-month growth %
  const currentYear = now.getFullYear();
  const targetYear = currentYear; // change this to filter a different year
  // const donationYearFilter = {
  //   createdAt: {
  //     $gte: new Date(targetYear, 0, 1),
  //     $lt: new Date(targetYear + 1, 0, 1),
  //   },
  // };

  const donationGrowthMonthly = await (async () => {
    const months = Array.from({ length: 12 }, (_, m) => ({
      start: new Date(targetYear, m, 1),
      end: new Date(targetYear, m + 1, 1),
      year: targetYear,
      month: m,
    }));

    const counts = await Promise.all(
      months.map((interval) =>
        Donation.countDocuments({
          createdAt: { $gte: interval.start, $lt: interval.end },
          donationType: { $eq: 'one-time' },
        })
      )
    );

    return months.map((interval, idx) => {
      const count = counts[idx];
      const prev = idx === 0 ? null : counts[idx - 1];
      const growth =
        prev === null ? null : prev === 0 ? 100 : ((count - prev) / prev) * 100;
      return {
        year: interval.year,
        month: interval.month, // 0-11
        count,
        growth, // null for January (no previous month), otherwise percentage
      };
    });
  })();

  // donations growth from the subscriptions type
  const subscriptionDonationGrowthMonthly = await (async () => {
    const months = Array.from({ length: 12 }, (_, m) => ({
      start: new Date(targetYear, m, 1),
      end: new Date(targetYear, m + 1, 1),
      year: targetYear,
      month: m,
    }));
    const counts = await Promise.all(
      months.map((interval) =>
        Donation.countDocuments({
          createdAt: { $gte: interval.start, $lt: interval.end },
          donationType: { $eq: 'recurring' },
        })
      )
    );
    return months.map((interval, idx) => {
      const count = counts[idx];
      const prev = idx === 0 ? null : counts[idx - 1];
      const growth =
        prev === null ? null : prev === 0 ? 100 : ((count - prev) / prev) * 100;
      return {
        year: interval.year,
        month: interval.month, // 0-11
        count,
        growth, // null for January (no previous month), otherwise percentage
      };
    });
  })();

  // total donations by cause (all time) + month-over-month change per cause
  const donationsByCause = await Donation.aggregate([
    { $group: { _id: '$cause', totalAmount: { $sum: '$amount' } } },
    {
      $lookup: {
        from: 'causes',
        localField: '_id',
        foreignField: '_id',
        as: 'causeDetails',
      },
    },
    { $unwind: '$causeDetails' },
    {
      $project: {
        _id: 0,
        causeId: '$_id',
        cause: '$causeDetails.name',
        totalAmount: 1,
      },
    },
  ]);

  const currentByCauseAgg = await Donation.aggregate([
    { $match: { createdAt: { $gte: currentPeriodStart, $lt: currentPeriodEnd } } },
    { $group: { _id: '$cause', totalAmount: { $sum: '$amount' } } },
    {
      $lookup: {
        from: 'causes',
        localField: '_id',
        foreignField: '_id',
        as: 'causeDetails',
      },
    },
    { $unwind: { path: '$causeDetails', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, cause: '$causeDetails.name', totalAmount: 1 } },
  ]);

  const previousByCauseAgg = await Donation.aggregate([
    {
      $match: {
        createdAt: { $gte: previousPeriodStart, $lt: previousPeriodEnd },
      },
    },
    { $group: { _id: '$cause', totalAmount: { $sum: '$amount' } } },
    {
      $lookup: {
        from: 'causes',
        localField: '_id',
        foreignField: '_id',
        as: 'causeDetails',
      },
    },
    { $unwind: { path: '$causeDetails', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, cause: '$causeDetails.name', totalAmount: 1 } },
  ]);

  type CauseAgg = { cause?: string; totalAmount?: number };

  const currentByCauseMap = new Map<string, number>();
  currentByCauseAgg.forEach((d: CauseAgg) =>
    currentByCauseMap.set(d.cause ?? '', d.totalAmount ?? 0)
  );
  const previousByCauseMap = new Map<string, number>();
  previousByCauseAgg.forEach((d: CauseAgg) =>
    previousByCauseMap.set(d.cause ?? '', d.totalAmount ?? 0)
  );

  const donationsByCauseWithChange = donationsByCause.map((c: CauseAgg) => {
    const curr = currentByCauseMap.get(c.cause as string) ?? 0;
    const prev = previousByCauseMap.get(c.cause as string) ?? 0;
    const pct = calcPct(prev, curr);
    return {
      cause: c.cause,
      totalAmount: c.totalAmount,
      currentMonthAmount: curr,
      previousMonthAmount: prev,
      changePct: pct,
      changeText: formatPct(pct),
    };
  });

  // top 5 donors (all time) + month-over-month change per donor (by name)
  const topDonors = await Donation.aggregate([
    { $group: { _id: '$donor', totalAmount: { $sum: '$amount' } } },
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
        _id: 0,
        donorId: '$_id',
        donor: '$donorDetails.name',
        totalAmount: 1,
        since: '$clients.createdAt',
      },
    },
    { $sort: { totalAmount: -1 } },
    { $limit: 5 },
  ]);

  const currentDonorAgg = await Donation.aggregate([
    { $match: { createdAt: { $gte: currentPeriodStart, $lt: currentPeriodEnd } } },
    { $group: { _id: '$donor', totalAmount: { $sum: '$amount' } } },
    {
      $lookup: {
        from: 'clients',
        localField: '_id',
        foreignField: '_id',
        as: 'donorDetails',
      },
    },
    { $unwind: { path: '$donorDetails', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        donor: '$donorDetails.name',
        totalAmount: 1,
        since: '$donorDetails.createdAt',
      },
    },
  ]);

  const previousDonorAgg = await Donation.aggregate([
    {
      $match: {
        createdAt: { $gte: previousPeriodStart, $lt: previousPeriodEnd },
      },
    },
    { $group: { _id: '$donor', totalAmount: { $sum: '$amount' } } },
    {
      $lookup: {
        from: 'clients',
        localField: '_id',
        foreignField: '_id',
        as: 'donorDetails',
      },
    },
    { $unwind: { path: '$donorDetails', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        donor: '$donorDetails.name',
        totalAmount: 1,
        since: '$donorDetails.createdAt',
      },
    },
  ]);

  // typed shape for aggregate result documents
  type DonorAgg = {
    donor?: string;
    totalAmount?: number;
    since?: Date | string | null;
  };

  const currentDonorMap = new Map<
    string,
    { totalAmount: number; since?: Date | string | null }
  >();
  currentDonorAgg.forEach((d: DonorAgg) =>
    currentDonorMap.set(d.donor ?? '', {
      totalAmount: d.totalAmount ?? 0,
      since: d.since,
    })
  );
  const previousDonorMap = new Map<string, number>();
  previousDonorAgg.forEach((d: DonorAgg) =>
    previousDonorMap.set(d.donor ?? '', d.totalAmount ?? 0)
  );

  const topDonorsWithChange = topDonors.map(
    (d: {
      donor?: string;
      totalAmount?: number;
      since?: Date | string | null;
    }) => {
      const key = d.donor ?? '';
      const curr = currentDonorMap.get(key)?.totalAmount ?? 0;
      const prev = previousDonorMap.get(key) ?? 0;
      const pct = calcPct(prev, curr);
      return {
        donor: d.donor,
        totalAmount: d.totalAmount,
        currentMonthAmount: curr,
        previousMonthAmount: prev,
        changePct: pct,
        changeText: formatPct(pct),
        since: d.since ?? currentDonorMap.get(key)?.since,
      };
    }
  );

  // recent donors (unchanged)
  const recentDonorDocs = await Donation.aggregate([
    { $sort: { createdAt: -1 } },
    { $limit: 5 },

    {
      $lookup: {
        from: 'clients',
        localField: 'donor',
        foreignField: '_id',
        as: 'donor',
      },
    },

    { $unwind: { path: '$donor', preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: 'auths',
        localField: 'donor.auth',
        foreignField: '_id',
        as: 'donor_auth',
      },
    },

    { $unwind: { path: '$donor_auth', preserveNullAndEmptyArrays: true } },

    {
      $project: {
        _id: 0,
        createdAt: 1,
        donor: {
          name: '$donor.name',
          email: '$donor_auth.email',
        },
      },
    },
  ]);

  return {
    timeFilter: timeFilter || 'all',
    totalDonation,
    donationAmountChangeText,

    totalActiveOrganizations,
    currentPeriodActiveOrgs,
    previousPeriodActiveOrgs,
    organizationChangePct: orgChangePct,
    organizationChangeText: orgChangeText,

    donationGrowthMonthly, // per-month counts + growth
    subscriptionDonationGrowthMonthly,
    donationsByCause: donationsByCauseWithChange,
    topDonors: topDonorsWithChange,
    recentDonorDocs,
  };
};

type DonationsReportParams = {
  page?: number;
  limit?: number;
  search?: string;
  donationType?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  name?: string;
  email?: string;
  sortOrder?: 'asc' | 'desc';
  timeFilter?: 'today' | 'week' | 'month';
};

const getDonationsReportFromDb = async (params?: DonationsReportParams) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    donationType,
    startDate,
    endDate,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    timeFilter,
  } = params || {};

  // time windows for period comparison
  const currentPeriod = getDateRange(timeFilter);
  const previousPeriod = getPreviousPeriodRange(timeFilter);
  const currentPeriodStart = currentPeriod?.startDate ?? new Date();
  const currentPeriodEnd = currentPeriod?.endDate ?? new Date();
  const previousPeriodStart = previousPeriod?.startDate ?? new Date();
  const previousPeriodEnd = previousPeriod?.endDate ?? new Date();

  const comparisonLabel = timeFilter
    ? timeFilter === 'today'
      ? 'vs yesterday'
      : timeFilter === 'week'
        ? 'vs last week'
        : 'vs last month'
    : 'vs last month';

  const formatPct = (pct: number | null) =>
    pct === null
      ? null
      : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% ${comparisonLabel}`;

  const calcPct = (prev: number | null, curr: number) => {
    if (prev === null) return null;
    if (prev === 0) return curr === 0 ? 0 : 100;
    return ((curr - prev) / prev) * 100;
  };

  // Build filter object
  const filter: Record<string, unknown> = {};

  if (donationType) {
    filter.donationType = donationType;
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate)
      (filter.createdAt as Record<string, Date>).$gte = new Date(startDate);
    if (endDate)
      (filter.createdAt as Record<string, Date>).$lte = new Date(endDate);
  }

  // total donations for current period vs previous period
  const currentMonthDonationAgg = await Donation.aggregate([
    {
      $match: {
        amount: { $gt: 0 },
        createdAt: { $gte: currentPeriodStart, $lt: currentPeriodEnd },
      },
    },
    { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
  ]);
  const previousMonthDonationAgg = await Donation.aggregate([
    {
      $match: {
        amount: { $gt: 0 },
        createdAt: { $gte: previousPeriodStart, $lt: previousPeriodEnd },
      },
    },
    { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
  ]);
  const currentMonthDonation = (currentMonthDonationAgg[0]?.totalAmount ??
    0) as number;
  const previousMonthDonation = (previousMonthDonationAgg[0]?.totalAmount ??
    0) as number;
  const totalDonation = currentMonthDonation;
  const totalDonationChangePct = calcPct(
    previousMonthDonation,
    currentMonthDonation
  );
  const totalDonationChangeText = formatPct(totalDonationChangePct);

  // average donation amount
  const avgDonationAgg = await Donation.aggregate([
    { $match: { amount: { $gt: 0 } } },
    { $group: { _id: null, avgAmount: { $avg: '$amount' } } },
  ]);
  const avgDonationAmount = (avgDonationAgg[0]?.avgAmount ?? 0) as number;

  // average donation amount for current period vs previous period
  const currentMonthAvgAgg = await Donation.aggregate([
    {
      $match: {
        amount: { $gt: 0 },
        createdAt: { $gte: currentPeriodStart, $lt: currentPeriodEnd },
      },
    },
    { $group: { _id: null, avgAmount: { $avg: '$amount' } } },
  ]);
  const previousMonthAvgAgg = await Donation.aggregate([
    {
      $match: {
        amount: { $gt: 0 },
        createdAt: { $gte: previousPeriodStart, $lt: previousPeriodEnd },
      },
    },
    { $group: { _id: null, avgAmount: { $avg: '$amount' } } },
  ]);
  const currentMonthAvg = (currentMonthAvgAgg[0]?.avgAmount ?? 0) as number;
  const previousMonthAvg = (previousMonthAvgAgg[0]?.avgAmount ?? 0) as number;
  const avgDonationChangePct = calcPct(previousMonthAvg, currentMonthAvg);
  const avgDonationChangeText = formatPct(avgDonationChangePct);

  // total number of donors
  const totalDonors = await Donation.distinct('donor').then(
    (donors) => donors.length
  );

  // total donors for current period vs previous period
  const currentMonthDonors = await Donation.distinct('donor', {
    createdAt: { $gte: currentPeriodStart, $lt: currentPeriodEnd },
  }).then((donors) => donors.length);
  const previousMonthDonors = await Donation.distinct('donor', {
    createdAt: { $gte: previousPeriodStart, $lt: previousPeriodEnd },
  }).then((donors) => donors.length);
  const totalDonorsChangePct = calcPct(previousMonthDonors, currentMonthDonors);
  const totalDonorsChangeText = formatPct(totalDonorsChangePct);

  // Build search pipeline for donation history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const searchPipeline: any[] = [];

  if (Object.keys(filter).length > 0) {
    searchPipeline.push({ $match: filter });
  }

  // Populate donor and organization for search
  searchPipeline.push(
    {
      $lookup: {
        from: 'clients',
        localField: 'donor',
        foreignField: '_id',
        as: 'donorDetails',
      },
    },
    {
      $lookup: {
        from: 'organizations',
        localField: 'organization',
        foreignField: '_id',
        as: 'organizationDetails',
      },
    },
    // lookup auth email for donor (clients.auth -> auths._id)
    {
      $lookup: {
        from: 'auths',
        let: { donorAuthId: { $arrayElemAt: ['$donorDetails.auth', 0] } },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$donorAuthId'] } } },
          { $project: { email: 1, _id: 0 } },
        ],
        as: 'donorAuth',
      },
    },
    // lookup auth email for organization (organizationDetails.auth -> auths._id)
    {
      $lookup: {
        from: 'auths',
        let: { orgAuthId: { $arrayElemAt: ['$organizationDetails.auth', 0] } },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$orgAuthId'] } } },
          { $project: { email: 1, _id: 0 } },
        ],
        as: 'organizationAuth',
      },
    },
    {
      $addFields: {
        donorName: { $arrayElemAt: ['$donorDetails.name', 0] },
        donorEmail: { $arrayElemAt: ['$donorAuth.email', 0] },
        organizationName: { $arrayElemAt: ['$organizationDetails.name', 0] },
        organizationEmail: { $arrayElemAt: ['$organizationAuth.email', 0] },
      },
    }
  );

  // Search filter
  if (search) {
    searchPipeline.push({
      $match: {
        $or: [
          { donorName: { $regex: search, $options: 'i' } },
          { organizationName: { $regex: search, $options: 'i' } },
          { donorEmail: { $regex: search, $options: 'i' } },
          { organizationEmail: { $regex: search, $options: 'i' } },
          { specialMessage: { $regex: search, $options: 'i' } },
        ],
      },
    });
  }

  // Get total count for pagination
  const countPipeline = [...searchPipeline, { $count: 'total' }];
  const countResult = await Donation.aggregate(countPipeline);
  const totalRecords = countResult[0]?.total ?? 0;

  // Sort
  const sortField = sortBy || 'createdAt';
  const sortDirection = sortOrder === 'asc' ? 1 : -1;
  searchPipeline.push({ $sort: { [sortField]: sortDirection } });

  // Pagination
  const skip = (page - 1) * limit;
  searchPipeline.push({ $skip: skip }, { $limit: limit });

  // Project final fields
  searchPipeline.push({
    $project: {
      _id: 0,
      name: 1,
      amount: 1,
      cause: 1,
      donationType: 1,
      createdAt: 1,
      donor: { name: '$donorName', email: '$donorEmail' },
      organization: { name: '$organizationName', email: '$organizationEmail' },
      specialMessage: 1,
    },
  });

  const donationHistory = await Donation.aggregate(searchPipeline);

  return {
    timeFilter: timeFilter || 'month',
    totalDonation,
    totalDonationChangeText,
    avgDonationAmount,
    avgDonationChangeText,
    totalDonors,
    totalDonorsChangeText,
    donationHistory,
    meta: {
      total: totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
    },
  };
};

type SubscriptionsReportParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

const getSubscriptionsReportFromDb = async (
  params?: SubscriptionsReportParams
) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    status,
    startDate,
    endDate,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = params || {};

  // total active subscriptions
  const totalActiveSubscriptions = await Donation.countDocuments({
    donationType: 'recurring',
    status: 'completed',
  });
  // total cancelled subscription

  const totalCancelledSubscriptions = await Donation.countDocuments({
    donationType: 'recurring',
    status: 'canceled',
  });

  // monthly recurring renewal rate
  const totalRenewals = await Donation.countDocuments({
    donationType: 'recurring',
    status: 'renewed',
  });
  const monthlyRenewalRate =
    totalActiveSubscriptions + totalCancelledSubscriptions === 0
      ? 0
      : (totalRenewals /
          (totalActiveSubscriptions + totalCancelledSubscriptions)) *
        100;

  // Build filter for subscription history
  const filter: Record<string, unknown> = { donationType: 'recurring' };

  if (status) {
    filter.status = status;
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate)
      (filter.createdAt as Record<string, Date>).$gte = new Date(startDate);
    if (endDate)
      (filter.createdAt as Record<string, Date>).$lte = new Date(endDate);
  }

  // Build search pipeline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const searchPipeline: any[] = [{ $match: filter }];

  // Populate donor and organization for search
  searchPipeline.push(
    {
      $lookup: {
        from: 'clients',
        localField: 'donor',
        foreignField: '_id',
        as: 'donorDetails',
      },
    },
    {
      $lookup: {
        from: 'organizations',
        localField: 'organization',
        foreignField: '_id',
        as: 'organizationDetails',
      },
    },
    {
      $addFields: {
        donorName: { $arrayElemAt: ['$donorDetails.name', 0] },
        organizationName: { $arrayElemAt: ['$organizationDetails.name', 0] },
      },
    }
  );

  // Search filter
  if (search) {
    searchPipeline.push({
      $match: {
        $or: [
          { donorName: { $regex: search, $options: 'i' } },
          { organizationName: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
          { specialMessage: { $regex: search, $options: 'i' } },
        ],
      },
    });
  }

  // Get total count
  const countPipeline = [...searchPipeline, { $count: 'total' }];
  const countResult = await Donation.aggregate(countPipeline);
  const totalRecords = countResult[0]?.total ?? 0;

  // Sort
  const sortField = sortBy || 'createdAt';
  const sortDirection = sortOrder === 'asc' ? 1 : -1;
  searchPipeline.push({ $sort: { [sortField]: sortDirection } });

  // Pagination
  const skip = (page - 1) * limit;
  searchPipeline.push({ $skip: skip }, { $limit: limit });

  // Project final fields
  searchPipeline.push({
    $project: {
      _id: 0,
      name: 1,
      amount: 1,
      cause: 1,
      donationType: 1,
      createdAt: 1,
      donor: { name: '$donorName' },
      organization: { name: '$organizationName' },
      specialMessage: 1,
      status: 1,
    },
  });

  const subscriptionDonationHistory = await Donation.aggregate(searchPipeline);

  return {
    totalActiveSubscriptions,
    totalCancelledSubscriptions,
    monthlyRenewalRate,
    subscriptionDonationHistory,
    meta: {
      total: totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
    },
  };
};

const getRewardsReportFromDb = async () => {
  // Placeholder implementation for rewards report
  // You can replace this with actual logic to fetch rewards data from the database
  const totalRewardsIssued = 5000; // Example static data
  const totalActiveRewardUsers = 150; // Example static data
  return {
    totalRewardsIssued,
    totalActiveRewardUsers,
  };
};

type UsersReportParams = {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

const getUsersStatesReportFromDb = async () => {
  // time windows
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const previousMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  const currentMonthStart = new Date(currentYear, currentMonth, 1);
  const nextMonthStart = new Date(currentYear, currentMonth + 1, 1);
  const previousMonthStart = new Date(previousMonthYear, previousMonth, 1);
  const previousMonthEnd = new Date(previousMonthYear, previousMonth + 1, 1);

  const formatPct = (pct: number | null) =>
    pct === null
      ? null
      : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs last month`;

  const calcPct = (prev: number | null, curr: number) => {
    if (prev === null) return null;
    if (prev === 0) return curr === 0 ? 0 : 100;
    return ((curr - prev) / prev) * 100;
  };

  // total users by all roles
  const totalUsers = await Auth.countDocuments({
    status: 'verified',
    role: { $ne: 'ADMIN' },
  });

  // total users created this month vs previous month
  const currentMonthUsers = await Auth.countDocuments({
    status: 'verified',
    role: { $ne: 'ADMIN' },
    createdAt: { $gte: currentMonthStart, $lt: nextMonthStart },
  });
  const previousMonthUsers = await Auth.countDocuments({
    status: 'verified',
    role: { $ne: 'ADMIN' },
    createdAt: { $gte: previousMonthStart, $lt: previousMonthEnd },
  });
  const usersChangePct = calcPct(previousMonthUsers, currentMonthUsers);
  const usersChangeText = formatPct(usersChangePct);

  // total clients
  const totalClients = await Auth.countDocuments({ role: 'CLIENT' });

  // clients created this month vs previous month
  const currentMonthClients = await Auth.countDocuments({
    role: 'CLIENT',
    createdAt: { $gte: currentMonthStart, $lt: nextMonthStart },
  });
  const previousMonthClients = await Auth.countDocuments({
    role: 'CLIENT',
    createdAt: { $gte: previousMonthStart, $lt: previousMonthEnd },
  });
  const clientsChangePct = calcPct(previousMonthClients, currentMonthClients);
  const clientsChangeText = formatPct(clientsChangePct);

  // total organizations
  const totalOrganizations = await Auth.countDocuments({
    role: 'ORGANIZATION',
  });

  // organizations created this month vs previous month
  const currentMonthOrganizations = await Auth.countDocuments({
    role: 'ORGANIZATION',
    createdAt: { $gte: currentMonthStart, $lt: nextMonthStart },
  });
  const previousMonthOrganizations = await Auth.countDocuments({
    role: 'ORGANIZATION',
    createdAt: { $gte: previousMonthStart, $lt: previousMonthEnd },
  });
  const organizationsChangePct = calcPct(
    previousMonthOrganizations,
    currentMonthOrganizations
  );
  const organizationsChangeText = formatPct(organizationsChangePct);

  // total businesses
  const totalBusinesses = await Auth.countDocuments({ role: 'BUSINESS' });

  // businesses created this month vs previous month
  const currentMonthBusinesses = await Auth.countDocuments({
    role: 'BUSINESS',
    createdAt: { $gte: currentMonthStart, $lt: nextMonthStart },
  });
  const previousMonthBusinesses = await Auth.countDocuments({
    role: 'BUSINESS',
    createdAt: { $gte: previousMonthStart, $lt: previousMonthEnd },
  });
  const businessesChangePct = calcPct(
    previousMonthBusinesses,
    currentMonthBusinesses
  );
  const businessesChangeText = formatPct(businessesChangePct);

  // pending approvals
  const pendingApprovals = await Auth.countDocuments({ status: 'pending' });

  // pending approvals this month vs previous month
  const currentMonthPending = await Auth.countDocuments({
    status: 'pending',
    createdAt: { $gte: currentMonthStart, $lt: nextMonthStart },
  });
  const previousMonthPending = await Auth.countDocuments({
    status: 'pending',
    createdAt: { $gte: previousMonthStart, $lt: previousMonthEnd },
  });
  const pendingChangePct = calcPct(previousMonthPending, currentMonthPending);
  const pendingChangeText = formatPct(pendingChangePct);

  return {
    totalUsers,
    usersChangeText,
    totalClients,
    clientsChangeText,
    totalOrganizations,
    organizationsChangeText,
    totalBusinesses,
    businessesChangeText,
    pendingApprovals,
    pendingChangeText,
  };
};

const getUsersReportFromDb = async (params?: UsersReportParams) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    role,
    status,
    isActive,
    startDate,
    endDate,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = params || {};

  // Build filter for users
  const userFilter: Record<string, unknown> = { roles: { $ne: 'ADMIN' } };

  if (role) {
    userFilter.roles = role.toUpperCase();
  }

  if (status) {
    userFilter.status = status;
  }

  if (isActive !== undefined) {
    userFilter.isActive = isActive;
  }

  if (startDate || endDate) {
    userFilter.createdAt = {};
    if (startDate)
      (userFilter.createdAt as Record<string, Date>).$gte = new Date(startDate);
    if (endDate)
      (userFilter.createdAt as Record<string, Date>).$lte = new Date(endDate);
  }

  // Build users pipeline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usersPipeline: any[] = [{ $match: userFilter }];

  // lookup possible role-specific profile documents
  usersPipeline.push(
    {
      $lookup: {
        from: 'clients',
        localField: '_id',
        foreignField: 'auth',
        as: 'clientProfile',
      },
    },
    {
      $lookup: {
        from: 'organizations',
        localField: '_id',
        foreignField: 'auth',
        as: 'organizationProfile',
      },
    },
    {
      $lookup: {
        from: 'businesses',
        localField: '_id',
        foreignField: 'auth',
        as: 'businessProfile',
      },
    },
    {
      $addFields: {
        image: {
          $ifNull: [
            { $arrayElemAt: ['$clientProfile.image', 0] },
            {
              $ifNull: [
                { $arrayElemAt: ['$organizationProfile.image', 0] },
                { $arrayElemAt: ['$businessProfile.image', 0] },
              ],
            },
          ],
        },
      },
    }
  );

  // Search filter
  if (search) {
    usersPipeline.push({
      $match: {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ],
      },
    });
  }

  // Get total count
  const countPipeline = [...usersPipeline, { $count: 'total' }];
  const countResult = await Auth.aggregate(countPipeline);
  const totalRecords = countResult[0]?.total ?? 0;

  // Sort
  const sortField = sortBy || 'createdAt';
  const sortDirection = sortOrder === 'asc' ? 1 : -1;
  usersPipeline.push({ $sort: { [sortField]: sortDirection } });

  // Pagination
  const skip = (page - 1) * limit;
  usersPipeline.push({ $skip: skip }, { $limit: limit });

  // Project final fields
  usersPipeline.push({
    $project: {
      _id: 1,
      name: 1,
      email: 1,
      roles: 1,
      status: 1,
      isActive: 1,
      isVerifiedByOTP: 1,
      createdAt: 1,
      image: 1,
    },
  });

  const users = await Auth.aggregate(usersPipeline).exec();

  return {
    users,
    meta: {
      total: totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
    },
  };
};

type PendingUsersReportParams = {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

const changeUserStatusInDb = async (
  userId: string,
  status: 'verified' | 'suspended' | 'pending'
) => {

  const user = await Auth.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  user.status = status;
  await user.save();
  return user;
}

const deleteUserFromDb = async (userId: string) => {
  // delete the user softly
  const user = await Auth.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  user.isDeleted = true;
  await user.save();
  return user;
}


const getPendingUsersReportFromDb = async (
  params?: PendingUsersReportParams
) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    role,
    startDate,
    endDate,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = params || {};

  // Build filter for pending users
  const pendingFilter: Record<string, unknown> = { status: 'pending' };

  if (role) {
    pendingFilter.roles = role.toUpperCase();
  }

  if (startDate || endDate) {
    pendingFilter.createdAt = {};
    if (startDate)
      (pendingFilter.createdAt as Record<string, Date>).$gte = new Date(
        startDate
      );
    if (endDate)
      (pendingFilter.createdAt as Record<string, Date>).$lte = new Date(
        endDate
      );
  }

  // Build pending users pipeline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingPipeline: any[] = [{ $match: pendingFilter }];

  // lookup possible role-specific profile documents
  pendingPipeline.push(
    {
      $lookup: {
        from: 'clients',
        localField: '_id',
        foreignField: 'auth',
        as: 'clientProfile',
      },
    },
    {
      $lookup: {
        from: 'organizations',
        localField: '_id',
        foreignField: 'auth',
        as: 'organizationProfile',
      },
    },
    {
      $lookup: {
        from: 'businesses',
        localField: '_id',
        foreignField: 'auth',
        as: 'businessProfile',
      },
    },
    {
      $addFields: {
        image: {
          $ifNull: [
            { $arrayElemAt: ['$clientProfile.image', 0] },
            {
              $ifNull: [
                { $arrayElemAt: ['$organizationProfile.image', 0] },
                { $arrayElemAt: ['$businessProfile.image', 0] },
              ],
            },
          ],
        },
      },
    }
  );

  // Search filter
  if (search) {
    pendingPipeline.push({
      $match: {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ],
      },
    });
  }

  // Get total count
  const countPipeline = [...pendingPipeline, { $count: 'total' }];
  const countResult = await Auth.aggregate(countPipeline);
  const totalRecords = countResult[0]?.total ?? 0;

  // Sort
  const sortField = sortBy || 'createdAt';
  const sortDirection = sortOrder === 'asc' ? 1 : -1;
  pendingPipeline.push({ $sort: { [sortField]: sortDirection } });

  // Pagination
  const skip = (page - 1) * limit;
  pendingPipeline.push({ $skip: skip }, { $limit: limit });

  // Project final fields
  pendingPipeline.push({
    $project: {
      _id: 1,
      name: 1,
      email: 1,
      roles: 1,
      status: 1,
      isActive: 1,
      isVerifiedByOTP: 1,
      createdAt: 1,
      image: 1,
    },
  });

  const pendingUsers = await Auth.aggregate(pendingPipeline).exec();

  return {
    pendingUsers,
    meta: {
      total: totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
    },
  };
};

type UsersEngagementReportParams = {
  timeFilter?: 'today' | 'week' | 'month';
  role?: 'CLIENT' | 'BUSINESS' | 'ORGANIZATION';
};

const getUsersEngagementReportFromDb = async (params?: UsersEngagementReportParams) => {
  const { timeFilter, role } = params || {};

  // Get date range based on filter
  const dateRange = getDateRange(timeFilter);
  const previousDateRange = getPreviousPeriodRange(timeFilter);
  
  // Build base filter for the selected period
  const baseFilter: Record<string, unknown> = {
    status: 'verified',
    role: role ? role : { $ne: 'ADMIN' },
  };

  if (dateRange) {
    baseFilter.createdAt = { $gte: dateRange.startDate, $lte: dateRange.endDate };
  }

  // Build previous period filter
  const previousFilter: Record<string, unknown> = {
    status: 'verified',
    role: role ? role : { $ne: 'ADMIN' },
    createdAt: { $gte: previousDateRange.startDate, $lte: previousDateRange.endDate },
  };

  // Determine comparison label based on filter
  const getComparisonLabel = () => {
    switch (timeFilter) {
      case 'today':
        return 'vs yesterday';
      case 'week':
        return 'vs last week';
      case 'month':
        return 'vs last month';
      default:
        return 'vs last month';
    }
  };
  const comparisonLabel = getComparisonLabel();

  // total active users (current period)
  const totalActiveUsers = await Auth.countDocuments({
    ...baseFilter,
    isActive: true,
  });

  // total active users (previous period for comparison)
  const previousActiveUsers = await Auth.countDocuments({
    ...previousFilter,
    isActive: true,
  });

  const activeUsersChangePct = previousActiveUsers
    ? ((totalActiveUsers - previousActiveUsers) / previousActiveUsers) * 100
    : null;
  const activeUsersChangeText = activeUsersChangePct !== null
    ? `${activeUsersChangePct >= 0 ? '+' : ''}${activeUsersChangePct.toFixed(1)}% ${comparisonLabel}`
    : null;

  // new users (current period)
  const totalNewUsers = await Auth.countDocuments(baseFilter);

  // new users (previous period for comparison)
  const previousNewUsers = await Auth.countDocuments(previousFilter);

  const newUsersChangePct = previousNewUsers
    ? ((totalNewUsers - previousNewUsers) / previousNewUsers) * 100
    : null;
  const newUsersChangeText = newUsersChangePct !== null
    ? `${newUsersChangePct >= 0 ? '+' : ''}${newUsersChangePct.toFixed(1)}% ${comparisonLabel}`
    : null;

  // total returning users (current period)
  const totalReturningUsers = await Auth.countDocuments({
    ...baseFilter,
    isDeleted: true,
  });

  // returning users (previous period for comparison)
  const previousReturningUsers = await Auth.countDocuments({
    ...previousFilter,
    isDeleted: true,
  });

  const returningUsersChangePct = previousReturningUsers
    ? ((totalReturningUsers - previousReturningUsers) / previousReturningUsers) * 100
    : null;
  const returningUsersChangeText = returningUsersChangePct !== null
    ? `${returningUsersChangePct >= 0 ? '+' : ''}${returningUsersChangePct.toFixed(1)}% ${comparisonLabel}`
    : null;

  return {
    timeFilter: timeFilter || 'all',
    role: role || 'all',
    totalActiveUsers,
    activeUsersChangeText,
    totalNewUsers,
    newUsersChangeText,
    totalReturningUsers,
    returningUsersChangeText,
  };
};

type DonationsEngagementReportParams = {
  donationType?: 'one-time' | 'recurring';
  year?: number;
};

const getDonationsEngagementReportFromDb = async (params?: DonationsEngagementReportParams) => {
  const { donationType, year } = params || {};

  // total donations for a full calendar year (always 12 months Jan-Dec).
  const now = new Date();
  const targetYear = year || now.getFullYear(); // use provided year or current year
  const yearStart = new Date(targetYear, 0, 1);
  const yearEnd = new Date(targetYear + 1, 0, 1);

  // Build match filter
  const matchFilter: Record<string, unknown> = {
    createdAt: { $gte: yearStart, $lt: yearEnd },
    amount: { $gt: 0 },
  };

  // Add donationType filter if provided
  if (donationType) {
    matchFilter.donationType = donationType;
  }

  // Aggregate by donationType and month (1-12)
  const agg = await Donation.aggregate([
    {
      $match: matchFilter,
    },
    {
      $group: {
        _id: { donationType: '$donationType', month: { $month: '$createdAt' } },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  type AggItem = {
    _id: { donationType?: string | null; month?: number };
    totalAmount?: number | null;
    count?: number | null;
  };

  // Build a map: donationType -> (month -> {totalAmount, count})
  const typeMonthMap = new Map<string, Map<number, { totalAmount: number; count: number }>>();
  (agg as AggItem[]).forEach((d) => {
    const type = d._id.donationType ?? 'unknown';
    const month = d._id.month ?? 1; // 1-12
    const inner = typeMonthMap.get(type) ?? new Map<number, { totalAmount: number; count: number }>();
    inner.set(month, {
      totalAmount: d.totalAmount ?? 0,
      count: d.count ?? 0,
    });
    typeMonthMap.set(type, inner);
  });

  // Build result: for each donationType, include 12 months (1-12) filling missing months with 0
  const monthlyDonations: {
    donationType: string;
    year: number;
    month: number; // 1-12
    totalAmount: number;
    count: number;
  }[] = [];

  // If donationType filter is specified, only include that type
  const typesToInclude = donationType
    ? [donationType]
    : Array.from(typeMonthMap.keys());

  for (const type of typesToInclude) {
    const monthMap = typeMonthMap.get(type);
    for (let m = 1; m <= 12; m++) {
      const data = monthMap?.get(m);
      monthlyDonations.push({
        donationType: type,
        year: targetYear,
        month: m,
        totalAmount: data?.totalAmount ?? 0,
        count: data?.count ?? 0,
      });
    }
  }

  return {
    year: targetYear,
    donationType: donationType || 'all',
    monthlyDonations,
  };
};

const getClauseWisePercentagesReportFromDb = async () => {
  // percentages of donations of each cause wise (lookup cause details)
  const clauseAgg = await Donation.aggregate([
    { $match: { amount: { $gt: 0 } } },
    { $group: { _id: '$cause', totalAmount: { $sum: '$amount' } } },
    {
      $lookup: {
        from: 'causes',
        localField: '_id',
        foreignField: '_id',
        as: 'causeDetails',
      },
    },
    { $unwind: { path: '$causeDetails', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        causeId: '$_id',
        causeName: { $ifNull: ['$causeDetails.name', 'Unspecified'] },
        totalAmount: 1,
        // use the cause document's createdAt (not the donation's)
        createdAt: '$causeDetails.createdAt',
      },
    },
  ]);

  type ClauseAggItem = {
    causeId?: unknown;
    causeName?: string | null;
    totalAmount?: number | null;
    createdAt?: Date | string | null;
  };

  // compute grand total to derive percentages
  const grandTotal = clauseAgg.reduce(
    (sum: number, it: ClauseAggItem) => sum + (it.totalAmount ?? 0),
    0
  );

  const clauseWisePercentages: {
    clause: string;
    totalAmount: number;
    percentage: number; // numeric percentage (e.g. 40.5)
    percentageText: string; // formatted (e.g. "40.5%")
    createdAt?: Date | string | null;
  }[] = clauseAgg.map((item: ClauseAggItem) => {
    const amt = item.totalAmount ?? 0;
    const pct = grandTotal > 0 ? Math.round((amt / grandTotal) * 1000) / 10 : 0; // one decimal
    return {
      clause: item.causeName ?? 'Unspecified',
      totalAmount: amt,
      percentage: pct,
      percentageText: `${pct}%`,
      createdAt: item.createdAt,
    };
  });

  return {
    clauseWisePercentages,
  };
};

type OrganizationsReportParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  isActive?: boolean;
  serviceType?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

const getOrganizationsReportFromDb = async (params?: OrganizationsReportParams) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    status,
    isActive,
    serviceType,
    startDate,
    endDate,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = params || {};

  // Build filter object
  const filter: Record<string, unknown> = {};

  if (serviceType) {
    filter.serviceType = serviceType;
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate)
      (filter.createdAt as Record<string, Date>).$gte = new Date(startDate);
    if (endDate)
      (filter.createdAt as Record<string, Date>).$lte = new Date(endDate);
  }

  // Build search pipeline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const searchPipeline: any[] = [];

  if (Object.keys(filter).length > 0) {
    searchPipeline.push({ $match: filter });
  }

  // Lookup auth data with filtering
  searchPipeline.push(
    {
      $lookup: {
        from: 'auths',
        localField: 'auth',
        foreignField: '_id',
        as: 'authData',
        pipeline: [
          {
            $match: {
              isDeleted: { $ne: true },
            },
          },
          {
            $project: {
              email: 1,
              status: 1,
              isActive: 1,
              createdAt: 1,
            },
          },
        ],
      },
    },
    // Filter organizations that have valid auth data
    {
      $match: {
        'authData.0': { $exists: true },
      },
    },
    // Transform auth data
    {
      $addFields: {
        authEmail: { $arrayElemAt: ['$authData.email', 0] },
        authStatus: { $arrayElemAt: ['$authData.status', 0] },
        authIsActive: { $arrayElemAt: ['$authData.isActive', 0] },
      },
    }
  );

  // Filter by auth status and isActive
  const authFilter: Record<string, unknown> = {};
  if (status) {
    authFilter.authStatus = status;
  }
  if (isActive !== undefined) {
    authFilter.authIsActive = isActive;
  }
  if (Object.keys(authFilter).length > 0) {
    searchPipeline.push({ $match: authFilter });
  }

  // Search filter
  if (search) {
    searchPipeline.push({
      $match: {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { authEmail: { $regex: search, $options: 'i' } },
          { address: { $regex: search, $options: 'i' } },
          { state: { $regex: search, $options: 'i' } },
          { serviceType: { $regex: search, $options: 'i' } },
        ],
      },
    });
  }

  // Lookup causes data
  searchPipeline.push({
    $lookup: {
      from: 'causes',
      localField: '_id',
      foreignField: 'organization',
      as: 'causes',
      pipeline: [
        {
          $project: {
            name: 1,
            description: 1,
            createdAt: 1,
            category: 1,
            status: 1,
          },
        },
      ],
    },
  });

  // Get total count for pagination
  const countPipeline = [...searchPipeline, { $count: 'total' }];
  const countResult = await Organization.aggregate(countPipeline);
  const totalRecords = countResult[0]?.total ?? 0;

  // Sort
  const sortField = sortBy || 'createdAt';
  const sortDirection = sortOrder === 'asc' ? 1 : -1;
  searchPipeline.push({ $sort: { [sortField]: sortDirection } });

  // Pagination
  const skip = (page - 1) * limit;
  searchPipeline.push({ $skip: skip }, { $limit: limit });

  // Project final fields
  searchPipeline.push({
    $project: {
      _id: 1,
      name: 1,
      serviceType: 1,
      address: 1,
      state: 1,
      postalCode: 1,
      website: 1,
      phoneNumber: 1,
      coverImage: 1,
      logoImage: 1,
      isProfileVisible: 1,
      createdAt: 1,
      updatedAt: 1,
      auth: {
        email: '$authEmail',
        status: '$authStatus',
        isActive: '$authIsActive',
      },
      causes: 1,
    },
  });

  const organizations = await Organization.aggregate(searchPipeline);

  return {
    organizations,
    meta: {
      total: totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
    },
  };
};

type CausesReportParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

const getCausesReportFromDb = async (params?: CausesReportParams) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    status,
    category,
    startDate,
    endDate,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = params || {};

  // Build filter object
  const filter: Record<string, unknown> = {};

  if (status) {
    filter.status = status;
  }

  if (category) {
    filter.category = category;
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate)
      (filter.createdAt as Record<string, Date>).$gte = new Date(startDate);
    if (endDate)
      (filter.createdAt as Record<string, Date>).$lte = new Date(endDate);
  }

  // Build search pipeline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const searchPipeline: any[] = [];

  if (Object.keys(filter).length > 0) {
    searchPipeline.push({ $match: filter });
  }

  // Populate organization details
  searchPipeline.push(
    {
      $lookup: {
        from: 'organizations',
        localField: 'organization',
        foreignField: '_id',
        as: 'organizationDetails',
      },
    },
    {
      $lookup: {
        from: 'auths',
        let: { orgAuthId: { $arrayElemAt: ['$organizationDetails.auth', 0] } },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$orgAuthId'] } } },
          { $project: { email: 1, _id: 0 } },
        ],
        as: 'organizationAuth',
      },
    },
    {
      $addFields: {
        organizationName: { $arrayElemAt: ['$organizationDetails.name', 0] },
        organizationEmail: { $arrayElemAt: ['$organizationAuth.email', 0] },
      },
    }
  );

  // Search filter
  if (search) {
    searchPipeline.push({
      $match: {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { organizationName: { $regex: search, $options: 'i' } },
          { organizationEmail: { $regex: search, $options: 'i' } },
        ],
      },
    });
  }

  // Get total count for pagination
  const countPipeline = [...searchPipeline, { $count: 'total' }];
  const countResult = await Cause.aggregate(countPipeline);
  const totalRecords = countResult[0]?.total ?? 0;

  // Sort
  const sortField = sortBy || 'createdAt';
  const sortDirection = sortOrder === 'asc' ? 1 : -1;
  searchPipeline.push({ $sort: { [sortField]: sortDirection } });

  // Pagination
  const skip = (page - 1) * limit;
  searchPipeline.push({ $skip: skip }, { $limit: limit });

  // Project final fields
  searchPipeline.push({
    $project: {
      _id: 1,
      name: 1,
      description: 1,
      category: 1,
      status: 1,
      createdAt: 1,
      updatedAt: 1,
      organization: {
        name: '$organizationName',
        email: '$organizationEmail',
      },
    },
  });

  const causes = await Cause.aggregate(searchPipeline);

  return {
    causes,
    meta: {
      total: totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
    },
  };
};

type BusinessesReportParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

const getBusinessesReportFromDb = async (params?: BusinessesReportParams) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    status,
    isActive,
    startDate,
    endDate,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = params || {};

  // Build filter object
  const filter: Record<string, unknown> = {};

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate)
      (filter.createdAt as Record<string, Date>).$gte = new Date(startDate);
    if (endDate)
      (filter.createdAt as Record<string, Date>).$lte = new Date(endDate);
  }

  // Build search pipeline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const searchPipeline: any[] = [];

  if (Object.keys(filter).length > 0) {
    searchPipeline.push({ $match: filter });
  }

  // Populate auth details
  searchPipeline.push(
    {
      $lookup: {
        from: 'auths',
        localField: 'auth',
        foreignField: '_id',
        as: 'authDetails',
      },
    },
    {
      $addFields: {
        authEmail: { $arrayElemAt: ['$authDetails.email', 0] },
        authStatus: { $arrayElemAt: ['$authDetails.status', 0] },
        authIsActive: { $arrayElemAt: ['$authDetails.isActive', 0] },
      },
    }
  );

  // Filter by auth status and isActive
  const authFilter: Record<string, unknown> = {};
  if (status) {
    authFilter.authStatus = status;
  }
  if (isActive !== undefined) {
    authFilter.authIsActive = isActive;
  }
  if (Object.keys(authFilter).length > 0) {
    searchPipeline.push({ $match: authFilter });
  }

  // Search filter
  if (search) {
    searchPipeline.push({
      $match: {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { authEmail: { $regex: search, $options: 'i' } },
          { address: { $regex: search, $options: 'i' } },
          { state: { $regex: search, $options: 'i' } },
        ],
      },
    });
  }

  // Get total count for pagination
  const countPipeline = [...searchPipeline, { $count: 'total' }];
  const countResult = await Business.aggregate(countPipeline);
  const totalRecords = countResult[0]?.total ?? 0;

  // Sort
  const sortField = sortBy || 'createdAt';
  const sortDirection = sortOrder === 'asc' ? 1 : -1;
  searchPipeline.push({ $sort: { [sortField]: sortDirection } });

  // Pagination
  const skip = (page - 1) * limit;
  searchPipeline.push({ $skip: skip }, { $limit: limit });

  // Project final fields
  searchPipeline.push({
    $project: {
      _id: 1,
      name: 1,
      address: 1,
      state: 1,
      postalCode: 1,
      website: 1,
      phoneNumber: 1,
      image: 1,
      createdAt: 1,
      updatedAt: 1,
      auth: {
        email: '$authEmail',
        status: '$authStatus',
        isActive: '$authIsActive',
      },
    },
  });

  const businesses = await Business.aggregate(searchPipeline);

  return {
    businesses,
    meta: {
      total: totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
    },
  };
}

type AdminUpdate = {
  name?: string;
  email?: string;
  image?: string;
  mobile?: string;
  password?: string;
};

const updateAdminProfileInDb = async (
  id: string,
  updateData: Partial<AdminUpdate>
) => {
  // fields that live on Auth vs role-specific profile collections
  const authAllowed = ['email', 'password'] as const;
  const profileAllowed = ['name', 'image', 'mobile'] as const;

  const authPayload: Partial<AdminUpdate> = {};
  const profilePayload: Partial<AdminUpdate> = {};

  for (const k of authAllowed) {
    if (Object.prototype.hasOwnProperty.call(updateData, k)) {
      authPayload[k] = updateData[k];
    }
  }
  for (const k of profileAllowed) {
    if (Object.prototype.hasOwnProperty.call(updateData, k)) {
      profilePayload[k] = updateData[k];
    }
  }

  if (
    Object.keys(authPayload).length === 0 &&
    Object.keys(profilePayload).length === 0
  ) {
    throw new Error('No updatable fields provided');
  }

  // load Auth doc to determine roles and to run pre-save hooks for password
  const authDoc = await Auth.findById(id);
  if (!authDoc) return null;

  // update auth fields (email/password) on authDoc and save to trigger hooks
  let authChanged = false;
  for (const key of Object.keys(authPayload) as (keyof AdminUpdate)[]) {
    // assign dynamically
    (authDoc as unknown as Record<string, unknown>)[key] = authPayload[key];
    authChanged = true;
  }
  if (authChanged) {
    await authDoc.save();
  }
  // update role-specific profile document: clients, organizations, businesses
  // access mongoose connection from the Auth model in a typed manner
  const db: Connection = (Auth as unknown as { db: Connection }).db; // access mongoose connection
  // try to get models if registered
  const ClientModel =
    db.models.clients ?? db.models.Client ?? db.model('clients');
  const BusinessModel =
    db.models.businesses ?? db.models.Business ?? db.model('businesses');
  const OrganizationModel = Organization; // imported at top

  let profileResult: Record<string, unknown> | null = null;

  if (Object.keys(profilePayload).length > 0) {
    // prefer updating profile based on roles indicated on authDoc
    // Auth may expose either 'role' (string) or 'roles' (string[]); normalize to string[]
    type AuthRoleFields = { roles?: string[]; role?: string | string[] };
    const authFields = authDoc as unknown as AuthRoleFields;
    const rawRole = authFields.roles ?? authFields.role ?? [];
    const roles = Array.isArray(rawRole)
      ? rawRole.map(String)
      : rawRole
      ? [String(rawRole)]
      : [];
    const roleLower = roles.map((r) => String(r).toLowerCase());

    const tryUpdate = async (
      model?: Model<any>
    ): Promise<Record<string, unknown> | null> => {
      if (!model) return null;
      try {
        const res = await model
          .findOneAndUpdate(
            { auth: authDoc._id },
            { $set: profilePayload },
            { new: true }
          )
          .lean()
          .exec();

        if (!res) return null;
        // findOneAndUpdate with lean() can sometimes be typed as an array or a single doc; normalize to a Record
        if (Array.isArray(res)) {
          return (res[0] ?? null) as Record<string, unknown> | null;
        }
        return res as Record<string, unknown>;
      } catch {
        return null;
      }
    };

    // attempt role-directed update first
    if (roleLower.includes('organization')) {
      profileResult = await tryUpdate(OrganizationModel);
    }
    if (!profileResult && roleLower.includes('client')) {
      profileResult = await tryUpdate(ClientModel);
    }
    if (!profileResult && roleLower.includes('business')) {
      profileResult = await tryUpdate(BusinessModel);
    }

    // fallback: try all profiles if role wasn't explicit or previous attempts failed
    if (!profileResult) {
      profileResult =
        (await tryUpdate(ClientModel)) ||
        (await tryUpdate(OrganizationModel)) ||
        (await tryUpdate(BusinessModel));
    }
  }

  // build return object: auth (without sensitive fields) + merged profile values if any
  type AuthLean = Record<string, unknown> | null;
  const authObj = (await Auth.findById(authDoc._id)
    .select({ password: 0, otp: 0, otpExpiry: 0 })
    .lean()
    .exec()) as AuthLean;

  const result = {
    ...(authObj ?? {}),
    ...(profileResult ? { profile: profileResult } : {}),
  };

  return result;
};

export const AdminService = {
  getAdminStatesFromDb,
  getDonationsReportFromDb,
  getSubscriptionsReportFromDb,
  getRewardsReportFromDb,
  getUsersStatesReportFromDb,
  getUsersReportFromDb,
  changeUserStatusInDb,
  deleteUserFromDb,
  getPendingUsersReportFromDb,
  getUsersEngagementReportFromDb,
  getDonationsEngagementReportFromDb,
  getClauseWisePercentagesReportFromDb,
  getOrganizationsReportFromDb,
  getCausesReportFromDb,
  getBusinessesReportFromDb,
  updateAdminProfileInDb,
};
