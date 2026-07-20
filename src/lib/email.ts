import "server-only";

import { Resend } from "resend";

const FROM = process.env.RESEND_FROM || "Policy Diff <alerts@localhost>";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

let resend: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resend) resend = new Resend(key);
  return resend;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Sending is best-effort: a subscription that is stored but whose confirmation
 * bounced is recoverable, a request that 500s because Resend was down is not.
 * With no RESEND_API_KEY the mail is logged instead, which is what happens in
 * development.
 */
async function send(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const client = getResend();
  if (!client) {
    console.info(`[email] would send to ${options.to}: ${options.subject}`);
    return;
  }

  try {
    const { error } = await client.emails.send({
      from: FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    if (error) console.error("[email] Resend rejected the message:", error);
  } catch (error) {
    console.error("[email] send failed:", error);
  }
}

export async function sendSubscriptionConfirmation(input: {
  email: string;
  companyName: string;
  companySlug: string;
  unsubscribeToken: string;
}): Promise<void> {
  const timelineUrl = `${siteUrl()}/company/${input.companySlug}`;
  const unsubscribeUrl = `${siteUrl()}/unsubscribe/${input.unsubscribeToken}`;
  const company = escapeHtml(input.companyName);

  await send({
    to: input.email,
    subject: `You are watching ${input.companyName} on Policy Diff`,
    text: [
      `You will get an email whenever ${input.companyName} changes its terms of service or privacy policy.`,
      ``,
      `Timeline: ${timelineUrl}`,
      `Unsubscribe: ${unsubscribeUrl}`,
    ].join("\n"),
    html: `<p>You will get an email whenever <strong>${company}</strong> changes its terms of service or privacy policy.</p>
<p><a href="${timelineUrl}">See the timeline so far</a></p>
<p style="color:#666;font-size:13px">Not you, or changed your mind? <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>`,
  });
}

export async function sendChangeNotification(input: {
  email: string;
  companyName: string;
  headline: string;
  summary: string;
  changeId: string;
  unsubscribeToken: string;
}): Promise<void> {
  const changeUrl = `${siteUrl()}/change/${input.changeId}`;
  const unsubscribeUrl = `${siteUrl()}/unsubscribe/${input.unsubscribeToken}`;

  await send({
    to: input.email,
    subject: `${input.companyName}: ${input.headline}`,
    text: [input.headline, "", input.summary, "", `Full diff: ${changeUrl}`, `Unsubscribe: ${unsubscribeUrl}`].join(
      "\n",
    ),
    html: `<h2 style="margin:0 0 8px">${escapeHtml(input.headline)}</h2>
<p>${escapeHtml(input.summary)}</p>
<p><a href="${changeUrl}">Read the full diff</a></p>
<p style="color:#666;font-size:13px"><a href="${unsubscribeUrl}">Unsubscribe from ${escapeHtml(input.companyName)}</a></p>`,
  });
}
