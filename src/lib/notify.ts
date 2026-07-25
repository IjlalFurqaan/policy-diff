import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { changes, companies, documents, subscriptions } from "@/db/schema";
import { sendChangeNotification } from "@/lib/email";

/**
 * Emails everyone watching a company that one of its documents changed.
 *
 * Guarded by `changes.notifiedAt`: the row is stamped before any message goes
 * out, and a change that already carries a stamp is skipped. A crawl that runs
 * twice — a retried cron invocation, a manual re-run — therefore cannot send
 * the same notification twice.
 */
export async function notifySubscribers(changeId: string): Promise<number> {
  const [change] = await db
    .select({
      id: changes.id,
      headline: changes.headline,
      summary: changes.summary,
      published: changes.published,
      notifiedAt: changes.notifiedAt,
      companyId: companies.id,
      companyName: companies.name,
    })
    .from(changes)
    .innerJoin(documents, eq(changes.documentId, documents.id))
    .innerJoin(companies, eq(documents.companyId, companies.id))
    .where(eq(changes.id, changeId))
    .limit(1);

  if (!change || !change.published || change.notifiedAt) return 0;

  // Claim the change first. If this update matches nothing another run got
  // there ahead of us, and it owns the send.
  const [claimed] = await db
    .update(changes)
    .set({ notifiedAt: new Date() })
    .where(and(eq(changes.id, changeId), isNull(changes.notifiedAt)))
    .returning({ id: changes.id });

  if (!claimed) return 0;

  const recipients = await db
    .select({ email: subscriptions.email, token: subscriptions.unsubscribeToken })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.companyId, change.companyId),
        isNull(subscriptions.unsubscribedAt),
      ),
    );

  for (const recipient of recipients) {
    await sendChangeNotification({
      email: recipient.email,
      companyName: change.companyName,
      headline: change.headline ?? "A change was detected",
      summary: change.summary ?? "",
      changeId: change.id,
      unsubscribeToken: recipient.token,
    });
  }

  return recipients.length;
}
