const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** An ISO timestamp as the pages show it, e.g. "6 Oct 2026, 12:00". */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}
