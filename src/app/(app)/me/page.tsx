import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime, pct } from "@/lib/format";
import { ATTENDANCE_TARGET } from "@/lib/rules";
import { Badge, Card, PageHeader, Stat, StatusBadge } from "@/components/ui";
import type { MemberStats } from "@/lib/types";

export default async function MyDashboard() {
  const me = await requireMember();
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [{ data: stats }, { data: upcoming }, { data: excusals }, { data: tasks }] = await Promise.all([
    supabase.from("member_stats").select("*").eq("user_id", me.id).maybeSingle<MemberStats>(),
    supabase.from("events").select("id, title, starts_at, is_required, points").gte("starts_at", now).eq("cancelled", false).order("starts_at").limit(6),
    supabase.from("excusals").select("id, status, events(title)").eq("user_id", me.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("tasks").select("id, title, due_date, status").eq("assignee_id", me.id).neq("status", "done").order("due_date", { nullsFirst: false }).limit(5),
  ]);
  const pctVal = stats?.attendance_pct ?? null;
  const onTrack = pctVal === null || Number(pctVal) >= ATTENDANCE_TARGET;

  return (
    <div className="space-y-4">
      <PageHeader title={`Hi, ${me.fullName.split(" ")[0]}`} subtitle={me.roleNames.join(" · ") || "General Member"} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Points" value={stats?.points ?? 0} />
        <Stat label="Events attended" value={stats?.events_attended ?? 0} />
        <Stat
          label="Attendance (required events)"
          value={<span className={onTrack ? "" : "text-red-700"}>{pct(pctVal)}</span>}
          hint={stats ? `${stats.required_attended} attended / (${stats.required_total} required − ${stats.required_excused} excused) · goal ${ATTENDANCE_TARGET}%` : undefined}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Upcoming events">
          <ul className="space-y-2 text-sm">
            {(upcoming ?? []).map((e) => (
              <li key={e.id}>
                <Link href={`/events/${e.id}`} className="font-medium text-wine">{e.title}</Link>{" "}
                {e.is_required && <Badge tone="wine">Required</Badge>}
                <div className="text-xs text-gray-500">{fmtDateTime(e.starts_at)} · {e.points} pts</div>
              </li>
            ))}
            {!upcoming?.length && <li className="text-gray-500">Nothing scheduled.</li>}
          </ul>
        </Card>
        <Card title="My excusals" actions={<Link href="/excusals" className="text-xs text-wine">All</Link>}>
          <ul className="space-y-2 text-sm">
            {(excusals as unknown as { id: string; status: "pending" | "approved" | "rejected"; events: { title: string } | null }[] ?? []).map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2"><span className="truncate">{x.events?.title}</span><StatusBadge status={x.status} /></li>
            ))}
            {!excusals?.length && <li className="text-gray-500">None.</li>}
          </ul>
        </Card>
        <Card title="Open tasks" actions={<Link href="/tasks" className="text-xs text-wine">All</Link>}>
          <ul className="space-y-2 text-sm">
            {(tasks ?? []).map((t) => (
              <li key={t.id}>{t.title}{t.due_date && <span className="text-xs text-gray-500"> · due {fmtDate(t.due_date + "T12:00:00Z")}</span>}</li>
            ))}
            {!tasks?.length && <li className="text-gray-500">All caught up.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
