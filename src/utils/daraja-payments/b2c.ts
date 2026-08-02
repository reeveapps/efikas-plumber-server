import { constants, publicEncrypt } from "node:crypto";
import { getAccessToken } from "./auth";
import { getConfig, getB2CConfig } from "./config";
import { normalizePhone } from "./stk-push";

export interface B2CParams {
  phone: string;
  amount: number;
  remarks: string;
  occasion?: string;
}

export interface B2CResponse {
  ConversationID: string;
  OriginatorConversationID: string;
  ResponseCode: string;
  ResponseDescription: string;
}

function getSecurityCredential(): string {
  const { initiatorPassword, cert } = getB2CConfig();
  return publicEncrypt(
    { key: cert, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(initiatorPassword)
  ).toString("base64");
}

export async function initiateB2C(params: B2CParams): Promise<B2CResponse> {
  const { baseUrl, callbackBaseUrl } = getConfig();
  const { initiatorName, b2cShortCode } = getB2CConfig();
  const accessToken = await getAccessToken();

  const body = {
    InitiatorName: initiatorName,
    SecurityCredential: getSecurityCredential(),
    CommandID: "BusinessPayment",
    Amount: Math.round(params.amount),
    PartyA: b2cShortCode,
    PartyB: normalizePhone(params.phone),
    Remarks: params.remarks.slice(0, 100),
    QueueTimeOutURL: `${callbackBaseUrl}/api/billing/mpesa-b2c-timeout`,
    ResultURL: `${callbackBaseUrl}/api/billing/mpesa-b2c-result`,
    Occasion: (params.occasion ?? "Withdrawal").slice(0, 100),
  };

  const response = await fetch(`${baseUrl}/mpesa/b2c/v1/paymentrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`B2C payment request failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<B2CResponse>;
}

export function parseB2CResult(body: {
  Result: {
    ResultType: number;
    ResultCode: number;
    ResultDesc: string;
    OriginatorConversationID: string;
    ConversationID: string;
    TransactionID?: string;
    ResultParameters?: {
      ResultParameter: Array<{ Key: string; Value?: string | number }>;
    };
  };
}): {
  success: boolean;
  conversationId: string;
  resultDesc: string;
  receiptNumber?: string;
  amount?: number;
} {
  const result = body.Result;
  const success = result.ResultCode === 0;
  const items = result.ResultParameters?.ResultParameter ?? [];
  const get = (key: string) => items.find((i) => i.Key === key)?.Value;

  return {
    success,
    conversationId: result.ConversationID,
    resultDesc: result.ResultDesc,
    receiptNumber: success ? String(get("TransactionReceipt") ?? result.TransactionID ?? "") : undefined,
    amount: success ? Number(get("TransactionAmount") ?? 0) : undefined,
  };
}
