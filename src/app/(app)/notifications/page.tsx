import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";

async function markAllRead() {
  "use server";
  await requireMember();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/", "layout");
}

export default async function NotificationsPage() {
  await requireMember();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
  return (
    <div>
      <PageHeader
        title="Notifications"
        actions={<form action={markAllRead}><button className="rounded border bg-white px-3 py-1 text-sm">Mark all read</button></form>}
      />
      <Card>
        {!data?.length ? <p className="text-sm text-gray-500">No notifications.</p> : (
          <ul className="divide-y">
            {data.map((n) => (
              <li key={n.id} className={`py-3 text-sm ${n.read_at ? "text-gray-500" : ""}`}>
                <div className="flex items-center gap-2">
                  {!n.read_at && <span className="h-2 w-2 rounded-full bg-wine" aria-label="unread" />}
                  {n.link ? <Link href={n.link} className="font-medium hover:text-wine">{n.title}</Link> : <span className="font-medium">{n.title}</span>}
                </div>
                {n.body && <p className="mt-0.5 whitespace-pre-wrap">{n.body}</p>}
                <p className="text-xs text-gray-400">{fmtDateTime(n.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
