"use client";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { validateProofFile } from "@/lib/rules";
import { inputCls, labelCls } from "@/components/ui";
import { submitExcusal } from "./actions";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "application/pdf": "pdf",
};

export function ExcusalForm({ eventId, userId, emergencyOnly }: { eventId: string; userId: string; emergencyOnly: boolean }) {
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("proof") as File | null;
    fd.delete("proof");
    start(async () => {
      setMsg(null);
      if (file && file.size > 0) {
        const problem = validateProofFile(file);
        if (problem) return setMsg({ error: problem });
        // Upload straight to the private bucket, into the member's own folder (enforced by storage RLS).
        const path = `${userId}/${crypto.randomUUID()}.${EXT[file.type]}`;
        const { error } = await createClient().storage.from("excusal-proofs").upload(path, file, { contentType: file.type, upsert: false });
        if (error) return setMsg({ error: "Upload failed. Make sure the file is a photo or PDF under 10 MB." });
        fd.set("proof_path", path);
      }
      const res = await submitExcusal(null, fd);
      setMsg(res);
      if (res?.ok) form.reset();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="event_id" value={eventId} />
      {emergencyOnly && (
        <div className="rounded border border-yellow-300 bg-yellow-50 p-2 text-sm text-yellow-900">
          The regular deadline has passed. You can still submit an <strong>emergency</strong> excusal.
          <input type="hidden" name="is_emergency" value="on" />
        </div>
      )}
      <div>
        <label className={labelCls} htmlFor="reason">Reason</label>
        <textarea id="reason" name="reason" required maxLength={2000} rows={3} className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor="proof">Proof (photo or PDF, up to 10 MB)</label>
        <input id="proof" name="proof" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" className="text-sm" />
      </div>
      <button disabled={pending} className="rounded-full bg-wine px-4 py-1.5 text-sm font-medium tracking-wide text-white shadow-sm hover:bg-berry-dark disabled:opacity-50">
        {pending ? "Submitting…" : emergencyOnly ? "Submit emergency excusal" : "Submit excusal"}
      </button>
      {msg?.error && <p role="alert" className="text-sm text-red-700">{msg.error}</p>}
      {msg?.ok && <p role="status" className="text-sm text-green-700">{msg.ok}</p>}
    </form>
  );
}
