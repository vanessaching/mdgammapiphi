import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { inputCls, labelCls } from "@/components/ui";
import { getCurrentMember } from "@/lib/auth";
import { sendMagicLink, sendPasswordReset, signIn } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentMember()) redirect("/calendar");
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen flex-col justify-center bg-wine bg-cover bg-center px-4 py-10" style={{ backgroundImage: "url(/brand/gradient.jpg)" }}>
     <div className="mx-auto w-full max-w-sm">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand logo */}
      <img src="/brand/logo-tagline-white.png" alt="Pi Beta Phi: Connect. Serve. Shine." width={380} height={110} className="mx-auto h-auto w-72 drop-shadow" />
      <h1 className="mt-4 text-center font-sans text-xs font-medium uppercase tracking-[0.3em] text-white">Chapter Hub</h1>
      <div className="mx-auto mb-6 mt-3 h-0.5 w-12 bg-silver-blue" aria-hidden />
      {error === "link" && (
        <p role="alert" className="mb-4 rounded-lg bg-white p-2 text-sm text-red-700">That link is invalid or expired. Request a new one.</p>
      )}
      <div className="space-y-6 rounded-2xl bg-white p-6 shadow-xl">
        <ActionForm action={signIn} className="space-y-3">
          <div>
            <label className={labelCls} htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className={inputCls} />
          </div>
          <SubmitButton className="w-full">Sign in</SubmitButton>
        </ActionForm>

        <details className="text-sm">
          <summary className="cursor-pointer text-navy">Email me a sign-in link instead</summary>
          <ActionForm action={sendMagicLink} className="mt-2 space-y-2">
            <input name="email" type="email" placeholder="you@school.edu" required className={inputCls} aria-label="Email for sign-in link" />
            <SubmitButton variant="secondary">Send link</SubmitButton>
          </ActionForm>
        </details>

        <details className="text-sm">
          <summary className="cursor-pointer text-navy">Forgot your password?</summary>
          <ActionForm action={sendPasswordReset} className="mt-2 space-y-2">
            <input name="email" type="email" placeholder="you@school.edu" required className={inputCls} aria-label="Email for password reset" />
            <SubmitButton variant="secondary">Send reset link</SubmitButton>
          </ActionForm>
        </details>
      </div>
      <p className="mt-4 text-center text-xs font-medium text-navy">Accounts are invite-only. Ask an exec member for an invite.</p>
     </div>
    </main>
  );
}
