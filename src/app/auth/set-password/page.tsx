import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { inputCls, labelCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { setPassword } from "./actions";

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-3xl font-semibold text-berry-dark">Set your password</h1>
      <p className="mb-4 text-sm text-gray-600">Signed in as {user.email}. At least 10 characters, with upper- and lowercase letters and a number.</p>
      <ActionForm action={setPassword} className="space-y-3 rounded-lg border bg-white p-6 shadow-sm">
        <div>
          <label className={labelCls} htmlFor="password">New password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="confirm">Confirm password</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required className={inputCls} />
        </div>
        <SubmitButton className="w-full">Save password</SubmitButton>
      </ActionForm>
    </main>
  );
}
