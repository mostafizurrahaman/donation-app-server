export const REDEMPTION_METHOD = {
  QR_CODE: 'qr',
  NFC: 'nfc',
  STATIC_CODE: 'static-code',
  DISCOUNT_CODE: 'discount-code',
  GIFT_CARD: 'gift-card',
} as const;

export const REDEMPTION_METHOD_VALUES = Object.values(REDEMPTION_METHOD);

// Redemption status
export const REDEMPTION_STATUS = {
  CLAIMED: 'claimed',
  REDEEMED: 'redeemed',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;

export const REDEMPTION_STATUS_VALUES = Object.values(REDEMPTION_STATUS);
// Time limits
export const CLAIM_EXPIRY_DAYS = 30;
export const CANCELLATION_WINDOW_HOURS = 24;
