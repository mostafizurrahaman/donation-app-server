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
import { Logger } from '../../utils/logger';

// Helper function to calculate next donation date for recurring donations
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

// Helper to update scheduled donation after successful payment
const updateScheduledDonationAfterSuccess = async (
  scheduledDonationId: string
) => {
  try {
    const scheduledDonation = await ScheduledDonation.findById(
      scheduledDonationId
    );

    if (!scheduledDonation) {
      console.error(`❌ Scheduled donation not found: ${scheduledDonationId}`);
      return;
    }

    // Update execution tracking
    scheduledDonation.lastExecutedDate = new Date();
    scheduledDonation.totalExecutions += 1;

    // Calculate next donation date
    const nextDate = calculateNextDonationDate(
      new Date(),
      scheduledDonation.frequency,
      scheduledDonation.customInterval
    );
    scheduledDonation.nextDonationDate = nextDate;

    // Check if end date has passed
    if (scheduledDonation.endDate && nextDate > scheduledDonation.endDate) {
      scheduledDonation.isActive = false;
      console.log(
        `🏁 Scheduled donation ${scheduledDonationId} completed (reached end date)`
      );
    }

    await scheduledDonation.save();

    console.log(`✅ Updated scheduled donation: ${scheduledDonationId}`);
    console.log(`   Next donation date: ${nextDate.toISOString()}`);
    console.log(`   Total executions: ${scheduledDonation.totalExecutions}`);
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`❌ Error updating scheduled donation: ${err.message}`);
  }
};

// Generate Receipt
const generateReceiptAfterPayment = async (
  donation: any,
  paymentIntent: Stripe.PaymentIntent
) => {
  try {
    console.log(`📄 Generating receipt for donation: ${donation._id}`);

    // Check if receipt already exists
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
      amount: donation.amount,
      isTaxable: donation.isTaxable,
      taxAmount: donation.taxAmount,
      totalAmount: donation.totalAmount,
      currency: donation.currency || paymentIntent.currency.toUpperCase(),
      donationType: donation.donationType || 'one-time',
      donationDate: new Date(),
      paymentMethod: 'Stripe',
      specialMessage: donation.specialMessage,
    };

    // Generate receipt
    const receipt = await receiptServices.generateReceipt(receiptPayload);

    console.log(`✅ Receipt generated successfully: ${receipt.receiptNumber}`);
    Logger.info(
      `Receipt generated for donation \n ${donation._id}:  Receipt ID: ${receipt._id} \n url: ${receipt.pdfUrl} \n email sent: ${receipt.emailSent} \n Total Amount: $${receipt.totalAmount} \n Base Amount: $${receipt.amount} \n Tax Amount: $${receipt.taxAmount} `
    );
    return receipt;
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`❌ Error generating receipt: ${err.message}`);
  }
};

// Handle RoundUp Success (Update transactions)
const handleRoundUpDonationSuccess = async (
  roundUpId: string,
  paymentIntentId: string
) => {
  try {
    // Get the round-up configuration
    const roundUpConfig = await RoundUpModel.findById(roundUpId);
    if (!roundUpConfig) {
      console.error(`❌ RoundUp configuration not found: ${roundUpId}`);
      return;
    }

    // Find existing Donation record
    const donation = await Donation.findOne({
      stripePaymentIntentId: paymentIntentId,
      donationType: 'round-up',
    });

    if (!donation) {
      console.error(
        `❌ Donation record not found for payment intent: ${paymentIntentId}`
      );
      return;
    }

    // Get all processing transactions for this payment intent
    const processingTransactions = await RoundUpTransactionModel.find({
      stripePaymentIntentId: paymentIntentId,
      status: 'processed',
    });

    if (processingTransactions.length === 0) {
      console.error(
        `❌ No processing transactions found for payment intent: ${paymentIntentId}`
      );
      return;
    }

    // Mark transactions as donated
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

    // Update existing Donation record
    donation.status = 'completed';
    donation.donationDate = new Date();
    donation.roundUpTransactionIds = processingTransactions.map(
      (t) => t._id
    ) as Types.ObjectId[];
    await donation.save();

    // Use completeDonationCycle() method for proper state management
    await roundUpConfig.completeDonationCycle();

    console.log(`✅ RoundUp donation completed successfully`);
    return {
      success: true,
      roundUpId,
      donationId: donation._id,
    };
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`❌ Error handling RoundUp donation success: ${err.message}`);
    throw error;
  }
};

// Handle RoundUp donation failure
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

    // Mark failed transactions back to processed (can retry later)
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

    // Reset round-up configuration
    roundUpConfig.status = 'pending';
    roundUpConfig.lastDonationAttempt = new Date();
    roundUpConfig.lastDonationFailure = new Date();
    roundUpConfig.lastDonationFailureReason = errorMessage || 'Unknown error';
    roundUpConfig.currentMonthTotal =
      (roundUpConfig.currentMonthTotal || 0) + restoredAmount;
    await roundUpConfig.save();

    console.log(`❌ RoundUp donation failed, rollback completed`);
    return {
      success: false,
      roundUpId,
      error: errorMessage || 'Unknown error',
    };
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`❌ Error handling RoundUp donation failure: ${err.message}`);
    throw error;
  }
};

