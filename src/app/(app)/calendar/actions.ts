"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyError, requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { syncGoogleCalendar } from "@/lib/calendar-sync";
import type { ActionState } from "@/lib/action";

export async function syncNow(): Promise<ActionState> {
  const me = await requireMember();
  if (!me.perms.can_manage_attendance) return { error: "Only the VP Operations can sync the calendar." };
  try {
    const { synced } = await syncGoogleCalendar();
    revalidatePath("/calendar");
    return { ok: `Synced ${synced} events from Google Calendar.` };
  } catch (e) {
    console.error(e);
    return { error: e instanceof Error && e.message.includes("not configured") ? e.message : "Sync failed. Check the server logs." };
  }
}

const eventSchema = z.object({
  title: z.string().trim().min(1).max(300),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  location: z.string().trim().max(500).optional(),
  tz_offset: z.coerce.number().int().min(-900).max(900),
});

/** Manually add an event (for things not on the Google Calendar). */
export async function addEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireMember();
  const parsed = eventSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Fill in a title, start and end." };
  // datetime-local has no zone; the browser sends its offset so we store the right instant.
  const toIso = (local: string) => new Date(new Date(local + "Z").getTime() + parsed.data.tz_offset * 60_000).toISOString();
  const starts = toIso(parsed.data.starts_at);
  const ends = toIso(parsed.data.ends_at);
  if (Number.isNaN(Date.parse(starts)) || ends < starts) return { error: "End must be after start." };
  const supabase = await createClient();
  const { error } = await supabase.from("events").insert({
    title: parsed.data.title, starts_at: starts, ends_at: ends, location: parsed.data.location || null,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/calendar");
  return { ok: "Event added. Open it to set required/points." };
}
