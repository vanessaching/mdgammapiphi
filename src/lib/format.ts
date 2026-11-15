import { publicEnv } from "./env";

const tz = publicEnv.timeZone;

export const fmtDateTime = (d: string | Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(d));

export const fmtTime = (d: string | Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(d));

export const fmtDate = (d: string | Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" }).format(new Date(d));

/** YYYY-MM-DD of an instant in the chapter's time zone. */
export const dayKey = (d: string | Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));

export const pct = (v: number | string | null) => (v === null ? "—" : `${Number(v).toFixed(1).replace(/\.0$/, "")}%`);
