import mongoose, { ClientSession, Types } from 'mongoose';
import { Payout } from './payout.model';
import {
  OrganizationBalance,
  BalanceTransaction,
} from '../Balance/balance.model';
import { AppError } from '../../utils';
import httpStatus from 'http-status';
import { PAYOUT_STATUS } from './payout.constant';

/**
 * Generate unique payout number (e.g., PO-20241201-RAND)
 */
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
    // 1. Check Organization Balance
    const balance = await OrganizationBalance.findOne({
      organization: organizationId,
    }).session(session);

    if (!balance || balance.availableBalance < amount) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Insufficient available balance for this payout request.'
      );
    }

    // 2. ✅ NO FEE DEDUCTION LOGIC HERE
    // Fees and GST were already deducted at the point of Donation Entry (Balance Service).
    // The 'availableBalance' consists purely of Net funds belonging to the Organization.
    // We transfer exactly what is requested.

    const platformFeeRate = 0;
    const platformFeeAmount = 0;
    const taxRate = 0;
    const taxAmount = 0;
    const netAmount = amount; // The amount requested is the amount sent

    // 3. Create Payout Record
    const payoutDate = scheduledDate ? new Date(scheduledDate) : new Date();

    const [payout] = await Payout.create(
      [
        {
          organization: organizationId,
          payoutNumber: generatePayoutNumber(),
          requestedAmount: amount,
          platformFeeRate,
          platformFeeAmount,
          taxRate,
          taxAmount,
          netAmount,
          scheduledDate: payoutDate,
          status: PAYOUT_STATUS.PENDING,
          requestedBy: userId,
        },
      ],
      { session }
    );

    // 4. Update Balance (Lock Funds: Available -> Reserved)
    balance.availableBalance -= amount;
    balance.reservedBalance += amount;
    await balance.save({ session });

    // 5. Create Ledger Entry
    await BalanceTransaction.create(
      [
        {
          organization: organizationId,
          type: 'debit', // Conceptually a debit from 'available', moved to 'reserved'
          category: 'payout_reserved',
          amount: amount,
          balanceAfter_pending: balance.pendingBalance,
          balanceAfter_available: balance.availableBalance, // Reduced
          balanceAfter_reserved: balance.reservedBalance, // Increased
          balanceAfter_total:
            balance.pendingBalance +
            balance.availableBalance +
            balance.reservedBalance,
          payout: payout._id,
          description: `Payout requested: ${payout.payoutNumber}`,
          processedBy: new Types.ObjectId(userId),
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
 * Cancel Payout (Admin or User)
 * Reverses the fund reservation.
 */
const cancelPayout = async (
  payoutId: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isAdmin = false
) => {
  const session: ClientSession = await mongoose.startSession();
  session.startTransaction();

  try {
    const payout = await Payout.findById(payoutId).session(session);
    if (!payout) throw new AppError(httpStatus.NOT_FOUND, 'Payout not found');

    if (
      payout.status === PAYOUT_STATUS.COMPLETED ||
      payout.status === PAYOUT_STATUS.PROCESSING ||
      payout.status === PAYOUT_STATUS.CANCELLED
    ) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Cannot cancel this payout');
    }

    // Identify Org
    const organizationId = payout.organization.toString();

    // 1. Update Payout Status
    payout.status = PAYOUT_STATUS.CANCELLED;
    await payout.save({ session });

    // 2. Return Funds (Reserved -> Available)
    const balance = await OrganizationBalance.findOne({
      organization: organizationId,
    }).session(session);

    if (balance) {
      balance.reservedBalance -= payout.requestedAmount;
      balance.availableBalance += payout.requestedAmount;
      await balance.save({ session });

      // 3. Ledger Entry
      await BalanceTransaction.create(
        [
          {
            organization: organizationId,
            type: 'credit', // Returning funds to available
            category: 'payout_cancelled',
            amount: payout.requestedAmount, // Return the gross amount reserved
            balanceAfter_pending: balance.pendingBalance,
            balanceAfter_available: balance.availableBalance,
            balanceAfter_reserved: balance.reservedBalance,
            balanceAfter_total:
              balance.pendingBalance +
              balance.availableBalance +
              balance.reservedBalance,
            payout: payout._id,
            description: `Payout cancelled: ${payout.payoutNumber}`,
            processedBy: new Types.ObjectId(userId),
          },
        ],
        { session }
      );
    }

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
 * Get All Payouts (for Org Dashboard)
 */
const getAllPayouts = async (
  organizationId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  query: Record<string, unknown>
) => {
  // Use QueryBuilder pattern here (simplified for brevity)
  const payouts = await Payout.find({ organization: organizationId })
    .sort({ createdAt: -1 })
    .populate('requestedBy', 'name email');
  return payouts;
};

export const PayoutService = {
  requestPayout,
  cancelPayout,
  getAllPayouts,
};
