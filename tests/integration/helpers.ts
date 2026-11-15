import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Status = { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };

let cached: Status | null = null;
export function localStack(): Status {
  if (cached) return cached;
  const raw = execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  cached = JSON.parse(raw.slice(raw.indexOf("{"))) as Status;
  return cached;
}

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };

export function adminClient(): SupabaseClient {
  const s = localStack();
  return createClient(s.API_URL, s.SERVICE_ROLE_KEY, noPersist);
}

export function anonClient(): SupabaseClient {
  const s = localStack();
  return createClient(s.API_URL, s.ANON_KEY, noPersist);
}

export const PASSWORD = "Test-Passw0rd-123";

export type TestUser = { id: string; email: string; client: SupabaseClient };

/** Invite + create + sign in a user, optionally granting roles (by key). */
export async function makeUser(name: string, roleKeys: string[] = []): Promise<TestUser> {
  const admin = adminClient();
  const email = `${name}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  const inv = await admin.from("invitations").insert({ email, full_name: name });
  if (inv.error) throw inv.error;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  const id = created.data.user.id;
  for (const key of roleKeys) {
    const { data: role } = await admin.from("roles").select("id").eq("key", key).single();
    const r = await admin.from("member_roles").insert({ user_id: id, role_id: role!.id });
    if (r.error) throw r.error;
  }
  const client = anonClient();
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signIn.error) throw signIn.error;
  return { id, email, client };
}

export async function roleId(key: string): Promise<string> {
  const { data, error } = await adminClient().from("roles").select("id").eq("key", key).single();
  if (error) throw error;
  return data.id;
}

export function hoursFromNow(h: number) {
  return new Date(Date.now() + h * 3600_000).toISOString();
}

export async function makeEvent(overrides: Record<string, unknown> = {}) {
  const startsInHours = (overrides.startsInHours as number) ?? 24 * 7;
  delete overrides.startsInHours;
  const { data, error } = await adminClient()
    .from("events")
    .insert({
      title: "Chapter Meeting",
      starts_at: hoursFromNow(startsInHours),
      ends_at: hoursFromNow(startsInHours + 2),
      is_required: true,
      points: 10,
      ...overrides,
    })
    .select()
    .single();
  if (error) throw error;
  return data as { id: string; title: string };
}
