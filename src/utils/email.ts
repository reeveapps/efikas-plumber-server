import { env } from '../config/env.js';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

// HTTP API rather than SMTP — SMTP ports (25/465/587) are blocked outbound on
// Railway (and most PaaS hosts) regardless of credentials/DNS config; this
// goes over plain HTTPS instead, which is never blocked.
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!env.BREVO_API_KEY) {
    if (env.NODE_ENV !== 'production') {
      console.log(`[EMAIL:dev] to=${to} subject="${subject}"\n${html}`);
      return;
    }
    throw new Error('Brevo is not configured (BREVO_API_KEY)');
  }

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Brevo API request failed (${response.status}): ${body}`);
  }
}
