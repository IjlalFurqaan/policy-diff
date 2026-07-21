import type { DiffJson, DiffPart } from "@/lib/crawler/diff";
import { countWords } from "@/lib/crawler/diff";
import { cn } from "@/lib/utils";

/** Unchanged runs longer than this are folded down to their edges. */
const COLLAPSE_THRESHOLD = 700;
const KEEP_EDGE = 260;

type Side = "old" | "new";

interface Segment {
  key: string;
  kind: "equal" | "changed" | "gap";
  text: string;
}

/**
 * Both columns fold the *same* unchanged parts, so the two sides stay roughly
 * level with each other as you scroll.
 */
function buildSegments(parts: DiffPart[], side: Side): Segment[] {
  const keepOp = side === "old" ? "delete" : "insert";
  const segments: Segment[] = [];

  parts.forEach((part, index) => {
    if (part.op !== "equal") {
      if (part.op === keepOp) {
        segments.push({ key: `c${index}`, kind: "changed", text: part.value });
      }
      return;
    }

    if (part.value.length <= COLLAPSE_THRESHOLD) {
      segments.push({ key: `e${index}`, kind: "equal", text: part.value });
      return;
    }

    const hasChangeBefore = index > 0;
    const hasChangeAfter = index < parts.length - 1;
    const head = hasChangeBefore ? part.value.slice(0, KEEP_EDGE) : "";
    const tail = hasChangeAfter ? part.value.slice(-KEEP_EDGE) : "";
    const hidden = part.value.length - head.length - tail.length;

    if (head) segments.push({ key: `e${index}h`, kind: "equal", text: head });
    if (hidden > 0) {
      segments.push({
        key: `e${index}g`,
        kind: "gap",
        text: `${countWords(part.value.slice(head.length, part.value.length - tail.length))} unchanged words`,
      });
    }
    if (tail) segments.push({ key: `e${index}t`, kind: "equal", text: tail });
  });

  return segments;
}

function Column({
  title,
  subtitle,
  parts,
  side,
}: {
  title: string;
  subtitle: string;
  parts: DiffPart[];
  side: Side;
}) {
  const segments = buildSegments(parts, side);

  return (
    <section className="min-w-0 flex-1">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </header>
      <div className="whitespace-pre-wrap break-words px-4 py-4 font-mono text-[13px] leading-relaxed">
        {segments.map((segment) => {
          if (segment.kind === "gap") {
            return (
              <span
                key={segment.key}
                className="my-3 flex items-center gap-3 font-sans text-xs text-muted-foreground select-none"
              >
                <span className="h-px flex-1 bg-border" />
                {segment.text}
                <span className="h-px flex-1 bg-border" />
              </span>
            );
          }
          if (segment.kind === "equal") {
            return <span key={segment.key}>{segment.text}</span>;
          }
          return (
            <mark
              key={segment.key}
              className={cn(
                "rounded-sm px-0.5 py-px",
                side === "old"
                  ? "bg-diff-del text-diff-del-foreground decoration-diff-del-strong line-through decoration-1"
                  : "bg-diff-add text-diff-add-foreground",
              )}
            >
              {segment.text}
            </mark>
          );
        })}
      </div>
    </section>
  );
}

export function DiffView({
  diff,
  oldLabel,
  newLabel,
}: {
  diff: DiffJson;
  oldLabel: string;
  newLabel: string;
}) {
  const { stats } = diff;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-diff-del-foreground">−{stats.removedWords}</span>{" "}
          <span className="font-medium text-diff-add-foreground">+{stats.addedWords}</span> words
          of {stats.totalWords}
        </span>
        <span>{diff.hunks.length} changed passage{diff.hunks.length === 1 ? "" : "s"}</span>
      </div>
      <div className="flex flex-col divide-y divide-border md:flex-row md:divide-x md:divide-y-0">
        <Column title="Before" subtitle={oldLabel} parts={diff.parts} side="old" />
        <Column title="After" subtitle={newLabel} parts={diff.parts} side="new" />
      </div>
    </div>
  );
}

export function DiffViewSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="h-10 border-b border-border" />
      <div className="flex flex-col divide-y divide-border md:flex-row md:divide-x md:divide-y-0">
        {["Before", "After"].map((label) => (
          <section key={label} className="min-w-0 flex-1">
            <header className="border-b border-border px-4 py-2.5">
              <h3 className="text-sm font-semibold">{label}</h3>
              <p className="text-xs text-muted-foreground">Loading…</p>
            </header>
            <div className="space-y-2.5 px-4 py-4" aria-hidden>
              {[92, 80, 96, 64, 88, 74, 90, 58].map((width, index) => (
                <div
                  key={index}
                  className="h-3 animate-pulse rounded bg-accent"
                  style={{ width: `${width}%` }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
