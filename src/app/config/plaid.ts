import { PlaidApi, PlaidEnvironments, Configuration } from 'plaid';
import config from './index';
import crypto from 'crypto';

// Use centralized configuration system as designed
const PLAID_ENV = config.plaid.env || 'sandbox';
const PLAID_CLIENT_ID = config.plaid.clientId;
const PLAID_SECRET = config.plaid.secret;
const PLAID_WEBHOOK_URL = config.plaid.webhookUrl;
const PLAID_WEBHOOK_KEY = config.plaid.webhookKey;

// Validate required configuration
if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
  console.error(
    'CRITICAL: PLAID_CLIENT_ID and PLAID_SECRET must be set in environment variables'
  );
}

if (!PLAID_WEBHOOK_URL) {
  console.warn(
    'WARNING: PLAID_WEBHOOK_URL not set, webhooks will not work properly'
  );
}

if (!PLAID_WEBHOOK_KEY) {
  console.warn(
    'WARNING: PLAID_WEBHOOK_KEY not set, webhook verification will fail'
  );
}

// Plaid environment mapping
const getPlaidEnvironment = () => {
  switch (PLAID_ENV) {
    case 'sandbox':
      return PlaidEnvironments.sandbox;
    case 'development':
      return PlaidEnvironments.development;
    case 'production':
      return PlaidEnvironments.production;
    default:
      return PlaidEnvironments.sandbox;
  }
};

// Initialize Plaid client
const plaidConfig = new Configuration({
  basePath: getPlaidEnvironment(),
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
      // 'Plaid-Version': '2020-09-14',
    },
  },
});

export const plaidClient = new PlaidApi(plaidConfig);

// Helper function to ensure key is exactly 32 bytes for AES-256
const getEncryptionKey = (): Buffer => {
  const keyString =
    config.encryptionKey || 'default32characterlongencryptionkey!';

  // Ensure the key is exactly 32 bytes
  if (keyString.length === 32) {
    return Buffer.from(keyString, 'utf8');
  } else if (keyString.length < 32) {
    // Pad with zeros if too short
    return Buffer.from(keyString.padEnd(32, '0'), 'utf8');
  } else {
    // Truncate if too long
    return Buffer.from(keyString.substring(0, 32), 'utf8');
  }
};

// Helper functions for encryption
export const encryptData = (text: string): string => {
  const algorithm = 'aes-256-cbc';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

export const decryptData = (encryptedText: string): string => {
  const algorithm = 'aes-256-cbc';
  const key = getEncryptionKey();
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

// Webhook verification
export const verifyPlaidWebhook = (
  webhookSignature: string,
  webhookBody: string
): boolean => {
  try {
    const parts = webhookSignature.split(',');
    const timestamp = parts[0];
    const v2Signature = parts[1];

    const plaidWebhookKey = config.plaid.webhookKey || PLAID_WEBHOOK_KEY;

    if (!plaidWebhookKey) {
      console.error('Plaid webhook key not configured');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', plaidWebhookKey)
      .update(timestamp + '.' + webhookBody)
      .digest('base64');

    return v2Signature === expectedSignature;
  } catch (error) {
    console.error('Error verifying Plaid webhook:', error);
    return false;
  }
};

export default {
  client: plaidClient,
  environment: PLAID_ENV,
  webhookUrl: PLAID_WEBHOOK_URL,
  encrypt: encryptData,
  decrypt: decryptData,
  verifyWebhook: verifyPlaidWebhook,
};
