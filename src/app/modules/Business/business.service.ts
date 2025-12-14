/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import httpStatus from 'http-status';
import { startSession, PipelineStage } from 'mongoose';
import { AppError } from '../../utils';
import Business, { BusinessView, BusinessWebsiteView } from './business.model';
import { IAuth } from '../Auth/auth.interface';
import { defaultUserImage } from '../Auth/auth.constant';
import {
  calculatePercentageChange,
  getDateHeader,
  getDateRanges,
  getTimeAgo,
} from '../../lib/filter-helper';
import { RewardRedemption } from '../RewardRedeemtion/reward-redeemtion.model';
import { Reward, ViewReward } from '../Reward/reward.model';
import { REWARD_STATUS } from '../Reward/reward.constant';
import { monthAbbreviations } from '../Donation/donation.constant';
import {
  REDEMPTION_METHOD_VALUES,
  REDEMPTION_STATUS,
} from '../RewardRedeemtion/reward-redeemtion.constant';
import { TTimeFilter } from '../Donation/donation.interface';

import Auth from '../Auth/auth.model';
// 1. Update Business Profile Service
const updateBusinessProfile = async (
  payload: {
    category?: string;
    name?: string;
    tagLine?: string;
    description?: string;
    businessPhoneNumber?: string;
    businessEmail?: string;
    businessWebsite?: string;
    locations?: string[];
  },
  user: IAuth,
  files: {
    coverImage?: Express.Multer.File[];
    logoImage?: Express.Multer.File[];
  }
) => {
  if (!user || user.role !== 'BUSINESS') {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Unauthorized access!');
  }

  const existingBusiness = await Business.findOne({ auth: user._id });

  if (!existingBusiness) {
    throw new AppError(httpStatus.NOT_FOUND, 'Business profile not found!');
  }

  const coverImagePath =
    files?.coverImage?.[0]?.path.replace(/\\/g, '/') || null;
  const logoImagePath = files?.logoImage?.[0]?.path.replace(/\\/g, '/') || null;

  const session = await startSession();

  try {
    session.startTransaction();

    const businessUpdatePayload: any = {};

    if (payload.category) businessUpdatePayload.category = payload.category;
    if (payload.name) businessUpdatePayload.name = payload.name;
    if (payload.tagLine) businessUpdatePayload.tagLine = payload.tagLine;
    if (payload.description)
      businessUpdatePayload.description = payload.description;
    if (payload.businessPhoneNumber)
      businessUpdatePayload.businessPhoneNumber = payload.businessPhoneNumber;
    if (payload.businessEmail)
      businessUpdatePayload.businessEmail = payload.businessEmail;
    if (payload.businessWebsite)
      businessUpdatePayload.businessWebsite = payload.businessWebsite;
    if (payload.locations) businessUpdatePayload.locations = payload.locations;
    if (coverImagePath) businessUpdatePayload.coverImage = coverImagePath;
    if (logoImagePath) businessUpdatePayload.logoImage = logoImagePath;

    const updatedBusiness = await Business.findOneAndUpdate(
      { auth: user._id },
      businessUpdatePayload,
      { new: true, session }
    );

    if (!updatedBusiness) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to update business profile!'
      );
    }

    await session.commitTransaction();
    await session.endSession();

    return updatedBusiness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    await session.abortTransaction();
    await session.endSession();

    if (files) {
      Object.values(files).forEach((fileArray) => {
        fileArray.forEach((file) => {
          try {
            if (file?.path && fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          } catch (deleteErr) {
            console.warn(
              'Failed to delete uploaded file:',
              file.path,
              deleteErr
            );
          }
        });
      });
    }

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error?.message || 'Failed to update business profile. Please try again!'
    );
  }
};

// 2. Get Business Profile
const getBusinessProfileById = async (businessId: string, userId: string) => {
  const auth = await Auth.findById(userId);

  if (!auth) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const business = await Business.findOneAndUpdate({
    _id: businessId,
  });

  if (!business) {
    throw new AppError(httpStatus.NOT_FOUND, `Business doesn't exists!`);
  }

  const view = await BusinessView.create({
    business: business._id,
    user: auth._id,
  });

  return view;
};
// 3. Increase Business website count
const increaseWebsiteCount = async (businessId: string, userId: string) => {
  const auth = await Auth.findById(userId);

  if (!auth) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const business = await Business.findOneAndUpdate({
    _id: businessId,
  });

  if (!business) {
    throw new AppError(httpStatus.NOT_FOUND, `Business doesn't exists!`);
  }

  const view = await BusinessWebsiteView.create({
    business: business._id,
    user: auth._id,
  });

  return view;
};

