/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
import { Response } from 'express';
import { Stripe } from 'stripe';
import { sendResponse, AppError } from '../../utils';
import httpStatus from 'http-status';
import { Donation } from './donation.model';
import { StripeService } from '../Stripe/stripe.service';
import { ExtendedRequest } from '../../types';
import mongoose, { Types } from 'mongoose';
import { ScheduledDonation } from '../ScheduledDonation/scheduledDonation.model';
import { RoundUpModel } from '../RoundUp/roundUp.model';
import { RoundUpTransactionModel } from '../RoundUpTransaction/roundUpTransaction.model';
import { receiptServices } from './../Receipt/receipt.service';
import { Receipt } from '../Receipt/receipt.model';
import { pointsServices } from '../Points/points.service';
import { badgeService } from '../badge/badge.service';
import { BalanceService } from '../Balance/balance.service';
import { PAYOUT_STATUS } from '../Payout/payout.constant';
import { Payout } from '../Payout/payout.model';
import { BalanceTransaction } from '../Balance/balance.model';
import { STRIPE_ACCOUNT_STATUS } from '../Organization/organization.constants';
import { TOrganizationAccountStatusType } from '../Organization/organization.interface';
import Organization from '../Organization/organization.model';
import { calculateNextDonationDate } from '../ScheduledDonation/scheduledDonation.service';


// ========================================
// SCHEDULED DONATION: Success Handler
// ========================================
const updateScheduledDonationAfterSuccess = async (
  scheduledDonationId: string
) => {
  try {
    console.log(`🔄 Updating scheduled donation: ${scheduledDonationId}`);

    const scheduledDonation = await ScheduledDonation.findById(
      scheduledDonationId
    );

    if (!scheduledDonation) {
      console.error(`❌ Scheduled donation not found: ${scheduledDonationId}`);
      return;
    }

    const now = new Date();
    const nextDate = calculateNextDonationDate(
      now,
      scheduledDonation.frequency,
      scheduledDonation.customInterval
    );

    await ScheduledDonation.findByIdAndUpdate(scheduledDonationId, {
      $set: {
        lastExecutedDate: now,
        nextDonationDate: nextDate,
        status: 'active',
      },
      $inc: {
        totalExecutions: 1,
      },
    });

    console.log(`✅ Scheduled donation updated successfully`);
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`❌ Error updating scheduled donation:`, err.message);

    // Unlock on error
    await ScheduledDonation.findByIdAndUpdate(scheduledDonationId, {
      status: 'active',
    });
  }
};

// ========================================
// SCHEDULED DONATION: Failure Handler
// ========================================
const updateScheduledDonationAfterFailure = async (
  scheduledDonationId: string,
  errorMessage?: string
) => {
  try {
    console.log(
      `❌ Updating scheduled donation after failure: ${scheduledDonationId}`
    );

    await ScheduledDonation.findOneAndUpdate(
      {
        _id: scheduledDonationId,
        status: 'processing',
      },
      {
        $set: {
          status: 'active',
        },
      }
    );

    console.log(
      `🔓 Unlocked scheduled donation ${scheduledDonationId} after failure: ${
        errorMessage || 'Unknown error'
      }`
    );
  } catch (error: unknown) {
    const err = error as Error;
    console.error(
      `❌ Error unlocking scheduled donation: ${err.message}`,
      err.stack
    );
  }
};

