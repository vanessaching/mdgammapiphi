import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import { Badge, Card, PageHeader, inputCls, labelCls } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { createTask, deleteTask, setTaskStatus } from "./actions";

type Task = {
  id: string; title: string; description: string | null; due_date: string | null; status: "todo" | "in_progress" | "done";
  assignee_id: string; assigned_by: string;
  assignee: { full_name: string; email: string } | null; assigner: { full_name: string; email: string } | null;
};
const STATUS_LABEL = { todo: "To Do", in_progress: "In Progress", done: "Done" } as const;
const STATUS_TONE = { todo: "gray", in_progress: "yellow", done: "green" } as const;

export default async function TasksPage() {
  const me = await requireMember();
  const supabase = await createClient();
  const select = "id, title, description, due_date, status, assignee_id, assigned_by, assignee:profiles!tasks_assignee_id_fkey(full_name, email), assigner:profiles!tasks_assigned_by_fkey(full_name, email)";
  const [{ data: mine }, { data: given }, { data: assignable }] = await Promise.all([
    supabase.from("tasks").select(select).eq("assignee_id", me.id).order("due_date", { nullsFirst: false }),
    supabase.from("tasks").select(select).eq("assigned_by", me.id).neq("assignee_id", me.id).order("due_date", { nullsFirst: false }),
    supabase.rpc("assignable_members"),
  ]);
  const name = (p: { full_name: string; email: string } | null) => p?.full_name || p?.email || "Unknown";

  const TaskItem = ({ t, showAssignee }: { t: Task; showAssignee?: boolean }) => (
    <li className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-medium ${t.status === "done" ? "text-gray-400 line-through" : ""}`}>{t.title}</span>
          <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
          {t.due_date && <span className="text-gray-500">Due {fmtDate(t.due_date + "T12:00:00Z")}</span>}
        </div>
        {t.description && <p className="mt-1 whitespace-pre-wrap text-gray-600">{t.description}</p>}
        <p className="text-xs text-gray-500">
          {showAssignee ? `Assigned to ${name(t.assignee)}` : t.assigned_by === me.id ? "Self-assigned" : `From ${name(t.assigner)}`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {t.assignee_id === me.id && (
          <ActionForm action={setTaskStatus.bind(null, t.id)} className="flex gap-1">
            <select name="status" defaultValue={t.status} className="rounded border px-1 py-1 text-sm" aria-label="Status">
              <option value="todo">To Do</option><option value="in_progress">In Progress</option><option value="done">Done</option>
            </select>
            <SubmitButton variant="secondary">Save</SubmitButton>
          </ActionForm>
        )}
        {(t.assigned_by === me.id || me.perms.is_president) && (
          <ActionForm action={deleteTask.bind(null, t.id)} confirm="Delete this task?">
            <SubmitButton variant="danger">Delete</SubmitButton>
          </ActionForm>
        )}
      </div>
    </li>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <PageHeader title="Tasks" />
        <Card title="My tasks">
          {(mine ?? []).length === 0 ? <p className="text-sm text-gray-500">No tasks. Nice!</p> :
            <ul className="divide-y">{(mine as unknown as Task[]).map((t) => <TaskItem key={t.id} t={t} />)}</ul>}
        </Card>
        {(given ?? []).length > 0 && (
          <Card title="Tasks I assigned">
            <ul className="divide-y">{(given as unknown as Task[]).map((t) => <TaskItem key={t.id} t={t} showAssignee />)}</ul>
          </Card>
        )}
      </div>
      <Card title="New task">
        <ActionForm action={createTask} resetOnSuccess className="space-y-3">
          <div><label className={labelCls} htmlFor="title">Title</label><input id="title" name="title" required maxLength={200} className={inputCls} /></div>
          <div><label className={labelCls} htmlFor="description">Details</label><textarea id="description" name="description" rows={3} maxLength={5000} className={inputCls} /></div>
          <div><label className={labelCls} htmlFor="due_date">Due date</label><input id="due_date" name="due_date" type="date" className={inputCls} /></div>
          <div>
            <label className={labelCls} htmlFor="assignee_id">Assign to</label>
            <select id="assignee_id" name="assignee_id" defaultValue={me.id} className={inputCls}>
              {(assignable ?? []).map((m: { id: string; full_name: string; email: string }) => (
                <option key={m.id} value={m.id}>{m.id === me.id ? "Myself" : m.full_name || m.email}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {me.perms.is_president ? "As President you can assign to anyone." : me.perms.is_exec ? "Exec can assign to directors and general members." : "You can assign tasks to yourself."}
            </p>
          </div>
          <SubmitButton>Assign task</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
