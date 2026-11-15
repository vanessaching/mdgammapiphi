import { notFound } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/format";
import { excusalDeadline, excusalWindow, EMERGENCY_WINDOW_DAYS } from "@/lib/rules";
import { Badge, Card, StatusBadge, inputCls, labelCls } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import type { EventRow } from "@/lib/types";
import { ExcusalForm } from "./ExcusalForm";
import { saveRoster, updateEventSettings, withdrawExcusal } from "./actions";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const me = await requireMember();
  const supabase = await createClient();

  const { data: ev } = await supabase.from("events").select("*").eq("id", id).maybeSingle<EventRow>();
  if (!ev) notFound();
  const { data: mine } = await supabase.from("excusals").select("*").eq("event_id", id).eq("user_id", me.id).maybeSingle();
  const window = excusalWindow(ev);
  const deadline = excusalDeadline(ev);

  let roster: { id: string; full_name: string; email: string; status: string | null; excused: boolean }[] = [];
  if (me.perms.can_manage_attendance) {
    const [{ data: members }, { data: att }, { data: approved }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").eq("active", true).order("full_name"),
      supabase.from("attendance").select("user_id, status").eq("event_id", id),
      supabase.from("excusals").select("user_id").eq("event_id", id).eq("status", "approved"),
    ]);
    const attMap = new Map((att ?? []).map((a) => [a.user_id, a.status]));
    const excused = new Set((approved ?? []).map((x) => x.user_id));
    roster = (members ?? []).map((m) => ({ ...m, status: attMap.get(m.id) ?? null, excused: excused.has(m.id) }));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{ev.title}</h1>
            {ev.cancelled && <Badge tone="red">Cancelled</Badge>}
            <Badge tone={ev.is_required ? "wine" : "gray"}>{ev.is_required ? "Required" : "Optional"}</Badge>
            <Badge tone="blue">{ev.points} pts</Badge>
          </div>
          <p className="mt-1 text-sm text-gray-700">{fmtDateTime(ev.starts_at)} – {fmtDateTime(ev.ends_at)}</p>
          {ev.location && <p className="text-sm text-gray-700">📍 {ev.location}</p>}
          {ev.description && <p className="mt-3 whitespace-pre-wrap text-sm text-gray-800">{ev.description}</p>}
          <p className="mt-3 text-xs text-gray-500">
            Excusal deadline: {fmtDateTime(deadline)} ({ev.excusal_deadline_hours}h before).{" "}
            {ev.allow_emergency ? `Emergency excusals accepted until ${EMERGENCY_WINDOW_DAYS} days after the event.` : "No emergency excusals for this event."}
          </p>
        </Card>

        <Card title="My excusal">
          {mine ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><StatusBadge status={mine.status} />{mine.is_emergency && <Badge tone="yellow">Emergency</Badge>}</div>
              <p className="whitespace-pre-wrap">{mine.reason}</p>
              {mine.reviewer_note && <p className="rounded bg-gray-50 p-2 text-gray-700">VPO note: {mine.reviewer_note}</p>}
              {mine.status === "pending" && (
                <ActionForm action={withdrawExcusal.bind(null, mine.id, ev.id)} confirm="Withdraw this excusal?">
                  <SubmitButton variant="danger">Withdraw</SubmitButton>
                </ActionForm>
              )}
            </div>
          ) : window === "closed" ? (
            <p className="text-sm text-gray-600">The excusal form for this event is closed.</p>
          ) : (
            <ExcusalForm eventId={ev.id} userId={me.id} emergencyOnly={window === "emergency_only"} />
          )}
        </Card>
      </div>

      {me.perms.can_manage_attendance && (
        <div className="space-y-4">
          <Card title="Event settings (VPO)">
            <ActionForm action={updateEventSettings.bind(null, ev.id)} className="space-y-3 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="is_required" defaultChecked={ev.is_required} /> Required</label>
              <div>
                <label className={labelCls} htmlFor="points">Points</label>
                <input id="points" name="points" type="number" min={0} max={1000} defaultValue={ev.points} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="deadline">Excusal deadline (hours before)</label>
                <input id="deadline" name="excusal_deadline_hours" type="number" min={0} max={720} defaultValue={ev.excusal_deadline_hours} className={inputCls} />
              </div>
              <label className="flex items-center gap-2"><input type="checkbox" name="allow_emergency" defaultChecked={ev.allow_emergency} /> Allow emergency excusals</label>
              <SubmitButton>Save settings</SubmitButton>
            </ActionForm>
          </Card>

          <Card title={`Roster${ev.attendance_taken ? " ✓" : ""}`}>
            <ActionForm action={saveRoster.bind(null, ev.id)} className="space-y-1 text-sm">
              <p className="mb-2 text-xs text-gray-500">Check off who attended. Unchecked members are absent unless excused.</p>
              {roster.map((m) => (
                <label key={m.id} className="flex items-center justify-between gap-2 rounded px-1 hover:bg-gray-50">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" name="present" value={m.id} defaultChecked={m.status === "present"} />
                    {m.full_name || m.email}
                  </span>
                  {m.excused && m.status !== "present" && <Badge tone="green">Excused</Badge>}
                </label>
              ))}
              <div className="pt-2"><SubmitButton>Save attendance</SubmitButton></div>
            </ActionForm>
          </Card>
        </div>
      )}
    </div>
  );
}
