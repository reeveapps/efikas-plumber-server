import { env } from '../config/env.js';

const REQUEST_TIMEOUT_MS = 15_000;


function toMobile(to: string): string {
  const digits = to.replace(/\D/g, '');
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}


export async function sendSms(to: string, message: string): Promise<void> {
  const { TEXTSMS_API_KEY: apikey, TEXTSMS_PARTNER_ID: partnerID, TEXTSMS_SHORTCODE: shortcode } = env;

  if (!apikey || !partnerID || !shortcode) {
    if (env.NODE_ENV === 'production') throw new Error('SMS provider is not configured');
    console.log(`[SMS:dev] to=${toMobile(to)} message="${message}"`);
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(env.TEXTSMS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ apikey, partnerID, message, shortcode, mobile: toMobile(to) }),
      signal: controller.signal,
    });

    const body = (await response.json().catch(() => null)) as {
      responses?: Array<Record<string, unknown>>;
    } | null;
    const first = body?.responses?.[0];
    // The provider's own docs spell this key "respose-code"; accept the correct
    // spelling too in case they ever fix it.
    const code = Number(first?.['respose-code'] ?? first?.['response-code']);

    if (!response.ok || code !== 200) {
      // Never include the request body here — it carries the API key.
      throw new Error(`TextSMS did not accept the message: ${String(first?.['response-description'] ?? response.status)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
