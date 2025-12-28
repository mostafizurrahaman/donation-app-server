/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types, ClientSession } from 'mongoose';
import mongoose from 'mongoose';
import httpStatus from 'http-status';

import { RewardRedemption } from './reward-redeemtion.model';
import { Reward } from '../Reward/reward.model';
import Client from '../Client/client.model';
import Business from '../Business/business.model';
import { pointsServices } from '../Points/points.service';
import { AppError } from '../../utils';

import {
  IRewardRedemptionDocument,
  ICancelClaimPayload,
} from '../Reward/reward.interface';

import {
  REDEMPTION_METHOD,
  REDEMPTION_STATUS,
  CANCELLATION_WINDOW_HOURS,
} from './reward-redeemtion.constant';
import { REWARD_MESSAGES, STATIC_POINTS_COST } from '../Reward/reward.constant';
import { createNotification } from '../Notification/notification.service';
import { NOTIFICATION_TYPE } from '../Notification/notification.constant';
import { RewardCode } from '../RewardCode/reward-code.model';
import Auth from '../Auth/auth.model';
import sendRewardCodeEmail from '../../utils/sendReward';
import { RedemptionMethod } from './reward-redeemtion.interface';
import { IClient } from '../Client/client.interface';
import { PointsBalance } from '../Points/points.model';
import QueryBuilder from '../../builders/QueryBuilder';
import { IBusiness } from '../Business/business.interface';

// ==========================================
// REWARD CLAIMING & REDEMPTION SERVICES
// ==========================================

/**
 * Claim a reward
 * Digital (Online): Claim -> Auto-Redeem -> Email Code
 * Physical (In-Store): Claim -> Status: 'claimed' -> Wait for store scan
 */
