// JWT expiry
export const JWT_ACCESS_EXPIRY = '4h';
export const JWT_REFRESH_EXPIRY = '20d';

// OTP
export const OTP_EXPIRY_SECONDS = 600; // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_REQUEST_RATE_LIMIT_PER_HOUR = 10;

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Job matching (see jobs/matching.cron.ts)
export const JOB_OFFER_TIMEOUT_SECONDS = 60;
export const JOB_OFFER_MAX_CANDIDATES = 5;
