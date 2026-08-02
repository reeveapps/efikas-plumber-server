// Config
export { getConfig, getB2CConfig } from "./config";
export type { DarajaConfig, DarajaEnvironment, DarajaB2CConfig } from "./config";

// Auth (exposed for advanced use; normally called internally)
export { getAccessToken } from "./auth";

// STK Push
export { stkPush, normalizePhone } from "./stk-push";
export type { StkPushParams, StkPushResponse } from "./stk-push";

// B2C (payouts / disbursements)
export { initiateB2C, parseB2CResult } from "./b2c";
export type { B2CParams, B2CResponse } from "./b2c";

// C2B
export { registerC2BURL } from "./c2b";
export type { C2BCallbackPayload } from "./c2b";

// QR Code
export { generateQR } from "./qr";
export type { GenerateQRParams, GenerateQRResponse } from "./qr";

// Transaction Status + Callback parsing
export { checkTransactionStatus, parseStkCallback } from "./status";
export type { TransactionStatusResponse } from "./status";