// Handle checkout.session.completed event
const handleCheckoutSessionCompleted = async (
  session: Stripe.Checkout.Session
) => {
  const { metadata } = session;

  if (session.payment_intent && metadata?.donationId) {
    try {
      const donation = await Donation.findOneAndUpdate(
        {
          _id: new Types.ObjectId(metadata.donationId),
          status: { $in: ['pending'] },
        },
        {
          stripePaymentIntentId: session.payment_intent as string,
          status: 'processing',
        }
      );

      if (!donation) {
        console.error(
          'Could not find donation to update with payment intent ID'
        );
        return;
      }
      console.log(
        `Donation ${metadata.donationId} updated with payment intent ID: ${session.payment_intent}`
      );
    } catch (error) {
      console.error(`Failed to update donation with payment intent ID:`, error);
    }
  }
};

// Handle payment_intent.succeeded
const handlePaymentIntentSucceeded = async (
  paymentIntent: Stripe.PaymentIntent
) => {
  const { metadata } = paymentIntent;

  console.log(`WEBHOOK: payment_intent.succeeded`);
  console.log(`   Payment Intent ID: ${paymentIntent.id}`);
  console.log(
    `   Total Charged: $${(paymentIntent.amount / 100).toFixed(
      2
    )} ${paymentIntent.currency.toUpperCase()}`
  );

  try {
    // Step 1: Find donation by payment intent ID (primary)
    let donation = await Donation.findOneAndUpdate(
      {
        stripePaymentIntentId: paymentIntent.id,
        status: { $in: ['pending', 'processing'] },
      },
      {
        status: 'completed',
        stripeChargeId: paymentIntent.latest_charge as string,
        pointsEarned: Math.floor(paymentIntent.amount / 100) * 100, // Fallback calculation
      },
      { new: true }
    )
      .populate('donor')
      .populate('organization')
      .populate('cause');

    // Step 2: Fallback — find by donationId from metadata
    if (!donation && metadata?.donationId) {
      console.log('Fallback: searching by metadata.donationId');
      donation = await Donation.findOneAndUpdate(
        {
          _id: new Types.ObjectId(metadata.donationId),
          status: { $in: ['pending', 'processing'] },
        },
        {
          status: 'completed',
          stripePaymentIntentId: paymentIntent.id,
          stripeChargeId: paymentIntent.latest_charge as string,
          pointsEarned: Math.floor((paymentIntent.amount / 100) * 100),
        },
        { new: true }
      )
        .populate('donor')
        .populate('organization')
        .populate('cause');
    }

    if (!donation) {
      console.error('Donation not found for payment_intent.succeeded');
      return;
    }

    console.log(`Payment succeeded for donation: ${donation._id}`);

    // ==================================================================
    // ✅ NEW: ADD FUNDS TO ORGANIZATION BALANCE (LEDGER)
    // ==================================================================
    try {
      // Handle populated organization field safely
      const orgId =
        (donation.organization as any)._id?.toString() ||
        donation.organization.toString();

      await BalanceService.addDonationFunds(
        orgId,
        donation.totalAmount, // Use total amount charged (includes tax, etc. - Payout logic will split fees later)
        donation?._id?.toString()!,
        donation.donationType as 'one-time' | 'recurring' | 'round-up'
      );
      console.log(`✅ Funds added to ledger for Org: ${orgId}`);
    } catch (err: any) {
      console.error(
        `❌ Failed to update balance for donation ${donation._id}:`,
        err.message
      );
      // We log critical error but proceed with other non-financial post-processing
    }

    // ------------------------------------------------------------------
    // 1. Generate Tax Receipt (Critical for donors)
    // ------------------------------------------------------------------
    try {
      await generateReceiptAfterPayment(donation, paymentIntent);
    } catch (err) {
      console.error(
        `Receipt generation failed for donation ${donation._id}:`,
        err
      );
    }

    // ------------------------------------------------------------------
    // 2. AWARD POINTS TO DONOR (Gamification)
    // ------------------------------------------------------------------
    try {
      await pointsServices.awardPointsForDonation(
        donation.donor._id.toString(),
        donation._id!.toString(),
        donation.amount // Award points on BASE amount
      );
      console.log(`Points awarded based on $${donation.amount}`);
    } catch (err) {
      console.error(
        `Points awarding failed for donation ${donation._id}:`,
        err
      );
    }

    // ------------------------------------------------------------------
    // 3. CHECK AND UPDATE BADGES
    // ------------------------------------------------------------------
    try {
      console.log(`🏅 Checking badges for user: ${donation.donor._id}`);
      await badgeService.checkAndUpdateBadgesForDonation(
        donation.donor._id,
        donation._id?.toString()!
      );
    } catch (err) {
      console.error(`Badge checking failed for donation ${donation._id}:`, err);
    }

    // ------------------------------------------------------------------
    // 4. Handle Round-Up Donations
    // ------------------------------------------------------------------
    if (metadata?.donationType === 'roundup' && metadata?.roundUpId) {
      console.log(`Processing Round-Up donation: ${metadata.roundUpId}`);
      try {
        await handleRoundUpDonationSuccess(
          metadata.roundUpId,
          paymentIntent.id
        );
      } catch (err) {
        console.error(`Round-Up handling failed:`, err);
      }
    }

    // ------------------------------------------------------------------
    // 5. Handle Recurring / Scheduled Donations
    // ------------------------------------------------------------------
    if (
      metadata?.donationType === 'recurring' &&
      metadata?.scheduledDonationId
    ) {
      console.log(
        `Updating scheduled donation: ${metadata.scheduledDonationId}`
      );
      try {
        await updateScheduledDonationAfterSuccess(metadata.scheduledDonationId);
      } catch (err) {
        console.error(`Failed to update scheduled donation:`, err);
      }
    }

    console.log(
      `All post-payment actions completed for donation ${donation._id}`
    );
  } catch (error) {
    console.error(`Critical error in payment_intent.succeeded handler:`, error);
  }
};

