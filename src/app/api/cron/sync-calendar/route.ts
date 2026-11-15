import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncGoogleCalendar } from "@/lib/calendar-sync";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

function authorized(header: string | null, secret: string | undefined) {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Called hourly by Vercel Cron (sends `Authorization: Bearer $CRON_SECRET`). */
export async function GET(request: NextRequest) {
  if (!authorized(request.headers.get("authorization"), serverEnv().cronSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await syncGoogleCalendar());
  } catch (e) {
    console.error("calendar sync failed", e);
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
