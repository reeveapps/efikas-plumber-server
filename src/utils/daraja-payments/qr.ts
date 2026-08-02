import { getAccessToken } from "./auth";
import { getConfig } from "./config";

export interface GenerateQRParams {
  amount: number;
  /** Reference displayed on the QR — e.g. "INV-0042" (max 12 chars) */
  merchantRef: string;
  /** Merchant name shown on the customer's M-Pesa app */
  merchantName?: string;
}

export interface GenerateQRResponse {
  ResponseCode: string;
  ResponseDescription: string;
  /** Base64 QR code image string */
  QRCode: string;
}

/**
 * Generate a Daraja M-Pesa QR code for display at the reception desk.
 */
export async function generateQR(params: GenerateQRParams): Promise<GenerateQRResponse> {
  const { baseUrl, shortCode } = getConfig();
  const accessToken = await getAccessToken();

  const body = {
    MerchantName: params.merchantName ?? "GEM Health",
    RefNo: params.merchantRef.slice(0, 12),
    Amount: Math.round(params.amount),
    TrxCode: "PB", // Paybill
    CPI: shortCode,
    Size: "300",
  };

  const response = await fetch(`${baseUrl}/mpesa/qrcode/v1/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`QR generation failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<GenerateQRResponse>;
}