// ========================================
// RECEIPT: Generate After Payment
// ========================================
const generateReceiptAfterPayment = async (
  donation: any,
  paymentIntent: Stripe.PaymentIntent
) => {
  try {
    console.log(`📄 Generating receipt for donation: ${donation._id}`);

    const existingReceipt = await Receipt.findOne({
      donation: donation._id,
    });

    if (existingReceipt) {
      console.log(`📄 Receipt already exists for donation: ${donation._id}`);
      return existingReceipt;
    }

    const receiptPayload = {
      donationId: donation._id,
      donorId: donation.donor._id || donation.donor,
      organizationId: donation.organization._id || donation.organization,
      causeId: donation.cause?._id || donation.cause,

      // Financial Breakdown
      amount: donation.amount,
      coverFees: donation.coverFees,
      platformFee: donation.platformFee,
      gstOnFee: donation.gstOnFee,
      stripeFee: donation.stripeFee || 0,
      totalAmount: donation.totalAmount,

      currency: donation.currency || paymentIntent.currency.toUpperCase(),
      donationType: donation.donationType || 'one-time',
      donationDate: new Date(),
      paymentMethod: 'Stripe',
      specialMessage: donation.specialMessage,
    };

    const receipt = await receiptServices.generateReceipt(receiptPayload);

    console.log(`✅ Receipt generated successfully: ${receipt.receiptNumber}`);
    return receipt;
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`❌ Error generating receipt: ${err.message}`);
  }
};

// ========================================
// ROUND-UP: Success Handler
// ========================================
const handleRoundUpDonationSuccess = async (
  roundUpId: string,
  paymentIntentId: string
) => {
  try {
    const roundUpConfig = await RoundUpModel.findById(roundUpId);
    if (!roundUpConfig) {
      console.error(`❌ RoundUp configuration not found: ${roundUpId}`);
      return;
    }

    const donation = await Donation.findOne({
      stripePaymentIntentId: paymentIntentId,
      donationType: 'round-up',
    });

    if (!donation) {
      console.error(`❌ Donation record not found: ${paymentIntentId}`);
      return;
    }

    const processingTransactions = await RoundUpTransactionModel.find({
      stripePaymentIntentId: paymentIntentId,
      status: 'processed',
    });

    if (processingTransactions.length > 0) {
      await RoundUpTransactionModel.updateMany(
        {
          stripePaymentIntentId: paymentIntentId,
          status: 'processed',
        },
        {
          status: 'donated',
          donatedAt: new Date(),
          stripeChargeId: paymentIntentId,
        }
      );
    }

    donation.status = 'completed';
    donation.donationDate = new Date();
    donation.roundUpTransactionIds = processingTransactions.map(
      (t) => t._id
    ) as Types.ObjectId[];
    await donation.save();

    await roundUpConfig.completeDonationCycle();
    console.log(`✅ RoundUp donation completed successfully`);
    return { success: true, roundUpId, donationId: donation._id };
  } catch (error: unknown) {
    console.error(
      `❌ Error handling RoundUp donation success: ${(error as Error).message}`
    );
  }
};

// ========================================
// ROUND-UP: Failure Handler
// ========================================
const handleRoundUpDonationFailure = async (
  roundUpId: string,
  paymentIntentId: string,
  errorMessage?: string
) => {
  try {
    const roundUpConfig = await RoundUpModel.findById(roundUpId);
    if (!roundUpConfig) {
      console.error(`❌ RoundUp configuration not found: ${roundUpId}`);
      return;
    }

    const processingTransactions = await RoundUpTransactionModel.find({
      user: roundUpConfig.user,
      bankConnection: roundUpConfig.bankConnection,
      status: 'processed',
      stripePaymentIntentId: paymentIntentId,
    });

    const restoredAmount = processingTransactions.reduce(
      (sum, transaction) => sum + transaction.roundUpAmount,
      0
    );

    await RoundUpTransactionModel.updateMany(
      {
        user: roundUpConfig.user,
        bankConnection: roundUpConfig.bankConnection,
        status: 'processed',
        stripePaymentIntentId: paymentIntentId,
      },
      {
        status: 'processed',
        stripePaymentIntentId: undefined,
        donationAttemptedAt: undefined,
        lastPaymentFailure: new Date(),
        lastPaymentFailureReason: errorMessage || 'Unknown error',
      }
    );

    roundUpConfig.status = 'pending';
    roundUpConfig.lastDonationAttempt = new Date();
    roundUpConfig.lastDonationFailure = new Date();
    roundUpConfig.lastDonationFailureReason = errorMessage || 'Unknown error';
    roundUpConfig.currentMonthTotal =
      (roundUpConfig.currentMonthTotal || 0) + restoredAmount;
    await roundUpConfig.save();

    console.log(`❌ RoundUp donation failed, rollback completed`);
  } catch (error: unknown) {
    console.error(
      `❌ Error handling RoundUp donation failure: ${(error as Error).message}`
    );
  }
};

