import { z } from "zod";

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  timeZone: process.env.NEXT_PUBLIC_CHAPTER_TIMEZONE ?? "America/New_York",
  chapterName: process.env.NEXT_PUBLIC_CHAPTER_NAME ?? "Pi Beta Phi",
};

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, "SUPABASE_SERVICE_ROLE_KEY is required"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  CRON_SECRET: z.string().min(16).optional(),
  GOOGLE_CALENDAR_ID: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
});

/** Server-only secrets, validated lazily so the build doesn't need them. */
export function serverEnv() {
  const e = serverSchema.parse(process.env);
  return {
    serviceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY,
    resendApiKey: e.RESEND_API_KEY,
    emailFrom: e.EMAIL_FROM ?? "Chapter Hub <noreply@example.com>",
    cronSecret: e.CRON_SECRET,
    googleCalendarId: e.GOOGLE_CALENDAR_ID,
    googleServiceAccountJson: e.GOOGLE_SERVICE_ACCOUNT_JSON,
    googleApiKey: e.GOOGLE_API_KEY,
  };
}
