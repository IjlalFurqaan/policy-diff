import type { Metadata } from "next";
import { Suspense } from "react";

import { unsubscribe } from "@/app/actions/subscribe";
import { UnsubscribeCard } from "@/components/unsubscribe-card";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function UnsubscribePage({ params }: PageProps) {
  // `params` is uncached, so reading it has to happen inside a boundary — the
  // shell prerenders and the token is filled in per request.
  return (
    <Suspense fallback={<UnsubscribeCard />}>
      <UnsubscribeForm params={params} />
    </Suspense>
  );
}

async function UnsubscribeForm({ params }: PageProps) {
  const { token } = await params;

  /**
   * A GET must not unsubscribe anyone: mail clients prefetch links, and a
   * prefetch that silently cancels a subscription is a bug. The confirmation
   * button posts instead.
   */
  async function confirm() {
    "use server";
    return unsubscribe(token);
  }

  return <UnsubscribeCard action={confirm} />;
}
