import express from 'express';
import { auth, validateRequest } from '../../middlewares';
import { FavoriteRewardValidation } from './FavoriteReward.validation';
import { favoriteController } from './FavoriteReward.controller';
import { ROLE } from '../Auth/auth.constant';

const router = express.Router();

router.post(
  '/add',
  auth(ROLE.CLIENT),
  validateRequest(FavoriteRewardValidation.addFavoriteRewardSchema),
  favoriteController.addFavoriteReward
);

router.delete(
  '/remove/:rewardId',
  auth(ROLE.CLIENT),
  validateRequest(FavoriteRewardValidation.deleteFavoriteRewardSchema),
  favoriteController.deleteFavoriteReward
);

router.get(
  '/me',
  auth(ROLE.CLIENT),
  validateRequest(FavoriteRewardValidation.getFavoriteRewardQuerySchema),
  favoriteController.getMyFavoriteRewards
);

export const favoriteRoutes = router;