const claimReward = async (payload: { rewardId: string; userId: string }) => {
  const { rewardId, userId } = payload;

  // 1. Resolve Client Profile
  const client = await Client.findOne({ auth: userId });
  if (!client) {
    throw new AppError(httpStatus.NOT_FOUND, 'Client profile not found');
  }

  // Check the points balance:
  const balance = await PointsBalance?.findOne({
    user: client?._id,
  });

  if (!balance || balance.currentBalance < 500) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You have Insufficient balance!'
    );
  }

  // 2. Prevent Duplicate Claims (If already claimed/redeemed and not expired)
  const existingClaim = await RewardRedemption.findOne({
    user: client._id,
    reward: rewardId,
    status: { $in: [REDEMPTION_STATUS.CLAIMED, REDEMPTION_STATUS.REDEEMED] },
  });

  if (existingClaim) {
    throw new AppError(httpStatus.CONFLICT, REWARD_MESSAGES.ALREADY_CLAIMED);
  }

  // 3. Start Transaction
  const session: ClientSession = await mongoose.startSession();
  session.startTransaction();

  try {
    // 4. Atomic Stock Check & Decrement
    const reward = await Reward.findOneAndUpdate(
      {
        _id: rewardId,
        remainingCount: { $gt: 0 },
        status: 'active',
        isActive: true,
      },
      { $inc: { remainingCount: -1, redeemedCount: 1, redemptions: 1 } },
      { session, new: true }
    );
    console.log({ reward });

    if (!reward) {
      throw new AppError(httpStatus.GONE, REWARD_MESSAGES.RACE_CONDITION);
    }

    // 5. Fetch and Lock one unique Code from inventory
    const availableCode = await RewardCode.findOneAndUpdate(
      { reward: rewardId, isUsed: false },
      {
        $set: {
          isUsed: true,
          usedBy: client._id,
          usedAt: new Date(),
        },
      },
      { session, new: true }
    );

    if (!availableCode) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Inventory Mismatch: No codes available.'
      );
    }

    // 6. Branching Logic: Online vs In-Store
    const isOnline = reward.type === 'online';
    const finalStatus = isOnline
      ? REDEMPTION_STATUS.REDEEMED
      : REDEMPTION_STATUS.CLAIMED;
    const availableMethods = [];

    if (isOnline) {
      if (reward?.onlineRedemptionMethods?.discountCode) {
        availableMethods?.push(REDEMPTION_METHOD.DISCOUNT_CODE);
      }
      if (reward?.onlineRedemptionMethods?.giftCard) {
        availableMethods?.push(REDEMPTION_METHOD.GIFT_CARD);
      }
    } else {
      if (reward?.inStoreRedemptionMethods?.nfcTap) {
        availableMethods?.push(REDEMPTION_METHOD.NFC);
      }
      if (reward?.inStoreRedemptionMethods?.qrCode) {
        availableMethods?.push(REDEMPTION_METHOD.QR_CODE);
      }
      if (reward?.inStoreRedemptionMethods?.staticCode) {
        availableMethods?.push(REDEMPTION_METHOD.STATIC_CODE);
      }
    }

    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 Days

    // 7. Create Redemption Ticket
    const [redemption] = await RewardRedemption.create(
      [
        {
          user: client._id,
          reward: rewardId,
          business: reward.business,
          pointsSpent: STATIC_POINTS_COST,
          status: finalStatus,
          assignedCode: availableCode.code,
          redeemedAt: isOnline ? new Date() : undefined,
          expiresAt: expiryDate,
        },
      ],
      { session }
    );

    // Link code back to the redemption record for audit
    availableCode.redemption = redemption._id as Types.ObjectId;
    await availableCode.save({ session });

    // 8. Deduct Points (Atomic)
    await pointsServices.deductPoints(
      client._id.toString(),
      STATIC_POINTS_COST,
      'reward_redemption',
      redemption._id?.toString() as string,
      `Points used for: ${reward.title}`,
      { rewardId: reward._id.toString() },
      session
    );

    // 9. If stock hit zero, mark as sold-out
    if (reward.remainingCount <= 0) {
      reward.status = 'sold-out';
      await reward.save({ session });
    }

    await session.commitTransaction();

    // ==========================================
    // POST-TRANSACTION (ASYNC ACTIONS)
    // ==========================================

    const userAuth = await Auth.findById(userId);
    const business = await Business.findById(reward.business);

    // A. Send Email for Online Rewards
    if (isOnline && userAuth) {
      sendRewardCodeEmail({
        email: userAuth.email,
        userName: client.name,
        rewardTitle: reward.title,
        code: availableCode.code,
        businessName: business?.name || 'Partner Business',
      }).catch((err) => console.error('Reward Email Failed:', err));
    }

    // B. Send In-App/Push Notification
    createNotification(
      userId,
      NOTIFICATION_TYPE.REWARD_CLAIMED,
      isOnline
        ? `Success! Your code for "${reward.title}" has been sent to your email.`
        : `Success! You've claimed "${reward.title}". View your code in the rewards section.`,
      redemption._id.toString(),
      { rewardId: reward._id, image: reward.image }
    ).catch((err) => console.error('Notification Failed:', err));

    return {
      redemption,
      code: availableCode.code,
      status: finalStatus,
      availableMethods,
      message: isOnline
        ? 'Reward sent to your email!'
        : REWARD_MESSAGES.CLAIMED,
    };
  } catch (error: any) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Cancel claimed reward and refund points
 */
