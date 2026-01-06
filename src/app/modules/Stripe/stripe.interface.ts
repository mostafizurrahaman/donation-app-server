export interface ICheckoutSessionRequest {
  amount: number;
  causeId: string;
  organizationId: string;

  specialMessage?: string;
  userId: string;
  coverFees?: boolean;
  totalAmount: number; // This is what gets charged
}

export interface ICheckoutSessionResponse {
  sessionId: string;
  url: string;
}

export interface IPaymentIntentRequest {
  amount: number; // Base Amount
  currency?: string;
  donorId: string;
  organizationId: string;
  causeId: string;
  specialMessage?: string;

  // ✅ Financial Breakdown for Metadata
  coverFees?: boolean;
  platformFee?: number;
  gstOnFee?: number;
  stripeFee?: number; // ✅ NEW: Transaction Fee
  netToOrg?: number;

  totalAmount: number; // Total Charge
}

export interface IPaymentIntentResponse {
  client_secret: string;
  payment_intent_id: string;
}

export interface IDonationUpdateRequest {
  donationId: string;
  status: 'completed' | 'failed' | 'refunded';
  stripePaymentIntentId?: string;
  stripeCustomerId?: string;
}

export interface IStripeWebhookEvent {
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

export interface ISetupIntentRequest {
  userId: string;
  email: string;
  paymentMethodType?: 'card' | 'ideal' | 'sepa_debit';
}

export interface ISetupIntentResponse {
  client_secret: string;
  setup_intent_id: string;
}

export interface IAttachPaymentMethodRequest {
  paymentMethodId: string;
  customerId: string;
}

export interface ICreatePaymentIntentWithMethodRequest {
  amount: number; // Base Amount
  currency?: string;
  customerId: string;
  paymentMethodId: string;
  donationId: string;
  organizationId: string;
  causeId: string;
  specialMessage?: string;

  // ✅ Financial Breakdown for Metadata
  coverFees?: boolean;
  platformFee?: number;
  gstOnFee?: number;
  stripeFee?: number; // ✅ NEW: Transaction Fee
  netToOrg?: number;

  totalAmount: number; // Total Charge
}

//  Interface for RoundUp payment intent
export interface ICreateRoundUpPaymentIntentRequest {
  roundUpId: string;
  userId: string;
  charityId: string;
  causeId?: string;
  amount: number; // Base Amount
  month: string;
  year: number;
  specialMessage: string;
  paymentMethodId: string;
  donationId: string;
  applicationFee: number;

  // ✅ Financial Breakdown for Metadata
  coverFees?: boolean;
  platformFee?: number;
  gstOnFee?: number;
  stripeFee?: number; // ✅ NEW: Transaction Fee
  netToOrg?: number;

  totalAmount: number; // Total Charge
}
