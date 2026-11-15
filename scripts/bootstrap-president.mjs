#!/usr/bin/env node
/**
 * One-time setup: invite the first Chapter President.
 * After this, they (and any exec member) invite everyone else from the Members page.
 *
 *   node --env-file=.env.local scripts/bootstrap-president.mjs president@school.edu "Full Name"
 */
import { createClient } from "@supabase/supabase-js";

const [email, fullName] = process.argv.slice(2);
if (!email || !fullName) {
  console.error('Usage: node --env-file=.env.local scripts/bootstrap-president.mjs <email> "<full name>"');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");

const admin = createClient(url, key, { auth: { persistSession: false } });
const lower = email.trim().toLowerCase();

const { data: existing } = await admin.from("member_roles").select("user_id, roles!inner(key)").eq("roles.key", "president");
if (existing?.length) {
  console.error("A Chapter President already exists. Use the Members page to change roles.");
  process.exit(1);
}

let { error } = await admin.from("invitations").upsert({ email: lower, full_name: fullName });
if (error) throw error;
const { data, error: invErr } = await admin.auth.admin.inviteUserByEmail(lower, {
  redirectTo: `${site}/auth/confirm?next=/auth/set-password`,
});
if (invErr) throw invErr;
const { data: role } = await admin.from("roles").select("id").eq("key", "president").single();
({ error } = await admin.from("member_roles").insert({ user_id: data.user.id, role_id: role.id }));
if (error) throw error;
console.log(`Invited ${lower} as Chapter President. They'll get an email to set their password.`);
