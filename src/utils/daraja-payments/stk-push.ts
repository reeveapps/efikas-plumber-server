import { getAccessToken } from "./auth";
import { getConfig } from "./config";

export interface StkPushParams {
  /** Customer phone number — format: 254XXXXXXXXX */
  phone: string;
  amount: number;
  /** Account reference shown on customer's phone */
  accountRef: string;
  /** Transaction description shown on customer's phone */
  description: string;
  /** Overrides the default `${callbackBaseUrl}/api/billing/mpesa-callback` result URL. */
  callbackUrl?: string;
}

export interface StkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

/**
 * Initiate an M-Pesa STK Push (Lipa Na Mpesa Online).
 * Returns the CheckoutRequestID — store it on the Bill to poll for status.
 */
export async function stkPush(params: StkPushParams): Promise<StkPushResponse> {
  const { baseUrl, shortCode, passKey, callbackBaseUrl } = getConfig();
  const accessToken = await getAccessToken();

  const timestamp = getTimestamp();
  const password = Buffer.from(`${shortCode}${passKey}${timestamp}`).toString("base64");
  // Normalize phone: strip leading + or 0 and ensure 254 prefix
  const phone = normalizePhone(params.phone);

  const body = {
    BusinessShortCode: shortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(params.amount),
    PartyA: phone,
    PartyB: shortCode,
    PhoneNumber: phone,
    CallBackURL: params.callbackUrl ?? `${callbackBaseUrl}/api/billing/mpesa-callback`,
    AccountReference: params.accountRef.slice(0, 12),
    TransactionDesc: params.description.slice(0, 13),
  };

  const response = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`STK Push failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<StkPushResponse>;
}

function getTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
}

export function normalizePhone(phone: string): string {
  const stripped = phone.replace(/\s+/g, "").replace(/^\+/, "");
  if (stripped.startsWith("0")) return `254${stripped.slice(1)}`;
  if (stripped.startsWith("254")) return stripped;
  return `254${stripped}`;
}
