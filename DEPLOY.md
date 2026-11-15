# Launch guide: Chapter Hub

Step by step, no coding needed. Plan on about **2 hours**, in one sitting if you can.

**What it costs:** the domain is about $10–20 a year. Everything else starts on a free plan:
GitHub, Supabase, Vercel, Resend, Google Cloud.

**You'll create accounts at:** GitHub, Supabase, Vercel, Resend, Google Cloud.
Use an email the chapter will keep (for example a shared `tech@` or president's address you'll
hand down), not a personal school email that disappears when you graduate.

> 🔐 **Before anything else:** turn on **two-factor authentication (2FA)** on every one of these
> accounts as you create them. Use an authenticator app, not SMS. These accounts control the
> whole site, so they're the most important thing to protect.

Keep a private note (a password manager is best) to collect the values marked **📋 save this**.
Never paste the secret ones into chats, emails or group chats.

---

## Step 1 — Put the code on GitHub

1. Sign in at **github.com** and turn on 2FA (Settings → Password and authentication).
2. Click **+ → New repository**. Name: `chapter-hub`. Choose **Private**. Don't add a README.
   Click **Create repository**.
3. Get the code into it, either way:
   - **Easiest:** send Claude the repo name (`yourname/chapter-hub`) and it pushes the code for you.
   - **Yourself:** unzip `chapter-hub.zip`. On the empty repo page click **uploading an existing file**,
     drag in everything inside the unzipped folder (including the `.github` and `supabase` folders),
     and click **Commit changes**.
4. In the repo, open **Settings → Code security** and turn on **Dependabot alerts** and
   **Dependabot security updates**. GitHub will then warn you about security fixes for the code's building blocks.

---

## Step 2 — Buy your domain

**Easiest: buy it inside Vercel**, because Vercel then sets up the web address and HTTPS for you
automatically. (Cloudflare Registrar is a little cheaper but needs extra DNS steps.)

1. Pick a name. Common patterns: `[school]piphi.com`, `piphi[school].org`, `[chapter]piphi.org`.
   - ⚠️ Pi Beta Phi Headquarters has rules about using its name and logos online. Ask your
     chapter advisor or check the brand guidelines before buying a name with "Pi Beta Phi" or
     "Pi Phi" in it.
2. You'll buy it in Step 7 (Vercel → **Domains → Buy**). Just decide on the name now and
   check it's available.
3. After buying: make sure **auto-renew** is on, and **WHOIS privacy** is on (Vercel
   and Cloudflare include it). If the domain expires, the site and its emails go down.

---

## Step 3 — Set up Supabase (accounts, database, file storage)

### 3a. Create the project
1. Go to **supabase.com** → sign up (turn on 2FA in Account → Security).
2. **New project.** Name `chapter-hub`. Click **Generate a password** and **📋 save it**.
   Pick the **region closest to your school**: **East US (North Virginia)** for Baltimore.
3. Wait about 2 minutes for it to finish.

### 3b. Create the tables and security rules
1. Left sidebar → **SQL Editor** → **New query**.
2. Open the file `supabase/migrations/20261115000000_init.sql` from the code, copy **all** of it,
   paste it in, and click **Run**. You should see "Success. No rows returned."
3. Check: **Table Editor** should list `profiles`, `events`, `excusals`, `tasks`, etc., and
   **Storage** should show a bucket named `excusal-proofs` marked **Private**.

### 3c. Copy your keys
**Project Settings → API Keys** (and **Data API** for the URL):
- **Project URL** (`https://xxxx.supabase.co`) → 📋 save this
- **anon / publishable key** → 📋 save this (this one is safe to be public)
- **service_role / secret key** → 📋 save this **(SECRET: it bypasses all security. It only ever goes into Vercel.)**

### 3d. Lock down sign-in
Go to **Authentication** in the sidebar:
1. **Sign In / Providers**
   - Turn **off** "Allow new users to sign up". Only people exec invites can have accounts.
     The database also enforces this, so it's a second lock.
   - Under **Email**: keep "Confirm email" **on**, turn **Secure email change** **on**,
     set **Minimum password length** to **10**, and set **Password requirements** to
     *lowercase, uppercase letters and digits*.
   - Turn **off** any providers you don't use (phone, anonymous sign-ins, etc.).
2. **URL Configuration:** you'll fill this in at Step 8, after you have your domain.
3. **Emails → Templates:** update three templates. For each one, set the subject, delete what's in
   the body, and paste the matching file from `supabase/templates/`:

   | Template | Subject | Paste file |
   |---|---|---|
   | Invite user | `You're invited to Chapter Hub` | `invite.html` |
   | Magic Link | `Your Chapter Hub sign-in link` | `magic_link.html` |
   | Reset Password | `Reset your Chapter Hub password` | `recovery.html` |

   These send people through the site's secure sign-in page. Without them, invite links won't work.
4. **Emails → SMTP Settings:** you'll fill this in at Step 4 (Supabase's built-in email only
   sends a handful per hour, which is not enough to invite a chapter).

