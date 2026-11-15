/**
 * Pure business rules shared by the UI. The database enforces the same rules
 * (see supabase/migrations); these exist so the UI can explain them.
 */
import { z } from "zod";
import type { EventRow, MemberStats } from "./types";

export const EMERGENCY_WINDOW_DAYS = 7;
export const ATTENDANCE_TARGET = 80;

export function excusalDeadline(ev: Pick<EventRow, "starts_at" | "excusal_deadline_hours">): Date {
  return new Date(new Date(ev.starts_at).getTime() - ev.excusal_deadline_hours * 3600_000);
}

export type ExcusalWindow = "open" | "emergency_only" | "closed";

export function excusalWindow(
  ev: Pick<EventRow, "starts_at" | "ends_at" | "excusal_deadline_hours" | "allow_emergency" | "cancelled">,
  now: Date = new Date(),
): ExcusalWindow {
  if (ev.cancelled) return "closed";
  if (now <= excusalDeadline(ev)) return "open";
  const emergencyEnd = new Date(ev.ends_at).getTime() + EMERGENCY_WINDOW_DAYS * 86400_000;
  if (ev.allow_emergency && now.getTime() <= emergencyEnd) return "emergency_only";
  return "closed";
}

/** Attendance % = required attended ÷ (required events − excused). */
export function attendancePct(requiredAttended: number, requiredTotal: number, requiredExcused: number): number | null {
  const denom = requiredTotal - requiredExcused;
  if (denom <= 0) return null;
  return Math.round((1000 * requiredAttended) / denom) / 10;
}

export function splitByTarget(rows: MemberStats[], target = ATTENDANCE_TARGET) {
  const sorted = [...rows].sort((a, b) => (b.attendance_pct ?? -1) - (a.attendance_pct ?? -1) || a.full_name.localeCompare(b.full_name));
  return {
    atOrAbove: sorted.filter((r) => r.attendance_pct !== null && Number(r.attendance_pct) >= target),
    below: sorted.filter((r) => r.attendance_pct !== null && Number(r.attendance_pct) < target),
    noData: sorted.filter((r) => r.attendance_pct === null),
  };
}

/** Only allow same-site relative redirects (blocks open redirects like //evil.com). */
export function safeNextPath(next: string | null | undefined, fallback = "/calendar"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\r\n]/.test(next)) {
    return fallback;
  }
  return next;
}

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(72, "Use at most 72 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

/** Hosts whose newsletter pages may be embedded in an iframe (must match the CSP). */
export const EMBED_HOSTS = ["docs.google.com", "www.canva.com", "mailchi.mp", "us1.campaign-archive.com", "www.flipsnack.com"];

export function embeddableUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && EMBED_HOSTS.includes(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;

export function validateProofFile(f: { type: string; size: number }): string | null {
  if (!PROOF_TYPES.includes(f.type)) return "Proof must be a photo (JPG, PNG, WEBP, HEIC) or a PDF.";
  if (f.size > PROOF_MAX_BYTES) return "Proof must be 10 MB or smaller.";
  return null;
}
