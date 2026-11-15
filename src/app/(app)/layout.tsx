import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMember();
  const supabase = await createClient();
  const { count: unread } = await supabase
    .from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);

  const links = [
    { href: "/calendar", label: "Calendar" },
    { href: "/me", label: "My Dashboard" },
    { href: "/excusals", label: "My Excusals" },
    { href: "/tasks", label: "Tasks" },
    { href: "/newsletter", label: "Newsletter" },
    { href: "/members", label: "Members" },
    ...(me.perms.can_manage_attendance
      ? [{ href: "/excusals/review", label: "Review Excusals" }, { href: "/attendance", label: "80% View" }]
      : []),
  ];

  return (
    <div>
      <header className="bg-wine text-white shadow">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/calendar" className="flex shrink-0 items-center gap-3" aria-label={`${publicEnv.chapterName} Chapter Hub home`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
            <img src="/brand/logo-white.png" alt="Pi Beta Phi" width={175} height={32} className="h-7 w-auto sm:h-8" />
            <span className="hidden border-l border-white/40 pl-3 text-xs uppercase tracking-[0.2em] text-white/80 xl:inline">Chapter Hub</span>
          </Link>
          <nav className="hidden flex-1 flex-wrap gap-x-4 gap-y-1 text-sm lg:flex" aria-label="Main">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-white/85 hover:text-white hover:underline">{l.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/notifications" className="relative text-white/85 hover:text-white" aria-label={`Notifications (${unread ?? 0} unread)`}>
              🔔{!!unread && <span className="ml-1 rounded-full bg-white px-1.5 text-xs font-semibold text-wine">{unread}</span>}
            </Link>
            <span className="hidden text-white/70 xl:inline" title={me.roleNames.join(", ") || "General Member"}>{me.fullName}</span>
            <form action="/auth/signout" method="post" className="hidden lg:block">
              <button className="rounded-full border border-white/40 px-3 py-0.5 text-white/90 hover:bg-white/10">Sign out</button>
            </form>
            {/* Phone menu: no JavaScript needed */}
            <details className="group relative lg:hidden">
              <summary className="cursor-pointer list-none rounded-full border border-white/40 px-3 py-1 text-white [&::-webkit-details-marker]:hidden">
                Menu
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl bg-white py-2 text-ink shadow-xl">
                <div className="border-b border-light-blue px-4 pb-2 text-xs text-gray-500">
                  {me.fullName}
                  <div className="text-wine">{me.roleNames.join(" · ") || "General Member"}</div>
                </div>
                {links.map((l) => (
                  <Link key={l.href} href={l.href} className="block px-4 py-2.5 text-base hover:bg-pink-light">{l.label}</Link>
                ))}
                <form action="/auth/signout" method="post" className="border-t border-light-blue">
                  <button className="block w-full px-4 py-2.5 text-left text-base text-wine hover:bg-pink-light">Sign out</button>
                </form>
              </div>
            </details>
          </div>
        </div>
      </header>
      <div className="h-1 bg-silver-blue" aria-hidden />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
