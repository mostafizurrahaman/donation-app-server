import { Response } from 'express';
import httpStatus from 'http-status';
import { rewardRedemptionService } from './reward-redeemtion.service';
import { REWARD_MESSAGES } from '../Reward/reward.constant';
import { AppError, asyncHandler, sendResponse } from '../../utils';
import { ExtendedRequest } from '../../types';
import Client from '../Client/client.model';

/**
 * Claim a reward (deduct points)
 */
const claimReward = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const result = await rewardRedemptionService.claimReward({
      rewardId: req.params.id,
      userId,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: result.message,
      data: {
        redemption: result.redemption,
        code: result.code,
        availableMethods: result.availableMethods,
      },
    });
  }
);

/**
 * Cancel claimed reward (refund points)
 */
const cancelClaimedReward = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const { reason } = req.body;

    const result = await rewardRedemptionService.cancelClaimedReward({
      redemptionId: req.params.redemptionId,
      userId,
      reason,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: REWARD_MESSAGES.CANCELLED,
      data: result,
    });
  }
);

/**
 * Redeem a claimed reward (mark as used - Final Step)
 */
const redeemReward = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const { staffAuthId, code, method } = req.body;

    const result = await rewardRedemptionService.redeemRewardByCode({
      code,
      staffAuthId,
      method,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: REWARD_MESSAGES.REDEEMED,
      data: result,
    });
  }
);

/**
 * Get user's claimed rewards
 */
const getUserClaimedRewards = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const client = await Client.findOne({ auth: userId });

    if (!client) {
      throw new AppError(httpStatus.NOT_FOUND, 'Client not found');
    }

    const result = await rewardRedemptionService.getUserClaimedRewards(
      client?._id?.toString(),
      req.query
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Claimed rewards retrieved successfully',
      data: result.data,
      meta: result.meta,
    });
  }
);

/**
 * Get claimed reward by ID
 */
const getClaimedRewardById = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'User not authenticated');
    }

    const client = await Client.findOne({ auth: userId });

    if (!client) {
      throw new AppError(httpStatus.NOT_FOUND, 'Client not found');
    }

    const redemption = await rewardRedemptionService.getClaimedRewardById(
      req.params.redemptionId,
      client?._id?.toString()
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Claimed reward retrieved successfully',
      data: redemption,
    });
  }
);

/**
 * Verify redemption by code or QR (only business can validate)
 * This is Step 1 of redemption (Scanning)
 */
const verifyRedemption = asyncHandler(
  async (req: ExtendedRequest, res: Response) => {
    const { code, redemptionId } = req.body;
    const staffBusinessId = req.user?._id?.toString();

    if (!staffBusinessId) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Business not authenticated');
    }

    const result = await rewardRedemptionService.verifyRedemption(
      staffBusinessId,
      code,
      redemptionId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Redemption verified successfully',
      data: result,
    });
  }
);

export const RewardRedemptionController = {
  claimReward,
  cancelClaimedReward,
  redeemReward,
  getUserClaimedRewards,
  getClaimedRewardById,
  verifyRedemption,
};
