import { asyncHandler, sendResponse } from '../../utils';
import { favoriteRewardService } from './FavoriteReward.service';
import httpStatus from 'http-status';

const addFavoriteReward = asyncHandler(async (req, res) => {
  const userId = req.user?._id?.toString();
  const rewardId = req.body.reward;

  const result = await favoriteRewardService.addFavorite(userId, rewardId);

  sendResponse(res, {
    data: result,
    message: `Reward added to favorite successfully!`,
    statusCode: httpStatus.CREATED,
  });
});

const deleteFavoriteReward = asyncHandler(async (req, res) => {
  const userId = req.user?._id?.toString();
  const rewardId = req.params.rewardId;

  const result = await favoriteRewardService.deleteFavorite(userId, rewardId);

  sendResponse(res, {
    data: result,
    message: `Reward remove from favorite successfully!`,
    statusCode: httpStatus.OK,
  });
});

const getMyFavoriteRewards = asyncHandler(async (req, res) => {
  const userId = req.user?._id?.toString();
  const query = req.query;

  console.log({
    userId,
    query,
  });

  const result = await favoriteRewardService.getMyFavoriteRewards(
    userId,
    query
  );

  sendResponse(res, {
    data: result.data,
    meta: result.meta,
    message: `Favorite reward retrived successfully!`,
    statusCode: httpStatus.OK,
  });
});

export const favoriteController = {
  addFavoriteReward,
  deleteFavoriteReward,
  getMyFavoriteRewards,
};
