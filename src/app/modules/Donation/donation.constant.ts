export const DONATION_STATUS = [
  'pending',
  'processing',
  'completed',
  'failed',
  'refunded',
  'canceled',
  'refunding',
  'renewed',
] as const;

export const DONATION_TYPE = ['one-time', 'recurring', 'round-up'] as const;

export const DEFAULT_CURRENCY = 'USD';

// Recurring donation frequency options
export const RECURRING_FREQUENCY = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
  'custom',
] as const;

// Round-up threshold options
export const ROUNDUP_THRESHOLD_OPTIONS = [
  '10',
  '20',
  '25',
  '40',
  '50',
  'custom',
  'none',
] as const;

// Auto donate trigger types
export const AUTODONATE_TRIGGER_TYPE = ['amount', 'days', 'both'] as const;

// Bank account status
export const BANK_ACCOUNT_STATUS = [
  'active',
  'login_required',
  'disconnected',
] as const;

export const monthAbbreviations = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];