const getBusinessOverview = async (userId: string) => {
  const business = await Business.findOne({
    auth: userId,
  });

  if (!business) {
    throw new AppError(httpStatus.NOT_FOUND, `Business doesn't exist!`);
  }

  const { current, previous } = getDateRanges('last_7_days');

  const { current: targetYear } = getDateRanges('this_year');

  const [sevenDayStats, monthlyRedemptions, monthlyCreations, overallProgress] =
    await Promise.all([
      RewardRedemption.aggregate([
        {
          $match: {
            business: business._id,
            status: { $in: ['claimed', 'redeemed'] },
          },
        },
        {
          $facet: {
            currentSevenDays: [
              {
                $match: {
                  claimedAt: {
                    $gte: current.startDate,
                    $lte: current.endDate,
                  },
                },
              },
              {
                $count: 'totalRedeemed',
              },
            ],
            previousSevenDays: [
              {
                $match: {
                  claimedAt: {
                    $gte: previous.startDate,
                    $lte: previous.endDate,
                  },
                },
              },
              {
                $count: 'totalRedeemed',
              },
            ],
          },
        },
      ]),

      RewardRedemption.aggregate([
        {
          $match: {
            business: business._id,
            createdAt: { $gte: targetYear.startDate, $lte: targetYear.endDate },
            status: { $ne: 'cancelled' },
          },
        },
        {
          $group: {
            _id: { $month: '$createdAt' },
            count: { $sum: 1 },
          },
        },
      ]),

      Reward.aggregate([
        {
          $match: {
            business: business._id,
            createdAt: { $gte: targetYear.startDate, $lte: targetYear.endDate },
            isActive: true,
          },
        },
        {
          $group: {
            _id: { $month: '$createdAt' },
            count: { $sum: 1 },
          },
        },
      ]),

      Reward.aggregate([
        {
          $match: {
            business: business._id,
            status: { $ne: 'inactive' },
          },
        },
        {
          $facet: {
            activeRewards: [
              { $match: { isActive: true, status: REWARD_STATUS.ACTIVE } },
              { $count: 'count' },
            ],
            progress: [
              {
                $group: {
                  _id: null,
                  totalLimit: { $sum: '$redemptionLimit' },
                  totalRedeemed: { $sum: '$redeemedCount' },
                },
              },
            ],
          },
        },
      ]),
    ]);

  const currentCount =
    sevenDayStats[0]?.currentSevenDays[0]?.totalRedeemed || 0;
  const previousCount =
    sevenDayStats[0]?.previousSevenDays[0]?.totalRedeemed || 0;
  const sevenDayGrowth = calculatePercentageChange(currentCount, previousCount);

  const redemptionMap = new Map(
    monthlyRedemptions.map((i) => [i._id, i.count])
  );
  const creationMap = new Map(monthlyCreations.map((i) => [i._id, i.count]));

  const monthlyStats = monthAbbreviations.map((monthName, index) => {
    const monthIndex = index + 1;
    return {
      month: `${monthName} ${targetYear.startDate?.getFullYear()}`,
      redeemed: redemptionMap.get(monthIndex) || 0,
      reward: creationMap.get(monthIndex) || 0,
    };
  });

  const activeCount = overallProgress[0]?.activeRewards[0]?.count || 0;
  const progressData = overallProgress[0]?.progress[0] || {
    totalLimit: 0,
    totalRedeemed: 0,
  };

  const progressPercentage =
    progressData.totalLimit > 0
      ? (progressData.totalRedeemed / progressData.totalLimit) * 100
      : 0;

  return {
    overview: {
      totalActiveRewards: activeCount,
      lastSevenDaysRedeemed: currentCount,
      previousSevenDaysRedeemed: previousCount,
      sevenDaysGrowthPercentage: sevenDayGrowth.percentageChange,
      isIncrease: sevenDayGrowth.isIncrease,
    },
    monthlyStats,
    overallProgress: {
      totalRedemptionLimit: progressData.totalLimit,
      totalRedeemedCount: progressData.totalRedeemed,
      percentage: parseFloat(progressPercentage.toFixed(2)),
    },
  };
};

