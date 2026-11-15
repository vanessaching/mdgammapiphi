"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyError, requireAttendanceManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import type { ActionState } from "@/lib/action";

export async function decideExcusal(excusalId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireAttendanceManager();
  const parsed = z.object({
    decision: z.enum(["approved", "rejected"]),
    note: z.string().max(1000).optional().default(""),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success || !z.string().uuid().safeParse(excusalId).success) return { error: "Choose approve or reject (note max 1000 characters)." };

  const supabase = await createClient();
  // The database function re-checks that the caller is the VPO/President.
  const { data: ex, error } = await supabase.rpc("decide_excusal", {
    p_excusal: excusalId, p_decision: parsed.data.decision, p_note: parsed.data.note,
  });
  if (error) return { error: friendlyError(error) };

  // In-app notification is created by the database; also email the member.
  const [{ data: member }, { data: ev }] = await Promise.all([
    supabase.from("profiles").select("email, full_name").eq("id", ex.user_id).single(),
    supabase.from("events").select("title").eq("id", ex.event_id).single(),
  ]);
  if (member?.email) {
    const decided = parsed.data.decision === "approved" ? "approved" : "not approved";
    await sendEmail(member.email, `Your excusal for ${ev?.title ?? "an event"} was ${decided}`, [
      `Hi ${member.full_name || "there"},`,
      `Your excusal for "${ev?.title ?? "an event"}" was ${decided}.`,
      ...(parsed.data.note.trim() ? [`Note from the VPO: ${parsed.data.note.trim()}`] : []),
    ], { href: "/excusals", label: "View your excusals" }).catch((e) => console.error("email failed", e));
  }
  revalidatePath("/excusals/review");
  return { ok: `Excusal ${parsed.data.decision}.` };
}
