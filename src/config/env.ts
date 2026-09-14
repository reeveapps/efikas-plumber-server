import dotenv from 'dotenv';
dotenv.config();

export const env = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'jwt-secret-change-in-production',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'jwt-refresh-secret-change-in-production',
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || 'localhost',
  PARTNER_CLIENT_URL: process.env.PARTNER_CLIENT_URL || 'http://localhost:3000',
  ADMIN_APP_URL: process.env.ADMIN_APP_URL || 'http://localhost:3002',
  MARKETING_CLIENT_URL: process.env.MARKETING_CLIENT_URL || 'http://localhost:3003',

  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID || '',
  CF_ACCESS_KEY_ID: process.env.CF_ACCESS_KEY_ID || '',
  CF_SECRET_ACCESS_KEY: process.env.CF_SECRET_ACCESS_KEY || '',
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || '',
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || '',

  MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY || '',
  MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET || '',
  MPESA_SHORTCODE: process.env.MPESA_SHORTCODE || '',
  MPESA_PASSKEY: process.env.MPESA_PASSKEY || '',
  MPESA_CALLBACK_URL: process.env.MPESA_CALLBACK_URL || '',

  // Brevo transactional email API — HTTP-based (not SMTP), since SMTP ports
  // are blocked outbound on Railway and most PaaS hosts regardless of config.
  BREVO_API_KEY: process.env.BREVO_API_KEY || '',
  BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL || 'noreply@efikasplumber.com',
  BREVO_SENDER_NAME: process.env.BREVO_SENDER_NAME || 'Efikas Plumber',
  JWT_RESET_SECRET: process.env.JWT_RESET_SECRET || 'jwt-reset-secret-change-in-prod',
 //For whatsapp
  META_API_TOKEN: process.env.META_API_TOKEN || '',
  META_PHONE_NUMBER_ID: process.env.META_PHONE_NUMBER_ID || '',

  AFRICAS_TALKING_API_KEY: process.env.AFRICAS_TALKING_API_KEY || '',
  AFRICAS_TALKING_USERNAME: process.env.AFRICAS_TALKING_USERNAME || '',

  //push nots
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || '',
  FIREBASE_PRIVATE_KEY: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),

  GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
  APPLE_OAUTH_CLIENT_ID: process.env.APPLE_OAUTH_CLIENT_ID || '',

  // Shared secret embedded in the Daraja callback URL path to authenticate inbound webhooks.
  MPESA_CALLBACK_SECRET: process.env.MPESA_CALLBACK_SECRET || '',

  // Gates POST /admin/setup-super-admin — the one-time bootstrap endpoint that
  // creates the first super admin before any admin account exists. Leave unset
  // to disable the endpoint entirely (recommended once bootstrap is done).
  SUPER_ADMIN_SETUP_SECRET: process.env.SUPER_ADMIN_SETUP_SECRET || '',
} as const;