const cancelClaimedReward = async (
  payload: ICancelClaimPayload
): Promise<IRewardRedemptionDocument> => {
  const { redemptionId, userId, reason } = payload;

  const isClientExists = await Client.findOne({ auth: userId });
  const userObjectId = isClientExists
    ? isClientExists._id
    : new Types.ObjectId(userId);

  const redemption = await RewardRedemption.findOne({
    _id: redemptionId,
    user: userObjectId,
    status: 'claimed',
    isHidden: { $ne: true }, // EXCLUDE HIDDEN
  }).populate('reward');

  if (!redemption) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.CLAIM_NOT_FOUND);
  }

  const hoursSinceClaim =
    (Date.now() - redemption.claimedAt.getTime()) / (1000 * 60 * 60);
  if (hoursSinceClaim > CANCELLATION_WINDOW_HOURS) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      REWARD_MESSAGES.CANCELLATION_EXPIRED
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Refund points
    const refundTransaction = await pointsServices.refundPoints(
      userId,
      redemption.pointsSpent,
      'reward_redemption',
      reason || 'Reward claim cancelled',
      redemptionId,
      undefined,
      session
    );

    // Update status
    redemption.status = 'cancelled';
    redemption.cancelledAt = new Date();
    redemption.cancellationReason = reason;
    redemption.refundTransactionId = refundTransaction.transaction
      ._id as Types.ObjectId;
    await redemption.save({ session });

    // Return stock and code
    const reward = await Reward.findById(redemption.reward).session(session);
    if (reward) {
      if (redemption.assignedCode) {
        await RewardCode.findOneAndUpdate(
          { code: redemption.assignedCode },
          {
            $set: {
              isUsed: false,
              usedBy: null,
              usedAt: null,
              redemption: null,
            },
          },
          { session }
        );
      }

      reward.remainingCount += 1;
      reward.redeemedCount = Math.max(0, reward.redeemedCount - 1);

      if (reward.status === 'sold-out') {
        reward.status = 'active';
      }

      await reward.save({ session });
    }

    await session.commitTransaction();
    return redemption;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Verify redemption by code or ID (Step 1: Scan/Input)
 */
const verifyRedemption = async (
  staffBusinessId: string,
  code?: string,
  redemptionId?: string
) => {
  const query: any = { status: 'claimed', isHidden: { $ne: true } };

  if (code) {
    query.assignedCode = code;
  } else if (redemptionId) {
    query._id = redemptionId;
  } else {
    throw new AppError(httpStatus.BAD_REQUEST, 'Provide code or redemptionId');
  }

  const redemption = await RewardRedemption.findOne(query).populate([
    'reward',
    'business',
    'user',
  ]);

  if (!redemption) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      REWARD_MESSAGES.REDEMPTION_NOT_FOUND
    );
  }

  if (redemption.business._id.toString() !== staffBusinessId) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'This reward does not belong to your business'
    );
  }

  if (new Date() > redemption.expiresAt) {
    throw new AppError(httpStatus.GONE, REWARD_MESSAGES.CLAIM_EXPIRED);
  }

  return {
    redemptionId: redemption._id,
    user: redemption.user,
    rewardName: (redemption.reward as any).title,
    status: redemption.status,
    assignedCode: redemption.assignedCode,
    availableMethods: redemption.availableRedemptionMethods,
    expiresAt: redemption.expiresAt,
  };
};

/**
 * Mark reward as redeemed (Step 2: Confirmation)
 */