// Handle payment_intent.payment_failed event
const handlePaymentIntentFailed = async (
  paymentIntent: Stripe.PaymentIntent
) => {
  const { metadata } = paymentIntent;

  console.log(`🔔 WEBHOOK: payment_intent.payment_failed`);
  console.log(`   Payment Intent ID: ${paymentIntent.id}`);

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

      if (fallbackUpdate) {
        console.log(`❌ Payment failed for donation: ${fallbackUpdate._id}`);

        if (metadata?.donationType === 'roundup' && metadata?.roundUpId) {
          await handleRoundUpDonationFailure(
            metadata.roundUpId,
            paymentIntent.id,
            paymentIntent.last_payment_error?.message || 'Unknown error'
          );
        }
      }
      return;
    } else if (!donation) {
      return;
    }

    console.log(`❌ Payment failed for donation: ${donation._id}`);

    if (metadata?.donationType === 'roundup' && metadata?.roundUpId) {
      await handleRoundUpDonationFailure(
        metadata.roundUpId,
        paymentIntent.id,
        paymentIntent.last_payment_error?.message || 'Unknown error'
      );
    }
  } catch (error) {
    console.error(
      `Failed to update donation for payment intent ${paymentIntent.id}:`,
      error
    );
  }
};

// Handle payment_intent.canceled event
const handlePaymentIntentCanceled = async (
  paymentIntent: Stripe.PaymentIntent
) => {
  const { metadata } = paymentIntent;

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
        {
          _id: new Types.ObjectId(metadata.donationId),
          status: { $in: ['pending', 'processing'] },
        },
        {
          status: 'canceled',
          stripePaymentIntentId: paymentIntent.id,
          $inc: { paymentAttempts: 1 },
          lastPaymentAttempt: new Date(),
        }
      );
    }

    console.log(`Payment intent ${paymentIntent.id} marked as canceled`);
  } catch (error) {
    console.error(
      `Failed to update donation for payment intent ${paymentIntent.id}:`,
      error
    );
  }
};

// Handle charged.refunded event
const handleChargeRefunded = async (charge: Stripe.Charge) => {
  const paymentIntentId = charge.payment_intent as string;
  const amountRefunded = charge.amount_refunded / 100; // Convert cents to dollars

  if (!paymentIntentId) return;

  try {
    // 1. Update Donation Status
    const donation = await Donation.findOneAndUpdate(
      {
        stripePaymentIntentId: paymentIntentId,
        // Match status: don't restrict to 'refunding' in case it was done on Stripe Dashboard
        status: { $in: ['completed', 'refunding'] },
      },
      {
        status: 'refunded',
      },
      { new: true }
    );

    if (donation) {
      console.log(
        `Donation for payment intent ${paymentIntentId} marked as refunded.`
      );

      // 2. ✅ Deduct from Ledger
      try {
        const orgId =
          (donation.organization as any)._id?.toString() ||
          donation.organization.toString();

        await BalanceService.deductRefund(
          orgId,
          amountRefunded, // Deduct the actual refunded amount
          donation?._id?.toString()!
        );
        console.log(`✅ Refund deducted from ledger for Org: ${orgId}`);
      } catch (err: any) {
        console.error(
          `❌ Failed to update ledger for refund ${donation._id}:`,
          err.message
        );
      }
    }
  } catch (error) {
    console.error(
      `Failed to update donation status to refunded for payment intent ${paymentIntentId}:`,
      error
    );
  }
};

// Main Stripe webhook handler
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

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;

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

      case 'account.updated':
      case 'customer.created':
        console.log(`Webhook received: ${event.type}`);
        break;

      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: 'Webhook processed successfully',
      data: { received: true },
    });
  } catch (error) {
    console.error('Webhook error:', error);

    if (error instanceof AppError) {
      return sendResponse(res, {
        statusCode: error.statusCode,
        message: error.message,
        data: null,
      });
    }

    sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      message: 'Webhook processing failed',
      data: null,
    });
  }
};

export const WebhookHandler = {
  handleStripeWebhook,
};