const getBusinessRecentActivity = async (
  userId: string,
  query: Record<string, unknown>
) => {
  const business = await Business.findOne({ auth: userId });

  if (!business) {
    throw new AppError(httpStatus.NOT_FOUND, `Business doesn't exist!`);
  }

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const skip = (page - 1) * limit;

  const pipeline = [
    {
      $match: {
        business: business._id,
        status: { $in: ['redeemed'] },
      },
    },
    {
      $lookup: {
        from: 'clients',
        localField: 'user',
        foreignField: '_id',
        as: 'userDetails',
      },
    },
    { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'rewards',
        localField: 'reward',
        foreignField: '_id',
        as: 'rewardDetails',
      },
    },
    { $unwind: { path: '$rewardDetails', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        type: { $literal: 'redemption' },
        timestamp: '$createdAt',

        userName: '$userDetails.name',
        userImage: '$userDetails.image',
        rewardTitle: '$rewardDetails.title',
        redemptionMethod: '$redemptionMethod',
      },
    },
    {
      $unionWith: {
        coll: 'rewards',
        pipeline: [
          {
            $match: {
              business: business._id,
            },
          },
          {
            $project: {
              _id: 1,
              type: { $literal: 'creation' },
              timestamp: '$createdAt',

              rewardTitle: '$title',

              userName: { $literal: null },
              qrCode: { $literal: null },
            },
          },
        ],
      },
    },
    { $sort: { timestamp: -1 } },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ];

  const result = await RewardRedemption.aggregate(pipeline as any);

  const rawData = result[0].data || [];
  const total = result[0].metadata[0]?.total || 0;

  const groupedData = new Map<string, any[]>();

  rawData.forEach((item: any) => {
    const groupTitle = getDateHeader(new Date(item.timestamp));

    const enrichedItem = {
      ...item,
      timeAgo: getTimeAgo(new Date(item.timestamp)),
    };

    if (!groupedData.has(groupTitle)) {
      groupedData.set(groupTitle, []);
    }
    groupedData.get(groupTitle)?.push(enrichedItem);
  });

  const formattedActivities = Array.from(groupedData, ([title, items]) => ({
    title,
    data: items,
  }));

  return {
    activities: formattedActivities,
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
  };
};

const getBusinessAnalytics = async (
  userId: string,
  timeFilter: TTimeFilter
) => {
  const business = await Business.findOne({ auth: userId });
  if (!business) {
    throw new AppError(httpStatus.NOT_FOUND, `Business doesn't exists!`);
  }

  const { current, previous } = getDateRanges(timeFilter);

  const getViews = async (Model: any) => {
    const result = await Model.aggregate([
      { $match: { business: business._id } },
      {
        $facet: {
          current: [
            {
              $match: {
                createdAt: { $gte: current.startDate, $lte: current.endDate },
              },
            },
            { $count: 'count' },
          ],
          previous: [
            {
              $match: {
                createdAt: { $gte: previous.startDate, $lte: previous.endDate },
              },
            },
            { $count: 'count' },
          ],
        },
      },
      {
        $project: {
          current: { $ifNull: [{ $arrayElemAt: ['$current.count', 0] }, 0] },
          previous: { $ifNull: [{ $arrayElemAt: ['$previous.count', 0] }, 0] },
        },
      },
    ]);

    return result[0];
  };

  const profileViews = await getViews(BusinessView);
  const websiteViews = await getViews(BusinessWebsiteView);

  const redemptionData = await RewardRedemption.aggregate([
    {
      $match: {
        business: business._id,
        status: REDEMPTION_STATUS.REDEEMED,
        redeemedAt: { $gte: current.startDate, $lte: current.endDate },
      },
    },
    { $group: { _id: '$redemptionMethod', count: { $sum: 1 } } },
  ]);

  const totalRedemptions = redemptionData.reduce((a, b) => a + b.count, 0);

  const methods = REDEMPTION_METHOD_VALUES.slice(0, 3).map((method) => {
    const found = redemptionData.find((item) => item._id === method);
    return {
      method,
      count: found?.count || 0,
      percentage: found
        ? Math.round((found.count / totalRedemptions) * 100)
        : 0,
    };
  });

  const topRewards = await RewardRedemption.aggregate([
    {
      $match: {
        business: business._id,
        status: REDEMPTION_STATUS.REDEEMED,
      },
    },
    { $group: { _id: '$reward', totalRedemptions: { $sum: 1 } } },
    {
      $lookup: {
        from: 'rewards',
        localField: '_id',
        foreignField: '_id',
        as: 'reward',
      },
    },
    { $unwind: '$reward' },
    {
      $project: {
        rewardId: '$_id',
        title: '$reward.title',
        totalRedemptions: 1,
        redemptionLimit: '$reward.redemptionLimit',
        percentage: {
          $round: [
            {
              $multiply: [
                { $divide: ['$totalRedemptions', '$reward.redemptionLimit'] },
                100,
              ],
            },
            2,
          ],
        },
      },
    },
    { $sort: { percentage: -1 } },
    { $limit: 3 },
  ]);

  const profileChange = calculatePercentageChange(
    profileViews.current,
    profileViews.previous
  );

  const websiteChange = calculatePercentageChange(
    websiteViews.current,
    websiteViews.previous
  );

  return {
    totalRedemptions,

    // Profile views
    profileCurrent: profileViews.current,
    profilePrevious: profileViews.previous,
    profileChange: profileChange.percentageChange,
    profileIncrease: profileChange.isIncrease,

    // Website views
    websiteCurrent: websiteViews.current,
    websitePrevious: websiteViews.previous,
    websiteChange: websiteChange.percentageChange,
    websiteIncrease: websiteChange.isIncrease,

    // Breakdown & Top Rewards
    methods,
    topRewards,
  };
};