// ========================================
// PAYMENT INTENT: Succeeded Handler
// ========================================
const handlePaymentIntentSucceeded = async (
  paymentIntent: Stripe.PaymentIntent
) => {
  const { metadata } = paymentIntent;
  console.log({ metadata });
  console.log(`\n🎉 ========================================`);
  console.log(`   WEBHOOK: payment_intent.succeeded`);
  console.log(`   Payment Intent ID: ${paymentIntent.id}`);
  console.log(`========================================\n`);

  try {
    // Try to find donation by payment intent ID
    let donation = await Donation.findOneAndUpdate(
      {
        stripePaymentIntentId: paymentIntent.id,
        status: { $in: ['pending', 'processing'] },
      },
      {
        status: 'completed',
        stripeChargeId: paymentIntent.latest_charge as string,
      },
      { new: true }
    )
      .populate('donor')
      .populate('organization')
      .populate('cause');

    // Fallback: Try to find by metadata donation ID
    if (!donation && metadata?.donationId) {
      donation = await Donation.findOneAndUpdate(
        {
          _id: new Types.ObjectId(metadata.donationId),
          status: { $in: ['pending', 'processing'] },
        },
        {
          status: 'completed',
          stripePaymentIntentId: paymentIntent.id,
          stripeChargeId: paymentIntent.latest_charge as string,
        },
        { new: true }
      )
        .populate('donor')
        .populate('organization')
        .populate('cause');
    }

    if (!donation) {
      console.error('❌ Donation not found for payment_intent.succeeded');
      return;
    }

    // Update points earned
    donation.pointsEarned = Math.floor(donation.amount * 100);
    await donation.save();

    console.log(`✅ Payment succeeded for donation: ${donation._id}`);

    // ========================================
    // POST-PAYMENT PROCESSING
    // ========================================

    // 1. Log funds to history ledger (History Only - No Local Balance Update)
    try {
      const orgId =
        (donation.organization as any)._id?.toString() ||
        donation.organization.toString();

      await BalanceService.logDonationTransaction(
        orgId,
        donation?._id?.toString() as string,
        donation?.donationType
      );
      console.log(`✅ Donation transaction logged for Org: ${orgId}`);
    } catch (err: any) {
      console.error(`❌ Failed to log transaction:`, err.message);
    }

    // ========================================
    // DONATION TYPE SPECIFIC HANDLING
    // ========================================

    // Handle RoundUp donation success
    if (metadata?.donationType === 'roundup' && metadata?.roundUpId) {
      try {
        console.log(`🔄 Processing RoundUp donation success...`);
        await handleRoundUpDonationSuccess(
          metadata.roundUpId,
          paymentIntent.id
        );
      } catch (err) {
        console.error(`❌ Round-Up handling failed:`, err);
      }
    }

    // Handle Scheduled donation success
    if (
      donation?.donationType === 'recurring' &&
      donation?.scheduledDonationId
    ) {
      try {
        console.log(`🔄 Processing Scheduled donation success...`);
        await updateScheduledDonationAfterSuccess(
          donation.scheduledDonationId?.toString()
        );
      } catch (err) {
        console.error(`❌ Failed to update scheduled donation:`, err);
      }
    }

    // 2. Generate receipt
    try {
      await generateReceiptAfterPayment(donation, paymentIntent);
    } catch (err) {
      console.error(`❌ Receipt generation failed:`, err);
    }

    // 3. Award points
    try {
      await pointsServices.awardPointsForDonation(
        donation.donor._id.toString(),
        donation._id!.toString(),
        donation.amount
      );
      console.log(`✅ Points awarded to donor`);
    } catch (err) {
      console.error(`❌ Points awarding failed:`, err);
    }

    // 4. Check and update badges
    try {
      console.log(`🏅 Checking badges...`);
      await badgeService.checkAndUpdateBadgesForDonation(
        donation.donor._id?.toString(),
        donation._id?.toString() as string
      );
      console.log(`✅ Badges checked and updated`);
    } catch (err) {
      console.error(`❌ Badge checking failed:`, err);
    }

    console.log(`\n✅ Payment processing completed successfully\n`);
  } catch (error) {
    console.error(
      `❌ Critical error in payment_intent.succeeded handler:`,
      error
    );
  }
};

