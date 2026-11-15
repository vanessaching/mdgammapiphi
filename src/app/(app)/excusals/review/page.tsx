import Link from "next/link";
import { requireAttendanceManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/format";
import { Badge, Card, PageHeader, StatusBadge, inputCls } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { decideExcusal } from "./actions";

type Row = {
  id: string; user_id: string; reason: string; status: "pending" | "approved" | "rejected"; is_emergency: boolean;
  proof_path: string | null; reviewer_note: string | null; created_at: string;
  events: { id: string; title: string; starts_at: string } | null;
  member: { full_name: string; email: string } | null;
};

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const me = await requireAttendanceManager();
  const showAll = (await searchParams).show === "all";
  const supabase = await createClient();
  let q = supabase
    .from("excusals")
    .select("id, user_id, reason, status, is_emergency, proof_path, reviewer_note, created_at, events(id, title, starts_at), member:profiles!excusals_user_id_fkey(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!showAll) q = q.eq("status", "pending");
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];

  // Short-lived signed links to the private proof files.
  const paths = rows.map((r) => r.proof_path).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await supabase.storage.from("excusal-proofs").createSignedUrls(paths, 600);
    urls?.forEach((u) => u.path && u.signedUrl && signed.set(u.path, u.signedUrl));
  }

  return (
    <div>
      <PageHeader
        title="Review excusals"
        subtitle={showAll ? "Most recent 100 excusals" : "Pending excusals"}
        actions={<Link className="text-sm text-wine" href={showAll ? "/excusals/review" : "/excusals/review?show=all"}>{showAll ? "Show pending only" : "Show all"}</Link>}
      />
      <div className="space-y-3">
        {rows.length === 0 && <Card><p className="text-sm text-gray-500">Nothing to review. 🎉</p></Card>}
        {rows.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge status={r.status} />
              {r.is_emergency && <Badge tone="yellow">Emergency</Badge>}
              <strong>{r.member?.full_name || r.member?.email}</strong>
              <span className="text-gray-500">for</span>
              {r.events && <Link className="text-wine" href={`/events/${r.events.id}`}>{r.events.title}</Link>}
              {r.events && <span className="text-gray-500">({fmtDateTime(r.events.starts_at)})</span>}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{r.reason}</p>
            <div className="mt-1 text-sm">
              {r.proof_path ? (
                signed.get(r.proof_path)
                  ? <a href={signed.get(r.proof_path)} target="_blank" rel="noopener noreferrer" className="text-wine underline">View proof</a>
                  : <span className="text-gray-500">Proof unavailable</span>
              ) : <span className="text-gray-500">No proof attached</span>}
            </div>
            {r.reviewer_note && <p className="mt-1 text-sm text-gray-600">Note: {r.reviewer_note}</p>}
            {r.user_id === me.id ? (
              <p className="mt-3 text-xs text-gray-500">This is your own excusal. Another officer (the President) must review it.</p>
            ) : (
              <ActionForm action={decideExcusal.bind(null, r.id)} className="mt-3 flex flex-wrap items-center gap-2">
                <input name="note" maxLength={1000} placeholder="Optional note to the member" className={`${inputCls} max-w-md`} aria-label="Note" />
                <button name="decision" value="approved" className="rounded-full bg-wine px-4 py-1.5 text-sm font-medium text-white hover:bg-berry-dark">Approve</button>
                <button name="decision" value="rejected" className="rounded-full border border-red-300 bg-white px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">Reject</button>
              </ActionForm>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