const getSingleRewardAnalytics = async (userId: string, rewardId: string) => {
  const business = await Business.findOne({
    auth: userId,
  });

  if (!business) {
    throw new AppError(httpStatus.NOT_FOUND, `Business doesn't exists!`);
  }

  const reward = await Reward.findById(rewardId);

  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, `Reward not found!`);
  }

  const { current } = getDateRanges('last_7_days');

  const dateLabels: string[] = [];
  const startDate = current.startDate as Date;
  const tempDate = new Date(startDate);

  for (let i = 0; i < 7; i++) {
    dateLabels.push(tempDate.toLocaleDateString('en-CA'));
    tempDate.setDate(tempDate.getDate() + 1);
  }

  const [viewsData, claimsData, redemptionsData] = await Promise.all([
    ViewReward.aggregate([
      {
        $match: {
          reward: reward._id,
          createdAt: { $gte: current.startDate, $lte: current.endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
    ]),

    RewardRedemption.aggregate([
      {
        $match: {
          reward: reward._id,
          claimedAt: { $gte: current.startDate, $lte: current.endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$claimedAt' } },
          count: { $sum: 1 },
        },
      },
    ]),

    RewardRedemption.aggregate([
      {
        $match: {
          reward: reward._id,
          status: REDEMPTION_STATUS.REDEEMED,
          redeemedAt: { $gte: current.startDate, $lte: current.endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$redeemedAt' } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);


  const viewsMap = new Map(viewsData.map((d) => [d._id, d.count]));
  const claimsMap = new Map(claimsData.map((d) => [d._id, d.count]));
  const redemptionsMap = new Map(redemptionsData.map((d) => [d._id, d.count]));

  let totalViews = 0;
  let totalClaims = 0;
  let totalRedemptions = 0;

  const chartData = dateLabels.map((date) => {
    const views = viewsMap.get(date) || 0;
    const claims = claimsMap.get(date) || 0;
    const redemptions = redemptionsMap.get(date) || 0;

    totalViews += views;
    totalClaims += claims;
    totalRedemptions += redemptions;

    return {
      date,
      day: new Date(date).getDate(),
      views,
      claims,
      redemptions,
    };
  });

  return {
    summary: {
      views: totalViews,
      claims: totalClaims,
      redemptions: totalRedemptions,
    },
    chartData,
  };
};

export const BusinessService = {
  updateBusinessProfile,
  getBusinessProfileById,
  increaseWebsiteCount,
  getBusinessOverview,
  getBusinessRecentActivity,
  getBusinessAnalytics,
  getSingleRewardAnalytics,
};
