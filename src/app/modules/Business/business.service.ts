import fs from 'fs';
import httpStatus from 'http-status';
import { startSession } from 'mongoose';
import { AppError } from '../../utils';
import Business from './business.model';
import { IAuth } from '../Auth/auth.interface';
import { defaultUserImage } from '../Auth/auth.constant';
import {
  calculatePercentageChange,
  getDateHeader,
  getDateRanges,
  getTimeAgo,
} from '../../lib/filter-helper';
import { RewardRedemption } from '../RewardRedeemtion/reward-redeemtion.model';
import { Reward } from '../Reward/reward.model';
import { REWARD_STATUS } from '../Reward/reward.constant';
import { monthAbbreviations } from '../Donation/donation.constant';
import {
  REDEMPTION_METHOD,
  REDEMPTION_METHOD_VALUES,
  REDEMPTION_STATUS,
} from '../RewardRedeemtion/reward-redeemtion.constant';
import { TTimeFilter } from '../Donation/donation.interface';

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
  // Check if user exists and is a business
  if (!user || user.role !== 'BUSINESS') {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Unauthorized access!');
  }

  // Find existing business profile
  const existingBusiness = await Business.findOne({ auth: user._id });

  if (!existingBusiness) {
    throw new AppError(httpStatus.NOT_FOUND, 'Business profile not found!');
  }

  // Extract file paths
  const coverImagePath =
    files?.coverImage?.[0]?.path.replace(/\\/g, '/') || null;
  const logoImagePath = files?.logoImage?.[0]?.path.replace(/\\/g, '/') || null;

  // Start a MongoDB session for transaction
  const session = await startSession();

  try {
    session.startTransaction();

    // Prepare update payload
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

    // Update business profile
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

    // Prepare access token payload
    const accessTokenPayload = {
      id: user._id.toString(),
      name: updatedBusiness?.name,
      image:
        updatedBusiness?.logoImage ||
        updatedBusiness?.coverImage ||
        defaultUserImage,
      email: user.email,
      role: user.role,
      isProfile: user.isProfile,
      isActive: user.isActive,
      status: user.status,
    };

    return updatedBusiness;
  } catch (error: any) {
    await session.abortTransaction();
    await session.endSession();

    // Clean up uploaded files on error
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

    // Re-throw application-specific errors
    if (error instanceof AppError) {
      throw error;
    }

    // Throw generic internal server error
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error?.message || 'Failed to update business profile. Please try again!'
    );
  }
};

// 2. Get Business Profile
const getBusinessProfileById = async (businessId: string) => {
  const business = await Business.findOneAndUpdate(
    {
      _id: businessId,
    },
    {
      $inc: {
        views: 1,
      },
    },
    {
      new: true,
    }
  );

  if (!business) {
    throw new AppError(httpStatus.NOT_FOUND, `Business doesn't exists!`);
  }

  return business;
};
// 3. Increase Business website count
const increaseWebsiteCount = async (businessId: string) => {
  const business = await Business.findOneAndUpdate(
    {
      _id: businessId,
    },
    {
      $inc: {
        websiteViews: 1,
      },
    },
    {
      new: true,
    }
  );

  if (!business) {
    throw new AppError(httpStatus.NOT_FOUND, `Business doesn't exists!`);
  }

  return business;
};

