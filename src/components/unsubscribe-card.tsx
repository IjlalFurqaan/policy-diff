"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type State = "pending" | "done" | "unknown";

/**
 * Rendered without an `action` while the token is still resolving, which keeps
 * the prerendered shell and the interactive form visually identical.
 */
export function UnsubscribeCard({ action }: { action?: () => Promise<boolean> }) {
  const [state, formAction] = useActionState<State>(
    async () => ((await action?.()) ? "done" : "unknown"),
    "pending",
  );

  if (state !== "pending") {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">
          {state === "done" ? "Unsubscribed" : "Nothing to unsubscribe"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {state === "done"
            ? "That address will not receive any further notifications for this company."
            : "That link does not match a subscription. It may already have been used."}
        </p>
        <p className="mt-4 text-sm">
          <Link href="/" className="underline underline-offset-4">
            Back to Policy Diff
          </Link>
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-lg font-semibold">Unsubscribe</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Confirm and this address stops receiving change notifications for that company. You can
        resubscribe from the company page at any time.
      </p>
      <form action={formAction} className="mt-4">
        <SubmitButton disabled={!action} />
      </form>
    </Shell>
  );
}

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Unsubscribing…" : "Unsubscribe me"}
    </Button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card className="p-6">{children}</Card>
    </div>
  );
}
