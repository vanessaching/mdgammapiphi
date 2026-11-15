"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyError, requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action";

export async function addIssue(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireMember();
  if (!me.perms.is_exec) return { error: "Only exec members can post newsletters." };
  const parsed = z.object({
    title: z.string().trim().min(1).max(200),
    issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    url: z.string().trim().url().startsWith("https://", "Links must start with https://").optional().or(z.literal("")),
    body: z.string().trim().max(50000).optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!parsed.data.url && !parsed.data.body) return { error: "Add a link or write the post." };
  const supabase = await createClient();
  const { error } = await supabase.from("newsletters").insert({
    title: parsed.data.title, issue_date: parsed.data.issue_date,
    url: parsed.data.url || null, body: parsed.data.body || null, published: fd.get("published") === "on",
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/newsletter");
  return { ok: "Issue saved." };
}

export async function setPublished(id: string, published: boolean): Promise<ActionState> {
  await requireMember();
  if (!z.string().uuid().safeParse(id).success) return { error: "Invalid issue." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("newsletters").update({ published }).eq("id", id).select("id");
  if (error || !data?.length) return { error: friendlyError(error) };
  revalidatePath("/newsletter");
  return { ok: published ? "Published." : "Unpublished." };
}

export async function deleteIssue(id: string): Promise<ActionState> {
  await requireMember();
  if (!z.string().uuid().safeParse(id).success) return { error: "Invalid issue." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("newsletters").delete().eq("id", id).select("id");
  if (error || !data?.length) return { error: friendlyError(error) };
  revalidatePath("/newsletter");
  return { ok: "Deleted." };
}
