import { describe, expect, it } from "vitest";
import {
  attendancePct, embeddableUrl, escapeHtml, excusalDeadline, excusalWindow, passwordSchema,
  safeNextPath, splitByTarget, validateProofFile,
} from "@/lib/rules";
import type { MemberStats } from "@/lib/types";

const h = 3600_000;
const ev = (startsInH: number, extra: Partial<{ excusal_deadline_hours: number; allow_emergency: boolean; cancelled: boolean }> = {}) => {
  const now = Date.UTC(2026, 10, 15, 12);
  return {
    now: new Date(now),
    ev: {
      starts_at: new Date(now + startsInH * h).toISOString(),
      ends_at: new Date(now + (startsInH + 2) * h).toISOString(),
      excusal_deadline_hours: 48, allow_emergency: true, cancelled: false, ...extra,
    },
  };
};

describe("excusal window", () => {
  it("defaults to 48 hours before the event", () => {
    const { ev: e } = ev(100);
    expect(new Date(e.starts_at).getTime() - excusalDeadline(e).getTime()).toBe(48 * h);
  });
  it("is open before the deadline", () => {
    const { ev: e, now } = ev(49);
    expect(excusalWindow(e, now)).toBe("open");
  });
  it("is emergency-only after the deadline", () => {
    const { ev: e, now } = ev(47);
    expect(excusalWindow(e, now)).toBe("emergency_only");
  });
  it("respects a per-event deadline", () => {
    const { ev: e, now } = ev(47, { excusal_deadline_hours: 24 });
    expect(excusalWindow(e, now)).toBe("open");
  });
  it("is closed when emergencies are off, the event is cancelled, or 7 days have passed", () => {
    expect(excusalWindow(ev(10, { allow_emergency: false }).ev, ev(10).now)).toBe("closed");
    expect(excusalWindow(ev(100, { cancelled: true }).ev, ev(100).now)).toBe("closed");
    expect(excusalWindow(ev(-24 * 8).ev, ev(0).now)).toBe("closed");
    expect(excusalWindow(ev(-24 * 6).ev, ev(0).now)).toBe("emergency_only");
  });
});

describe("attendance %", () => {
  it("= required attended ÷ (required − excused)", () => {
    expect(attendancePct(8, 11, 1)).toBe(80);
    expect(attendancePct(1, 3, 1)).toBe(50);
    expect(attendancePct(2, 3, 0)).toBe(66.7);
  });
  it("is null when nothing counts yet", () => {
    expect(attendancePct(0, 0, 0)).toBeNull();
    expect(attendancePct(0, 2, 2)).toBeNull();
  });
  it("splits members around 80%", () => {
    const row = (name: string, p: number | null) => ({ user_id: name, full_name: name, attendance_pct: p }) as MemberStats;
    const { atOrAbove, below, noData } = splitByTarget([row("a", 80), row("b", 79.9), row("c", null), row("d", 100)]);
    expect(atOrAbove.map((r) => r.full_name)).toEqual(["d", "a"]);
    expect(below.map((r) => r.full_name)).toEqual(["b"]);
    expect(noData.map((r) => r.full_name)).toEqual(["c"]);
  });
});

describe("security helpers", () => {
  it("blocks open redirects", () => {
    expect(safeNextPath("/auth/set-password")).toBe("/auth/set-password");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "evil", null, "/x\r\nSet-Cookie: a"]) {
      expect(safeNextPath(bad)).toBe("/calendar");
    }
  });
  it("requires strong passwords", () => {
    expect(passwordSchema.safeParse("Sh0rt").success).toBe(false);
    expect(passwordSchema.safeParse("alllowercase123").success).toBe(false);
    expect(passwordSchema.safeParse("NoDigitsHereAtAll").success).toBe(false);
    expect(passwordSchema.safeParse("Good-Passw0rd").success).toBe(true);
  });
  it("escapes HTML in emails", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe("&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;");
  });
  it("only embeds allow-listed https hosts", () => {
    expect(embeddableUrl("https://docs.google.com/document/d/abc/pub")).not.toBeNull();
    expect(embeddableUrl("http://docs.google.com/x")).toBeNull();
    expect(embeddableUrl("https://evil.example.com")).toBeNull();
    expect(embeddableUrl("javascript:alert(1)")).toBeNull();
  });
  it("accepts only photos/PDFs up to 10 MB", () => {
    expect(validateProofFile({ type: "application/pdf", size: 1000 })).toBeNull();
    expect(validateProofFile({ type: "image/heic", size: 1000 })).toBeNull();
    expect(validateProofFile({ type: "text/html", size: 10 })).not.toBeNull();
    expect(validateProofFile({ type: "image/png", size: 11 * 1024 * 1024 })).not.toBeNull();
  });
});
