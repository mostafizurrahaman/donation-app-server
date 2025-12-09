import { AppError } from '../../utils';
import Donation from '../Donation/donation.model';
import { RoundUpModel } from '../RoundUp/roundUp.model';
import { RoundUpTransactionModel } from '../RoundUpTransaction/roundUpTransaction.model';
import Client from './client.model';
import httpStatus from 'http-status';
import { Types } from 'mongoose';

// 1. Roundup donation stats
const getRoundupStats = async (userId: string) => {
  // 1. Check User
  const client = await Client.findOne({
    auth: userId,
  });

  if (!client) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  // 2. Get Active Roundup
  const activeRoundup = await RoundUpModel.findOne({
    user: userId,
    isActive: true,
  });

  if (!activeRoundup) {
    return {
      currentRoundupBalance: 0,
      monthlyThreshold: 0,
      todaysRoundupAmount: 0,
      lastTransactionAmount: 0,
      roundupPercentage: 0,
      recentTransactions: [],
    };
  }

  // 3. Get Last Transaction Amount (Single Query for accuracy)
  const lastTransaction = await RoundUpTransactionModel.findOne({
    user: userId,
    roundUp: activeRoundup._id,
    status: 'processed',
  })
    .sort({ createdAt: -1 })
    .select('roundUpAmount');

  // 4. Calculate Today's Total Roundup Amount
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todaysStats = await RoundUpTransactionModel.aggregate([
    {
      $match: {
        user: new Types.ObjectId(userId),
        roundUp: activeRoundup._id,
        status: 'processed',
        createdAt: { $gte: startOfDay },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$roundUpAmount' },
      },
    },
  ]);

  const todaysRoundupAmount = todaysStats[0]?.total || 0;

  // 5. Get Recent Transactions (Grouped by Date)
  const recentTransactions = await RoundUpTransactionModel.aggregate([
    {
      $match: {
        user: new Types.ObjectId(userId),
        roundUp: activeRoundup._id,
        status: 'processed',
      },
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $limit: 20,
    },
    {
      $addFields: {
        todayStr: {
          $dateToString: { format: '%Y-%m-%d', date: new Date() },
        },
        yesterdayStr: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: { $subtract: [new Date(), 24 * 60 * 60 * 1000] },
          },
        },
        createdDateStr: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
        },

        formattedDate: {
          $toUpper: {
            $concat: [
              { $toString: { $dayOfMonth: '$createdAt' } },
              ' ',
              { $dateToString: { format: '%b %Y', date: '$createdAt' } },
            ],
          },
        },
      },
    },
    {
      $addFields: {
        dateLabel: {
          $switch: {
            branches: [
              {
                case: { $eq: ['$createdDateStr', '$todayStr'] },
                then: 'Today',
              },
              {
                case: { $eq: ['$createdDateStr', '$yesterdayStr'] },
                then: 'Yesterday',
              },
            ],
            default: '$formattedDate', // Returns "2 JUL 2025"
          },
        },
      },
    },
    {
      $group: {
        _id: '$dateLabel',
        sortDate: { $first: '$createdDateStr' },
        transactions: {
          $push: {
            transactionId: '$transactionId',
            roundupAmount: '$roundUpAmount',
            transactionAmount: '$originalAmount',
            transactionName: '$transactionName',
            createdAt: '$createdAt',
          },
        },
      },
    },
    {
      $sort: {
        sortDate: -1,
      },
    },
    {
      $project: {
        _id: 0,
        title: '$_id',
        transactions: 1,
      },
    },
  ]);

  const currentBalance = activeRoundup.currentMonthTotal || 0;
  const threshold = activeRoundup.monthlyThreshold;
  const isUnlimited = threshold === 'no-limit';

  const numericThreshold =
    !isUnlimited && typeof threshold === 'number' ? threshold : 0;

  let roundupPercentage = 0;
  if (numericThreshold > 0) {
    roundupPercentage = (currentBalance / numericThreshold) * 100;
  }

  // calculate the days left in the month
  const today = new Date();

  const nextMonthFirstDay = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    1
  );

  const diffTime = nextMonthFirstDay.getTime() - today.getTime();

  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    currentRoundupBalance: Number(currentBalance.toFixed(2)),
    todaysRoundupAmount: Number(todaysRoundupAmount.toFixed(2)),
    monthlyThreshold: isUnlimited
      ? 'no-limit'
      : Number(numericThreshold.toFixed(2)),
    lastTransactionAmount: Number(
      (lastTransaction?.roundUpAmount || 0).toFixed(2)
    ),
    roundupPercentage: Number(roundupPercentage.toFixed(2)),
    daysLeft,
    recentTransactions,
  };
};

