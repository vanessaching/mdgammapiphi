"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyError, requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import type { ActionState } from "@/lib/action";

const uuid = z.string().uuid();
const done = (ok: string): ActionState => { revalidatePath("/members"); return { ok }; };

async function requireExec() {
  const me = await requireMember();
  if (!me.perms.is_exec) throw new Error("not exec");
  return me;
}

export async function inviteMember(_: ActionState, fd: FormData): Promise<ActionState> {
  try { await requireExec(); } catch { return { error: "Only Executive Council members can invite members." }; }
  const parsed = z.object({
    email: z.string().trim().toLowerCase().email("Enter a valid email.").max(254),
    full_name: z.string().trim().min(1, "Enter their name.").max(120),
    role_id: uuid.optional().or(z.literal("")),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, full_name, role_id } = parsed.data;

  const supabase = await createClient();
  // 1) Authorization happens in the database: this fails unless the caller is exec.
  const inv = await supabase.rpc("create_invitation", { p_email: email, p_full_name: full_name });
  if (inv.error) return { error: friendlyError(inv.error) };

  // 2) Only after that succeeds, use the service role to send the invite email.
  const { data, error } = await createAdminClient().auth.admin.inviteUserByEmail(email, {
    redirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/auth/set-password`,
  });
  if (error) {
    return { error: /already been registered|already exists/i.test(error.message) ? "That person already has an account." : "Couldn't send the invite email. Try again." };
  }
  if (role_id && data.user) {
    const r = await supabase.rpc("assign_role", { p_user: data.user.id, p_role: role_id });
    if (r.error) return { error: `Invite sent, but the role wasn't assigned: ${friendlyError(r.error)}` };
  }
  return done(`Invite sent to ${email}.`);
}

export async function assignRole(userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireMember();
  const roleId = uuid.safeParse(fd.get("role_id"));
  if (!roleId.success || !uuid.safeParse(userId).success) return { error: "Pick a role." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_role", { p_user: userId, p_role: roleId.data });
  return error ? { error: friendlyError(error) } : done("Role assigned.");
}

export async function revokeRole(userId: string, roleId: string): Promise<ActionState> {
  await requireMember();
  if (!uuid.safeParse(userId).success || !uuid.safeParse(roleId).success) return { error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_role", { p_user: userId, p_role: roleId });
  return error ? { error: friendlyError(error) } : done("Role removed.");
}

export async function setActive(userId: string, active: boolean): Promise<ActionState> {
  await requireMember();
  if (!uuid.safeParse(userId).success) return { error: "Invalid member." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_active", { p_user: userId, p_active: active });
  if (error) return { error: friendlyError(error) };
  // Permission was verified by the RPC above; now block (or restore) their login.
  await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  return done(active ? "Member reactivated." : "Member deactivated and signed out of the site.");
}

const roleSchema = z.object({
  name: z.string().trim().min(2, "Name is too short.").max(80),
  tier: z.enum(["exec", "director", "committee"]),
});

export async function createRole(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireMember();
  const parsed = roleSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const key = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  if (key.length < 2) return { error: "Use letters or numbers in the name." };
  const supabase = await createClient();
  const sort = { exec: 20, director: 50, committee: 70 }[parsed.data.tier];
  const { error } = await supabase.from("roles").insert({ key, name: parsed.data.name, tier: parsed.data.tier, sort_order: sort });
  return error ? { error: friendlyError(error) } : done("Position added.");
}

export async function deleteRole(roleId: string): Promise<ActionState> {
  await requireMember();
  if (!uuid.safeParse(roleId).success) return { error: "Invalid role." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("roles").delete().eq("id", roleId).select("id");
  if (error?.code === "23503") return { error: "Someone holds this position. Remove it from them first." };
  if (error || !data?.length) return { error: friendlyError(error) };
  return done("Position removed.");
}