### 3e. Run the security check
Sidebar → **Advisors → Security Advisor** → **Rerun linter**. You should see **no errors**.
A warning about "leaked password protection" is expected on the free plan: that feature is part
of the paid plan.

---

## Step 4 — Set up email (Resend)

1. **resend.com** → sign up, turn on 2FA.
2. **Domains → Add domain** → enter your domain (from Step 2). Resend shows 3–4 **DNS
   records** (TXT/MX). Leave this tab open. You'll add them at Step 7 once the domain is
   bought, then come back and click **Verify**.
3. **API Keys → Create API key**. Name `chapter-hub`, permission **Sending access**, and
   limit it to your domain. **📋 save this (SECRET)**.
4. Back in **Supabase → Authentication → Emails → SMTP Settings**, turn on **Custom SMTP**:
   - Sender email: `hub@yourdomain.com`   · Sender name: `Pi Beta Phi Chapter Hub`
   - Host: `smtp.resend.com`   · Port: `465`
   - Username: `resend`   · Password: *your Resend API key*
   - Save. Then in **Authentication → Rate Limits**, raise "emails sent per hour" (e.g. to 100).
5. Note: Resend's free plan has a daily sending cap (check their current limit). If you're
   inviting a big chapter, invite in batches across a couple of days.

---

## Step 5 — Connect the Google Calendar

The calendar ID is already filled in for you:
`fb9fb41dcb988c312d97fde66e23dc1669ff686a33f597a0700a7e315b0a2071@group.calendar.google.com`

✅ **Your calendar is public**, so you only need an API key:
1. **console.cloud.google.com** → create a project `chapter-hub`.
2. **APIs & Services → Library** → search **Google Calendar API** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**. Then **Edit** the key and,
   under **API restrictions**, choose **Restrict key → Google Calendar API**. Save.
   **📋 save the key (SECRET)**. This goes in `GOOGLE_API_KEY` in Step 7.

<details><summary>Only if the calendar is ever made private</summary>

1. Same project, enable the Google Calendar API (steps 1–2 above).
2. **IAM & Admin → Service Accounts → Create**. Name `calendar-reader`, with no roles.
3. Open it → **Keys → Add key → JSON**. A file downloads. **📋 save it (SECRET)**.
4. Copy the service account's email (`calendar-reader@…iam.gserviceaccount.com`).
   In Google Calendar → the chapter calendar's **Settings and sharing → Share with specific
   people** → add that email with **"See all event details"**.
5. In Vercel, put the JSON file contents in `GOOGLE_SERVICE_ACCOUNT_JSON` and delete `GOOGLE_API_KEY`.
</details>

---

## Step 6 — Make a cron secret

This is a random password that lets the hourly calendar sync prove it's allowed to run. Use your
password manager's generator to make a **random 40+ character** string (letters and numbers).
**📋 save it (SECRET)**.

---

## Step 7 — Publish on Vercel

1. **vercel.com** → **Sign up with GitHub**, turn on 2FA.
2. **Add New → Project** → choose `chapter-hub` → **Import**.
3. Before clicking Deploy, open **Environment Variables** and add each of these. For the
   secret ones, tick **Sensitive**, and set the environment to **Production** only:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` 🔒 | Supabase service_role/secret key |
   | `NEXT_PUBLIC_SITE_URL` | `https://yourdomain.com` (your real domain, no trailing slash) |
   | `NEXT_PUBLIC_CHAPTER_NAME` | `Pi Beta Phi Maryland Gamma` |
   | `NEXT_PUBLIC_CHAPTER_TIMEZONE` | `America/New_York` (Baltimore, Eastern time) |
   | `GOOGLE_CALENDAR_ID` | the calendar ID above |
   | `GOOGLE_API_KEY` 🔒 | your Google key from Step 5 |
   | `RESEND_API_KEY` 🔒 | Resend API key |
   | `EMAIL_FROM` | `Pi Beta Phi Chapter Hub <hub@yourdomain.com>` |
   | `CRON_SECRET` 🔒 | your cron secret from Step 6 |

4. Click **Deploy**. In about 2 minutes you get a `chapter-hub-xxxx.vercel.app` link.
5. **Buy and connect the domain:** Project → **Settings → Domains** → **Buy** (or **Add** if
   you bought it elsewhere). Add both `yourdomain.com` and `www.yourdomain.com`, and set
   `www` to **redirect** to `yourdomain.com`. HTTPS turns on automatically.
6. **Add the Resend email records:** Vercel dashboard → **Domains** → your domain → **DNS Records**.
   Add each record Resend showed you (copy Type, Name and Value exactly). Also add a DMARC record:
   Type `TXT`, Name `_dmarc`, Value `v=DMARC1; p=none; rua=mailto:hub@yourdomain.com`.
   Then go back to Resend → **Verify**. It can take a few minutes up to a few hours.
7. **Security settings:** Project → **Settings → Deployment Protection**: make sure
   **Vercel Authentication** is on for **Preview** deployments. Preview links (made for
   test versions) can then only be opened by your Vercel team.

---

