import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Permissions } from "./types";

export type CurrentMember = {
  id: string;
  email: string;
  fullName: string;
  perms: Permissions;
  roleNames: string[];
};

/**
 * The signed-in member, verified with the Auth server (getUser, not
 * getSession, so a forged cookie can't pass). Cached per request.
 */
export const getCurrentMember = cache(async (): Promise<CurrentMember | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: perms }, { data: profile }, { data: roles }] = await Promise.all([
    supabase.rpc("my_permissions"),
    supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
    supabase.from("member_roles").select("roles(name, sort_order)").eq("user_id", user.id),
  ]);
  if (!perms?.is_member || !profile) return null;

  type RoleJoin = { roles: { name: string; sort_order: number } | null };
  return {
    id: user.id,
    email: profile.email,
    fullName: profile.full_name || profile.email,
    perms: perms as Permissions,
    roleNames: ((roles ?? []) as unknown as RoleJoin[])
      .map((r) => r.roles)
      .filter((r): r is { name: string; sort_order: number } => !!r)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r) => r.name),
  };
});

export async function requireMember(): Promise<CurrentMember> {
  const me = await getCurrentMember();
  if (!me) redirect("/login");
  return me;
}

export async function requireAttendanceManager() {
  const me = await requireMember();
  if (!me.perms.can_manage_attendance) redirect("/calendar");
  return me;
}

/** Turn a Postgres/PostgREST error into a message safe to show users. */
export function friendlyError(err: { message?: string; code?: string } | null | undefined): string {
  if (!err) return "Something went wrong.";
  // Messages raised by our own functions (errcode 42501/22023/P0001) are written for users.
  if (err.code && ["42501", "22023", "P0001"].includes(err.code) && err.message && !/permission denied/.test(err.message)) {
    return err.message;
  }
  if (err.code === "23505") return "That already exists.";
  if (err.code === "23503") return "That item is still in use.";
  if (err.code === "23514") return "Some of the values aren't valid.";
  if (err.code === "42501" || /permission denied|row-level security/i.test(err.message ?? "")) {
    return "You don't have permission to do that.";
  }
  return "Something went wrong. Please try again.";
}