// ========================================
// PAYMENT INTENT: Failed Handler
// ========================================
const handlePaymentIntentFailed = async (
  paymentIntent: Stripe.PaymentIntent
) => {
  const { metadata } = paymentIntent;

  console.log(`\n❌ ========================================`);
  console.log(`   WEBHOOK: payment_intent.payment_failed`);
  console.log(`   Payment Intent ID: ${paymentIntent.id}`);
  console.log(
    `   Error: ${paymentIntent.last_payment_error?.message || 'Unknown'}`
  );
  console.log(`========================================\n`);

  try {
    const donation = await Donation.findOneAndUpdate(
      {
        stripePaymentIntentId: paymentIntent.id,
        status: { $in: ['pending', 'processing'] },
      },
      {
        status: 'failed',
        $inc: { paymentAttempts: 1 },
        lastPaymentAttempt: new Date(),
      },
      { new: true }
    );

    // Fallback: Try to find by metadata donation ID
    if (!donation && metadata?.donationId) {
      const fallbackUpdate = await Donation.findOneAndUpdate(
        {
          _id: new Types.ObjectId(metadata.donationId),
          status: { $in: ['pending', 'processing'] },
        },
        {
          status: 'failed',
          stripePaymentIntentId: paymentIntent.id,
          $inc: { paymentAttempts: 1 },
          lastPaymentAttempt: new Date(),
        },
        { new: true }
      );

      // Handle RoundUp failure
      if (
        fallbackUpdate &&
        metadata?.donationType === 'roundup' &&
        metadata?.roundUpId
      ) {
        await handleRoundUpDonationFailure(
          metadata.roundUpId,
          paymentIntent.id,
          paymentIntent.last_payment_error?.message
        );
      }

      // ✅ Handle scheduled donation failure
      if (
        fallbackUpdate &&
        metadata?.donationType === 'recurring' &&
        metadata?.scheduledDonationId
      ) {
        await updateScheduledDonationAfterFailure(
          metadata.scheduledDonationId,
          paymentIntent.last_payment_error?.message
        );
      }

      return;
    }

    // Handle RoundUp failure
    if (
      donation &&
      metadata?.donationType === 'roundup' &&
      metadata?.roundUpId
    ) {
      await handleRoundUpDonationFailure(
        metadata.roundUpId,
        paymentIntent.id,
        paymentIntent.last_payment_error?.message
      );
    }

    // ✅ Handle scheduled donation failure
    if (
      donation &&
      donation?.donationType === 'recurring' &&
      donation?.scheduledDonationId
    ) {
      await updateScheduledDonationAfterFailure(
        donation.scheduledDonationId?.toString(),
        paymentIntent.last_payment_error?.message
      );
    }

    console.log(`✅ Payment failure processed`);
  } catch (error) {
    console.error(`❌ Failed to update donation for payment intent:`, error);
  }
};

