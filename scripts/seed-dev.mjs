#!/usr/bin/env node
/**
 * LOCAL DEVELOPMENT ONLY: creates demo members (password: Demo-Passw0rd!) and events.
 *   npm run db:start && node --env-file=.env.local scripts/seed-dev.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!/127\.0\.0\.1|localhost/.test(url ?? "")) throw new Error("Refusing to seed a non-local database.");
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PASSWORD = "Demo-Passw0rd!";

const people = [
  ["president@demo.test", "Avery President", ["president"]],
  ["vpo@demo.test", "Jordan Operations", ["vp_operations"]],
  ["vpme@demo.test", "Riley Experience", ["vp_member_experience"]],
  ["director@demo.test", "Casey Sisterhood", ["dir_sisterhood"]],
  ["mcc@demo.test", "Morgan Conduct", ["mcc_member"]],
  ["member@demo.test", "Taylor Member", []],
  ["member2@demo.test", "Sam Member", []],
];
// After `supabase db reset` the API restarts; wait until it answers.
let roles;
for (let i = 0; i < 60 && !roles?.length; i++) {
  ({ data: roles } = await admin.from("roles").select("id, key"));
  if (!roles?.length) await new Promise((r) => setTimeout(r, 1000));
}
if (!roles?.length) throw new Error("Supabase API not reachable. Is `npm run db:start` running?");
const roleId = Object.fromEntries(roles.map((r) => [r.key, r.id]));

for (const [email, name, keys] of people) {
  await admin.from("invitations").upsert({ email, full_name: name });
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) { console.log(`skip ${email}: ${error.message}`); continue; }
  for (const k of keys) await admin.from("member_roles").insert({ user_id: data.user.id, role_id: roleId[k] });
  console.log(`created ${email}`);
}

const at = (days, hour) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const events = [
  ["Chapter Meeting", 5, 19, true, 10],
  ["Philanthropy Event: Read > Lead", 9, 14, true, 15],
  ["Sisterhood Movie Night", 3, 20, false, 5],
  ["Chapter Meeting", 1, 19, true, 10],
  ["Past Chapter Meeting", -6, 19, true, 10],
];
for (const [title, d, h, req, pts] of events) {
  await admin.from("events").insert({ title, starts_at: at(d, h), ends_at: at(d, h + 1), is_required: req, points: pts, location: "Chapter House" });
}
console.log("seeded events");
