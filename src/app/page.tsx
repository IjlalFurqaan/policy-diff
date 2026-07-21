import Link from "next/link";

import { ChangeCard } from "@/components/change-card";
import { getFeed } from "@/lib/queries";
import { pluralize } from "@/lib/format";

export default async function HomePage() {
  const feed = await getFeed();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Recent changes</h1>
        <p className="text-sm text-muted-foreground">
          Every published change, newest first. Cosmetic edits — a rotated date, a smart quote, a
          reordered list — are filtered out and never reach this page.
        </p>
      </div>

      {feed.length === 0 ? (
        <EmptyFeed />
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">{pluralize(feed.length, "change")}</p>
          <ul className="space-y-4">
            {feed.map((change) => (
              <li key={change.id}>
                <ChangeCard change={change} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <h2 className="font-medium">Nothing published yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        The crawler stores the first version of every document as a baseline without recording a
        change. Changes appear here once a document is edited after that baseline.
      </p>
      <Link
        href="/companies"
        className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
      >
        See what is being watched
      </Link>
    </div>
  );
}
