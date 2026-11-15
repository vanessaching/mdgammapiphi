"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { passwordSchema } from "@/lib/rules";
import type { ActionState } from "@/lib/action";

export async function setPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) return { error: "Passwords don't match." };
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: error.message.includes("same") ? "Choose a different password." : "Couldn't set that password. Try a stronger one." };
  redirect("/calendar");
}