// ========================================
// PAYMENT INTENT: Canceled Handler
// ========================================
const handlePaymentIntentCanceled = async (
  paymentIntent: Stripe.PaymentIntent
) => {
  const { metadata } = paymentIntent;

  console.log({ metadata });
  console.log(`\n🚫 ========================================`);
  console.log(`   WEBHOOK: payment_intent.canceled`);
  console.log(`   Payment Intent ID: ${paymentIntent.id}`);
  console.log(`========================================\n`);

  try {
    const donation = await Donation.findOneAndUpdate(
      {
        stripePaymentIntentId: paymentIntent.id,
        status: { $in: ['pending', 'processing'] },
      },
      {
        status: 'canceled',
        $inc: { paymentAttempts: 1 },
        lastPaymentAttempt: new Date(),
      }
    );

    if (!donation && metadata?.donationId) {
      await Donation.findOneAndUpdate(
        { _id: new Types.ObjectId(metadata.donationId) },
        { status: 'canceled', stripePaymentIntentId: paymentIntent.id }
      );
    }

    // Unlock scheduled donation if canceled
    if (
      donation?.donationType === 'recurring' &&
      donation?.scheduledDonationId
    ) {
      await updateScheduledDonationAfterFailure(
        metadata.scheduledDonationId,
        'Payment canceled by user or system'
      );
    }

    console.log(`✅ Payment cancellation processed`);
  } catch (error) {
    console.error(`❌ Failed to update donation for canceled intent:`, error);
  }
};

// ========================================
// CHARGE: Refunded Handler
// ========================================
const handleChargeRefunded = async (charge: Stripe.Charge) => {
  const paymentIntentId = charge.payment_intent as string;

  console.log(`\n💸 WEBHOOK: charge.refunded - ID: ${paymentIntentId}`);

  if (!paymentIntentId) return;

  try {
    // 1. Find and update Donation
    const donation = await Donation.findOneAndUpdate(
      {
        stripePaymentIntentId: paymentIntentId,
        status: { $in: ['completed', 'refunding'] },
      },
      { status: 'refunded' },
      { new: true }
    );

    if (donation) {
      try {
        const orgId =
          (donation.organization as any)._id?.toString() ||
          donation.organization.toString();

        await BalanceService.logRefundTransaction(
          orgId,
          donation._id!.toString()
        );
        console.log(`✅ Refund logged for Org: ${orgId}`);
      } catch (err: any) {
        console.error(`❌ Failed to log refund:`, err.message);
      }
    } else {
      console.warn(
        `⚠️ Donation not found or not eligible for refund via webhook (PI: ${paymentIntentId})`
      );
    }

    console.log(`✅ Donation status updated to REFUNDED.`);
  } catch (error) {
    console.error(`❌ Failed to update donation status to refunded:`, error);
  }
};

// ========================================
// PAYOUT: Paid Handler (Success Confirmation)
// ========================================
const handlePayoutPaid = async (payoutEvent: Stripe.Payout) => {
  console.log(`\n💸 WEBHOOK: payout.paid - ID: ${payoutEvent.id}`);

  try {
    // 1. Find Payout by the ID stored during the Cron Job execution
    const payout = await Payout.findOne({ stripePayoutId: payoutEvent.id });

    if (!payout) {
      console.warn(`⚠️ Payout not found for Stripe ID: ${payoutEvent.id}`);
      return;
    }

    // 2. Ensure status is COMPLETED
    if (payout.status !== PAYOUT_STATUS.COMPLETED) {
      payout.status = PAYOUT_STATUS.COMPLETED;
      payout.completedAt = new Date(); // Update with actual webhook time
      await payout.save();
      console.log(
        `✅ Payout ${payout.payoutNumber} confirmed as COMPLETED via Webhook.`
      );
    } else {
      console.log(
        `ℹ️ Payout ${payout.payoutNumber} was already marked COMPLETED.`
      );
    }
  } catch (error) {
    console.error(`❌ Error handling payout.paid:`, error);
  }
};

