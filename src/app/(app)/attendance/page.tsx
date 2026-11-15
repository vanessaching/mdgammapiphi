import { requireAttendanceManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { pct } from "@/lib/format";
import { ATTENDANCE_TARGET, splitByTarget } from "@/lib/rules";
import { Card, PageHeader, Stat } from "@/components/ui";
import type { MemberStats } from "@/lib/types";

function Table({ rows }: { rows: MemberStats[] }) {
  if (!rows.length) return <p className="text-sm text-gray-500">No one here.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-gray-500">
          <tr><th className="py-1">Member</th><th>Attendance</th><th>Required (att./total/exc.)</th><th>Events</th><th>Points</th></tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.user_id}>
              <td className="py-1.5">{r.full_name || "—"}</td>
              <td className="font-medium">{pct(r.attendance_pct)}</td>
              <td>{r.required_attended} / {r.required_total} / {r.required_excused}</td>
              <td>{r.events_attended}</td>
              <td>{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AttendancePage() {
  await requireAttendanceManager();
  const supabase = await createClient();
  const { data } = await supabase.from("member_stats").select("*");
  const { atOrAbove, below, noData } = splitByTarget((data ?? []) as MemberStats[]);

  return (
    <div className="space-y-4">
      <PageHeader title={`${ATTENDANCE_TARGET}% view`} subtitle="Attendance % = required events attended ÷ (required events − excused). Only events with saved attendance count." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={`At or above ${ATTENDANCE_TARGET}%`} value={atOrAbove.length} />
        <Stat label={`Below ${ATTENDANCE_TARGET}%`} value={<span className="text-red-700">{below.length}</span>} />
        <Stat label="No required events yet" value={noData.length} />
      </div>
      <Card title={`Below ${ATTENDANCE_TARGET}%`}><Table rows={below} /></Card>
      <Card title={`At or above ${ATTENDANCE_TARGET}%`}><Table rows={atOrAbove} /></Card>
      {noData.length > 0 && <Card title="No required events recorded yet"><Table rows={noData} /></Card>}
    </div>
  );
}
