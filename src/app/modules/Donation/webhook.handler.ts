/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
import { Response } from 'express';
import { Stripe } from 'stripe';
import { sendResponse, AppError } from '../../utils';
import httpStatus from 'http-status';
import { Donation } from './donation.model';
import { StripeService } from '../Stripe/stripe.service';
import { ExtendedRequest } from '../../types';
import { Types } from 'mongoose';
import { ScheduledDonation } from '../ScheduledDonation/scheduledDonation.model';
import { RoundUpModel } from '../RoundUp/roundUp.model';
import { RoundUpTransactionModel } from '../RoundUpTransaction/roundUpTransaction.model';
import { receiptServices } from './../Receipt/receipt.service';
import { Receipt } from '../Receipt/receipt.model';
import { pointsServices } from '../Points/points.service';
import { badgeService } from '../badge/badge.service';
import { BalanceService } from '../Balance/balance.service';

// ========================================
// HELPER: Calculate Next Donation Date
// ========================================
const calculateNextDonationDate = (
  currentDate: Date,
  frequency: string,
  customInterval?: { value: number; unit: 'days' | 'weeks' | 'months' }
): Date => {
  const nextDate = new Date(currentDate);

  switch (frequency) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'quarterly':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case 'yearly':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
    case 'custom':
      if (customInterval) {
        switch (customInterval.unit) {
          case 'days':
            nextDate.setDate(nextDate.getDate() + customInterval.value);
            break;
          case 'weeks':
            nextDate.setDate(nextDate.getDate() + customInterval.value * 7);
            break;
          case 'months':
            nextDate.setMonth(nextDate.getMonth() + customInterval.value);
            break;
        }
      }
      break;
  }

  return nextDate;
};

// ========================================
// SCHEDULED DONATION: Success Handler
// ========================================
const updateScheduledDonationAfterSuccess = async (
  scheduledDonationId: string
) => {
  try {
    console.log(
      `🔄 Updating scheduled donation after success: ${scheduledDonationId}`
    );

    // ✅ Atomic update to prevent race conditions
    const scheduledDonation = await ScheduledDonation.findOneAndUpdate(
      {
        _id: scheduledDonationId,
        status: 'processing', 
      },
      {
        $set: {
          lastExecutedDate: new Date(),
        },
        $inc: {
          totalExecutions: 1, 
        },
      },
      {
        new: true,
      }
    );

    if (!scheduledDonation) {
      console.error(
        `❌ Scheduled donation not found or not in processing state: ${scheduledDonationId}`
      );
      return;
    }

    // ✅ Calculate next date from lastExecutedDate (not current time)
    const baseDate = scheduledDonation.lastExecutedDate || new Date();
    const nextDate = calculateNextDonationDate(
      baseDate,
      scheduledDonation.frequency,
      scheduledDonation.customInterval
    );

    // ✅ Update next date and unlock status
    await ScheduledDonation.findByIdAndUpdate(scheduledDonationId, {
      $set: {
        nextDonationDate: nextDate,
        status: 'active', 
      },
    });

    console.log(
      `✅ Updated scheduled donation: ${scheduledDonationId} | Next: ${nextDate.toISOString()} | Status: active`
    );
  } catch (error: unknown) {
    const err = error as Error;
    console.error(
      `❌ Error updating scheduled donation: ${err.message}`,
      err.stack
    );

    // ✅ Unlock on error to prevent stuck 'processing' status
    try {
      await ScheduledDonation.findByIdAndUpdate(scheduledDonationId, {
        $set: { status: 'active' },
      });
      console.log(
        `🔓 Unlocked scheduled donation ${scheduledDonationId} after error`
      );
    } catch (unlockError) {
      console.error(
        `❌ Failed to unlock scheduled donation ${scheduledDonationId}:`,
        unlockError
      );
    }
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

      // ✅ Use Financial Breakdown
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

    // 1. Add funds to balance ledger
    try {
      const orgId =
        (donation.organization as any)._id?.toString() ||
        donation.organization.toString();

      await BalanceService.addDonationFunds(
        orgId,
        donation?._id?.toString() as string,
        donation?.donationType
      );
      console.log(`✅ Funds added to ledger for Org: ${orgId}`);
    } catch (err: any) {
      console.error(`❌ Failed to update balance:`, err.message);
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

    //  Handle Scheduled donation success
    if (
      metadata?.donationType === 'recurring' &&
      metadata?.scheduledDonationId
    ) {
      try {
        console.log(`🔄 Processing Scheduled donation success...`);
        await updateScheduledDonationAfterSuccess(metadata.scheduledDonationId);
      } catch (err) {
        console.error(`❌ Failed to update scheduled donation:`, err);
      }
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
      metadata?.donationType === 'recurring' &&
      metadata?.scheduledDonationId
    ) {
      await updateScheduledDonationAfterFailure(
        metadata.scheduledDonationId,
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

    //  Unlock scheduled donation if canceled
    if (
      metadata?.donationType === 'recurring' &&
      metadata?.scheduledDonationId
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

  console.log(`\n💸 ========================================`);
  console.log(`   WEBHOOK: charge.refunded`);
  console.log(`   Payment Intent ID: ${paymentIntentId}`);
  console.log(`   Refund Amount: ${charge.amount_refunded / 100}`);
  console.log(`========================================\n`);

  if (!paymentIntentId) return;

  try {
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

        await BalanceService.deductRefund(
          orgId,
          donation?._id?.toString() as string
        );
        console.log(`✅ Refund deducted from ledger for Org: ${orgId}`);
      } catch (err: any) {
        console.error(`❌ Failed to update ledger for refund:`, err.message);
      }
    }

    console.log(`✅ Refund processed successfully`);
  } catch (error) {
    console.error(`❌ Failed to update donation status to refunded:`, error);
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

    console.log(`\n📨 ========================================`);
    console.log(`   Incoming Webhook Event: ${event.type}`);
    console.log(`   Event ID: ${event.id}`);
    console.log(`========================================\n`);

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

      default:
        console.log(`⚠️ Unhandled webhook event type: ${event.type}`);
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Webhook processed successfully',
      data: { received: true },
    });
  } catch (error) {
    console.error('\n❌ ========================================');
    console.error('   Webhook Processing Error');
    console.error('========================================');
    console.error(error);
    console.error('========================================\n');

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
