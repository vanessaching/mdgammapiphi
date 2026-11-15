# Maryland Gamma Chapter Hub: setup guide

Everything is click-by-click, with no coding. Work through it in order; you can stop between parts.

- **Part 1 — Launch (free):** about 1 hour. The site goes live at a free address like
  `mdgammapiphi.vercel.app`, and invite/password emails come from a chapter Gmail.
- **Part 2 — Your own domain (later):** about 30 minutes plus the domain cost (around $10–20 a
  year). This moves the site to your own address and turns on approval/task emails.

**Already done ✅:** the code is on GitHub ([vanessaching/mdgammapiphi](https://github.com/vanessaching/mdgammapiphi)),
the Supabase project is created, the database is built, and the Security Advisor check passed.

> 🔐 **Rules for every account below:** turn on **2-step verification** (use an authenticator app,
> not texts). Save passwords and keys in a **password manager**. **Never** paste a secret key into a
> chat, email, group chat, or screenshot, including to Claude.
>
> **📋 = save this in your password manager.** **🔒 = secret.**

---

# PART 1 — Launch (free)

## 1. GitHub security (1 minute)
In the repo: **Settings → Code security** → turn on **Dependabot alerts** and **Dependabot
security updates**. GitHub will then tell you when the site's building blocks need a security fix.

## 2. Supabase keys and sign-in settings
*(You already created the project and ran the database file.)*

**2a. Copy your keys.** In Supabase, open **Project Settings → API Keys** and save these:
- **Project URL**, like `https://xxxx.supabase.co` 📋
- **anon / publishable key** 📋 (safe to be public)
- **service_role / secret key** 📋🔒 (this one bypasses all security; it only ever goes into Vercel)

**2b. Lock down sign-in.** Go to **Authentication → Sign In / Providers**:
- Turn **off** "Allow new users to sign up". Only invited people can have accounts.
- Under **Email**: keep **Confirm email** on, turn on **Secure email change**, set
  **Minimum password length** to **10**, and set **Password requirements** to
  *lowercase, uppercase letters and digits*.
- Turn **off** any providers you don't use (phone, anonymous, etc.).

## 3. Email sender: chapter Gmail (about 10 minutes)
Supabase's built-in email only reaches your Supabase team, sends about 2 emails an hour, and on new
free projects its templates can't be edited. Connecting your own sender fixes all three.

1. Use a **dedicated chapter Gmail** (e.g. `mdgammapiphi.hub@gmail.com`), not a personal one, so
   it can be passed down to future officers. Create one if needed.
2. On that Google account, turn on **2-Step Verification** (myaccount.google.com → Security).
3. Go to **myaccount.google.com/apppasswords** → name it `Supabase` → **Create**. Copy the
   16-character code. 📋🔒
4. In Supabase, open **Authentication → Emails → SMTP Settings** → turn on **Custom SMTP**:

   | Field | Value |
   |---|---|
   | Sender email | your chapter Gmail address |
   | Sender name | `Pi Beta Phi Maryland Gamma` |
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | your chapter Gmail address |
   | Password | the 16-character app password |

   Click **Save**.
5. **Authentication → Rate Limits**: set "emails sent per hour" to about **30**.
6. **Authentication → Emails → Templates**. These should be editable now. For each of the three,
   set the subject, delete the existing body, and paste the matching file from the repo's
   [`supabase/templates`](https://github.com/vanessaching/mdgammapiphi/tree/main/supabase/templates)
   folder (open the file on GitHub → **copy raw file** button):

   | Template | Subject | File |
   |---|---|---|
   | Invite user | `You're invited to Chapter Hub` | `invite.html` |
   | Magic Link | `Your Chapter Hub sign-in link` | `magic_link.html` |
   | Reset Password | `Reset your Chapter Hub password` | `recovery.html` |

   ⚠️ This step matters: without these templates, invite links won't sign people in.

## 4. Google Calendar key (about 5 minutes)
Your calendar is public, so all you need is an API key.
1. **console.cloud.google.com** → create a project `mdgamma-hub`.
2. **APIs & Services → Library** → search **Google Calendar API** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key.**
4. Click **Edit** on the key → **API restrictions → Restrict key → Google Calendar API** → **Save**.
   📋🔒

## 5. Cron secret
Use your password manager to generate a **random password of 40+ letters and numbers**. 📋🔒
It lets the automatic calendar sync prove it's allowed to run.

## 6. Publish on Vercel (about 10 minutes)
1. **vercel.com** → **Sign up with GitHub** → turn on 2FA (Account Settings → Authentication).
2. **Add New → Project** → pick `mdgammapiphi` → **Import**.
3. Open **Environment Variables** and add these. Tick **Sensitive** on the 🔒 ones:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` 🔒 | Supabase service_role/secret key |
   | `NEXT_PUBLIC_SITE_URL` | `https://mdgammapiphi.vercel.app` (fix in step 5 below if different) |
   | `NEXT_PUBLIC_CHAPTER_NAME` | `Pi Beta Phi Maryland Gamma` |
   | `NEXT_PUBLIC_CHAPTER_TIMEZONE` | `America/New_York` |
   | `GOOGLE_CALENDAR_ID` | `fb9fb41dcb988c312d97fde66e23dc1669ff686a33f597a0700a7e315b0a2071@group.calendar.google.com` |
   | `GOOGLE_API_KEY` 🔒 | your Google key from step 4 |
   | `CRON_SECRET` 🔒 | your cron secret from step 5 |

   *(Leave out `RESEND_API_KEY` and `EMAIL_FROM` until Part 2.)*
4. Click **Deploy** and wait about 2 minutes.
5. **Check the address:** **Settings → Domains** shows your real `.vercel.app` address. If it's
   not exactly `mdgammapiphi.vercel.app`, change `NEXT_PUBLIC_SITE_URL` to match, then
   **Deployments → ⋯ (latest) → Redeploy**.
6. **Settings → Deployment Protection:** make sure **Vercel Authentication** is on for
   **Preview**, so test versions of the site can only be opened by you.

## 7. Point Supabase at the site
In Supabase, open **Authentication → URL Configuration**:
- **Site URL:** `https://mdgammapiphi.vercel.app` (your real address)
- **Redirect URLs:** add `https://mdgammapiphi.vercel.app/auth/confirm`

## 8. Hourly calendar sync (2 minutes)
Vercel's free plan syncs the calendar once a day; this makes it hourly.
In the GitHub repo, open **Settings → Secrets and variables → Actions → New repository secret** and add two:
- `SITE_URL` = `https://mdgammapiphi.vercel.app`
- `CRON_SECRET` = the same cron secret from step 5

Test it: **Actions** tab → **Sync Google Calendar** → **Run workflow**. A ✅ means the sync worked.

## 9. Create your account (the first one)
You'll be **VP Operations**: you can invite everyone, assign positions (including President),
approve excusals and take attendance.
1. On GitHub, open [`supabase/setup/first-account.sql`](https://github.com/vanessaching/mdgammapiphi/blob/main/supabase/setup/first-account.sql)
   and copy it. In **Supabase → SQL Editor → New query**, paste it, then replace **both**
   `you@school.edu` with your email and `Your Full Name` with your name.
2. Select **only the PART 1 lines** and click **Run**.
3. Go to **Authentication → Users → Add user → Send invitation** and enter the same email.
4. Back in the SQL Editor, select the **PART 2** lines plus the check below them and **Run**. You
   should see yourself as *Vice President Operations*.
5. Open the invite email, click the link, and set your password. You're in. 🎉

## 10. Bring in exec, then the chapter
1. **Members → Invite a member:** invite the **President**. Once she has signed in, use
   **Assign a position → Chapter President** next to her name. *(Set her up early: she's the one
   who approves your own excusals.)*
2. Invite the rest of exec and give each their position. Any exec member can invite and
   assign positions, including their own.
3. Invite general members. Gmail allows a few hundred emails a day, so for a big chapter, spread
   invites over a day or two.

## 11. Launch test (10 minutes, on phone and laptop)
- [ ] The site loads with the 🔒 padlock and shows the Pi Phi login screen
- [ ] Invite a second email you own. The email arrives (check spam), the link works, and you can set a password
- [ ] As that member: open an event and submit an excusal **with a photo**
- [ ] As yourself (VPO): **Review Excusals** → **View proof** → **Approve**. The member sees the 🔔 notification
- [ ] Take attendance on an event (check people off → **Save attendance**), then check the **80% View**
- [ ] Assign that member a task; it shows on their calendar and **Tasks**
- [ ] **Calendar** shows the real chapter events (or press **Sync now**)
- [ ] **Deactivate** the test member. They're logged out and can't sign back in

**Part 1 is done. The site is live! 🎉**

---

# PART 2 — Your own domain (whenever you're ready)

## 12. Buy the domain in Vercel
1. Pick a name (e.g. `mdgammapiphi.org`). ⚠️ Pi Beta Phi HQ has rules about using its name
   online, so check with your chapter advisor first.
2. In the Vercel project, open **Settings → Domains → Buy**. Add both `yourdomain.org` and
   `www.yourdomain.org`, and set `www` to **redirect** to `yourdomain.org`. HTTPS is automatic.
3. Make sure **auto-renew** is on. If the domain expires, the site goes down.

## 13. Email from your own domain (Resend)
1. **resend.com** → sign up, turn on 2FA → **Domains → Add domain** → your domain.
2. Resend shows several DNS records. In **Vercel → Domains → your domain → DNS Records**, add each
   one exactly (Type, Name, Value). Also add **DMARC**: Type `TXT`, Name `_dmarc`, Value
   `v=DMARC1; p=none; rua=mailto:hub@yourdomain.org`. Back in Resend, click **Verify**. It can
   take from a few minutes to a few hours.
3. In Resend, open **API Keys → Create**, give it **Sending access** only, for your domain. 📋🔒
4. **Switch Supabase's sender:** **Authentication → Emails → SMTP Settings** → change to:
   Sender `hub@yourdomain.org`, Host `smtp.resend.com`, Port `465`, Username `resend`,
   Password = the Resend API key. Save. (Your templates stay as they are.)

## 14. Move the site to the domain
1. **Vercel → Settings → Environment Variables:**
   - change `NEXT_PUBLIC_SITE_URL` to `https://yourdomain.org`
   - add `RESEND_API_KEY` 🔒 = your Resend key (this turns on approval and task emails)
   - add `EMAIL_FROM` = `Pi Beta Phi Maryland Gamma <hub@yourdomain.org>`

   Then go to **Deployments → ⋯ → Redeploy** (settings only take effect after a redeploy).
2. **Supabase → Authentication → URL Configuration:** set the Site URL to `https://yourdomain.org`, and
   add `https://yourdomain.org/auth/confirm` to Redirect URLs (remove the old vercel.app one).
3. **GitHub → Settings → Secrets → Actions:** update `SITE_URL` to `https://yourdomain.org`.
4. Re-run the launch test (step 11) on the new address.

---

# Keeping it secure (every semester)

- **Officer transition:** new exec assigns positions and **removes old ones**. **Deactivate**
  graduates and members who left. Skim the **audit log** on the Members page.
- **Hand over the accounts before you graduate:** add the next tech/exec person to the GitHub repo,
  Vercel team, Supabase organization, Google Cloud project and (later) Resend, each with their **own
  login and 2FA**. Never share one login. Also hand over the chapter Gmail.
- **If a secret might have leaked** (pasted somewhere, lost laptop): create a new one in that
  service, update it in Vercel, and **Redeploy**.
- **Dependabot:** when GitHub opens a security update pull request, merge it (or ask Claude to).
- **Backups:** the Supabase free plan has no downloadable backups. If losing attendance history
  would be bad, Pro (about $25/month) adds daily backups. Free projects also **pause after a week of no
  activity**. The calendar sync counts as activity, but if the project ever shows as paused,
  press **Restore** in Supabase.

# If something goes wrong

| Problem | Fix |
|---|---|
| Invite link says "invalid or expired" | Links work once and expire after an hour, so re-send from **Members**. Check the step 3 templates and the step 7 URLs. Open the link in the same browser you'll use the site in. |
| Invite email never arrives | Check spam. Check the Supabase SMTP settings (step 3). In Gmail, look at **Sent** for that account. |
| "Accounts are invite-only" | Invite from the site's **Members** page (or for your first account, run PART 1 of step 9 first). |
| Calendar is empty | VPO → **Calendar → Sync now** and read the message. Check `GOOGLE_API_KEY` is restricted to the *Calendar* API and that the Calendar API is enabled. |
| Times are off by hours | `NEXT_PUBLIC_CHAPTER_TIMEZONE` should be `America/New_York`. Redeploy after changing it. |
| Proof upload fails | It must be a photo or PDF under 10 MB. |
| Site shows an error | **Vercel → Deployments → latest → Logs**. Send Claude the error text (never the keys). |
