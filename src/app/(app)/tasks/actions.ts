"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyError, requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import type { ActionState } from "@/lib/action";

const uuid = z.string().uuid();

export async function createTask(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  const parsed = z.object({
    title: z.string().trim().min(1, "Enter a title.").max(200),
    description: z.string().trim().max(5000).optional(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    assignee_id: uuid,
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    title: parsed.data.title,
    description: parsed.data.description || null,
    due_date: parsed.data.due_date || null,
    assignee_id: parsed.data.assignee_id,
  });
  if (error) return { error: friendlyError(error) };

  if (parsed.data.assignee_id !== me.id) {
    const { data: who } = await supabase.from("profiles").select("email, full_name").eq("id", parsed.data.assignee_id).single();
    if (who?.email) {
      await sendEmail(who.email, `New task from ${me.fullName}: ${parsed.data.title}`, [
        `${me.fullName} assigned you a task: "${parsed.data.title}".`,
        ...(parsed.data.due_date ? [`Due ${parsed.data.due_date}.`] : []),
      ], { href: "/tasks", label: "Open My Tasks" }).catch((e) => console.error("email failed", e));
    }
  }
  revalidatePath("/tasks");
  return { ok: "Task assigned." };
}

export async function setTaskStatus(taskId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireMember();
  const status = z.enum(["todo", "in_progress", "done"]).safeParse(fd.get("status"));
  if (!status.success || !uuid.safeParse(taskId).success) return { error: "Invalid status." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").update({ status: status.data }).eq("id", taskId).select("id");
  if (error || !data?.length) return { error: friendlyError(error) };
  revalidatePath("/tasks");
  return { ok: "Updated." };
}

export async function deleteTask(taskId: string): Promise<ActionState> {
  await requireMember();
  if (!uuid.safeParse(taskId).success) return { error: "Invalid task." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").delete().eq("id", taskId).select("id");
  if (error || !data?.length) return { error: "Only the person who assigned a task can delete it." };
  revalidatePath("/tasks");
  return { ok: "Deleted." };
}
