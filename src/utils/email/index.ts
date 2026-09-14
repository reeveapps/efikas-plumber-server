import { sendEmail } from '../email.js';
import { env } from '../../config/env.js';

const BRAND_COLOR = '#0B6B4F';

function layout(preheader: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <span style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:${BRAND_COLOR};padding:20px 32px;">
                <span style="color:#ffffff;font-size:20px;font-weight:700;">Efikas Plumber</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#18181b;font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background-color:#fafafa;color:#71717a;font-size:12px;">
                This is an automated message from the Efikas Plumber platform.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background-color:${BRAND_COLOR};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin-top:8px;">${label}</a>`;
}

export async function sendTwoFactorCodeEmail(params: { to: string; code: string }): Promise<void> {
  const { to, code } = params;
  const html = layout(
    `Your verification code is ${code}`,
    `<p>Your Efikas Plumber admin console verification code is:</p>
     <p style="font-size:28px;font-weight:700;letter-spacing:4px;color:${BRAND_COLOR};margin:16px 0;">${code}</p>
     <p>It expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>`
  );
  await sendEmail(to, 'Your Efikas Plumber verification code', html);
}

export async function sendDeliveryRequestEmail(params: {
  to: string;
  partnerName: string;
  productName: string;
  quantity: number;
  address: string;
  contactPhone: string;
}): Promise<void> {
  const { to, partnerName, productName, quantity, address, contactPhone } = params;
  const html = layout(
    `New delivery request for ${productName}`,
    `<p>Hi ${partnerName},</p>
     <p>You've received a new delivery request for <strong>${productName}</strong>.</p>
     <p><strong>Quantity:</strong> ${quantity}<br/>
        <strong>Delivery address:</strong> ${address}<br/>
        <strong>Contact phone:</strong> ${contactPhone}</p>
     <p>${button(`${env.PARTNER_CLIENT_URL}/partner/delivery-requests`, 'View delivery requests')}</p>`
  );
  await sendEmail(to, `New delivery request, ${productName}`, html);
}

export async function sendCampaignApprovedEmail(params: {
  to: string;
  partnerName: string;
  productName: string;
}): Promise<void> {
  const { to, partnerName, productName } = params;
  const html = layout(
    `Your campaign for ${productName} was approved`,
    `<p>Hi ${partnerName},</p>
     <p>Good news, your ad campaign for <strong>${productName}</strong> has been approved and is now pending payment. Please pay the billed amount to get it running.</p>
     <p>${button(`${env.PARTNER_CLIENT_URL}/partner/campaigns`, 'View campaigns')}</p>`
  );
  await sendEmail(to, `Campaign approved, ${productName}`, html);
}

export async function sendContentApprovedEmail(params: {
  to: string;
  partnerName: string;
  contentTitle: string;
}): Promise<void> {
  const { to, partnerName, contentTitle } = params;
  const html = layout(
    `Your training content "${contentTitle}" was approved`,
    `<p>Hi ${partnerName},</p>
     <p>Your training content <strong>${contentTitle}</strong> has been approved and is now published for plumbers to view.</p>
     <p>${button(`${env.PARTNER_CLIENT_URL}/partner/content`, 'View content')}</p>`
  );
  await sendEmail(to, `Training content approved, ${contentTitle}`, html);
}

export async function sendProductApprovedEmail(params: {
  to: string;
  partnerName: string;
  productName: string;
}): Promise<void> {
  const { to, partnerName, productName } = params;
  const html = layout(
    `Your product "${productName}" was approved`,
    `<p>Hi ${partnerName},</p>
     <p>Your product <strong>${productName}</strong> has been approved and is now live for customers and plumbers to see.</p>
     <p>${button(`${env.PARTNER_CLIENT_URL}/partner/products`, 'View products')}</p>`
  );
  await sendEmail(to, `Product approved, ${productName}`, html);
}

export async function sendPartnerAccountApprovedEmail(params: {
  to: string;
  partnerName: string;
}): Promise<void> {
  const { to, partnerName } = params;
  const html = layout(
    'Your Efikas Plumber partner account was approved',
    `<p>Hi ${partnerName},</p>
     <p>Your partner account has been verified and approved. You can now list products, run ad campaigns, and publish training content.</p>
     <p>${button(`${env.PARTNER_CLIENT_URL}/partner/dashboard`, 'Go to your dashboard')}</p>`
  );
  await sendEmail(to, 'Your Efikas Plumber partner account was approved', html);
}

export async function sendAdminInviteEmail(params: {
  to: string;
  name: string;
  inviteUrl: string;
}): Promise<void> {
  const { to, name, inviteUrl } = params;
  const html = layout(
    "You're invited to the Efikas Plumber admin console",
    `<p>Hi ${name},</p>
     <p>You've been invited to join the Efikas Plumber admin console. Set your password to get started:</p>
     <p>${button(inviteUrl, 'Set your password')}</p>
     <p>This link expires in 7 days.</p>`
  );
  await sendEmail(to, "You're invited to the Efikas Plumber admin console", html);
}
