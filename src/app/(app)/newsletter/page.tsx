import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import { embeddableUrl } from "@/lib/rules";
import { Badge, Card, PageHeader, inputCls, labelCls } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { addIssue, deleteIssue, setPublished } from "./actions";

export default async function NewsletterPage() {
  const me = await requireMember();
  const supabase = await createClient();
  const { data: issues } = await supabase.from("newsletters").select("*").order("issue_date", { ascending: false });
  const [latest, ...archive] = issues ?? [];

  const Issue = ({ n, expanded }: { n: NonNullable<typeof latest>; expanded?: boolean }) => {
    const embed = expanded ? embeddableUrl(n.url) : null;
    return (
      <Card
        title={n.title}
        actions={me.perms.is_exec && (
          <div className="flex gap-2">
            <ActionForm action={setPublished.bind(null, n.id, !n.published)}><SubmitButton variant="secondary">{n.published ? "Unpublish" : "Publish"}</SubmitButton></ActionForm>
            <ActionForm action={deleteIssue.bind(null, n.id)} confirm="Delete this issue?"><SubmitButton variant="danger">Delete</SubmitButton></ActionForm>
          </div>
        )}
      >
        <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">{fmtDate(n.issue_date + "T12:00:00Z")}{!n.published && <Badge tone="yellow">Draft</Badge>}</div>
        {n.body && <div className="whitespace-pre-wrap text-sm text-gray-800">{expanded ? n.body : n.body.slice(0, 280) + (n.body.length > 280 ? "…" : "")}</div>}
        {embed && (
          <iframe src={embed} title={n.title} className="mt-3 h-[70vh] w-full rounded border" sandbox="allow-scripts allow-same-origin allow-popups" referrerPolicy="no-referrer" loading="lazy" />
        )}
        {n.url && <a href={n.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-wine underline">Open issue ↗</a>}
      </Card>
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <PageHeader title="Newsletter" />
        {latest ? <Issue n={latest} expanded /> : <Card><p className="text-sm text-gray-500">No issues yet.</p></Card>}
        {archive.length > 0 && <h2 className="pt-2 font-semibold">Archive</h2>}
        {archive.map((n) => <Issue key={n.id} n={n} />)}
      </div>
      {me.perms.is_exec && (
        <Card title="Add an issue">
          <ActionForm action={addIssue} resetOnSuccess className="space-y-3">
            <div><label className={labelCls} htmlFor="nl-title">Title</label><input id="nl-title" name="title" required maxLength={200} className={inputCls} /></div>
            <div><label className={labelCls} htmlFor="nl-date">Issue date</label><input id="nl-date" name="issue_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputCls} /></div>
            <div><label className={labelCls} htmlFor="nl-url">Link (Canva, Google Docs, Mailchimp…)</label><input id="nl-url" name="url" type="url" placeholder="https://" className={inputCls} /></div>
            <div><label className={labelCls} htmlFor="nl-body">Or write the post</label><textarea id="nl-body" name="body" rows={6} maxLength={50000} className={inputCls} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" /> Publish now</label>
            <SubmitButton>Save issue</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
