import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/format";
import { Badge, Card, PageHeader, inputCls, labelCls } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import type { Role } from "@/lib/types";
import { assignRole, createRole, deleteRole, inviteMember, revokeRole, setActive } from "./actions";

const TIER_LABEL = { president: "President", exec: "Executive Council", director: "Directors", committee: "Member Conduct Committee", member: "Members" } as const;
const TIER_TONE = { president: "wine", exec: "wine", director: "blue", committee: "yellow", member: "gray" } as const;

export default async function MembersPage() {
  const me = await requireMember();
  const isExec = me.perms.is_exec;
  const supabase = await createClient();
  const [{ data: profiles }, { data: roles }, { data: memberRoles }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, active").order("full_name"),
    supabase.from("roles").select("*").order("sort_order").order("name"),
    supabase.from("member_roles").select("user_id, role_id"),
  ]);
  const [{ data: audit }, { data: invites }] = isExec
    ? await Promise.all([
        supabase.from("audit_log").select("id, action, details, created_at, actor:profiles!audit_log_actor_id_fkey(full_name), target:profiles!audit_log_target_user_id_fkey(full_name)").order("created_at", { ascending: false }).limit(40),
        supabase.from("invitations").select("email, full_name, created_at").is("accepted_at", null).order("created_at", { ascending: false }),
      ])
    : [{ data: null }, { data: null }];

  const roleById = new Map((roles as Role[] ?? []).map((r) => [r.id, r]));
  const rolesOf = new Map<string, Role[]>();
  for (const mr of memberRoles ?? []) {
    const r = roleById.get(mr.role_id);
    if (r) rolesOf.set(mr.user_id, [...(rolesOf.get(mr.user_id) ?? []), r]);
  }
  for (const list of rolesOf.values()) list.sort((a, b) => a.sort_order - b.sort_order);
  const visible = (profiles ?? []).filter((p) => p.active || isExec);
  const rank = (id: string) => Math.min(...(rolesOf.get(id) ?? []).map((r) => r.sort_order), 1000);
  visible.sort((a, b) => rank(a.id) - rank(b.id) || (a.full_name || a.email).localeCompare(b.full_name || b.email));

  const RoleOptions = () => (
    <>
      {(["president", "exec", "director", "committee"] as const).map((tier) => (
        <optgroup key={tier} label={TIER_LABEL[tier]}>
          {(roles as Role[] ?? []).filter((r) => r.tier === tier).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </optgroup>
      ))}
    </>
  );

  type AuditRow = { id: number; action: string; details: { role?: string; email?: string; event?: string }; created_at: string; actor: { full_name: string } | null; target: { full_name: string } | null };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <PageHeader title="Members" subtitle={isExec ? "As an exec member you can assign positions, invite and deactivate members." : "Chapter directory"} />
        <Card>
          <ul className="divide-y">
            {visible.map((p) => {
              const theirRoles = rolesOf.get(p.id) ?? [];
              const self = p.id === me.id;
              return (
                <li key={p.id} className={`py-3 text-sm ${p.active ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-medium">{p.full_name || p.email}</span>{self && <span className="text-gray-500"> (you)</span>}
                      {!p.active && <Badge tone="red">Inactive</Badge>}
                      <div className="text-xs text-gray-500">{p.email}</div>
                    </div>
                    {isExec && !self && (
                      <ActionForm action={setActive.bind(null, p.id, !p.active)} confirm={p.active ? `Deactivate ${p.full_name || p.email}? They will lose access.` : undefined}>
                        <SubmitButton variant={p.active ? "danger" : "secondary"}>{p.active ? "Deactivate" : "Reactivate"}</SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {theirRoles.length === 0 && <Badge>General Member</Badge>}
                    {theirRoles.map((r) => (
                      <span key={r.id} className="inline-flex items-center gap-1">
                        <Badge tone={TIER_TONE[r.tier]}>{r.name}</Badge>
                        {isExec && (
                          <ActionForm action={revokeRole.bind(null, p.id, r.id)} confirm={self ? `Remove ${r.name} from yourself? If it's your only exec position, you'll lose exec access.` : `Remove ${r.name} from ${p.full_name || p.email}?`}>
                            <button className="text-xs text-gray-400 hover:text-red-700" aria-label={`Remove ${r.name}`}>✕</button>
                          </ActionForm>
                        )}
                      </span>
                    ))}
                  </div>
                  {isExec && p.active && (
                    <ActionForm action={assignRole.bind(null, p.id)} className="mt-2 flex gap-2">
                      <select name="role_id" required defaultValue="" className="rounded border px-2 py-1 text-sm" aria-label="Position to assign">
                        <option value="" disabled>Assign a position…</option>
                        <RoleOptions />
                      </select>
                      <SubmitButton variant="secondary">Assign</SubmitButton>
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {isExec && (
        <div className="space-y-4">
          <Card title="Invite a member">
            <ActionForm action={inviteMember} resetOnSuccess className="space-y-3">
              <div><label className={labelCls} htmlFor="inv-name">Name</label><input id="inv-name" name="full_name" required maxLength={120} className={inputCls} /></div>
              <div><label className={labelCls} htmlFor="inv-email">Email</label><input id="inv-email" name="email" type="email" required className={inputCls} /></div>
              <div>
                <label className={labelCls} htmlFor="inv-role">Position (optional)</label>
                <select id="inv-role" name="role_id" defaultValue="" className={inputCls}>
                  <option value="">General Member</option>
                  <RoleOptions />
                </select>
              </div>
              <SubmitButton>Send invite</SubmitButton>
              <p className="text-xs text-gray-500">They get an email to set their own password. Only invited emails can create accounts.</p>
            </ActionForm>
            {!!invites?.length && (
              <div className="mt-4 text-xs text-gray-600">
                <div className="font-medium">Pending invites</div>
                <ul>{invites.map((i) => <li key={i.email}>{i.full_name} · {i.email}</li>)}</ul>
              </div>
            )}
          </Card>

          <Card title="Positions">
            <ul className="mb-3 max-h-64 space-y-1 overflow-y-auto text-sm">
              {(roles as Role[] ?? []).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span>{r.name} <span className="text-xs text-gray-400">({TIER_LABEL[r.tier]})</span></span>
                  {!r.is_system && (
                    <ActionForm action={deleteRole.bind(null, r.id)} confirm={`Delete the position "${r.name}"?`}>
                      <button className="text-xs text-gray-400 hover:text-red-700" aria-label={`Delete ${r.name}`}>✕</button>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
            <ActionForm action={createRole} resetOnSuccess className="space-y-2">
              <input name="name" required maxLength={80} placeholder="e.g. Director of Scholarship" className={inputCls} aria-label="New position name" />
              <select name="tier" defaultValue="director" className={inputCls} aria-label="Position type">
                <option value="exec">Executive Council (VP)</option>
                <option value="director">Director</option>
                <option value="committee">Member Conduct Committee</option>
              </select>
              <SubmitButton variant="secondary">Add position</SubmitButton>
            </ActionForm>
          </Card>

          <Card title="Audit log">
            <ul className="max-h-80 space-y-1 overflow-y-auto text-xs text-gray-700">
              {((audit ?? []) as unknown as AuditRow[]).map((a) => (
                <li key={a.id}>
                  <span className="text-gray-400">{fmtDateTime(a.created_at)}</span>{" "}
                  <strong>{a.actor?.full_name ?? "System"}</strong> {a.action.replace(/_/g, " ")}{" "}
                  {a.details.role ?? a.details.email ?? a.details.event ?? ""}
                  {a.target && <> → {a.target.full_name}</>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