// 4. Get Business Oreveiw:
const getBusinessOverview = async (userId: string) => {
  const business = await Business.findOne({
    auth: userId,
  });

  if (!business) {
    throw new AppError(httpStatus.NOT_FOUND, `Business doesn't exist!`);
  }

  // 1. Get Date Ranges using the helper
  const { current, previous } = getDateRanges('last_7_days');

  const { current: targetYear } = getDateRanges('this_year');

  // 2. Execute Aggregations in Parallel
  const [sevenDayStats, monthlyRedemptions, monthlyCreations, overallProgress] =
    await Promise.all([
      // A. Last 7 Days Comparison (Using your facet structure)
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

      // B. Monthly Redemption Trends (For Graph)
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

      // C. Monthly Reward Creation Trends (For Graph)
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

      // D. Overall Progress (Limit vs Usage) & Total Active Count
      Reward.aggregate([
        {
          $match: {
            business: business._id,
            status: { $ne: 'inactive' },
          },
        },
        {
          $facet: {
            // Total Active Rewards Count
            activeRewards: [
              { $match: { isActive: true, status: REWARD_STATUS.ACTIVE } },
              { $count: 'count' },
            ],
            // Progress Stats
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

  // 3. Process 7-Day Stats
  const currentCount =
    sevenDayStats[0]?.currentSevenDays[0]?.totalRedeemed || 0;
  const previousCount =
    sevenDayStats[0]?.previousSevenDays[0]?.totalRedeemed || 0;
  const sevenDayGrowth = calculatePercentageChange(currentCount, previousCount);

  // 4. Process Monthly Stats
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

  // 5. Process Overall Progress & Active Count
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
// 5. Get Business Recent Activity
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
    // 1. Match Redemptions
    {
      $match: {
        business: business._id,
        status: { $in: ['redeemed'] },
      },
    },
    // 2. Lookup User
    {
      $lookup: {
        from: 'clients',
        localField: 'user',
        foreignField: '_id',
        as: 'userDetails',
      },
    },
    { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
    // 3. Lookup Reward
    {
      $lookup: {
        from: 'rewards',
        localField: 'reward',
        foreignField: '_id',
        as: 'rewardDetails',
      },
    },
    { $unwind: { path: '$rewardDetails', preserveNullAndEmptyArrays: true } },
    // 4. Project Raw Data (No text formatting)
    {
      $project: {
        _id: 1,
        type: { $literal: 'redemption' }, // Identify type
        timestamp: '$createdAt',

        // Required data for Frontend formatting
        userName: '$userDetails.name',
        userImage: '$userDetails.image',
        rewardTitle: '$rewardDetails.title',
        redemptionMethod: '$redemptionMethod', // e.g. 'qr', 'nfc', 'static-code'

        // Codes for Scanner/Display
        qrCode: 1, // Base64 QR string
        qrCodeUrl: 1, // Data URL for QR image
        assignedCode: 1, // Static code (e.g. "DISCOUNT50")
      },
    },
    // 5. Merge with Reward Creations
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
              type: { $literal: 'creation' }, // Identify type
              timestamp: '$createdAt',

              // Only reward title needed for creation event
              rewardTitle: '$title',

              // Nullify fields that don't exist for creations to keep shape consistent (optional)
              userName: { $literal: null },
              qrCode: { $literal: null },
            },
          },
        ],
      },
    },
    // 6. Sort Combined List (Newest First)
    { $sort: { timestamp: -1 } },
    // 7. Pagination
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ];

  // Execute Aggregation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await RewardRedemption.aggregate(pipeline as any);

  const rawData = result[0].data || [];
  const total = result[0].metadata[0]?.total || 0;

  // 8. Grouping Logic
  const groupedData = new Map<string, any[]>();

  rawData.forEach((item: any) => {
    const groupTitle = getDateHeader(new Date(item.timestamp));

    // Add timeAgo calculation for frontend convenience
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

// 6.Get Business Stats (analyst)
const getBusinessAnalytics = async (
  userId: string,
  timeFilter: TTimeFilter
) => {
  const business = await Business.findOne({
    auth: userId,
  });

  if (!business) {
    throw new AppError(httpStatus.NOT_FOUND, `Business doesn't exists!`);
  }

  const { current } = getDateRanges(timeFilter);

  const pipeline = [
    {
      $match: {
        business: business._id,
        status: REDEMPTION_STATUS.REDEEMED,
        redeemedAt: {
          $gte: current.startDate,
          $lte: current.endDate,
        },
      },
    },
    {
      $group: {
        _id: '$redemptionMethod',
        count: { $sum: 1 },
      },
    },
    {
      $setWindowFields: {
        partitionBy: null,
        output: {
          totalRedemptions: {
            $sum: '$count',
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        method: '$_id',
        count: 1,
        totalRedemptions: 1,
        percentage: {
          $round: [
            {
              $multiply: [{ $divide: ['$count', '$totalRedemptions'] }, 100],
            },
            2,
          ],
        },
      },
    },
    {
      $sort: { count: -1 },
    },
  ];

  const redemptionData = await RewardRedemption.aggregate(pipeline);

  const totalRedemptions =
    redemptionData.length > 0 ? redemptionData[0].totalRedemptions : 0;

  const formattedStats = REDEMPTION_METHOD_VALUES.slice(0, 3).map((method) => {
    const found = redemptionData.find((item) => item.method === method);
    return {
      method: method,
      count: found ? found.count : 0,
      percentage: found ? found.percentage : 0,
    };
  });

  return {
    totalRedemptions,
    breakdown: formattedStats,
  };
};
export const BusinessService = {
  updateBusinessProfile,
  getBusinessProfileById,
  increaseWebsiteCount,
  getBusinessOverview,
  getBusinessRecentActivity,
  getBusinessAnalytics,
};
