/** Pure mapping from a Google Calendar API event to an `events` row (unit-tested). */
export type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

export type SyncedEventRow = {
  google_event_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  cancelled: boolean;
};

/** Midnight of a YYYY-MM-DD date in the given IANA time zone, as an ISO instant. */
export function zonedMidnight(date: string, timeZone: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
  );
  const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess - (asIfUtc - guess)).toISOString();
}

const clip = (s: string | undefined, n: number) => (s ? s.slice(0, n) : null);
const stripHtml = (s: string | undefined) =>
  s?.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();

export function mapGoogleEvent(e: GoogleEvent, timeZone: string): SyncedEventRow | null {
  if (!e.id) return null;
  const start = e.start?.dateTime ?? (e.start?.date ? zonedMidnight(e.start.date, timeZone) : null);
  const end = e.end?.dateTime ?? (e.end?.date ? zonedMidnight(e.end.date, timeZone) : null);
  if (!start || !end) return null;
  const startIso = new Date(start).toISOString();
  let endIso = new Date(end).toISOString();
  if (endIso < startIso) endIso = startIso;
  return {
    google_event_id: e.id,
    title: clip(e.summary?.trim() || "Untitled event", 300)!,
    description: clip(stripHtml(e.description), 10000),
    location: clip(e.location, 500),
    starts_at: startIso,
    ends_at: endIso,
    cancelled: e.status === "cancelled",
  };
}
