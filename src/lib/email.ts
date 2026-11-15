import "server-only";
import { serverEnv, publicEnv } from "./env";
import { escapeHtml } from "./rules";

/** Send a transactional email through Resend. No-ops (with a log) if not configured. */
export async function sendEmail(to: string, subject: string, lines: string[], link?: { href: string; label: string }) {
  const env = serverEnv();
  if (!env.resendApiKey) {
    console.info(`[email skipped: RESEND_API_KEY not set] to=${to} subject=${subject}`);
    return;
  }
  const body = lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("");
  const button = link
    ? `<p><a href="${escapeHtml(publicEnv.siteUrl + link.href)}">${escapeHtml(link.label)}</a></p>`
    : "";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [to],
      subject,
      html: `<div style="font-family:sans-serif">${body}${button}</div>`,
      text: [...lines, link ? `${link.label}: ${publicEnv.siteUrl}${link.href}` : ""].join("\n\n"),
    }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text().catch(() => ""));
}