const redeemRewardByCode = async (payload: {
  code: string;
  staffAuthId: string;
  method: RedemptionMethod;
}) => {
  const { code, staffAuthId, method } = payload;

  const business = await Business.findOne({ auth: staffAuthId });
  if (!business) {
    throw new AppError(httpStatus.NOT_FOUND, 'Business profile not found.');
  }

  const codeParts = code.split('-');
  if (codeParts.length < 2) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Invalid code format. Code must include prefix.'
    );
  }
  const prefix = codeParts[0];

  const reward = await Reward.findOne({ codePrefix: prefix });
  if (!reward) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'No reward found matching this code prefix.'
    );
  }

  if (reward.business.toString() !== business._id.toString()) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Permission Denied: This reward belongs to another business.'
    );
  }

  // Validate method
  if (reward.type === 'in-store') {
    const availableMethods = [];
    if (reward?.inStoreRedemptionMethods?.nfcTap) {
      availableMethods.push(REDEMPTION_METHOD.NFC);
    }
    if (reward?.inStoreRedemptionMethods?.qrCode) {
      availableMethods.push(REDEMPTION_METHOD.QR_CODE);
    }
    if (reward?.inStoreRedemptionMethods?.staticCode) {
      availableMethods.push(REDEMPTION_METHOD.STATIC_CODE);
    }
    if (!availableMethods?.includes(method)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Invalid redemption method "${method}". Allowed: ${availableMethods.join(
          ', '
        )}.`
      );
    }
  }

  // Find the claim - EXCLUDE HIDDEN
  const redemption = await RewardRedemption.findOne({
    assignedCode: code,
    reward: reward._id,
    business: business._id,
    status: REDEMPTION_STATUS.CLAIMED,
    isHidden: { $ne: true },
  }).populate<{ user: IClient }>('user', 'name auth');

  if (!redemption) {
    // Check if already redeemed
    const alreadyRedeemed = await RewardRedemption.findOne({
      assignedCode: code,
      status: REDEMPTION_STATUS.REDEEMED,
    });
    if (alreadyRedeemed) {
      throw new AppError(
        httpStatus.CONFLICT,
        'This code has already been redeemed.'
      );
    }

    // Check if hidden (reward was deleted)
    const hiddenRedemption = await RewardRedemption.findOne({
      assignedCode: code,
      isHidden: true,
    });
    if (hiddenRedemption) {
      throw new AppError(
        httpStatus.GONE,
        'This reward has been removed and can no longer be redeemed.'
      );
    }

    throw new AppError(
      httpStatus.NOT_FOUND,
      'No active claim found for this code. It may be expired or invalid.'
    );
  }

  if (new Date() > redemption.expiresAt) {
    redemption.status = 'expired';
    await redemption.save();
    throw new AppError(httpStatus.GONE, 'This reward claim has expired.');
  }

  // Mark as redeemed
  redemption.status = REDEMPTION_STATUS.REDEEMED;
  redemption.redeemedAt = new Date();
  redemption.redeemedByStaff = new Types.ObjectId(business._id);
  redemption.redemptionMethod = method;
  await redemption.save();

  // Update code inventory
  await RewardCode.findOneAndUpdate(
    { code: code },
    { $set: { isUsed: true, usedAt: new Date() } }
  );

  // Notify user
  createNotification(
    redemption.user.auth.toString(),
    NOTIFICATION_TYPE.REWARD_REDEEMED,
    `Your reward "${reward.title}" has been successfully redeemed at ${business.name}. Enjoy!`,
    redemption._id.toString()
  ).catch((err) => console.error('Redemption notification failed', err));

  return {
    success: true,
    rewardTitle: reward.title,
    userName: (redemption.user as any).name,
    redeemedAt: redemption.redeemedAt,
    status: redemption.status,
  };
};

/**
 * Get user's claimed rewards
 */
const getUserClaimedRewards = async (
  userId: string,
  query: Record<string, unknown>
) => {
  const serachableFields = ['assignedCode', 'status'];

  const baseQuery = new QueryBuilder(
    RewardRedemption.find({
      user: userId,
      isHidden: { $ne: true },
    }).populate<{ reward: any }>('reward'),
    query
  )
    .search(serachableFields)
    .filter()
    .sort()
    .paginate()
    .fields();

  const data = await baseQuery.modelQuery;
  const meta = await baseQuery.countTotal();

  const processedData = data?.map((item) => {
    return {
      redeemedId: item?._id,
      rewardId: item?.reward?._id,
      title: item.reward?.title,
      rewardImage: item.reward.image || null,
      category: item.reward?.category,
      type: item.reward?.type,
      description: item.reward?.description,
      status: item.status,
      isEmailSent: item.reward?.type === 'online',
      code: item?.assignedCode,
      redemptionMethod: item?.redemptionMethod,
      business: item?.redeemedByStaff,
      claimedAt: item.claimedAt,
      redeemedAt: item?.redeemedAt,
      expiredAt: item.expiredAt,
    };
  });

  return { data: processedData, meta };
};

/**
 * Get claimed reward by ID
 */
const getClaimedRewardById = async (
  redemptionId: string,
  userId: string
): Promise<IRewardRedemptionDocument> => {
  const redemption = await RewardRedemption.findOne({
    _id: redemptionId,
    user: userId,
    isHidden: { $ne: true },
  })
    .populate('reward', 'title description image type category pointsCost')
    .populate('business', 'name locations coverImage');

  if (!redemption) {
    throw new AppError(httpStatus.NOT_FOUND, REWARD_MESSAGES.CLAIM_NOT_FOUND);
  }
  return redemption;
};

/**
 * Expire old claims with full restoration
 */
const expireOldClaimsWithFullRestoration = async (): Promise<{
  totalProcessed: number;
  expiredCount: number;
  codesReturned: number;
  pointsRefunded: number;
  stockRestored: number;
  errors: Array<{ claimId: string; error: string }>;
}> => {
  const now = new Date();
  const result = {
    totalProcessed: 0,
    expiredCount: 0,
    codesReturned: 0,
    pointsRefunded: 0,
    stockRestored: 0,
    errors: [] as Array<{ claimId: string; error: string }>,
  };

  // Find expired claims - EXCLUDE HIDDEN
  const expiredClaims = await RewardRedemption.find({
    status: 'claimed',
    expiresAt: { $lte: now },
    isHidden: { $ne: true },
  });

  result.totalProcessed = expiredClaims.length;

  if (expiredClaims.length === 0) return result;

  for (const claim of expiredClaims) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      claim.status = 'expired';
      claim.expiredAt = now;
      await claim.save({ session });

      // Refund points
      try {
        const client = await Client.findById(claim.user);
        // const authUserId = client
        //   ? client.auth.toString()
        //   : claim.user.toString();

        const refundResult = await pointsServices.refundPoints(
          client!._id.toString(),
          claim.pointsSpent,
          'claim_expired',
          `Reward claim expired - automatic refund`,
          claim._id.toString(),
          undefined,
          session
        );

        if (refundResult && refundResult.transaction) {
          claim.refundTransactionId = refundResult.transaction
            ._id as Types.ObjectId;
          await claim.save({ session });
          result.pointsRefunded += claim.pointsSpent;
        }
      } catch (refundError) {
        console.error(
          `Failed to refund points for claim ${claim._id}:`,
          refundError
        );
      }

      // Return code and stock
      const reward = await Reward.findById(claim.reward).session(session);
      if (reward) {
        if (claim.assignedCode) {
          await RewardCode.findOneAndUpdate(
            { code: claim.assignedCode },
            {
              $set: {
                isUsed: false,
                usedBy: null,
                usedAt: null,
                redemption: null,
              },
            },
            { session }
          );
          result.codesReturned++;
        }

        reward.remainingCount += 1;
        reward.redeemedCount = Math.max(0, reward.redeemedCount - 1);
        if (reward.status === 'sold-out' && reward.remainingCount > 0) {
          reward.status = 'active';
        }
        await reward.save({ session });
        result.stockRestored++;
      }

      await session.commitTransaction();
      result.expiredCount++;
    } catch (error: any) {
      await session.abortTransaction();
      result.errors.push({
        claimId: claim._id.toString(),
        error: error.message,
      });
    } finally {
      session.endSession();
    }
  }

  return result;
};

/**
 * Get expiring claims
 */
const getExpiringClaims = async (hoursUntilExpiry = 24) => {
  const now = new Date();
  const expiryThreshold = new Date(
    now.getTime() + hoursUntilExpiry * 60 * 60 * 1000
  );
  return RewardRedemption.find({
    status: 'claimed',
    expiresAt: { $gt: now, $lte: expiryThreshold },
  }).populate('user name email reward title business name');
};

/**
 * Get user expiration summary
 */
const getUserExpirationSummary = async (userId: string) => {
  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [expiringIn24Hours, expiringIn7Days, totalActive] = await Promise.all([
    RewardRedemption.countDocuments({
      user: userId,
      status: 'claimed',
      expiresAt: { $gt: now, $lte: in24Hours },
    }),
    RewardRedemption.countDocuments({
      user: userId,
      status: 'claimed',
      expiresAt: { $gt: now, $lte: in7Days },
    }),
    RewardRedemption.countDocuments({
      user: userId,
      status: 'claimed',
      expiresAt: { $gt: now },
    }),
  ]);

  return { expiringIn24Hours, expiringIn7Days, totalActive };
};

export const rewardRedemptionService = {
  claimReward,
  cancelClaimedReward,
  verifyRedemption,
  redeemRewardByCode,
  getUserClaimedRewards,
  getClaimedRewardById,
  expireOldClaimsWithFullRestoration,
  getExpiringClaims,
  getUserExpirationSummary,
};
