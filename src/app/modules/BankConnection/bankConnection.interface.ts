import { CountryCode, DepositoryAccountSubtype } from 'plaid';

export interface IBankConnection {
  user: string;

  provider: 'plaid' | 'basiq'; // Add this to differentiate logic
  itemId: string; // For Basiq, this will store the 'Connection ID'
  accessToken?: string; // Only Plaid uses this
  accountId: string;
  accountName: string;
  accountType: string;
  institutionName: string;
  institutionId: string;
  consentGivenAt: Date;
  consentExpiry?: Date;
  isActive: boolean;
  plaidWebhookId?: string;
  lastSyncAt?: Date;
  lastSyncCursor?: string; // ADDED THIS LINE
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPlaidAccount {
  id: string;
  name: string;
  type: string;
  subtype: string;
  mask?: string;
}

export interface IPlaidInstitution {
  institution_id: string;
  name: string;
  url?: string;
  logo?: string;
  primary_color?: string;
}

export interface IPlaidLinkTokenRequest {
  user: {
    client_user_id: string;
  };
  client_name?: string;
  products?: string[];
  country_codes?: CountryCode[];
  language?: string;
  webhook?: string;
  account_filters?: {
    depository?: {
      account_subtypes: DepositoryAccountSubtype[];
    };
  };
}

export interface IPlaidPublicTokenExchange {
  public_token: string;
}

export interface IPlaidTransaction {
  transaction_id: string;
  pending_transaction_id?: string;
  amount: number;
  iso_currency_code: string;
  date: string;
  name: string;
  merchant_name?: string;
  category: string[];
  account_id: string;
  account_owner: string;
  personal_finance_category?: {
    primary: string;
    detailed: string;
  };
}

export interface ITransactionFilter {
  userId?: string;
  accountIds?: string[];
  excludeCategories?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface ISyncResponse {
  hasMore: boolean;
  nextCursor?: string;
  added: IPlaidTransaction[];
  modified: IPlaidTransaction[];
  removed: string[];
}

// Add at the end of the file

export interface IBankAccountWithRoundUpStatus extends IBankConnection {
  isLinkedToActiveRoundUp: boolean;
  activeRoundUpId?: string;
  roundUpDetails?: {
    monthlyThreshold?: number | 'no-limit';
    currentMonthTotal: number;
    organization: string;
    organizationName?: string;
    cause?: string;
    causeName?: string;
    status: string;
    enabled: boolean;
    isTaxable: boolean;
  };
}

export interface IUserBankAccountsResponse {
  accounts: IBankAccountWithRoundUpStatus[];
  totalAccounts: number;
  activeRoundUps: number;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPage: number;
  };
}
