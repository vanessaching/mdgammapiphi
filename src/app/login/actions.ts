"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import type { ActionState } from "@/lib/action";

const email = z.string().trim().toLowerCase().email().max(254);
const GENERIC_SENT = "If that email belongs to a chapter member, a link is on its way. Check your inbox.";

export async function signIn(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z.object({ email, password: z.string().min(1).max(200) }).safeParse({
    email: fd.get("email"), password: fd.get("password"),
  });
  if (!parsed.success) return { error: "Enter your email and password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Same message for unknown email and wrong password (no account enumeration).
  if (error) return { error: "Email or password is incorrect." };
  redirect("/calendar");
}

export async function sendMagicLink(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = email.safeParse(fd.get("email"));
  if (!parsed.success) return { error: "Enter a valid email." };
  const supabase = await createClient();
  await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${publicEnv.siteUrl}/auth/confirm` },
  });
  return { ok: GENERIC_SENT };
}

export async function sendPasswordReset(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = email.safeParse(fd.get("email"));
  if (!parsed.success) return { error: "Enter a valid email." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/auth/set-password`,
  });
  return { ok: GENERIC_SENT };
}
