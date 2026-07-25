"use server";

import { eq } from "drizzle-orm";
import * as z from "zod/v4";

import { db } from "@/db";
import { companies, subscriptions } from "@/db/schema";
import { sendSubscriptionConfirmation } from "@/lib/email";
import type { SubscribeState } from "@/lib/subscription";

const subscribeSchema = z.object({
  companySlug: z.string().min(1).max(80),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  // Bots fill in every field they find; humans never see this one.
  website: z.string().max(0).optional().or(z.literal("")),
});

/**
 * Subscribes an address to one company's published changes.
 *
 * There are no accounts, so the address itself is the identity and the
 * unsubscribe token is the only credential. Re-subscribing an address that had
 * unsubscribed reactivates the existing row rather than creating a second one.
 */
export async function subscribeToCompany(
  _previous: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  const parsed = subscribeSchema.safeParse({
    companySlug: formData.get("companySlug"),
    email: formData.get("email"),
    website: formData.get("website") ?? "",
  });

  if (!parsed.success) {
    return { status: "error", message: "That does not look like an email address." };
  }

  // Honeypot hit: report success and do nothing.
  if (parsed.data.website) {
    return { status: "success", message: "Subscribed. Watch your inbox." };
  }

  const { companySlug, email } = parsed.data;

  const [company] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.slug, companySlug))
    .limit(1);

  if (!company) {
    return { status: "error", message: "That company is not being watched." };
  }

  const [row] = await db
    .insert(subscriptions)
    .values({ companyId: company.id, email })
    .onConflictDoUpdate({
      target: [subscriptions.companyId, subscriptions.email],
      set: { unsubscribedAt: null },
    })
    .returning({ token: subscriptions.unsubscribeToken });

  await sendSubscriptionConfirmation({
    email,
    companyName: company.name,
    companySlug,
    unsubscribeToken: row.token,
  });

  return {
    status: "success",
    message: `Subscribed. You will get an email when ${company.name} changes its terms.`,
  };
}

export async function unsubscribe(token: string): Promise<boolean> {
  const parsed = z.uuid().safeParse(token);
  if (!parsed.success) return false;

  // Idempotent: unsubscribing twice simply rewrites the timestamp.
  const [row] = await db
    .update(subscriptions)
    .set({ unsubscribedAt: new Date() })
    .where(eq(subscriptions.unsubscribeToken, parsed.data))
    .returning({ id: subscriptions.id });

  return Boolean(row);
}
