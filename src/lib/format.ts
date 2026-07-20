const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/** UTC everywhere: these pages are cached and must not depend on the renderer. */
export function formatDate(date: Date): string {
  return DATE_FORMATTER.format(date);
}

export function formatDateTime(date: Date): string {
  return `${DATE_TIME_FORMATTER.format(date)} UTC`;
}

export function formatPercent(ratio: number): string {
  if (ratio === 0) return "0%";
  if (ratio < 0.001) return "<0.1%";
  if (ratio < 0.01) return `${(ratio * 100).toFixed(1)}%`;
  return `${Math.round(ratio * 100)}%`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
