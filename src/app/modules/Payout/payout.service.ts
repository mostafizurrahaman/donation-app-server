/* eslint-disable @typescript-eslint/no-unused-vars */
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
  console.log({
    organizationId,
    userId,
    amount,
    scheduledDate,
  });

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
    console.log({
      balance,
    });

    // ---------------------------------------------------------
    // 2. UPDATE BALANCE WITH PROPORTIONAL REDUCTION
    // ---------------------------------------------------------

    // Calculate the ratio of the payout vs total available funds
    // e.g., if Available is $100 and payout is $50, ratio is 0.5 (50%)
    const ratio =
      balance.availableBalance > 0 ? amount / balance.availableBalance : 0;

    console.log({
      ratio,
    });

    // A. Update Global Totals
    balance.availableBalance = Number(
      (balance.availableBalance - amount).toFixed(2)
    );
    balance.reservedBalance = Number(
      (balance.reservedBalance + amount).toFixed(2)
    );

    // B. Reduce breakdown fields proportionally
    // This ensures the UI filter tabs (One-time, Recurring, etc.) decrease logically
    const reduceOneTime = Number(
      (balance.availableByType_oneTime * ratio).toFixed(2)
    );
    const reduceRecurring = Number(
      (balance.availableByType_recurring * ratio).toFixed(2)
    );
    const reduceRoundUp = Number(
      (balance.availableByType_roundUp * ratio).toFixed(2)
    );

    balance.availableByType_oneTime = Number(
      (balance.availableByType_oneTime - reduceOneTime).toFixed(2)
    );
    balance.availableByType_recurring = Number(
      (balance.availableByType_recurring - reduceRecurring).toFixed(2)
    );
    balance.availableByType_roundUp = Number(
      (balance.availableByType_roundUp - reduceRoundUp).toFixed(2)
    );

    // Safety check to prevent negative values due to floating point rounding errors
    if (balance.availableByType_oneTime < 0)
      balance.availableByType_oneTime = 0;
    if (balance.availableByType_recurring < 0)
      balance.availableByType_recurring = 0;
    if (balance.availableByType_roundUp < 0)
      balance.availableByType_roundUp = 0;

    console.log({
      balance,
    });
    await balance.save({ session });

    // ---------------------------------------------------------
    // 3. CREATE PAYOUT RECORD
    // ---------------------------------------------------------

    const platformFeeRate = 0;
    const platformFeeAmount = 0;
    const taxRate = 0;
    const taxAmount = 0;
    const netAmount = amount; // The amount requested is the amount sent

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

    // ---------------------------------------------------------
    // 4. CREATE LEDGER ENTRY
    // ---------------------------------------------------------
    await BalanceTransaction.create(
      [
        {
          organization: organizationId,
          type: 'debit', // Conceptually a debit from 'available', moved to 'reserved'
          category: 'payout_reserved',
          amount: amount,

          // Store snapshot of new balances
          balanceAfter_pending: balance.pendingBalance,
          balanceAfter_available: balance.availableBalance,
          balanceAfter_reserved: balance.reservedBalance,
          balanceAfter_total: Number(
            (
              balance.pendingBalance +
              balance.availableBalance +
              balance.reservedBalance
            ).toFixed(2)
          ),

          payout: payout._id,
          description: `Payout requested: ${payout.payoutNumber}`,
          processedBy: new Types.ObjectId(userId),

          // Optional: Store metadata about how much was taken from each type
          metadata: {
            reducedOneTime: reduceOneTime,
            reducedRecurring: reduceRecurring,
            reducedRoundUp: reduceRoundUp,
          },
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
/**
 * Cancel Payout (Admin or User)
 * Reverses the fund reservation.
 */
const cancelPayout = async (
  payoutId: string,
  userId: string,
  _isAdmin = false // Fixed: Prefix with _ to ignore unused variable
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

    console.log({
      balance,
    });
    if (balance) {
      // A. Restore Global Totals
      balance.reservedBalance = Number(
        (balance.reservedBalance - payout.requestedAmount).toFixed(2)
      );
      balance.availableBalance = Number(
        (balance.availableBalance + payout.requestedAmount).toFixed(2)
      );

      // B. Retrieve the original debit transaction to find exact deductions
      const originalDebitTx = await BalanceTransaction.findOne({
        payout: payout._id,
        category: 'payout_reserved',
        type: 'debit',
      }).session(session);

      // C. Restore Breakdown Types
      // Fixed: Type assertion to tell TS these are numbers
      const metadata = originalDebitTx?.metadata as
        | {
            reducedOneTime?: number;
            reducedRecurring?: number;
            reducedRoundUp?: number;
          }
        | undefined;

      if (metadata && metadata.reducedOneTime !== undefined) {
        // PRECISION RESTORATION: Use the exact amounts we took earlier
        const reducedOneTime = metadata.reducedOneTime || 0;
        const reducedRecurring = metadata.reducedRecurring || 0;
        const reducedRoundUp = metadata.reducedRoundUp || 0;

        balance.availableByType_oneTime = Number(
          (balance.availableByType_oneTime + reducedOneTime).toFixed(2)
        );
        balance.availableByType_recurring = Number(
          (balance.availableByType_recurring + reducedRecurring).toFixed(2)
        );
        balance.availableByType_roundUp = Number(
          (balance.availableByType_roundUp + reducedRoundUp).toFixed(2)
        );
      } else {
        // FALLBACK: If no metadata exists (legacy data), put everything into 'oneTime'
        balance.availableByType_oneTime = Number(
          (balance.availableByType_oneTime + payout.requestedAmount).toFixed(2)
        );
      }

      console.log({
        balance,
      });
      await balance.save({ session });

      // 3. Ledger Entry
      await BalanceTransaction.create(
        [
          {
            organization: organizationId,
            type: 'credit', // Returning funds to available
            category: 'payout_cancelled',
            amount: payout.requestedAmount, // Return the gross amount reserved

            // Snapshot of new state
            balanceAfter_pending: balance.pendingBalance,
            balanceAfter_available: balance.availableBalance,
            balanceAfter_reserved: balance.reservedBalance,
            balanceAfter_total: Number(
              (
                balance.pendingBalance +
                balance.availableBalance +
                balance.reservedBalance
              ).toFixed(2)
            ),

            payout: payout._id,
            description: `Payout cancelled: ${payout.payoutNumber}`,
            processedBy: new Types.ObjectId(userId),

            // Track what we restored for debugging
            metadata: {
              restoredOneTime: metadata?.reducedOneTime || 0,
              restoredRecurring: metadata?.reducedRecurring || 0,
              restoredRoundUp: metadata?.reducedRoundUp || 0,
            },
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
