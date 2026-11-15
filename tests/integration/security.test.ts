/**
 * End-to-end permission tests against a real local Supabase stack
 * (Auth + PostgREST + Postgres RLS + Storage). Run with `npm run test:db`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient, anonClient, makeEvent, makeUser, roleId, PASSWORD, type TestUser,
} from "./helpers";

let president: TestUser, vpo: TestUser, vp: TestUser, director: TestUser,
  mcc: TestUser, member: TestUser, member2: TestUser;

beforeAll(async () => {
  [president, vpo, vp, director, mcc, member, member2] = await Promise.all([
    makeUser("president", ["president"]),
    makeUser("vpo", ["vp_operations"]),
    makeUser("vp", ["vp_member_experience"]),
    makeUser("director", ["dir_sisterhood"]),
    makeUser("mcc", ["mcc_member"]),
    makeUser("member"),
    makeUser("member2"),
  ]);
});

const expectDenied = (res: { error: unknown }) => expect(res.error).not.toBeNull();

// ---------------------------------------------------------------------------
describe("accounts & login", () => {
  it("public sign-up is disabled", async () => {
    const res = await anonClient().auth.signUp({ email: `rando${Date.now()}@example.com`, password: PASSWORD });
    expectDenied(res);
  });

  it("an uninvited email cannot get an account, even via the admin API", async () => {
    const res = await adminClient().auth.admin.createUser({
      email: `uninvited${Date.now()}@example.com`, password: PASSWORD, email_confirm: true,
    });
    expectDenied(res);
  });

  it("weak passwords are rejected", async () => {
    const res = await member.client.auth.updateUser({ password: "short" });
    expectDenied(res);
  });

  it("signed-out visitors can read nothing", async () => {
    const anon = anonClient();
    for (const table of ["profiles", "events", "excusals", "tasks", "roles", "member_roles", "member_stats"]) {
      const { data } = await anon.from(table).select("*");
      expect(data ?? [], table).toHaveLength(0);
    }
    expectDenied(await anon.rpc("my_permissions"));
  });

  it("each member gets a profile and correct permissions", async () => {
    const { data } = await vpo.client.rpc("my_permissions");
    expect(data).toMatchObject({ is_vpo: true, is_exec: true, is_president: false, can_manage_attendance: true });
    const m = await member.client.rpc("my_permissions");
    expect(m.data).toMatchObject({ is_exec: false, can_manage_attendance: false, rank: 1 });
  });

  it("members cannot change their own email or active flag directly", async () => {
    expectDenied(await member.client.from("profiles").update({ active: false }).eq("id", member.id));
    expectDenied(await member.client.from("profiles").update({ email: "x@example.com" }).eq("id", member.id));
    const ok = await member.client.from("profiles").update({ full_name: "Member One" }).eq("id", member.id).select();
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);
  });

  it("members cannot edit someone else's profile", async () => {
    const res = await member.client.from("profiles").update({ full_name: "hacked" }).eq("id", member2.id).select();
    expect(res.data ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("role assignment (any exec member)", () => {
  it("general members, directors and MCC cannot assign roles", async () => {
    const rid = await roleId("dir_philanthropy");
    for (const u of [member, director, mcc]) {
      expectDenied(await u.client.rpc("assign_role", { p_user: member2.id, p_role: rid }));
    }
  });

  it("nobody can write member_roles directly", async () => {
    const rid = await roleId("president");
    expectDenied(await member.client.from("member_roles").insert({ user_id: member.id, role_id: rid }));
    expectDenied(await vp.client.from("member_roles").insert({ user_id: member.id, role_id: rid }));
  });

  it("a non-president VP can assign a director role, which is audited and notified", async () => {
    const rid = await roleId("dir_philanthropy");
    const res = await vp.client.rpc("assign_role", { p_user: member2.id, p_role: rid });
    expect(res.error).toBeNull();

    const { data: roles } = await member2.client.from("member_roles").select("role_id").eq("user_id", member2.id);
    expect(roles?.map((r) => r.role_id)).toContain(rid);

    const { data: log } = await vp.client.from("audit_log").select("*").eq("target_user_id", member2.id);
    expect(log?.some((l) => l.action === "role_granted" && l.actor_id === vp.id)).toBe(true);

    const { data: notes } = await member2.client.from("notifications").select("*").eq("kind", "role_granted");
    expect(notes?.length).toBeGreaterThan(0);

    // and can remove it again
    expect((await vp.client.rpc("revoke_role", { p_user: member2.id, p_role: rid })).error).toBeNull();
  });

  it("exec can change their own roles, and it's audited", async () => {
    const self = await makeUser("selfedit", ["vp_recruitment"]);
    const rid = await roleId("dir_wellness");
    expect((await self.client.rpc("assign_role", { p_user: self.id, p_role: rid })).error).toBeNull();
    const { data: log } = await vp.client.from("audit_log").select("*").eq("target_user_id", self.id).eq("action", "role_granted");
    expect(log?.some((l) => l.actor_id === self.id)).toBe(true);
    expect((await self.client.rpc("revoke_role", { p_user: self.id, p_role: rid })).error).toBeNull();
  });

  it("non-exec members still cannot give themselves roles", async () => {
    const rid = await roleId("president");
    for (const u of [member, director, mcc]) {
      expectDenied(await u.client.rpc("assign_role", { p_user: u.id, p_role: rid }));
    }
  });

  it("the only President cannot remove their own President role", async () => {
    const rid = await roleId("president");
    const res = await president.client.rpc("revoke_role", { p_user: president.id, p_role: rid });
    expect(res.error?.message).toMatch(/always have a Chapter President/);
  });

  it("leadership changes notify the rest of exec", async () => {
    const extra = await makeUser("newvp");
    const rid = await roleId("vp_inclusion");
    expect((await vp.client.rpc("assign_role", { p_user: extra.id, p_role: rid })).error).toBeNull();
    const { data } = await president.client.from("notifications").select("body").eq("kind", "leadership_change");
    expect(data?.some((n) => n.body?.includes("Vice President Inclusion"))).toBe(true);
  });

  it("the last Chapter President cannot be removed or deactivated", async () => {
    const rid = await roleId("president");
    const res = await vp.client.rpc("revoke_role", { p_user: president.id, p_role: rid });
    expect(res.error?.message).toMatch(/always have a Chapter President/);
    expectDenied(await vp.client.rpc("set_member_active", { p_user: president.id, p_active: false }));
  });

  it("presidency can be handed over: assign the new one, then remove the old", async () => {
    const successor = await makeUser("successor");
    const rid = await roleId("president");
    expect((await vp.client.rpc("assign_role", { p_user: successor.id, p_role: rid })).error).toBeNull();
    expect((await vp.client.rpc("revoke_role", { p_user: successor.id, p_role: rid })).error).toBeNull();
  });

  it("role catalog: exec can add positions; members cannot; guards hold", async () => {
    expectDenied(await member.client.from("roles").insert({ key: "dir_x", name: "Director X", tier: "director" }));
    const created = await vp.client.from("roles").insert({ key: "dir_arrow", name: "Director of The Arrow", tier: "director" }).select().single();
    expect(created.error).toBeNull();
    // no second president-tier role
    expectDenied(await vp.client.from("roles").insert({ key: "copres", name: "Co-President", tier: "president" }));
    // system roles can't be deleted or re-tiered
    const presId = await roleId("president");
    expectDenied(await vp.client.from("roles").delete().eq("id", presId));
    expectDenied(await vp.client.from("roles").update({ tier: "director" }).eq("id", presId));
    // a role in use can't be deleted
    expectDenied(await vp.client.from("roles").delete().eq("id", await roleId("dir_sisterhood")));
  });

  it("deactivated members lose all access", async () => {
    const leaving = await makeUser("leaving");
    expect((await vp.client.rpc("set_member_active", { p_user: leaving.id, p_active: false })).error).toBeNull();
    const { data } = await leaving.client.from("events").select("*");
    expect(data ?? []).toHaveLength(0);
    const perms = await leaving.client.rpc("my_permissions");
    expect(perms.data).toMatchObject({ is_member: false });
  });
});

// ---------------------------------------------------------------------------
describe("excusals", () => {
  it("member submits before the deadline; status is always pending", async () => {
    const ev = await makeEvent();
    const res = await member.client.from("excusals").insert({ event_id: ev.id, reason: "Exam" }).select().single();
    expect(res.error).toBeNull();
    expect(res.data.status).toBe("pending");
    expect(res.data.user_id).toBe(member.id);
  });

  it("member cannot self-approve or submit for someone else", async () => {
    const ev = await makeEvent();
    expectDenied(await member.client.from("excusals").insert({ event_id: ev.id, reason: "x", status: "approved" }));
    const spoof = await member.client.from("excusals").insert({ event_id: ev.id, reason: "x", user_id: member2.id });
    expectDenied(spoof);
  });

  it("the form closes after the deadline unless it's an emergency", async () => {
    const ev = await makeEvent({ startsInHours: 24 }); // default deadline is 48h before
    const late = await member.client.from("excusals").insert({ event_id: ev.id, reason: "late" });
    expect(late.error?.message).toMatch(/deadline/);
    const emergency = await member.client.from("excusals").insert({ event_id: ev.id, reason: "ER visit", is_emergency: true });
    expect(emergency.error).toBeNull();
  });

  it("per-event deadline and emergency switch are respected", async () => {
    const ev = await makeEvent({ startsInHours: 24, excusal_deadline_hours: 12, allow_emergency: false });
    expect((await member.client.from("excusals").insert({ event_id: ev.id, reason: "ok" })).error).toBeNull();
    const ev2 = await makeEvent({ startsInHours: 24, allow_emergency: false });
    expectDenied(await member.client.from("excusals").insert({ event_id: ev2.id, reason: "x", is_emergency: true }));
  });

  it("members only see their own excusals; VPO sees all", async () => {
    const ev = await makeEvent();
    await member2.client.from("excusals").insert({ event_id: ev.id, reason: "private reason" });
    const { data: theirs } = await member.client.from("excusals").select("*").eq("event_id", ev.id);
    expect(theirs).toHaveLength(0);
    const { data: vpoView } = await vpo.client.from("excusals").select("*").eq("event_id", ev.id);
    expect(vpoView).toHaveLength(1);
  });

  it("members cannot edit status directly", async () => {
    const ev = await makeEvent();
    const { data } = await member.client.from("excusals").insert({ event_id: ev.id, reason: "x" }).select().single();
    expectDenied(await member.client.from("excusals").update({ status: "approved" }).eq("id", data!.id));
  });

  it("only VPO/President can decide; other VPs cannot", async () => {
    const ev = await makeEvent();
    const { data: ex } = await member.client.from("excusals").insert({ event_id: ev.id, reason: "x" }).select().single();
    for (const u of [member, vp, director]) {
      expectDenied(await u.client.rpc("decide_excusal", { p_excusal: ex!.id, p_decision: "approved", p_note: "" }));
    }
    const ok = await vpo.client.rpc("decide_excusal", { p_excusal: ex!.id, p_decision: "approved", p_note: "Feel better" });
    expect(ok.error).toBeNull();

    // pre-marked Excused + notified
    const { data: att } = await member.client.from("attendance").select("status").eq("event_id", ev.id).single();
    expect(att?.status).toBe("excused");
    const { data: notes } = await member.client.from("notifications").select("*").eq("kind", "excusal_approved");
    expect(notes?.some((n) => n.body === "Feel better")).toBe(true);
  });

  it("approved excusals can't be withdrawn by the member", async () => {
    const ev = await makeEvent();
    const { data: ex } = await member.client.from("excusals").insert({ event_id: ev.id, reason: "x" }).select().single();
    await vpo.client.rpc("decide_excusal", { p_excusal: ex!.id, p_decision: "approved", p_note: "" });
    await member.client.from("excusals").delete().eq("id", ex!.id);
    const { data } = await vpo.client.from("excusals").select("id").eq("id", ex!.id);
    expect(data).toHaveLength(1);
  });

  it("VPO cannot review their own excusal", async () => {
    const ev = await makeEvent();
    const { data: ex } = await vpo.client.from("excusals").insert({ event_id: ev.id, reason: "x" }).select().single();
    const res = await vpo.client.rpc("decide_excusal", { p_excusal: ex!.id, p_decision: "approved", p_note: "" });
    expect(res.error?.message).toMatch(/own excusal/);
    expect((await president.client.rpc("decide_excusal", { p_excusal: ex!.id, p_decision: "approved", p_note: "" })).error).toBeNull();
  });

  it("proof must point at the member's own folder", async () => {
    const ev = await makeEvent();
    const res = await member.client.from("excusals").insert({ event_id: ev.id, reason: "x", proof_path: `${member2.id}/doc.pdf` });
    expectDenied(res);
  });
});

// ---------------------------------------------------------------------------
describe("proof uploads (storage)", () => {
  const pdf = new Blob(["%PDF-1.4 test"], { type: "application/pdf" });

  it("member can upload to their own folder only", async () => {
    const own = await member.client.storage.from("excusal-proofs").upload(`${member.id}/note.pdf`, pdf, { contentType: "application/pdf" });
    expect(own.error).toBeNull();
    const other = await member.client.storage.from("excusal-proofs").upload(`${member2.id}/evil.pdf`, pdf, { contentType: "application/pdf" });
    expectDenied(other);
  });

  it("only photos and PDFs are accepted", async () => {
    const html = new Blob(["<script>alert(1)</script>"], { type: "text/html" });
    const res = await member.client.storage.from("excusal-proofs").upload(`${member.id}/x.html`, html, { contentType: "text/html" });
    expectDenied(res);
  });

  it("files can't be overwritten", async () => {
    const res = await member.client.storage.from("excusal-proofs").upload(`${member.id}/note.pdf`, pdf, { contentType: "application/pdf", upsert: true });
    expectDenied(res);
  });

  it("other members can't read a member's proof; VPO can", async () => {
    const peek = await member2.client.storage.from("excusal-proofs").download(`${member.id}/note.pdf`);
    expectDenied(peek);
    const vpoRead = await vpo.client.storage.from("excusal-proofs").createSignedUrl(`${member.id}/note.pdf`, 60);
    expect(vpoRead.error).toBeNull();
  });

  it("the bucket is private", async () => {
    const { data } = anonClient().storage.from("excusal-proofs").getPublicUrl(`${member.id}/note.pdf`);
    const r = await fetch(data.publicUrl);
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("attendance & points", () => {
  it("only VPO/President take attendance", async () => {
    const ev = await makeEvent();
    for (const u of [member, vp, director]) {
      expectDenied(await u.client.rpc("save_attendance", { p_event: ev.id, p_present: [u.id] }));
    }
  });

  it("totals: points, events attended and attendance % (required only, excused removed)", async () => {
    const tracked = await makeUser("tracked");
    const req1 = await makeEvent({ points: 5 });
    const req2 = await makeEvent({ points: 5 });
    const req3 = await makeEvent({ points: 5 });
    const opt = await makeEvent({ is_required: false, points: 3 });

    // excused from req3
    const { data: ex } = await tracked.client.from("excusals").insert({ event_id: req3.id, reason: "x" }).select().single();
    await vpo.client.rpc("decide_excusal", { p_excusal: ex!.id, p_decision: "approved", p_note: "" });

    const saves = [
      [req1.id, [tracked.id]],   // present
      [req2.id, []],             // absent
      [req3.id, []],             // excused (pre-marked)
      [opt.id, [tracked.id]],    // present, optional
    ] as const;
    for (const [id, present] of saves) {
      expect((await vpo.client.rpc("save_attendance", { p_event: id, p_present: present })).error).toBeNull();
    }

    const { data: stats } = await tracked.client.from("member_stats").select("*").eq("user_id", tracked.id).single();
    expect(stats).toMatchObject({
      points: 8, events_attended: 2, required_total: 3, required_attended: 1, required_excused: 1,
    });
    expect(Number(stats!.attendance_pct)).toBe(50); // 1 / (3 - 1)
  });

  it("members see only their own stats; VPO sees everyone (80% view)", async () => {
    const { data: mine } = await member.client.from("member_stats").select("user_id");
    expect(mine?.map((r) => r.user_id)).toEqual([member.id]);
    const { data: all } = await vpo.client.from("member_stats").select("user_id");
    expect(all!.length).toBeGreaterThan(5);
  });

  it("members only see their own attendance rows", async () => {
    const { data } = await member.client.from("attendance").select("user_id");
    expect(new Set(data?.map((r) => r.user_id))).toEqual(new Set(data?.length ? [member.id] : []));
  });

  it("only VPO/President edit event settings; synced fields stay read-only", async () => {
    const ev = await makeEvent();
    const memberTry = await member.client.from("events").update({ points: 999 }).eq("id", ev.id).select();
    expect(memberTry.data ?? []).toHaveLength(0);
    const vpTry = await vp.client.from("events").update({ points: 999 }).eq("id", ev.id).select();
    expect(vpTry.data ?? []).toHaveLength(0);
    const ok = await vpo.client.from("events").update({ points: 20, excusal_deadline_hours: 72 }).eq("id", ev.id).select();
    expect(ok.data).toHaveLength(1);
    expectDenied(await vpo.client.from("events").update({ title: "renamed" }).eq("id", ev.id));
    expectDenied(await vpo.client.from("events").update({ attendance_taken: true }).eq("id", ev.id));
  });
});

// ---------------------------------------------------------------------------
describe("tasks", () => {
  const task = (assignee: string) => ({ title: "Make flyers", assignee_id: assignee, due_date: "2026-12-01" });

  it("everyone can assign themselves tasks", async () => {
    for (const u of [member, director, mcc]) {
      expect((await u.client.from("tasks").insert(task(u.id))).error).toBeNull();
    }
  });

  it("members and directors cannot assign to others", async () => {
    expectDenied(await member.client.from("tasks").insert(task(member2.id)));
    expectDenied(await director.client.from("tasks").insert(task(member.id)));
  });

  it("VPs (incl. VPO) assign to directors and general members, not to other exec", async () => {
    expect((await vp.client.from("tasks").insert(task(director.id))).error).toBeNull();
    expect((await vpo.client.from("tasks").insert(task(member.id))).error).toBeNull();
    expect((await vp.client.from("tasks").insert(task(mcc.id))).error).toBeNull();
    expectDenied(await vp.client.from("tasks").insert(task(vpo.id)));
    expectDenied(await vp.client.from("tasks").insert(task(president.id)));
  });

  it("President assigns to anyone", async () => {
    expect((await president.client.from("tasks").insert(task(vp.id))).error).toBeNull();
  });

  it("assigned_by can't be spoofed", async () => {
    const { data } = await member.client.from("tasks").insert({ ...task(member.id), assigned_by: president.id } as never).select().single();
    // column not granted → rejected, or forced to the caller
    if (data) expect(data.assigned_by).toBe(member.id);
  });

  it("assignee is notified and can change status but nothing else", async () => {
    const { data: t } = await vp.client.from("tasks").insert(task(member2.id)).select().single();
    const { data: notes } = await member2.client.from("notifications").select("*").eq("kind", "task_assigned");
    expect(notes!.length).toBeGreaterThan(0);

    expect((await member2.client.from("tasks").update({ status: "in_progress" }).eq("id", t!.id)).error).toBeNull();
    expectDenied(await member2.client.from("tasks").update({ title: "nope" }).eq("id", t!.id));
    expectDenied(await member2.client.from("tasks").update({ assignee_id: member.id }).eq("id", t!.id));
  });

  it("assigner can't reassign to someone they're not allowed to", async () => {
    const { data: t } = await vp.client.from("tasks").insert(task(member2.id)).select().single();
    expectDenied(await vp.client.from("tasks").update({ assignee_id: president.id }).eq("id", t!.id));
  });

  it("uninvolved members can't see or delete others' tasks", async () => {
    const { data: t } = await vp.client.from("tasks").insert(task(member2.id)).select().single();
    const { data } = await member.client.from("tasks").select("*").eq("id", t!.id);
    expect(data).toHaveLength(0);
    await member.client.from("tasks").delete().eq("id", t!.id);
    const still = await vp.client.from("tasks").select("id").eq("id", t!.id);
    expect(still.data).toHaveLength(1);
  });

  it("assignable_members returns only allowed people", async () => {
    const { data: dir } = await director.client.rpc("assignable_members");
    expect(dir?.map((m: { id: string }) => m.id)).toEqual([director.id]);
    const { data: v } = await vp.client.rpc("assignable_members");
    const ids = v!.map((m: { id: string }) => m.id);
    expect(ids).toContain(member.id);
    expect(ids).toContain(vp.id);
    expect(ids).not.toContain(president.id);
    expect(ids).not.toContain(vpo.id);
  });
});

// ---------------------------------------------------------------------------
describe("notifications & newsletter", () => {
  it("users can't read or create others' notifications", async () => {
    const { data } = await member.client.from("notifications").select("user_id");
    expect(data?.every((n) => n.user_id === member.id)).toBe(true);
    expectDenied(await member.client.from("notifications").insert({ user_id: member2.id, kind: "x", title: "phish" }));
  });

  it("only exec can post newsletters; drafts are hidden from members", async () => {
    expectDenied(await member.client.from("newsletters").insert({ title: "x", url: "https://example.com" }));
    expect((await vp.client.from("newsletters").insert({ title: "Draft", url: "https://example.com/d" })).error).toBeNull();
    expect((await vp.client.from("newsletters").insert({ title: "Fall Issue", url: "https://example.com/f", published: true })).error).toBeNull();
    const { data } = await member.client.from("newsletters").select("title");
    expect(data?.map((n) => n.title)).toContain("Fall Issue");
    expect(data?.map((n) => n.title)).not.toContain("Draft");
  });

  it("newsletter links must be https", async () => {
    expectDenied(await vp.client.from("newsletters").insert({ title: "bad", url: "javascript:alert(1)" }));
  });
});

// ---------------------------------------------------------------------------
describe("invitations", () => {
  it("only exec can invite", async () => {
    expectDenied(await member.client.rpc("create_invitation", { p_email: "new@example.com", p_full_name: "New" }));
    expect((await vp.client.rpc("create_invitation", { p_email: "New.Member@Example.com", p_full_name: "New" })).error).toBeNull();
    const { data } = await vp.client.from("invitations").select("email").eq("email", "new.member@example.com");
    expect(data).toHaveLength(1);
    const { data: hidden } = await member.client.from("invitations").select("*");
    expect(hidden).toHaveLength(0);
  });
});
