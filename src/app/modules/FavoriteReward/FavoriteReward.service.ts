import { AppError } from '../../utils';
import Auth from '../Auth/auth.model';
import httpStatus from 'http-status';
import { Reward } from '../Reward/reward.model';
import { REWARD_STATUS } from '../Reward/reward.constant';
import { FavoriteReward } from './FavoriteReward.model';
import Client from '../Client/client.model';

// Add Favorite :
const addFavorite = async (userId: string, rewardId: string) => {
  const auth = await Auth.findById(userId);

  if (!auth) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const reward = await Reward.findOne({
    _id: rewardId,
    isActive: true,
    status: REWARD_STATUS.ACTIVE,
  });

  if (!reward) {
    throw new AppError(httpStatus.NOT_FOUND, 'Reward not found!');
  }

  const favoriteReward = await FavoriteReward.findOneAndUpdate(
    {
      reward: reward?._id,
      user: auth?._id,
    },
    {
      reward: reward?._id,
      user: auth?._id,
    },
    {
      upsert: true,
      new: true,
    }
  );

  return favoriteReward;
};

// Add Favorite :
const deleteFavorite = async (userId: string, rewardId: string) => {
  const auth = await Auth.findById(userId);

  if (!auth) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const deleteFavoriteReward = await FavoriteReward.deleteOne({
    reward: rewardId,
    user: auth?._id,
  });

  return deleteFavoriteReward;
};

// GetMyFavorite Rewards:
const getMyFavoriteRewards = async (
  userId: string,
  query: Record<string, unknown>
) => {
  const client = await Client.findOne({ auth: userId });

  if (!client) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const searchTerm = (query?.searchTerm as string)?.trim();
  const skip = (page - 1) * limit;

  const searchStage = searchTerm
    ? {
        $match: {
          $or: [
            { title: { $regex: searchTerm, $options: 'i' } },
            { description: { $regex: searchTerm, $options: 'i' } },
          ],
        },
      }
    : null;

  const favoriteRewards = await FavoriteReward.aggregate([
    {
      $match: {
        user: client?.auth,
      },
    },
    {
      $lookup: {
        from: 'rewards',
        let: { rewardId: '$reward' },
        as: 'rewardDetails',
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ['$_id', '$$rewardId'],
              },
            },
          },
          {
            $lookup: {
              from: 'rewardredemptions',
              as: 'redeemptions',
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ['$reward', '$$rewardId'],
                    },
                    user: client?._id,
                  },
                },
                {
                  $limit: 1,
                },
              ],
            },
          },
          {
            $addFields: {
              isRedeemed: {
                $gt: [{ $size: '$redeemptions' }, 0],
              },
            },
          },
        ],
      },
    },
    {
      $unwind: '$rewardDetails',
    },
    {
      $project: {
        favoriteId: '$_id',
        reward: 1,
        user: 1,

        // reward info:
        title: '$rewardDetails.title',
        description: '$rewardDetails.description',
        image: '$rewardDetails.image',
        status: '$rewardDetails.status',
        isActive: '$rewardDetails.isActive',
        inStoreRedemptionMethods: '$rewardDetails.inStoreRedemptionMethods',
        onlineRedemptionMethods: '$rewardDetails.onlineRedemptionMethods',
        codePrefix: '$rewardDetails.codePrefix',
        isRedeemed: '$rewardDetails.isRedeemed',
        startDate: '$rewardDetails.startDate',
        expiryDate: '$rewardDetails.expiryDate',
        business: '$rewardDetails.business',
      },
    },
    {
      $match: {
        isActive: true,
        status: REWARD_STATUS.ACTIVE,
        isRedeemed: false,
      },
    },
    ...(searchStage ? [searchStage] : []),
    {
      $facet: {
        data: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
        ],
        meta: [{ $count: 'totalCount' }],
      },
    },
  ]);

  const data = favoriteRewards[0].data;
  const total = favoriteRewards[0].meta[0]?.totalCount || 0;
  const totalPage = Math.ceil(total / limit);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPage,
    },
  };
};

export const favoriteRewardService = {
  addFavorite,
  deleteFavorite,
  getMyFavoriteRewards,
};
