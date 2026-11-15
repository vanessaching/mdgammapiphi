/* eslint-disable @typescript-eslint/no-require-imports -- plain Node script using the preinstalled Playwright */
/**
 * Browser walkthrough against a running app + local Supabase seeded with
 * scripts/seed-dev.mjs.   node tests/e2e/flow.cjs
 */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MAILPIT = "http://127.0.0.1:54324";
const PW = "Demo-Passw0rd!";
const SHOTS = process.env.SHOTS_DIR;
let step = 0;
const log = (m) => console.log(`✓ ${++step}. ${m}`);

async function login(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) console.error("CSP violation:", m.text()); });
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click("button:has-text('Sign in')");
  await page.waitForURL("**/calendar");
  return { ctx, page };
}
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

(async () => {
  const browser = await chromium.launch();
  try {
    // --- Auth guard + bad login -------------------------------------------
    {
      const page = await (await browser.newContext()).newPage();
      await page.goto(`${BASE}/members`);
      assert.match(page.url(), /\/login$/);
      await page.fill("#email", "member@demo.test");
      await page.fill("#password", "wrong-password");
      await page.click("button:has-text('Sign in')");
      await page.getByText("Email or password is incorrect.").waitFor();
      await shot(page, "01-login");
      log("signed-out users are sent to /login; wrong password shows a generic error");
    }

    // --- Member submits an excusal with proof ------------------------------
    const member = await login(browser, "member@demo.test");
    await shot(member.page, "02-calendar");
    await member.page.goto(`${BASE}/me`);
    await member.page.getByText("Attendance (required events)").waitFor();
    log("member signs in and sees calendar + personal dashboard");

    await member.page.goto(`${BASE}/calendar`);
    await member.page.getByRole("link", { name: "Philanthropy Event: Read > Lead" }).first().click();
    await member.page.waitForURL("**/events/**");
    const eventUrl = member.page.url();
    await member.page.fill("#reason", "Biology midterm at the same time");
    const pdf = path.join(require("node:os").tmpdir(), "proof.pdf");
    fs.writeFileSync(pdf, "%PDF-1.4\n% test proof\n");
    await member.page.setInputFiles("#proof", pdf);
    await member.page.click("button:has-text('Submit excusal')");
    // The page refreshes into the "My excusal" view once saved.
    await member.page.getByRole("button", { name: "Withdraw" }).waitFor();
    await member.page.getByText("Pending").first().waitFor();
    await shot(member.page, "03-event-member");
    log("member submits an excusal with a PDF proof; it shows Pending");

    // Deadline closed → emergency-only for the event tomorrow
    await member.page.goto(`${BASE}/calendar`);
    const tomorrow = member.page.getByRole("link", { name: /Chapter Meeting/ });
    const hrefs = await tomorrow.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    let sawEmergency = false;
    for (const h of hrefs) {
      await member.page.goto(BASE + h);
      if (await member.page.getByText("Submit emergency excusal").count()) { sawEmergency = true; break; }
    }
    assert.ok(sawEmergency, "an event inside 48h should only allow emergency excusals");
    log("inside the 48h deadline, only an emergency excusal is offered");

    // Member can't reach VPO pages or exec controls
    await member.page.goto(`${BASE}/excusals/review`);
    assert.match(member.page.url(), /\/calendar/);
    await member.page.goto(`${BASE}/attendance`);
    assert.match(member.page.url(), /\/calendar/);
    await member.page.goto(`${BASE}/members`);
    assert.equal(await member.page.getByText("Assign a position…").count(), 0);
    assert.equal(await member.page.getByText("Invite a member").count(), 0);
    log("member is blocked from Review / 80% view and sees no role controls");

    // --- VPO approves -------------------------------------------------------
    const vpo = await login(browser, "vpo@demo.test");
    await vpo.page.goto(`${BASE}/excusals/review`);
    await vpo.page.getByText("Biology midterm").waitFor();
    const proofHref = await vpo.page.getByRole("link", { name: "View proof" }).first().getAttribute("href");
    const proofRes = await fetch(proofHref);
    assert.equal(proofRes.status, 200, "VPO's signed proof link works");
    assert.match(await proofRes.text(), /^%PDF/);
    await vpo.page.fill("input[name=note]", "Good luck on the exam!");
    await shot(vpo.page, "04-review");
    await vpo.page.click("button:has-text('Approve')");
    await vpo.page.getByText("Biology midterm").waitFor({ state: "detached" }); // decided items leave the pending queue
    log("VPO opens the proof and approves with a note");

    // Roster: excused pre-marked; check member2 present; save
    await vpo.page.goto(eventUrl);
    const row = vpo.page.locator("label", { hasText: "Taylor Member" });
    await row.getByText("Excused").waitFor();
    await vpo.page.locator("label", { hasText: "Sam Member" }).locator("input").check();
    await vpo.page.click("button:has-text('Save attendance')");
    await vpo.page.getByText("Attendance saved: 1 present.").waitFor();
    await shot(vpo.page, "05-event-vpo");
    log("roster shows the approved member as Excused; VPO saves attendance");

    await vpo.page.goto(`${BASE}/attendance`);
    await vpo.page.getByText("At or above 80%").first().waitFor();
    await shot(vpo.page, "06-80pct");
    log("80% view loads for the VPO");

    // Member got in-app notification
    await member.page.goto(`${BASE}/notifications`);
    await member.page.getByText("Excusal approved: Philanthropy Event").waitFor();
    await member.page.getByText("Good luck on the exam!").waitFor();
    log("member receives the in-app approval notification with the note");

    // --- Exec (non-president VP) assigns a role + invites ------------------
    const vp = await login(browser, "vpme@demo.test");
    await vp.page.goto(`${BASE}/members`);
    const memberRow = vp.page.locator("li", { hasText: "member@demo.test" }).first();
    await memberRow.locator("select[name=role_id]").selectOption({ label: "Director of Philanthropy" });
    await memberRow.getByRole("button", { name: "Assign" }).click();
    await vp.page.getByText("Role assigned.").waitFor();
    await vp.page.reload();
    await vp.page.locator("li", { hasText: "member@demo.test" }).locator("span.rounded-full", { hasText: "Director of Philanthropy" }).waitFor();
    log("a VP (not President) assigns 'Director of Philanthropy' to a member");

    // exec can manage their own positions too
    const selfRow = vp.page.locator("li", { hasText: "vpme@demo.test" }).first();
    await selfRow.locator("select[name=role_id]").selectOption({ label: "Director of Wellness" });
    await selfRow.getByRole("button", { name: "Assign" }).click();
    await vp.page.getByText("Role assigned.").waitFor();
    await vp.page.reload();
    await vp.page.locator("li", { hasText: "vpme@demo.test" }).locator("span.rounded-full", { hasText: "Director of Wellness" }).waitFor();
    assert.equal(await vp.page.locator("li", { hasText: "vpme@demo.test" }).getByRole("button", { name: "Deactivate" }).count(), 0);
    log("exec members can change their own positions (but can't deactivate themselves)");

    await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
    const newEmail = `newbie${Date.now()}@demo.test`;
    await vp.page.fill("#inv-name", "Nova Newbie");
    await vp.page.fill("#inv-email", newEmail);
    await vp.page.locator("#inv-role").selectOption({ label: "Member Conduct Committee Member" });
    await vp.page.click("button:has-text('Send invite')");
    await vp.page.getByText(`Invite sent to ${newEmail}.`).waitFor();
    await shot(vp.page, "07-members-exec");
    log("VP invites a new member with an MCC position");

    // --- New member accepts invite ---------------------------------------
    let msg;
    for (let i = 0; i < 20 && !msg; i++) {
      const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent("to:" + newEmail)}`)).json();
      msg = list.messages?.[0];
      if (!msg) await new Promise((r) => setTimeout(r, 500));
    }
    assert.ok(msg, "invite email delivered");
    const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
    const link = full.HTML.match(/href="([^"]+auth\/confirm[^"]+)"/)[1].replace(/&amp;/g, "&");
    const newbie = await (await browser.newContext()).newPage();
    await newbie.goto(link);
    await newbie.waitForURL("**/auth/set-password");
    await newbie.fill("#password", "weakpass");
    await newbie.fill("#confirm", "weakpass");
    await newbie.click("button:has-text('Save password')");
    await newbie.getByRole("alert").waitFor();
    await newbie.fill("#password", "Brand-New-Passw0rd");
    await newbie.fill("#confirm", "Brand-New-Passw0rd");
    await newbie.click("button:has-text('Save password')");
    await newbie.waitForURL("**/calendar");
    await newbie.goto(`${BASE}/me`);
    await newbie.locator("main").getByText(/Member Conduct Committee Member/).first().waitFor();
    log("invitee follows the email link, is forced to pick a strong password, and lands in with their MCC role");

    // --- Tasks ---------------------------------------------------------------
    await vp.page.goto(`${BASE}/tasks`);
    const options = await vp.page.locator("#assignee_id option").allTextContents();
    assert.ok(options.includes("Taylor Member") && !options.includes("Avery President") && !options.includes("Jordan Operations"));
    await vp.page.fill("#title", "Design philanthropy flyer");
    await vp.page.fill("#due_date", "2026-12-01");
    await vp.page.locator("#assignee_id").selectOption({ label: "Taylor Member" });
    await vp.page.click("button:has-text('Assign task')");
    await vp.page.getByText("Task assigned.").waitFor();
    log("VP can assign to members but not to the President/other VPs; task created");

    await member.page.goto(`${BASE}/tasks`);
    const taskRow = member.page.locator("li", { hasText: "Design philanthropy flyer" });
    await taskRow.locator("select[name=status]").selectOption("in_progress");
    await taskRow.getByRole("button", { name: "Save" }).click();
    await taskRow.getByText("Updated.").waitFor();
    await member.page.reload();
    await member.page.locator("li", { hasText: "Design philanthropy flyer" }).locator("span.rounded-full", { hasText: "In Progress" }).waitFor();
    await shot(member.page, "08-tasks");
    const memberOptions = await member.page.locator("#assignee_id option").allTextContents();
    assert.deepEqual(memberOptions, ["Myself"]);
    log("assignee updates status; general members can only assign to themselves");

    // --- Deactivation ---------------------------------------------------------
    await vp.page.goto(`${BASE}/members`);
    vp.page.once("dialog", (d) => d.accept());
    await vp.page.locator("li", { hasText: newEmail }).getByRole("button", { name: "Deactivate" }).click();
    await vp.page.getByText("Member deactivated and signed out").waitFor();
    await newbie.goto(`${BASE}/calendar`);
    assert.match(newbie.url(), /\/login/);
    log("deactivated member is locked out immediately");

    // --- Newsletter ------------------------------------------------------------
    await vp.page.goto(`${BASE}/newsletter`);
    await vp.page.fill("#nl-title", "November Issue");
    await vp.page.fill("#nl-body", "Congrats to our new members!");
    await vp.page.check("input[name=published]");
    await vp.page.click("button:has-text('Save issue')");
    await vp.page.getByText("Issue saved.").waitFor();
    await member.page.goto(`${BASE}/newsletter`);
    await member.page.getByText("Congrats to our new members!").waitFor();
    log("exec posts a newsletter; members can read it");

    // --- Sign out ---------------------------------------------------------------
    await member.page.click("button:has-text('Sign out')");
    await member.page.waitForURL("**/login");
    log("sign out works");

    console.log(`\nAll ${step} browser checks passed.`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error("✗ FAILED:", e.message); process.exit(1); });
