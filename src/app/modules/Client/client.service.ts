import { AppError } from '../../utils';
import { RoundUpModel } from '../RoundUp/roundUp.model';
import { RoundUpTransactionModel } from '../RoundUpTransaction/roundUpTransaction.model';

import Client from './client.model';
import httpStatus from 'http-status';

const getRoundupStats = async (userId: string) => {
  const client = await Client?.findOne({
    auth: userId,
  });

  if (!client) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const activeRoundup = await RoundUpModel.findOne({
    user: userId,
    isActive: true,
  });

  if (!activeRoundup) {
    return {
      monthlyThreshold: 0,
      totalAmountRoundedUp: 0,
    };
  }

  const recentTransactions = await RoundUpTransactionModel.aggregate([
    {
      $match: {
        user: userId,
        roundUp: activeRoundup._id,
        status: 'processed',
        createdAt: {
          $gte: activeRoundup?.lastMonthReset,
        },
      },
    },
    {
      
    }
  ]);


  console.log({ recentTransactions });

  return activeRoundup;
};

export const clientService = {
  getRoundupStats,
};
