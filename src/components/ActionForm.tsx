"use client";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
};

export function ActionForm({ action, children, className, resetOnSuccess, confirm }: Props) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state?.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p role="status" className="mt-2 text-sm text-green-700">{state.ok}</p>}
    </form>
  );
}

export function SubmitButton({ children, variant = "primary", className = "" }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; className?: string }) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-wine text-white hover:bg-berry-dark shadow-sm",
    secondary: "bg-white text-navy border border-navy/30 hover:bg-light-blue",
    danger: "bg-white text-red-700 border border-red-300 hover:bg-red-50",
  }[variant];
  return (
    <button type="submit" disabled={pending} className={`rounded-full px-4 py-1.5 text-sm font-medium tracking-wide disabled:opacity-50 ${styles} ${className}`}>
      {pending ? "Working…" : children}
    </button>
  );
}
