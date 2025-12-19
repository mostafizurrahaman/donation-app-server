export const NOTIFICATION_TYPE = {
  // --- CLIENT (DONOR) ---
  DONATION_SUCCESS: 'donation_success', // Trigger: Stripe Succeeded
  DONATION_FAILED: 'donation_failed', // Trigger: Stripe Failed
  DONATION_CANCELLED: 'donation_cancelled', // Trigger: Stripe Failed
  DONATION_REFUNDED: 'donation_refunded', // Trigger: Stripe Failed
  RECURRING_PLAN_STARTED: 'scheduled_donation',
  RECURRING_STATUS_CHANGED: 'scheduled_status_changed',
  THRESHOLD_REACHED: 'threshold_reached', // Trigger: Round-up limit hit
  BANK_DISCONNECTED: 'bank_disconnected', // Trigger: Plaid sync error
  BADGE_UNLOCKED: 'badge_unlocked', // Trigger: Badge Logic
  REWARD_CLAIMED: 'reward_claimed', // Trigger: Point deduction
  CLAIM_EXPIRING: 'claim_expiring', // Trigger: 5-min maintenance job

  // --- ORGANIZATION (CHARITY) ---
  NEW_DONATION: 'new_donation_received', // Trigger: PaymentIntent Succeeded
  PAYOUT_COMPLETED: 'payout_completed', // Trigger: Payout Job / Webhook
  PAYOUT_FAILED: 'payout_failed', // Trigger: Payout Job / Webhook
  STRIPE_RESTRICTED: 'stripe_restricted', // Trigger: account.updated webhook (KYC due)

  // --- BUSINESS (REWARD PARTNER) ---
  REWARD_REDEEMED: 'reward_redeemed', // Trigger: Customer scanned QR
  NEW_REWARD: 'new_reward', // Trigger: Customer scanned QR
  REWARD_SOLD_OUT: 'reward_sold_out', // Trigger: remainingCount reaches 0
  BUSINESS_VERIFIED: 'business_verified', // Trigger: Admin status change

  // --- SUPER ADMIN (PLATFORM OWNER) ---
  NEW_ORG_PENDING: 'new_org_pending', // Trigger: Organization Signup
  SYSTEM_CRON_FAILURE: 'cron_failure', // Trigger: CronJobTracker failExecution
  CONTACT_MESSAGE: 'contact_message', // Trigger: Contact Us form
} as const;

export type TNotification =
  (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];
