import "server-only";
import { JWT } from "google-auth-library";
import { createAdminClient } from "./supabase/admin";
import { serverEnv, publicEnv } from "./env";
import { mapGoogleEvent, type GoogleEvent } from "./google-map";

/**
 * Pull the chapter's Google Calendar into `events`.
 * Only calendar-owned fields (title, time, place, cancelled) are written, so the
 * VPO's settings (required, points, deadline) survive every sync.
 */
export async function syncGoogleCalendar(): Promise<{ synced: number }> {
  const env = serverEnv();
  if (!env.googleCalendarId || (!env.googleServiceAccountJson && !env.googleApiKey)) {
    throw new Error("Google Calendar is not configured (set GOOGLE_CALENDAR_ID and GOOGLE_API_KEY or GOOGLE_SERVICE_ACCOUNT_JSON).");
  }
  // Private calendar: service account the calendar is shared with.
  // Public calendar: a plain API key is enough.
  let get: (url: string) => Promise<{ items?: GoogleEvent[]; nextPageToken?: string }>;
  if (env.googleServiceAccountJson) {
    const creds = JSON.parse(env.googleServiceAccountJson) as { client_email: string; private_key: string };
    const jwt = new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });
    get = async (url) => (await jwt.request<{ items?: GoogleEvent[]; nextPageToken?: string }>({ url })).data;
  } else {
    get = async (url) => {
      const res = await fetch(`${url}&key=${encodeURIComponent(env.googleApiKey!)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Google Calendar API error ${res.status}. Is the calendar public?`);
      return res.json();
    };
  }

  const timeMin = new Date(Date.now() - 60 * 86400_000).toISOString();
  const timeMax = new Date(Date.now() + 365 * 86400_000).toISOString();
  const items: GoogleEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({
      singleEvents: "true", showDeleted: "true", maxResults: "250", orderBy: "startTime", timeMin, timeMax,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.googleCalendarId)}/events?${params}`;
    const data = await get(url);
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  const rows = items.map((e) => mapGoogleEvent(e, publicEnv.timeZone)).filter((r) => r !== null);
  if (rows.length === 0) return { synced: 0 };
  const { error } = await createAdminClient().from("events").upsert(rows, { onConflict: "google_event_id" });
  if (error) throw new Error(`Calendar upsert failed: ${error.message}`);
  return { synced: rows.length };
}
