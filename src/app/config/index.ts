import dotenv from 'dotenv';
import path from 'path';

dotenv.config({
  path: path.join(process.cwd(), '.env'),
});

interface IConfig {
  port: number;
  nodeEnv: string;
  host: string;
  dbUrl: string;
  clientUrl: string;
  serverUrl: string;
  paymentSetting: {
    platformFeePercent: number;
    gstPercentage: number;
    stripeFeePercent: number;
    stripeFixedFee: number;
    clearingPeriodDays: number;
  };
  jwt: {
    accessTokenSecret: string;
    refreshTokenSecret: string;
    otpSecret: string;
    accessTokenExpiresIn: string;
    refreshTokenExpiresIn: string;
    otpSecretExpiresIn: string;
  };
  bcrypt: {
    saltRounds: number;
  };
  email: {
    contactUsEmail: string;
    nodemailerEmail: string;
    nodemailerPassword: string;
  };
  admin: {
    email: string;
    password: string;
    otp: string;
  };
  cloudinary: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  };
  preferredWebsite: {
    name: string;
    emailColor: string;
    buttonColor: string;
  };
  defaultUserImage: string;
  firebase: {
    projectId: string;
    privateKey: string;
    clientEmail: string;
  };
  twilio: {
    sid: string;
    authToken: string;
    phoneNumber: string;
  };
  stripe: {
    secretKey: string;
    webhookSecret: string;
    stripeSuccessUrl: string;
    stripeFailedUrl: string;
    onboardingRefreshUrl: string;
    onboardingReturnUrl: string;
    connectClientId: string;
  };
  plaid: {
    clientId: string;
    secret: string;
    env: string;
    webhookUrl: string;
    webhookKey: string;
    redirectUri: string;
  };
  encryptionKey: string;
  awsConfig: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    s3BucketName: string;
  };
  basiq: {
    apiKey: string;
    baseUrl: string;
  };
}

const config: IConfig = {
  port: parseInt(process.env.PORT || '5001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  host: process.env.HOST || 'localhost',
  dbUrl: process.env.DB_URL || 'mongodb://localhost:27017/crescent_change',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  serverUrl: process.env.SERVER_URL || '',
  paymentSetting: {
    platformFeePercent: Number(process.env.PLATFORM_FEE_PERCENTAGE), // 5%
    gstPercentage: Number(process.env.GST_PERCENTAGE), // 10% GST in Australia
    stripeFeePercent: Number(process.env.STRIPE_FEE_PERCENTAGE), // 1.75% Domestic
    stripeFixedFee: Number(process.env.STRIPE_FIXED_FEE), // $0.30
    clearingPeriodDays: Number(process.env.CLEARING_PERIOD_DAYS),
  },
  jwt: {
    accessTokenSecret: process.env.JWT_ACCESS_SECRET || 'default_access_secret',
    refreshTokenSecret:
      process.env.JWT_REFRESH_SECRET || 'default_refresh_secret',
    otpSecret: process.env.JWT_OTP_SECRET || 'default_otp_secret',
    accessTokenExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    otpSecretExpiresIn: process.env.JWT_OTP_SECRET_EXPIRES_IN || '5m',
  },
  bcrypt: {
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
  },
  email: {
    contactUsEmail: process.env.CONTACT_US_EMAIL || 'contact@example.com',
    nodemailerEmail: process.env.EMAIL_FOR_NODEMAILER || '',
    nodemailerPassword: process.env.PASSWORD_FOR_NODEMAILER || '',
  },
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@example.com',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    otp: process.env.ADMIN_OTP || '123456',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  preferredWebsite: {
    name: process.env.PREFFERED_WEBSITE_NAME || 'Crescent Change',
    emailColor: process.env.EMAILCOLOR || '#4A90E2',
    buttonColor: process.env.BUTTONCOLOR || '#4A90E2',
  },
  defaultUserImage:
    process.env.DEFAULT_USER_IMAGE || 'https://example.com/default-avatar.png',
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    privateKey: process.env.FIREBASE_PRIVATE_KEY || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
  },
  twilio: {
    sid: process.env.TWILIO_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    stripeSuccessUrl: process.env.STRIPE_SUCCESS_URL!,
    stripeFailedUrl: process.env.STRIPE_CANCEL_URL!,
    onboardingRefreshUrl: process.env.STRIPE_ONBOARDING_REFRESH_URL || '',
    onboardingReturnUrl: process.env.STRIPE_ONBOARDING_RETURN_URL || '',
    connectClientId: process.env.STRIPE_CONNECT_CLIENT_ID || '',
  },
  plaid: {
    clientId: process.env.PLAID_CLIENT_ID || '',
    secret: process.env.PLAID_SECRET || '',
    env: process.env.PLAID_ENV || 'sandbox',
    webhookUrl: process.env.PLAID_WEBHOOK_URL || '',
    webhookKey: process.env.PLAID_WEBHOOK_KEY || '',
    redirectUri: process.env.PLAID_REDIRECT_URI!,
  },
  basiq: {
    apiKey: process.env.BASIQ_API_KEY || '',
    baseUrl: process.env.BASIQ_BASE_URL || 'https://au-api.basiq.io',
  },
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  awsConfig: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    s3BucketName: process.env.AWS_S3_BUCKET_NAME!,
  },
};

export default config;
