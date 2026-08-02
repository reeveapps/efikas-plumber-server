import { getAccessToken } from "./auth";
import { getConfig } from "./config";

export interface TransactionStatusResponse {
  ResponseCode: string;
  ResponseDescription: string;
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: string;
  ResultDesc: string;
}

/**
 * Query the status of an STK Push transaction.
 * @param checkoutRequestId  The CheckoutRequestID returned by stkPush()
 */
export async function checkTransactionStatus(
  checkoutRequestId: string
): Promise<TransactionStatusResponse> {
  const { baseUrl, shortCode, passKey } = getConfig();
  const accessToken = await getAccessToken();

  const timestamp = getTimestamp();
  const password = Buffer.from(`${shortCode}${passKey}${timestamp}`).toString("base64");

  const body = {
    BusinessShortCode: shortCode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  const response = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Transaction status query failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<TransactionStatusResponse>;
}

/**
 * Parse a Daraja STK callback body to determine if the payment succeeded.
 */
export function parseStkCallback(body: {
  Body: {
    stkCallback: {
      ResultCode: number;
      ResultDesc: string;
      CheckoutRequestID: string;
      CallbackMetadata?: {
        Item: Array<{ Name: string; Value?: string | number }>;
      };
    };
  };
}): {
  success: boolean;
  checkoutRequestId: string;
  resultDesc: string;
  receiptNumber?: string;
  amount?: number;
  phone?: string;
} {
  const cb = body.Body.stkCallback;
  const success = cb.ResultCode === 0;
  const items = cb.CallbackMetadata?.Item ?? [];

  const get = (name: string) => items.find((i) => i.Name === name)?.Value;

  return {
    success,
    checkoutRequestId: cb.CheckoutRequestID,
    resultDesc: cb.ResultDesc,
    receiptNumber: success ? String(get("MpesaReceiptNumber") ?? "") : undefined,
    amount: success ? Number(get("Amount") ?? 0) : undefined,
    phone: success ? String(get("PhoneNumber") ?? "") : undefined,
  };
}

function getTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
}
