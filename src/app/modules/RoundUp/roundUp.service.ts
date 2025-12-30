import { RoundUpModel } from './roundUp.model';

import { OrganizationModel } from '../Organization/organization.model';

import bankConnectionService from '../BankConnection/bankConnection.service';
import { roundUpTransactionService } from '../RoundUpTransaction/roundUpTransaction.service';

import { StatusCodes } from 'http-status-codes';
import Cause from '../Causes/causes.model';
import { CAUSE_STATUS_TYPE } from '../Causes/causes.constant';
import { AppError } from '../../utils';
import httpStatus from 'http-status';
import Auth from '../Auth/auth.model';
import PaymentMethod from '../PaymentMethod/paymentMethod.model';
import { AUTH_STATUS, ROLE } from '../Auth/auth.constant';
import { IBankConnection } from '../BankConnection/bankConnection.interface';
import { IPaymentMethod } from '../PaymentMethod/paymentMethod.interface';
import { IORGANIZATION } from '../Organization/organization.interface';
import { ICause } from '../Causes/causes.interface';
import { SubscriptionService } from '../Subscription/subscription.service';
import { StripeAccount } from '../OrganizationAccount/stripe-account.model';

const savePlaidConsent = async (
  userId: string,
  payload: Record<string, unknown>
) => {
  const {
    bankConnectionId,
    organizationId,
    causeId,
    monthlyThreshold,
    specialMessage,
    paymentMethodId,
    coverFees = false,
  } = payload as {
    bankConnectionId?: string;
    organizationId?: string;
    causeId?: string;
    monthlyThreshold?: number | 'no-limit';
    specialMessage?: string;
    paymentMethodId?: string;
    coverFees?: boolean;
  };

  const client = await Auth.findById(userId);

  if (!client) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const paymentMethod = await PaymentMethod.findById(paymentMethodId);

  if (!paymentMethod || paymentMethod.user.toString() !== userId) {
    throw new AppError(httpStatus.NOT_FOUND, 'Payment Method not found!');
  }

  if (!bankConnectionId) {
    return {
      success: false,
      message: 'Bank connection ID is required',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  const bankConnection = await bankConnectionService.getBankConnectionById(
    bankConnectionId
  );
  if (
    !bankConnection ||
    String(bankConnection.user as string) !== String(userId)
  ) {
    return {
      success: false,
      message: 'Bank connection not found',
      data: null,
      statusCode: StatusCodes.NOT_FOUND,
    };
  }

  const organization = await OrganizationModel.findById(organizationId);
  if (!organization) {
    return {
      success: false,
      message: 'Invalid organization selected',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  // check subscription status of organization
  await SubscriptionService.validateOrganizationAccess(
    organization?._id.toString()
  );

  // check is stripe account exists :
  const stripeAccount = await StripeAccount.findOne({
    organization: organization._id,
    status: 'active',
  });

  if (!stripeAccount || !stripeAccount.chargesEnabled) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This organization is not set up to receive payments (Stripe account inactive).'
    );
  }

  const cause = await Cause.findById(causeId);
  if (!cause) {
    return {
      success: false,
      message: 'Invalid cause selected',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  if (cause.organization.toString() !== organizationId) {
    return {
      success: false,
      message: 'Cause does not belong to the specified organization',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  if (cause.status !== CAUSE_STATUS_TYPE.VERIFIED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot create round-up for cause with status: ${cause.status}. Only verified causes can receive donations.`
    );
  }

  if (
    monthlyThreshold !== null &&
    monthlyThreshold !== undefined &&
    typeof monthlyThreshold === 'number' &&
    monthlyThreshold < 3
  ) {
    return {
      success: false,
      message:
        'Monthly threshold must be at least $3, "no-limit", or undefined',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  const existingRoundUp = await RoundUpModel.findOne({
    bankConnection: bankConnectionId,
    isActive: true,
  });

  if (existingRoundUp) {
    return {
      success: false,
      message: 'Round-up configuration already exists for this bank connection',
      data: existingRoundUp,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  const roundUpConfig = new RoundUpModel({
    user: userId,
    organization: organizationId,
    cause: causeId,
    bankConnection: bankConnectionId,
    paymentMethod: String(paymentMethod._id),
    monthlyThreshold: monthlyThreshold || undefined,
    coverFees,

    specialMessage: specialMessage || undefined,
    status: 'pending',
    isActive: true,
    enabled: true,
    totalAccumulated: 0,
    currentMonthTotal: 0,
    lastMonthReset: new Date(),
  });

  await roundUpConfig.save();

  return {
    success: true,
    message: 'Plaid consent saved and round-up configuration created',
    data: roundUpConfig,
    statusCode: StatusCodes.CREATED,
  };
};

const revokeConsent = async (userId: string, bankConnectionId: string) => {
  const bankConnection = await bankConnectionService.getBankConnectionById(
    bankConnectionId
  );
  if (!bankConnection || String(bankConnection.user) !== String(userId)) {
    return {
      success: false,
      message: 'Bank connection not found',
      data: null,
      statusCode: StatusCodes.NOT_FOUND,
    };
  }

  await RoundUpModel.updateMany(
    { bankConnection: bankConnectionId, isActive: true },
    {
      status: 'cancelled',
      isActive: false,
      enabled: false,
    }
  );

  await bankConnectionService.removeItem(bankConnection.itemId);

  return {
    success: true,
    message: 'Consent revoked and round-up deactivated',
    data: null,
    statusCode: StatusCodes.OK,
  };
};

const syncTransactions = async (
  userId: string,
  bankConnectionId: string,
  payload: { cursor?: string }
) => {
  const { cursor } = payload || {};

  const bankConnection = await bankConnectionService.getBankConnectionById(
    bankConnectionId
  );
  if (!bankConnection || String(bankConnection.user) !== String(userId)) {
    return {
      success: false,
      message: 'Bank connection not found',
      data: null,
      statusCode: StatusCodes.NOT_FOUND,
    };
  }

  const plaidSyncResponse = await bankConnectionService.syncTransactions(
    bankConnectionId,
    cursor
  );

  return {
    success: true,
    message:
      'Transactions synced successfully (RoundUp processing is automatic)',
    data: {
      plaidSync: plaidSyncResponse,
      hasMore: plaidSyncResponse.hasMore,
      nextCursor: plaidSyncResponse.nextCursor,
      note: 'RoundUp processing is handled automatically by background cron job every 4 hours',
    },
    statusCode: StatusCodes.OK,
  };
};

const resumeRoundUp = async (
  userId: string,
  payload: { roundUpId?: string }
) => {
  const { roundUpId } = payload;

  const roundUpConfig = await RoundUpModel.findOne({
    _id: roundUpId,
    user: userId,
    isActive: true,
  });

  if (!roundUpConfig) {
    return {
      success: false,
      message: 'Round-up configuration not found',
      data: null,
      statusCode: StatusCodes.NOT_FOUND,
    };
  }

  if (roundUpConfig.enabled) {
    return {
      success: false,
      message: 'Round-up is already active',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  if (roundUpConfig.status === 'cancelled') {
    return {
      success: false,
      message:
        'Cannot resume cancelled round-up. Please create a new round-up configuration.',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  roundUpConfig.enabled = true;
  if (roundUpConfig.status === 'failed') {
    roundUpConfig.status = 'pending';
  }
  await roundUpConfig.save();

  return {
    success: true,
    message: 'Round-up has been resumed successfully',
    data: {
      roundUpId: String(roundUpConfig._id),
      enabled: true,
    },
    statusCode: StatusCodes.OK,
  };
};

const switchCharity = async (
  userId: string,
  payload: {
    roundUpId?: string;
    newOrganizationId?: string;
    newCauseId?: string;
    reason?: string;
  }
) => {
  const { roundUpId, newOrganizationId, newCauseId } = payload;

  const roundUpConfig = await RoundUpModel.findOne({
    _id: roundUpId,
    user: userId,
  });

  if (!roundUpConfig) {
    return {
      success: false,
      message: 'Round-up configuration not found',
      data: null,
      statusCode: StatusCodes.NOT_FOUND,
    };
  }

  const newOrganization = await OrganizationModel.findById(newOrganizationId);
  if (!newOrganization) {
    return {
      success: false,
      message: 'Invalid organization selected',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  const newCause = await Cause.findById(newCauseId);
  if (!newCause) {
    return {
      success: false,
      message: 'Invalid cause selected',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  if (newCause.organization.toString() !== newOrganizationId) {
    return {
      success: false,
      message: 'Cause does not belong to the specified organization',
      data: null,
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  const canSwitch = (roundUpConfig as any).canSwitchCharity();
  if (!canSwitch) {
    const daysSinceSwitch = roundUpConfig.lastCharitySwitch
      ? Math.floor(
          (Date.now() - roundUpConfig.lastCharitySwitch.getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : Infinity;
    const daysUntilNextSwitch = 30 - daysSinceSwitch;

    return {
      success: false,
      message: `Cannot switch charity yet. Wait ${daysUntilNextSwitch} more days`,
      data: {
        canSwitch: false,
        daysUntilNextSwitch,
      },
      statusCode: StatusCodes.BAD_REQUEST,
    };
  }

  roundUpConfig.organization = newOrganizationId;
  roundUpConfig.cause = newCauseId || roundUpConfig.cause;
  roundUpConfig.lastCharitySwitch = new Date();
  await roundUpConfig.save();

  return {
    success: true,
    message: 'Charity switched successfully',
    data: {
      success: true,
      canSwitch: true,
      newOrganizationName: newOrganization.name,
      newCauseName: newCause.name,
    },
    statusCode: StatusCodes.OK,
  };
};

const getUserDashboard = async (userId: string) => {
  const roundUpConfig = await (RoundUpModel as any).findActiveByUserId(userId);

  if (!roundUpConfig) {
    return {
      success: true,
      message: 'No active round-up configuration',
      data: {
        hasRoundUp: false,
        config: null,
      },
      statusCode: StatusCodes.OK,
    };
  }

  const [bankConnection, organization, cause, transactionSummary] =
    await Promise.all([
      bankConnectionService.getBankConnectionById(roundUpConfig.bankConnection),
      OrganizationModel.findById(roundUpConfig.organization),
      Cause.findById(roundUpConfig.cause),
      roundUpTransactionService.getTransactionSummary(userId),
    ]);

  const userStats = {
    totalDonated: transactionSummary.totalStats.totalDonated,
    totalRoundUps: transactionSummary.totalStats.totalTransactions,
    monthsDonated: 0,
    currentMonthTotal: transactionSummary.currentMonthTotal,
    currentCharity: {
      name: `${organization?.name || 'Unknown'} - ${
        cause?.name || 'Selected Cause'
      }`,
      totalFromUser: transactionSummary.totalStats.totalDonated,
    },
  };

  return {
    success: true,
    message: 'User dashboard retrieved successfully',
    data: {
      hasRoundUp: true,
      config: roundUpConfig,
      stats: userStats,
      bankConnection,
      organization,
      cause,
    },
    statusCode: StatusCodes.OK,
  };
};

const getActiveRoundup = async (userId: string) => {
  const user = await Auth.findOne({
    _id: userId,
    isActive: true,
    status: AUTH_STATUS.VERIFIED,
    role: ROLE.CLIENT,
  });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!');
  }

  const roundupConfig = await RoundUpModel.findOne({
    isActive: true,
    enabled: true,
    status: {
      $in: ['pending', 'processing'],
    },
  })
    .populate<{ bankConnection: IBankConnection }>(
      'bankConnection',
      '_id accountId accountType institutionName isActive institutionId'
    )
    .populate<{ paymentMethod: IPaymentMethod }>(
      'paymentMethod',
      '_id stripePaymentMethodId cardBrand paymentMethod cardLast4 cardExpMonth cardExpYear'
    )
    .populate<{ organization: IORGANIZATION }>(
      'organization',
      'name registeredCharityName  logoImage coverImage'
    )
    .populate<{ cause: ICause }>('cause', 'name category status');

  if (!roundupConfig) {
    throw new AppError(httpStatus.NOT_FOUND, 'No Round Config exists');
  }

  return {
    // Base fields
    _id: roundupConfig._id,
    user: roundupConfig.user,
    coverFees: roundupConfig.coverFees,
    monthlyThreshold: roundupConfig.monthlyThreshold,
    specialMessage: roundupConfig.specialMessage,
    status: roundupConfig.status,
    isActive: roundupConfig.isActive,

    // Organization
    organizationId: roundupConfig.organization?._id,
    organizationName: roundupConfig.organization?.name,
    organizationLogo: roundupConfig.organization?.logoImage,
    organizationCover: roundupConfig.organization?.coverImage,
    registeredCharityName: roundupConfig.organization?.registeredCharityName,

    // Cause
    causeId: roundupConfig.cause?._id,
    causeName: roundupConfig.cause?.name,
    causeCategory: roundupConfig.cause?.category,
    causeStatus: roundupConfig.cause?.status,

    //  Bank
    bankConnectionId: (roundupConfig.bankConnection as any)?._id,
    bankAccountId: roundupConfig.bankConnection?.accountId,
    bankAccountType: roundupConfig.bankConnection?.accountType,
    institutionName: roundupConfig.bankConnection?.institutionName,
    institutionId: roundupConfig.bankConnection?.institutionId,
    bankIsActive: roundupConfig.bankConnection?.isActive,

    //  Payment
    paymentMethodId: (roundupConfig.paymentMethod as any)?._id,
    stripePaymentMethodId: roundupConfig.paymentMethod?.stripePaymentMethodId,
    cardBrand: roundupConfig.paymentMethod?.cardBrand,
    cardLast4: roundupConfig.paymentMethod?.cardLast4,
    cardExpMonth: roundupConfig.paymentMethod?.cardExpMonth,
    cardExpYear: roundupConfig.paymentMethod?.cardExpYear,
  };
};

const updateRoundUp = async (
  userId: string,
  roundUpId: string,
  payload: { monthlyThreshold?: number | 'no-limit'; specialMessage?: string }
) => {
  const roundUpConfig = await RoundUpModel.findOne({
    _id: roundUpId,
    user: userId,
    isActive: true,
  });

  if (!roundUpConfig) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'Round-up configuration not found'
    );
  }

  // 1. Update Threshold with Validation
  if (payload.monthlyThreshold !== undefined) {
    if (
      payload.monthlyThreshold !== 'no-limit' &&
      payload.monthlyThreshold < roundUpConfig.currentMonthTotal
    ) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `New threshold ($${
          payload.monthlyThreshold
        }) cannot be less than the current accumulated amount ($${roundUpConfig.currentMonthTotal.toFixed(
          2
        )})`
      );
    }
    roundUpConfig.monthlyThreshold = payload.monthlyThreshold;
  }

  // 2. Update Message
  if (payload.specialMessage !== undefined) {
    roundUpConfig.specialMessage = payload.specialMessage;
  }

  // 3. Replicate the logic of 'checkAndUpdateThresholdStatus' manually
  // This updates the status in the local object WITHOUT calling the model's .save()
  if (
    roundUpConfig.monthlyThreshold !== 'no-limit' &&
    typeof roundUpConfig.monthlyThreshold === 'number'
  ) {
    const isThresholdMet =
      roundUpConfig.currentMonthTotal >= roundUpConfig.monthlyThreshold;

    if (isThresholdMet && roundUpConfig.status === 'pending') {
      roundUpConfig.status = 'processing';
    }
  }

  // 4. Perform the ONLY save call
  // This persists the Threshold, Message, AND Status change at once.
  await roundUpConfig.save();

  return roundUpConfig;
};

const cancelRoundUp = async (
  userId: string,
  roundUpId: string,
  reason?: string
) => {
  const roundUpConfig = await RoundUpModel.findOne({
    _id: roundUpId,
    user: userId,
    isActive: true,
  });

  if (!roundUpConfig) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'Round-up configuration not found'
    );
  }

  await roundUpConfig.cancelRoundUp(reason || 'Cancelled by user');

  roundUpConfig.isActive = false;
  roundUpConfig.enabled = false;
  await roundUpConfig.save();

  return { success: true };
};

export const roundUpService = {
  savePlaidConsent,
  revokeConsent,
  syncTransactions,
  resumeRoundUp,
  switchCharity,
  getUserDashboard,
  updateRoundUp,
  cancelRoundUp,
  getActiveRoundup,
};
