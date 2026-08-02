import { env } from '../config/env.js';
import twilio from "twilio"

export async function sendSms(to: string, message: string): Promise<void> {
  try{const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!accountSid || !authToken || !serviceSid) {
    throw new Error("Missing required Twilio environment variables.");
  }

  const client = twilio(accountSid, authToken);
  const response = await client.verify.v2
    .services(serviceSid!)
    .verifications.create({ to, channel: "sms" });
 
  }
  catch(err){
    throw new Error("Twilio OTP message failed to send");
  }
}

