import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dayKey, fmtTime } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { TzOffsetInput } from "@/components/TzOffsetInput";
import { inputCls } from "@/components/ui";
import type { EventRow } from "@/lib/types";
import { addEvent, syncNow } from "./actions";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthFromParam(m: string | undefined) {
  const today = dayKey(new Date());
  const [y, mo] = (m && /^\d{4}-\d{2}$/.test(m) ? m : today.slice(0, 7)).split("-").map(Number);
  return { y, mo, today };
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const me = await requireMember();
  const { y, mo, today } = monthFromParam((await searchParams).m);
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const startPad = first.getUTCDay();

  const supabase = await createClient();
  const rangeStart = new Date(Date.UTC(y, mo - 1, 1) - 86400_000).toISOString();
  const rangeEnd = new Date(Date.UTC(y, mo, 1) + 86400_000).toISOString();
  const monthStr = `${y}-${String(mo).padStart(2, "0")}`;
  const [{ data: events }, { data: tasks }] = await Promise.all([
    supabase.from("events").select("*").gte("starts_at", rangeStart).lt("starts_at", rangeEnd).order("starts_at"),
    supabase.from("tasks").select("id, title, due_date, status").eq("assignee_id", me.id)
      .gte("due_date", `${monthStr}-01`).lte("due_date", `${monthStr}-${daysInMonth}`),
  ]);

  const byDay = new Map<string, { events: EventRow[]; tasks: { id: string; title: string; status: string }[] }>();
  const bucket = (k: string) => byDay.get(k) ?? (byDay.set(k, { events: [], tasks: [] }), byDay.get(k)!);
  for (const e of (events ?? []) as EventRow[]) bucket(dayKey(e.starts_at)).events.push(e);
  for (const t of tasks ?? []) if (t.due_date) bucket(t.due_date).tasks.push(t);

  const prev = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
  const title = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const EventChip = ({ e }: { e: EventRow }) => (
    <Link href={`/events/${e.id}`} className={`block truncate rounded px-1 text-xs ${e.cancelled ? "text-gray-400 line-through" : e.is_required ? "bg-pink-light text-wine" : "bg-light-blue/70 text-ink"}`}>
      {fmtTime(e.starts_at)} {e.title}
    </Link>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        subtitle="Chapter events (required in wine) and your tasks"
        actions={
          <div className="flex items-center gap-2 text-sm">
            <Link className="rounded-full border border-navy/30 bg-white px-3 py-1 text-navy hover:bg-light-blue" href={`/calendar?m=${prev}`}>← Prev</Link>
            <Link className="rounded-full border border-navy/30 bg-white px-3 py-1 text-navy hover:bg-light-blue" href="/calendar">Today</Link>
            <Link className="rounded-full border border-navy/30 bg-white px-3 py-1 text-navy hover:bg-light-blue" href={`/calendar?m=${next}`}>Next →</Link>
          </div>
        }
      />

      {/* Month grid (desktop) */}
      <div className="hidden grid-cols-7 overflow-hidden rounded-lg border bg-gray-200 md:grid" style={{ gap: 1 }}>
        {WEEKDAYS.map((d) => <div key={d} className="bg-gray-50 p-1 text-center text-xs font-medium text-gray-600">{d}</div>)}
        {cells.map((day, i) => {
          if (day === null) return <div key={`pad${i}`} className="min-h-24 bg-gray-50" />;
          const key = `${monthStr}-${String(day).padStart(2, "0")}`;
          const items = byDay.get(key);
          return (
            <div key={key} className={`min-h-24 space-y-0.5 bg-white p-1 ${key === today ? "ring-2 ring-inset ring-wine" : ""}`}>
              <div className="text-xs text-gray-500">{day}</div>
              {items?.events.map((e) => <EventChip key={e.id} e={e} />)}
              {items?.tasks.map((t) => (
                <Link key={t.id} href="/tasks" className="block truncate rounded bg-light-blue px-1 text-xs text-navy">
                  ☐ {t.title}
                </Link>
              ))}
            </div>
          );
        })}
      </div>

      {/* Agenda (mobile) */}
      <div className="space-y-2 md:hidden">
        {[...byDay.entries()].filter(([k]) => k.startsWith(monthStr)).sort().map(([k, v]) => (
          <Card key={k} title={new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(k + "T12:00:00Z"))}>
            <div className="space-y-1">
              {v.events.map((e) => <EventChip key={e.id} e={e} />)}
              {v.tasks.map((t) => <div key={t.id} className="text-xs text-navy">☐ {t.title}</div>)}
            </div>
          </Card>
        ))}
        {byDay.size === 0 && <p className="text-sm text-gray-500">Nothing this month.</p>}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone="wine">Required</Badge><Badge>Optional</Badge><Badge tone="blue">Your task</Badge>
      </div>

      {me.perms.can_manage_attendance && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Google Calendar">
            <p className="mb-2 text-sm text-gray-600">Events sync from Google Calendar automatically. Settings you set on an event (required, points, deadline) are kept.</p>
            <ActionForm action={syncNow}><SubmitButton variant="secondary">Sync now</SubmitButton></ActionForm>
          </Card>
          <Card title="Add an event manually">
            <ActionForm action={addEvent} resetOnSuccess className="grid gap-2 sm:grid-cols-2">
              <input name="title" placeholder="Title" required maxLength={300} className={`${inputCls} sm:col-span-2`} aria-label="Title" />
              <input name="starts_at" type="datetime-local" required className={inputCls} aria-label="Starts" />
              <input name="ends_at" type="datetime-local" required className={inputCls} aria-label="Ends" />
              <input name="location" placeholder="Location (optional)" maxLength={500} className={`${inputCls} sm:col-span-2`} aria-label="Location" />
              <TzOffsetInput />
              <div><SubmitButton>Add event</SubmitButton></div>
            </ActionForm>
          </Card>
        </div>
      )}
    </div>
  );
}
