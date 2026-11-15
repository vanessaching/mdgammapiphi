import { describe, expect, it } from "vitest";
import { mapGoogleEvent, zonedMidnight } from "@/lib/google-map";

describe("Google Calendar mapping", () => {
  it("maps a timed event", () => {
    const row = mapGoogleEvent({
      id: "abc", summary: " Chapter ", location: "Room 1", description: "Bring <b>pin</b><br>Wear white &amp; wine",
      start: { dateTime: "2026-11-16T19:00:00-05:00" }, end: { dateTime: "2026-11-16T20:30:00-05:00" },
    }, "America/New_York");
    expect(row).toEqual({
      google_event_id: "abc", title: "Chapter", location: "Room 1", description: "Bring pin\nWear white & wine",
      starts_at: "2026-11-17T00:00:00.000Z", ends_at: "2026-11-17T01:30:00.000Z", cancelled: false,
    });
  });
  it("maps all-day events to midnight in the chapter time zone (DST-aware)", () => {
    expect(zonedMidnight("2026-11-16", "America/New_York")).toBe("2026-11-16T05:00:00.000Z");
    expect(zonedMidnight("2026-07-04", "America/New_York")).toBe("2026-07-04T04:00:00.000Z");
    expect(zonedMidnight("2026-07-04", "America/Los_Angeles")).toBe("2026-07-04T07:00:00.000Z");
    const row = mapGoogleEvent({ id: "d", start: { date: "2026-11-16" }, end: { date: "2026-11-17" } }, "America/New_York");
    expect(row?.title).toBe("Untitled event");
    expect(row?.starts_at).toBe("2026-11-16T05:00:00.000Z");
  });
  it("marks cancelled events and skips broken ones", () => {
    expect(mapGoogleEvent({ id: "x", status: "cancelled", start: { dateTime: "2026-11-16T19:00:00Z" }, end: { dateTime: "2026-11-16T20:00:00Z" } }, "UTC")?.cancelled).toBe(true);
    expect(mapGoogleEvent({ id: "y" }, "UTC")).toBeNull();
  });
  it("truncates oversized fields to the database limits", () => {
    const row = mapGoogleEvent({ id: "z", summary: "x".repeat(500), start: { dateTime: "2026-11-16T19:00:00Z" }, end: { dateTime: "2026-11-16T20:00:00Z" } }, "UTC");
    expect(row?.title.length).toBe(300);
  });
});
