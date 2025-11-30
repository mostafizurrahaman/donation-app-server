export type TRoundUpStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface IRoundUp {
  user: string;
  organization: string;
  cause: string;
  bankConnection: string;
  paymentMethod?: string;
  monthlyThreshold?: number | 'no-limit';
  isTaxable: boolean; 
  specialMessage?: string;
  status: TRoundUpStatus;
  isActive: boolean;
  enabled: boolean;
  totalAccumulated: number;
  currentMonthTotal: number;
  lastMonthReset: Date;
  lastCharitySwitch?: Date;
  lastDonationAttempt?: Date;
  lastSuccessfulDonation?: Date;
  lastDonationFailure?: Date;
  lastDonationFailureReason?: string;
  cancelReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IRoundUpSummary {
  roundUpId: string;
  userId: string;
  charityName: string;
  currentMonthTotal: number;
  totalAccumulated: number;
  monthlyThreshold?: number | 'no-limit';
  isActive: boolean;
  enabled: boolean;
  nextDonationDate: Date;
  isThresholdMet: boolean;
}

export interface ICharitySwitchRequest {
  roundUpId: string;
  newOrganizationId: string;
  newCauseId: string;
  reason?: string;
}

export interface ICharitySwitchResponse {
  success: boolean;
  message: string;
  canSwitch: boolean;
  daysUntilNextSwitch?: number;
  lastSwitchDate?: Date;
}

export interface IRoundUpSettings {
  enabled: boolean;
  monthlyThreshold?: number | 'no-limit';
  organizationId: string;
  causeId: string;
  autoDonate: boolean; // Whether to donate when threshold is met or wait for month end
  isTaxable: boolean; 
}

export interface IUserRoundUpStats {
  totalDonated: number;
  totalRoundUps: number;
  monthsDonated: number;
  currentMonthTotal: number;
  currentCharity: {
    name: string;
    totalFromUser: number;
  };
}

export interface IAdminRoundUpStats {
  totalUsers: number;
  activeUsers: number;
  totalDonated: number;
  totalCharities: number;
  monthlyStats: {
    month: string;
    amount: number;
    users: number;
  }[];
  topCharities: {
    organizationId: string;
    name: string;
    amount: number;
    donors: number;
  }[];
  issues: {
    inactiveConnections: number;
    failedTransfers: number;
    pendingDonations: number;
  };
}
