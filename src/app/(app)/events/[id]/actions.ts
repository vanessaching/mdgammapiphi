"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyError, requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action";

const uuid = z.string().uuid();
const PROOF_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif|pdf)$/;

export async function submitExcusal(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const parsed = z.object({
    event_id: uuid,
    reason: z.string().trim().min(1, "Enter a reason.").max(2000, "Keep the reason under 2000 characters."),
    is_emergency: z.literal("on").optional(),
    proof_path: z.string().regex(PROOF_PATH).optional().or(z.literal("")),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { event_id, reason, is_emergency, proof_path } = parsed.data;
  if (proof_path && !proof_path.startsWith(`${me.id}/`)) return { error: "Invalid proof upload." };

  const supabase = await createClient();
  const { error } = await supabase.from("excusals").insert({
    event_id, reason, is_emergency: is_emergency === "on", proof_path: proof_path || null,
  });
  if (error) {
    if (proof_path) await supabase.storage.from("excusal-proofs").remove([proof_path]);
    return { error: error.code === "23505" ? "You already submitted an excusal for this event." : friendlyError(error) };
  }
  revalidatePath(`/events/${event_id}`);
  revalidatePath("/excusals");
  return { ok: "Excusal submitted. You'll be notified when the VPO reviews it." };
}

export async function withdrawExcusal(excusalId: string, eventId: string): Promise<ActionState> {
  await requireMember();
  if (!uuid.safeParse(excusalId).success) return { error: "Invalid excusal." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("excusals").delete().eq("id", excusalId).eq("status", "pending").select("proof_path");
  if (error || !data?.length) return { error: "Only pending excusals can be withdrawn." };
  if (data[0].proof_path) await supabase.storage.from("excusal-proofs").remove([data[0].proof_path]);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/excusals");
  return { ok: "Excusal withdrawn." };
}

export async function updateEventSettings(eventId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  if (!me.perms.can_manage_attendance) return { error: "Only the VP Operations can change event settings." };
  const parsed = z.object({
    points: z.coerce.number().int().min(0).max(1000),
    excusal_deadline_hours: z.coerce.number().int().min(0).max(720),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success || !uuid.safeParse(eventId).success) return { error: "Points must be 0–1000 and the deadline 0–720 hours." };
  const supabase = await createClient();
  const { error, data } = await supabase.from("events").update({
    ...parsed.data,
    is_required: fd.get("is_required") === "on",
    allow_emergency: fd.get("allow_emergency") === "on",
  }).eq("id", eventId).select("id");
  if (error || !data?.length) return { error: friendlyError(error) };
  revalidatePath(`/events/${eventId}`);
  return { ok: "Settings saved." };
}

export async function saveRoster(eventId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  if (!me.perms.can_manage_attendance) return { error: "Only the VP Operations can take attendance." };
  const present = fd.getAll("present").map(String).filter((v) => uuid.safeParse(v).success);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_attendance", { p_event: eventId, p_present: present });
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/attendance");
  return { ok: `Attendance saved: ${present.length} present.` };
}
