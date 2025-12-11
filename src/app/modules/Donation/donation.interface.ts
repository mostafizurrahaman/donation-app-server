import { Document, Types } from 'mongoose';

export interface IDonation {
  donor: Types.ObjectId;
  organization: Types.ObjectId;
  cause: Types.ObjectId;
  donationType: 'one-time' | 'recurring' | 'round-up';

  // ✅ Financial Fields (Australian Logic)
  amount: number; // Base Donation Amount (Tax Deductible for Donor)
  coverFees: boolean; // Did donor choose to cover fees?
  platformFee: number; // 5% Platform Fee
  gstOnFee: number; // 10% GST on the Platform Fee
  stripeFee: number; // ✅ NEW: Stripe Transaction Fee (e.g. 1.75% + 30c)
  netAmount: number; // The clean amount credited to the Organization
  totalAmount: number; // The actual charge to the card

  currency: string;
  status:
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'refunded'
    | 'canceled'
    | 'refunding';
  donationDate: Date;
  stripePaymentIntentId?: string;
  stripePaymentMethodId?: string;
  stripeChargeId?: string;
  stripeSessionId?: string;
  stripeCustomerId?: string;
  specialMessage?: string;
  refundReason?: string;
  pointsEarned: number;

  // Additional fields for recurring and round-up donations
  scheduledDonationId?: Types.ObjectId;
  roundUpId?: Types.ObjectId;
  roundUpTransactionIds?: Types.ObjectId[];
  receiptGenerated: boolean;
  receiptId?: Types.ObjectId;

  // New fields for idempotency and payment tracking
  idempotencyKey?: string;
  paymentAttempts?: number;
  lastPaymentAttempt?: Date;
  metadata?: Record<string, unknown>;
}

// Extended interface for donations with tracking data
export interface IDonationWithTracking extends IDonation {
  paymentAttempts: number;
  lastPaymentAttempt?: Date;
  _id: Types.ObjectId;
}

// Donation service response type
export interface IDonationWithPopulated {
  _id: Types.ObjectId;
  donor: { _id: Types.ObjectId; name: string; email: string };
  organization: { _id: Types.ObjectId; name: string };
  cause?: { _id: Types.ObjectId; name: string; description?: string };
  donationType: 'one-time' | 'recurring' | 'round-up';

  amount: number;
  coverFees: boolean;
  totalAmount: number;

  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  donationDate: Date;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  stripeSessionId?: string;
  stripeCustomerId?: string;
  specialMessage?: string;
  pointsEarned: number;

  paidAmount?: number;
}

export interface IDonationModel extends IDonation, Document {
  createdAt: Date;
  updatedAt: Date;
}

export interface ICheckoutSessionRequest {
  amount: number;
  causeId?: string;
  organizationId: string;
  userId: string;
  specialMessage?: string;
  coverFees?: boolean;
}

/**
 * ScheduledDonation interface
 */
export interface IScheduledDonation {
  // Template Data (what to donate)
  user: Types.ObjectId;
  organization: Types.ObjectId;
  amount: number;

  // ✅ Fee Preference
  coverFees: boolean;

  currency: string;
  cause: Types.ObjectId;
  specialMessage?: string;

  // Payment Information
  stripeCustomerId: string;
  paymentMethod: Types.ObjectId;

  // Scheduling Configuration
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
  customInterval?: {
    value: number;
    unit: 'days' | 'weeks' | 'months';
  };
  startDate: Date;
  nextDonationDate: Date;
  endDate?: Date;

  // Status & Execution Tracking
  isActive: boolean;
  lastExecutedDate?: Date;
  totalExecutions: number;
}

// RoundUp interface
export interface IRoundUp {
  user: Types.ObjectId;
  organization: Types.ObjectId;
  bankConnection: Types.ObjectId;

  // ✅ Fee Preference
  coverFees: boolean;

  thresholdAmount?: number;
  monthlyLimit?: number;
  autoDonateTrigger: {
    type: 'amount' | 'days' | 'both';
    amount?: number;
    days?: number;
  };
  specialMessage?: string;
  isActive: boolean;
  currentAccumulatedAmount: number;
  lastDonationDate?: Date;
  nextAutoDonationDate?: Date;
  cycleStartDate: Date;
}

// Extended model interfaces
export interface IScheduledDonationModel extends IScheduledDonation, Document {
  createdAt: Date;
  updatedAt: Date;
}

export interface IRoundUpModel extends IRoundUp, Document {
  createdAt: Date;
  updatedAt: Date;
}

// Analytics interfaces
export interface IAnalyticsPeriod {
  startDate?: Date;
  endDate?: Date;
}

export interface IPercentageChange {
  value: number;
  percentageChange: number;
  isIncrease: boolean;
}

export interface IDonationTypeBreakdown {
  'round-up': IPercentageChange;
  recurring: IPercentageChange;
  'one-time': IPercentageChange;
}

export interface ITopDonor {
  donor: {
    _id: string;
    name: string;
    email: string;
    image?: string;
  };
  totalAmount: number;
  donationCount: number;
  percentageChange: number;
  isIncrease: boolean;
  previousAmount: number;
}

export interface IRecentDonor {
  donor: {
    _id: string;
    name: string;
    email: string;
    image?: string;
  };
  lastDonationDate: Date;
  lastDonationAmount: number;
}

export interface CauseData {
  causeId: string;
  causeName: string;
  totalDonationAmount: number;
}

export interface CategoryData {
  category: string;
  totalDonationAmount: number;
  causes: CauseData[];
}

export interface IOrganizationStatsResponse {
  totalDonationAmount: number;
  categories: CategoryData[];
}

export interface ICauseMonthlyStat {
  month: string;
  totalAmount: number;
}

export interface IDonationAnalytics {
  totalDonatedAmount: IPercentageChange;
  averageDonationPerUser: IPercentageChange;
  totalDonors: IPercentageChange;
  topCause: {
    _id: string;
    name: string;
    totalAmount: number;
  } | null;
  donationTypeBreakdown: IDonationTypeBreakdown;
  topDonors: ITopDonor[];
  recentDonors: IRecentDonor[];
  breakDownByCause: IOrganizationStatsResponse;
}

// Define the filter type for reuse
export type TTimeFilter =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_year'
  | 'last_7_days';

export interface MonthlyTrend {
  month: string;
  totalAmount: number;
  totalCount: number;
  oneTimeCount: number;
  recurringCount: number;
  roundupCount: number;
  oneTimeTotal: number;
  recurringTotal: number;
  roundUpTotal: number;
}

export interface IClientDonationStats {
  roundUpAmount: number;
  recurringAmount: number;
  oneTimeAmount: number;
  totalDonationAmount: number;
  averageDonationAmount: number;
  maxConsistencyStreak: number; // The "4 days" example you gave
  currentStreak: number;
  donationDates: Array<{
    date: Date;
    amount: number;
    type: string;
  }>;
  uniqueDonationDates: string[];
  upcomingDonations: Array<{
    _id: string;
    amount: number;
    nextDate: Date;
    causeName: string;
    organizationName: string;
  }>;
}
