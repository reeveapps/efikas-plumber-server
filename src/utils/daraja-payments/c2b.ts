import { getAccessToken } from "./auth";
import { getConfig } from "./config";

export interface C2BCallbackPayload {
  TransactionType: string;
  TransID: string;
  TransTime: string;
  TransAmount: string;
  BusinessShortCode: string;
  BillRefNumber: string;
  InvoiceNumber: string;
  OrgAccountBalance: string;
  ThirdPartyTransID: string;
  MSISDN: string;
  FirstName: string;
  MiddleName: string;
  LastName: string;
}

export async function registerC2BURL(): Promise<void> {
  const { baseUrl, shortCode, callbackBaseUrl } = getConfig();
  const accessToken = await getAccessToken();

  const body = {
    ShortCode: shortCode,
    ResponseType: "Completed",
    ConfirmationURL: `${callbackBaseUrl}/api/billing/mpesa-callback`,
    ValidationURL: `${callbackBaseUrl}/api/billing/mpesa-validate`,
  };

  const response = await fetch(`${baseUrl}/mpesa/c2b/v1/registerurl`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`C2B URL registration failed (${response.status}): ${text}`);
  }
}