// 2. One time donation Stats:
const getOnetimeDonationStats = async (userId: string) => {
  const client = await Client.findOne({
    auth: userId,
  });

  if (!client) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const result = await Donation?.aggregate([
    {
      $match: {
        donor: client?._id,
        donationType: 'one-time',
        status: 'completed',
      },
    },
    {
      $facet: {
        totalDonated: [
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' },
            },
          },
        ],
        todaysTotalDonation: [
          {
            $match: {
              createdAt: {
                $gte: new Date(new Date().setHours(0, 0, 0, 0)),
              },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' },
            },
          },
        ],
        recentDonations: [
          { $sort: { createdAt: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: 'organizations',
              localField: 'organization',
              foreignField: '_id',
              as: 'orgDetails',
            },
          },
          { $unwind: '$orgDetails' },
          {
            $addFields: {
              todayStr: {
                $dateToString: { format: '%Y-%m-%d', date: new Date() },
              },
              yesterdayStr: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: { $subtract: [new Date(), 24 * 60 * 60 * 1000] },
                },
              },
              createdDateStr: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
              hoursDiff: {
                $dateDiff: {
                  startDate: '$createdAt',
                  endDate: '$$NOW',
                  unit: 'hour',
                },
              },
              daysDiff: {
                $dateDiff: {
                  startDate: '$createdAt',
                  endDate: '$$NOW',
                  unit: 'day',
                },
              },
              formattedDate: {
                $concat: [
                  { $toString: { $dayOfMonth: '$createdAt' } },
                  ' ',
                  { $dateToString: { format: '%b %Y', date: '$createdAt' } },
                ],
              },
            },
          },
          {
            $addFields: {
              dateLabel: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ['$createdDateStr', '$todayStr'] },
                      then: 'Today',
                    },
                    {
                      case: { $eq: ['$createdDateStr', '$yesterdayStr'] },
                      then: 'Yesterday',
                    },
                  ],
                  default: '$formattedDate',
                },
              },
              timeAgoStr: {
                $cond: {
                  if: { $gte: ['$hoursDiff', 24] },
                  then: {
                    $concat: [{ $toString: '$daysDiff' }, ' days ago'],
                  },
                  else: {
                    $cond: {
                      if: { $eq: ['$hoursDiff', 0] },
                      then: 'Just now',
                      else: {
                        $concat: [{ $toString: '$hoursDiff' }, ' hours ago'],
                      },
                    },
                  },
                },
              },
            },
          },
          {
            $group: {
              _id: '$dateLabel',
              sortDate: { $first: '$createdDateStr' },
              donations: {
                $push: {
                  donationId: '$_id',
                  amount: '$amount',
                  orgName: '$orgDetails.name',
                  registeredCharityName: '$orgDetails.registeredCharityName',
                  orgLogo: '$orgDetails.logoImage',
                  timeAgo: '$timeAgoStr',
                  createdAt: '$createdAt',
                },
              },
            },
          },
          { $sort: { sortDate: -1 } },
          {
            $project: {
              _id: 0,
              title: '$_id',
              donations: 1,
            },
          },
        ],
      },
    },
  ]);

  const stats = result[0];

  return {
    totalDonated: stats.totalDonated[0]?.total || 0,
    todaysTotalDonation: stats.todaysTotalDonation[0]?.total || 0,
    recentDonations: stats.recentDonations || [],
  };
};
export const clientService = {
  getRoundupStats,
  getOnetimeDonationStats,
};