## Step 8 — Point Supabase at your domain

**Supabase → Authentication → URL Configuration:**
- **Site URL:** `https://yourdomain.com`
- **Redirect URLs:** add `https://yourdomain.com/auth/confirm`. Remove any `localhost` entries.

---

## Step 9 — Hourly calendar sync (GitHub)

Vercel's free plan syncs the calendar **once a day**. A free GitHub Action is included that syncs **every
hour**:
GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
- `SITE_URL` = `https://yourdomain.com`
- `CRON_SECRET` = the same cron secret from Step 6

Test it: repo → **Actions → Sync Google Calendar → Run workflow**. A green check means the sync worked.
(The VPO can also click **Sync now** on the Calendar page anytime.)

---

## Step 10 — Create your account (the first one)

You'll be the first account, as **VP Operations**. That position can invite everyone, assign
positions (including Chapter President), approve excusals and take attendance.

1. Open `supabase/setup/first-account.sql`. Replace **both** `you@school.edu` with your email
   and `Your Full Name` with your name.
2. **Supabase → SQL Editor:** paste and run only **PART 1**.
3. **Authentication → Users → Add user → Send invitation** → enter the same email.
4. **SQL Editor:** run **PART 2** (and the check below it). You should see yourself listed as
   Vice President Operations.
5. Open the email, click the link, and set your password.
6. On the site's **Members** page, invite the President. Once she has signed in, use
   **Assign a position → Chapter President** next to her name. Then invite the rest of exec and
   give them their positions; they can help invite everyone else.

> Rule to know: the VPO can't approve **her own** excusals; the President does. That's why the
> President should be set up early.

## Step 11 — Launch test (10 minutes)

Do these on your phone **and** a laptop:
- [ ] Visit `yourdomain.com`. It shows the login page with the 🔒 padlock, and `www.` redirects.
- [ ] You sign in. **Members** page loads, and the President shows as Chapter President.
- [ ] Invite a test email you own. The email arrives (check spam), the link works, and you can set a password.
- [ ] As the test member: open an event, submit an excusal **with a photo**.
- [ ] As VPO: **Review Excusals** → open the proof → approve. The test member gets the
      notification **and** an email.
- [ ] Take attendance on an event; check **80% View**.
- [ ] Assign a task; it shows on the assignee's calendar.
- [ ] Calendar shows real chapter events (or press **Sync now**).
- [ ] Deactivate the test member. They're signed out and can't sign back in.

---

## Keeping it secure (do these every semester)

- **Officer transition:** new exec assigns positions and **removes old ones** from people who
  stepped down. **Deactivate** members who graduated or left. Review the **audit log** on Members.
- **Hand over the accounts:** make sure the next tech/exec person is added to the GitHub repo,
  Vercel team, Supabase organization and Resend team, each with their own login and 2FA,
  *before* the current owner graduates. Never share one login.
- **Rotate secrets** if one might have leaked (someone pasted it somewhere, or a laptop was lost):
  regenerate it in its service, update it in Vercel, and **redeploy**.
- **Dependabot PRs:** when GitHub opens a security update, merge it (or ask Claude to). Vercel
  redeploys automatically.
- **Backups:** the Supabase free plan doesn't include downloadable backups. If losing attendance
  history would be a big deal, the Pro plan (about $25/month) adds daily backups. Free projects also
  **pause after a week of no activity**. The daily calendar sync counts as activity, but if the
  site is ever "paused", press **Restore** in the Supabase dashboard.

## Changing the domain later

1. Vercel → **Settings → Domains** → add the new domain (and redirect the old one to it).
2. Vercel → **Settings → Environment Variables** → change `NEXT_PUBLIC_SITE_URL` (and
   `EMAIL_FROM` if the email domain changes) → **Deployments → ⋯ → Redeploy**.
   *(Settings starting with `NEXT_PUBLIC_` only take effect after a redeploy.)*
3. Supabase → **Authentication → URL Configuration** → update **Site URL** and **Redirect URLs**.
4. Resend → add and verify the new domain if emails should come from it.
5. GitHub → update the `SITE_URL` Actions secret.

## If something goes wrong

| Problem | Fix |
|---|---|
| Invite link says "invalid or expired" | Links expire after 1 hour and work once. Re-send from Members. Check Step 3d templates and Step 8 URLs. |
| Invite emails never arrive | Check spam. Check Resend → **Logs** and that the domain shows **Verified**. Check Supabase SMTP settings (Step 4). |
| "Accounts are invite-only" when inviting | The invite must be sent from the site's **Members** page (or do Part 1 of Step 10 first). |
| Calendar is empty | VPO → **Sync now**; read the error. Public calendar: check the API key restriction and that the calendar is public. Private: check it's shared with the service account email. |
| Times are off by hours | Fix `NEXT_PUBLIC_CHAPTER_TIMEZONE` in Vercel, then redeploy. |
| Proof upload fails | File must be a photo or PDF under 10 MB. |
| Site shows an error page | Vercel → **Deployments** → latest → **Logs**. Send Claude the error text (never the keys). |
