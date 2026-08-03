import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      // Forces IPv4 — smtp.gmail.com resolves to both A and AAAA records, and
      // some hosts (e.g. Railway) have no IPv6 egress, so an AAAA connection
      // attempt hangs until ENETUNREACH instead of falling back to IPv4.
      // `as any`: @types/nodemailer is stuck at 8.0.1 (nodemailer itself
      // ships no types; there's no newer DefinitelyTyped release yet) and
      // that version's SMTPConnection.Options doesn't model `family` at all,
      // which throws off createTransport's overload resolution entirely.
      family: 4,
    } as any);
  }
  return transporter;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    if (env.NODE_ENV !== 'production') {
      console.log(`[EMAIL:dev] to=${to} subject="${subject}"\n${html}`);
      return;
    }
    throw new Error('SMTP is not configured (SMTP_USER/SMTP_PASS)');
  }

  await getTransporter().sendMail({
    from: env.SMTP_FROM_EMAIL,
    to,
    subject,
    html,
  });
}
