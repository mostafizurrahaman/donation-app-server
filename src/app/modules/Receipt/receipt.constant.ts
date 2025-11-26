export const RECEIPT_STATUS = {
  PENDING: 'pending',
  GENERATED: 'generated',
  SENT: 'sent',
  FAILED: 'failed',
} as const;

export const RECEIPT_STATUS_VALUES = Object.values(RECEIPT_STATUS);

export const DONATION_TYPE = {
  ONE_TIME: 'one-time',
  RECURRING: 'recurring',
  ROUND_UP: 'round-up',
} as const;

export const DONATION_TYPE_VALUES = Object.values(DONATION_TYPE);

export const DEFAULT_CURRENCY = 'USD';

export const RECEIPT_NUMBER_PREFIX = 'CC-REC';

export const MAX_EMAIL_ATTEMPTS = 3;

export const RECEIPT_EMAIL_RETRY_DELAY = 60000; // 1 minute

export const AWS_S3_BUCKET_FOLDER = 'receipts';

export const RECEIPT_PDF_CONFIG = {
  PAGE_SIZE: 'A4',
  MARGIN: 50,
  FONT_SIZE: {
    TITLE: 24,
    HEADING: 16,
    SUBHEADING: 14,
    BODY: 12,
    SMALL: 10,
  },
  COLORS: {
    PRIMARY: '#2C3E50',
    SECONDARY: '#34495E',
    ACCENT: '#3498DB',
    SUCCESS: '#27AE60',
    TEXT: '#2C3E50',
    LIGHT_TEXT: '#7F8C8D',
    BORDER: '#BDC3C7',
  },
} as const;

export const RECEIPT_MESSAGES = {
  GENERATION_SUCCESS: 'Receipt generated successfully',
  GENERATION_FAILED: 'Failed to generate receipt',
  EMAIL_SENT: 'Receipt email sent successfully',
  EMAIL_FAILED: 'Failed to send receipt email',
  NOT_FOUND: 'Receipt not found',
  ALREADY_EXISTS: 'Receipt already exists for this donation',
  LEGAL_DISCLAIMER:
    'This receipt is issued by Crescent Change on behalf of the above-mentioned organization. Please retain this receipt for your tax records.',
  THANK_YOU_MESSAGE:
    'Thank you for your generous donation. Your contribution makes a real difference.',
} as const;
