import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

if (!accountSid || !authToken || !serviceSid) {
  throw new Error("Missing required Twilio environment variables.");
}

const client = twilio(accountSid, authToken);

/**
 * Sends an OTP to the target phone number via SMS
 * @param phoneNumber E.164 format (e.g., +254712345678)
 */
export async function sendOtp(phoneNumber: string) {
  return await client.verify.v2
    .services(serviceSid!)
    .verifications.create({ to: phoneNumber, channel: "sms" });
}

/**
 * Verifies the OTP entered by the user
 * @param phoneNumber E.164 format (e.g., +254712345678)
 * @param code 4-10 digit code submitted by user
 */
export async function verifyOtp(phoneNumber: string, code: string) {
  return await client.verify.v2
    .services(serviceSid!)
    .verificationChecks.create({ to: phoneNumber, code });
}