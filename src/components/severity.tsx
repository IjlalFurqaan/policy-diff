import { cn } from "@/lib/utils";
import { severityLabel } from "@/lib/tags";

const SEVERITY_STYLES: Record<number, string> = {
  1: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  2: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  3: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  4: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-300",
  5: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-300",
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: number | null;
  className?: string;
}) {
  const level = severity ?? 0;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        SEVERITY_STYLES[level] ?? SEVERITY_STYLES[1],
        className,
      )}
      title={`Severity ${level} of 5`}
    >
      <SeverityDots severity={level} />
      {severityLabel(severity)}
    </span>
  );
}

function SeverityDots({ severity }: { severity: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((step) => (
        <span
          key={step}
          className={cn(
            "size-1 rounded-full",
            step <= severity ? "bg-current" : "bg-current/25",
          )}
        />
      ))}
    </span>
  );
}
