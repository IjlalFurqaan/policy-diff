"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { initialSubscribeState, subscribeToCompany } from "@/app/actions/subscribe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SubscribeForm({
  companySlug,
  companyName,
}: {
  companySlug: string;
  companyName: string;
}) {
  const [state, formAction] = useActionState(subscribeToCompany, initialSubscribeState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="companySlug" value={companySlug} />
      {/* Honeypot — hidden from people, irresistible to bots. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute left-[-9999px] size-0"
      />

      <label htmlFor={`email-${companySlug}`} className="sr-only">
        Email address
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={`email-${companySlug}`}
          type="email"
          name="email"
          required
          maxLength={254}
          placeholder="you@example.com"
          aria-describedby={`subscribe-status-${companySlug}`}
        />
        <SubmitButton />
      </div>

      <p
        id={`subscribe-status-${companySlug}`}
        role="status"
        aria-live="polite"
        className={cn(
          "min-h-5 text-xs",
          state.status === "error" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {state.status === "idle"
          ? `One email per published change to ${companyName}. Unsubscribe any time.`
          : state.message}
      </p>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="sm:w-32">
      {pending ? "Subscribing…" : "Notify me"}
    </Button>
  );
}
