import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/format";
import { Badge, Card, PageHeader, StatusBadge } from "@/components/ui";

export default async function MyExcusalsPage() {
  const me = await requireMember();
  const supabase = await createClient();
  const { data } = await supabase
    .from("excusals")
    .select("id, reason, status, is_emergency, reviewer_note, created_at, events(id, title, starts_at)")
    .eq("user_id", me.id)
    .order("created_at", { ascending: false });
  type Row = { id: string; reason: string; status: "pending" | "approved" | "rejected"; is_emergency: boolean; reviewer_note: string | null; created_at: string; events: { id: string; title: string; starts_at: string } | null };
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div>
      <PageHeader title="My excusals" subtitle="To request one, open the event on the calendar." />
      <Card>
        {rows.length === 0 ? <p className="text-sm text-gray-500">No excusals yet.</p> : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={r.status} />
                  {r.is_emergency && <Badge tone="yellow">Emergency</Badge>}
                  {r.events && <Link href={`/events/${r.events.id}`} className="font-medium text-wine">{r.events.title}</Link>}
                  {r.events && <span className="text-gray-500">{fmtDateTime(r.events.starts_at)}</span>}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-gray-700">{r.reason}</p>
                {r.reviewer_note && <p className="mt-1 text-gray-600">VPO note: {r.reviewer_note}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
