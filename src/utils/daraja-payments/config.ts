export type DarajaEnvironment = "sandbox" | "production";

export interface DarajaConfig {
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  passKey: string;
  callbackBaseUrl: string;
  environment: DarajaEnvironment;
  baseUrl: string;
}

export function getConfig(): DarajaConfig {
  const consumerKey = process.env["DARAJA_CONSUMER_KEY"];
  const consumerSecret = process.env["DARAJA_CONSUMER_SECRET"];
  const shortCode = process.env["DARAJA_SHORTCODE"];
  const passKey = process.env["DARAJA_PASSKEY"];
  const callbackBaseUrl = process.env["DARAJA_CALLBACK_URL"];
  const environment = (process.env["DARAJA_ENVIRONMENT"] ?? "sandbox") as DarajaEnvironment;

  if (!consumerKey || !consumerSecret || !shortCode || !passKey || !callbackBaseUrl) {
    throw new Error(
      "Missing Daraja env vars: DARAJA_CONSUMER_KEY, DARAJA_CONSUMER_SECRET, DARAJA_SHORTCODE, DARAJA_PASSKEY, DARAJA_CALLBACK_URL"
    );
  }

  const baseUrl =
    environment === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";

  return { consumerKey, consumerSecret, shortCode, passKey, callbackBaseUrl, environment, baseUrl };
}

export interface DarajaB2CConfig {
  initiatorName: string;
  initiatorPassword: string;
  b2cShortCode: string;
  cert: string;
}

export function getB2CConfig(): DarajaB2CConfig {
  const initiatorName = process.env["DARAJA_INITIATOR_NAME"];
  const initiatorPassword = process.env["DARAJA_INITIATOR_PASSWORD"];
  const cert = process.env["DARAJA_B2C_CERT"];
  const b2cShortCode = process.env["DARAJA_B2C_SHORTCODE"] ?? process.env["DARAJA_SHORTCODE"];

  if (!initiatorName || !initiatorPassword || !cert || !b2cShortCode) {
    throw new Error(
      "Missing Daraja B2C env vars: DARAJA_INITIATOR_NAME, DARAJA_INITIATOR_PASSWORD, DARAJA_B2C_CERT, DARAJA_B2C_SHORTCODE (or DARAJA_SHORTCODE)"
    );
  }

  return { initiatorName, initiatorPassword, b2cShortCode, cert: cert.replace(/\\n/g, "\n") };
}
