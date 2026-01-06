/* eslint-disable @typescript-eslint/no-unused-vars */
import mongoose, { ClientSession, Types } from 'mongoose';
import { Payout } from './payout.model';
import { BalanceTransaction } from '../Balance/balance.model';
import { AppError } from '../../utils';
import httpStatus from 'http-status';
import { PAYOUT_STATUS } from './payout.constant';
import QueryBuilder from '../../builders/QueryBuilder';
import { StripeService } from '../Stripe/stripe.service';
import Organization from '../Organization/organization.model';
import { STRIPE_ACCOUNT_STATUS } from '../Organization/organization.constants';
import { StripeAccount } from '../OrganizationAccount/stripe-account.model';

const generatePayoutNumber = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `PO-${date}-${random}`;
};

/**
 * Request a Payout (Organization)
 */
const requestPayout = async (
  organizationId: string,
  userId: string,
  amount: number,
  scheduledDate?: Date
) => {
  const session: ClientSession = await mongoose.startSession();
  session.startTransaction();

  try {
    const organization = await Organization.findById(organizationId).session(
      session
    );
    if (!organization) {
      throw new AppError(httpStatus.NOT_FOUND, 'Organization not found');
    }

    // 1. Find Stripe Account
    const stripeAccount = await StripeAccount.findOne({
      organization: organizationId,
      status: 'active',
    }).session(session);

    if (!stripeAccount || !stripeAccount.payoutsEnabled) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Organization payouts are disabled or Stripe account is not fully connected.'
      );
    }

    // 2. Check Stripe Balance using the correct Account ID
    const stripeBalance = await StripeService.getAccountBalance(
      stripeAccount.stripeAccountId
    );

    if (stripeBalance.available < amount) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Insufficient funds. Available: $${stripeBalance.available}`
      );
    }

    // 3. Create Payout Record
    const payoutDate = scheduledDate ? new Date(scheduledDate) : new Date();

    const [payout] = await Payout.create(
      [
        {
          organization: organizationId,
          payoutNumber: generatePayoutNumber(),
          requestedAmount: amount,
          netAmount: amount,
          scheduledDate: payoutDate,
          status: PAYOUT_STATUS.PENDING,
          requestedBy: userId,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    return payout;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Cancel Payout
 */
const cancelPayout = async (payoutId: string, userId: string) => {
  const payout = await Payout.findById(payoutId);
  if (!payout) throw new AppError(httpStatus.NOT_FOUND, 'Payout not found');

  if (payout.status !== PAYOUT_STATUS.PENDING) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Can only cancel pending payouts'
    );
  }

  payout.status = PAYOUT_STATUS.CANCELLED;
  await payout.save();

  return payout;
};

const getAllPayouts = async (
  organizationId: string,
  query: Record<string, unknown>
) => {
  const payoutQuery = Payout.find({ organization: organizationId }).populate(
    'organization',
    'name'
  );

  const payoutBuilder = new QueryBuilder(payoutQuery, query)
    .search(['payoutNumber'])
    .filter()
    .sort()
    .paginate()
    .fields();

  const payouts = await payoutBuilder.modelQuery.populate(
    'requestedBy',
    'name email'
  );
  const meta = await payoutBuilder.countTotal();

  return { meta, data: payouts };
};

const getOrganizationNextPayoutDate = async (userId: string) => {
  const organization = await Organization.findOne({ auth: userId });
  if (!organization)
    throw new AppError(httpStatus.NOT_FOUND, 'Organization not found');

  const now = new Date();
  const nextPayout = await Payout.findOne({
    organization: organization._id,
    scheduledDate: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) },
    status: { $in: [PAYOUT_STATUS.PENDING, PAYOUT_STATUS.PROCESSING] },
  }).sort({ scheduledDate: -1 });

  return nextPayout ? nextPayout.scheduledDate : null;
};

export const PayoutService = {
  requestPayout,
  cancelPayout,
  getAllPayouts,
  getOrganizationNextPayoutDate,
};
