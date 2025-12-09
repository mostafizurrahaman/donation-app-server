import { AppError } from '../../utils';
import { RoundUpModel } from '../RoundUp/roundUp.model';
import { RoundUpTransactionModel } from '../RoundUpTransaction/roundUpTransaction.model';
import Client from './client.model';
import httpStatus from 'http-status';
import { Types } from 'mongoose';

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

export const clientService = {
  getRoundupStats,
};
