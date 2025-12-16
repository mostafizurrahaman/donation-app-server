import Stripe from 'stripe';
import config from '../config';

export const stripe = new Stripe(config.stripe?.secretKey, {
  apiVersion: '2025-11-17.clover',
});

export const STRIPE_EVENTS = {
  CHECKOUT_SESSION_COMPLETED: 'checkout.session.completed',
  PAYMENT_INTENT_SUCCEEDED: 'payment_intent.succeeded',
  PAYMENT_INTENT_FAILED: 'payment_intent.payment_failed',
  PAYMENT_INTENT_CANCELED: 'payment_intent.canceled',
} as const;
