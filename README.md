# Maryland Gamma Chapter Hub

An organizational tool for members of Pi Beta Phi Maryland Gamma: calendar, excusals, attendance/points, tasks and newsletter.
**Stack:** Next.js 15 · Supabase (Auth, Postgres + row-level security, Storage) · Google Calendar API · Resend · Vercel.

## Who can do what

| | President | VP Operations | Other VPs | Directors | MCC / General |
|---|:-:|:-:|:-:|:-:|:-:|
| **Assign/remove positions, invite & deactivate members** | ✅ | ✅ | ✅ | | |
| Approve/reject excusals, take attendance, event settings, 80% view | ✅ | ✅ | | | |
| Assign tasks | anyone | directors + members | directors + members | self | self |
| See all attendance & excusals | ✅ | ✅ | own | own | own |
| Post newsletters | ✅ | ✅ | ✅ | | |
| Calendar, submit excusals, own stats | ✅ | ✅ | ✅ | ✅ | ✅ |

Positions come pre-loaded with Pi Beta Phi's Executive Council (VPs), common Director positions, and
the Member Conduct Committee. Exec can add, rename or delete positions on the **Members** page; each
position has a *type* (Executive Council / Director / MCC) that decides its permissions.
A member can hold several positions (e.g. VP Risk Management + MCC Chair).

**Guardrails on role changes** (every exec member, including for themselves, can change roles):
- The chapter can never have **zero Chapter Presidents**: assign the new one before removing the old.
- Every change is written to the **audit log** (Members page), the member is notified, and changes
  to President/VP positions notify the rest of exec.
- The VPO can't approve their **own** excusal; the President does.

## Security

- **Own login for everyone, invite-only.** Public sign-up is off, and a database trigger rejects any
  account whose email wasn't invited by exec, even if someone calls the Auth API directly.
  Passwords: 10+ chars with upper/lower/digit. Magic links and password resets are supported.
- **Row-level security on every table.** The database enforces permissions itself, so a member
  with dev tools and the public API key still can't read others' excusals or approve their own.
  Sensitive writes (roles, excusal decisions, attendance) only happen inside database functions that
  check the caller's position first. Column-level grants stop edits to fields like `status`.
- **Proof uploads** go to a private bucket, each member's own folder only, photos/PDF ≤ 10 MB,
  no overwrites. The VPO views them through 10-minute signed links.
- **Deactivating** a member cuts off database access immediately and bans the login.
- Strict security headers: nonce-based CSP, HSTS, no framing, nosniff, no open redirects. The
  service-role key is server-only (`server-only` import guard). The cron endpoint uses a secret.

## Setup

**Launching for real? Follow [DEPLOY.md](DEPLOY.md): click-by-click, no terminal needed.** The notes below are the short version for developers.

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Install the CLI deps (`npm install`) and push the schema:
   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```
3. In the dashboard → **Authentication**:
   - **Sign In / Providers → Email:** turn **off** "Allow new users to sign up".
   - **URL Configuration:** Site URL = your Vercel URL; add `https://YOUR-SITE/auth/confirm` to Redirect URLs.
   - **Emails → Templates:** paste in `supabase/templates/invite.html`, `magic_link.html` and
     `recovery.html` (they send people through `/auth/confirm`).
   - **Emails → SMTP:** use Resend's SMTP so invites don't hit Supabase's low default email limit.
   - **Policies → Password:** minimum 10, require lower/upper/digits.

### 2. Google Calendar
The calendar ID is already in `.env.example`. Pick one:
- **Public calendar:** create an API key in Google Cloud (enable the *Google Calendar API*, restrict
  the key to it) → `GOOGLE_API_KEY`.
- **Private calendar:** create a service account, share the calendar with its email ("See all event
  details"), paste its JSON key into `GOOGLE_SERVICE_ACCOUNT_JSON`.

Events sync daily (Vercel Cron), hourly via the included GitHub Action, and on **Calendar → Sync now** (VPO). The VPO's settings (required,
points, deadline) are never overwritten by a sync.

### 3. Deploy on Vercel
Import the repo, add every variable from `.env.example`, deploy. Then create the first account
with `supabase/setup/first-account.sql` (see DEPLOY.md Step 10). It gets VP Operations and
invites everyone else from **Members**. (Developers can use `scripts/bootstrap-president.mjs` instead.)

## Local development & tests
Requires Docker.
```bash
npm install
npm run db:start                     # local Supabase
cp .env.example .env.local           # fill with keys from: npx supabase status
node --env-file=.env.local scripts/seed-dev.mjs   # demo users, password Demo-Passw0rd!
npm run dev
```
Tests:
```bash
npm test             # unit: deadlines, attendance %, mapping, security helpers
npm run test:db      # 49 permission tests against real Supabase (resets local DB)
npm run test:e2e     # 18-step browser walkthrough (needs the app running; resets + seeds local DB)
```
Local invite/reset emails land in Mailpit at http://127.0.0.1:54324.

## Decisions you may want to change
- **Emergency excusals** are accepted until 7 days after the event (`EMERGENCY_WINDOW_DAYS` in
  `src/lib/rules.ts` and the matching line in the migration).
- **Attendance %** only counts events where the VPO has saved the roster, so a meeting isn't counted
  as absences before attendance is taken.
- The **President** can approve excusals and take attendance too ("everything the VPO can do").
- Newsletter embeds are allowed from Google Docs, Canva, Mailchimp and Flipsnack; other links open in a new tab.

## Branding
Uses Pi Beta Phi's 2025 brand: colors sampled from the official brand kit (wine `#9B3359`,
dark berry `#512A44`, light pink `#F5DADF`, silver blue `#B9D9EB`, navy `#01426A`, light blue
`#DBE2E9`, cream `#FFF2E5`, charcoal `#3B4559`), the primary logo, the "Connect. Serve. Shine."
tagline logo, a brand gradient and the decorative Greek letters (app icon).
All colors live in `src/app/globals.css`; web-sized assets are in `public/brand/`.
The brand kit had no font files, so headings use a classic serif and body text a system sans-serif.