// ========================================
// PAYOUT: Failed Handler (Status Update Logic Only)
// ========================================
const handlePayoutFailed = async (payoutEvent: Stripe.Payout) => {
  console.log(`\n❌ WEBHOOK: payout.failed - ID: ${payoutEvent.id}`);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const payout = await Payout.findOne({
      stripePayoutId: payoutEvent.id,
    }).session(session);

    if (!payout) {
      console.warn(`⚠️ Payout not found for Stripe ID: ${payoutEvent.id}`);
      await session.abortTransaction();
      return;
    }

    // 1. Mark Payout as FAILED
    payout.status = PAYOUT_STATUS.FAILED;
    payout.failureReason =
      payoutEvent.failure_code ||
      payoutEvent.failure_message ||
      'Bank transfer failed';
    await payout.save({ session });

    // 2. Ledger Entry (Log only - no balance restoration needed as Stripe handles the money return)
    await BalanceTransaction.create(
      [
        {
          organization: payout.organization,
          type: 'credit', // Log as credit to indicate money returned conceptually
          category: 'payout_failed',
          amount: payout.netAmount,
          payout: payout._id,
          description: `Payout Failed: ${payout.payoutNumber} - Stripe balance reversed automatically`,
          metadata: {
            stripePayoutId: payoutEvent.id,
            reason: payout.failureReason,
            originalAmount: payout.requestedAmount,
          },
          idempotencyKey: `pay_fail_${payout._id}_${Date.now()}`,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    console.log(
      `✅ Payout ${payout.payoutNumber} marked FAILED. Transaction logged.`
    );
  } catch (error) {
    await session.abortTransaction();
    console.error(`❌ Error handling payout.failed:`, error);
  } finally {
    session.endSession();
  }
};

// ========================================
// ACCOUNT: Updated Handler (KYC & Bank Status)
// ========================================
const handleAccountUpdated = async (account: Stripe.Account) => {
  console.log(`\n👤 WEBHOOK: account.updated - ID: ${account.id}`);

  try {
    // 1. Determine Status based on Stripe Flags
    let status: TOrganizationAccountStatusType = STRIPE_ACCOUNT_STATUS.PENDING;
    const requirements = account.requirements?.currently_due || [];

    if (account.charges_enabled && account.payouts_enabled) {
      status = STRIPE_ACCOUNT_STATUS.ACTIVE;
    } else if (account.requirements?.disabled_reason) {
      status = STRIPE_ACCOUNT_STATUS.RESTRICTED;
    } else if (account.details_submitted) {
      // Submitted but waiting for verification or bank
      status = STRIPE_ACCOUNT_STATUS.PENDING;
    }

    console.log(`   New Status: ${status}`);
    console.log(`   Missing Requirements: ${requirements.join(', ')}`);

    // 2. Update Database
    await Organization.findOneAndUpdate(
      { stripeConnectAccountId: account.id },
      {
        $set: {
          stripeAccountStatus: status,
          stripeAccountRequirements: requirements,
        },
      }
    );

    console.log(`✅ Organization ${account.id} status updated to ${status}`);
  } catch (error) {
    console.error(`❌ Error handling account.updated:`, error);
  }
};

// ========================================
// MAIN WEBHOOK HANDLER
// ========================================
const handleStripeWebhook = async (
  req: ExtendedRequest,
  res: Response,
  rawBody?: string
) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Missing stripe-signature header'
      );
    }

    const event = StripeService.verifyWebhookSignature(
      rawBody || JSON.stringify(req.body),
      signature
    );

    console.log(`\n📨 Webhook Received: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(
          event.data.object as Stripe.PaymentIntent
        );
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(
          event.data.object as Stripe.PaymentIntent
        );
        break;

      case 'payment_intent.canceled':
        await handlePaymentIntentCanceled(
          event.data.object as Stripe.PaymentIntent
        );
        break;

      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      case 'payout.paid':
        await handlePayoutPaid(event.data.object as Stripe.Payout);
        break;

      case 'payout.failed':
        await handlePayoutFailed(event.data.object as Stripe.Payout);
        break;
      case 'account.updated':
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Webhook processed successfully',
      data: { received: true },
    });
  } catch (error) {
    console.error('\n❌ Webhook Error:', error);
    sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      message: 'Webhook processing failed',
      data: null,
    });
  }
};

// ========================================
// EXPORTS
// ========================================
export const WebhookHandler = {
  handleStripeWebhook,
};
