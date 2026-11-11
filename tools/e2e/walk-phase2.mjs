import { createRequire } from "module";
import crypto from "node:crypto";
const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
const BASE = "http://localhost:3102", SUPA = "http://localhost:54321", OUT = process.argv[2];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light" });
await ctx.grantPermissions(["notifications"], { origin: BASE });
const page = await ctx.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
page.on("response", (r) => { if (r.status() >= 400 && !/\/api\/(holidays|search)/.test(r.url())) problems.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
const log = [];
const step = async (name, fn) => { try { const extra = await fn(); log.push("ok   " + name + (extra ? "  — " + extra : "")); } catch (e) { log.push("FAIL " + name + " — " + e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-${name.replace(/\W+/g, "-")}.png` }).catch(() => {}); } };
const shot = (name, full = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
const pad = (n) => String(n).padStart(2, "0");
const d = new Date(); const TODAY = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inDays = (n) => { const x = new Date(d); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };

await step("sign in", async () => {
  await page.goto(BASE + "/");
  await page.fill('input[type="email"]', "andre@example.com");
  await page.fill('input[type="password"]', "correct horse");
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(BASE + "/", { timeout: 8000 });
  await page.waitForSelector("text=No training plan yet", { timeout: 8000 });
});
await step("pick a training template", async () => {
  await page.click("main a:has-text('Set up your week')");
  await page.waitForSelector("text=Upper · Lower × 2");
  await shot("01-templates", false);
  await page.click("text=Upper · Lower × 2");
  await page.waitForSelector("text=This week", { timeout: 5000 });
  await shot("02-training");
});
await step("edit a plan day", async () => {
  await page.click("main button:has-text('Wed')");
  await page.selectOption("dialog select", "run");
  await page.fill('dialog input[placeholder="Push, Legs, 5k…"]', "Easy 5k");
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector("text=Easy 5k", { timeout: 5000 });
});
await step("today: workout card and done", async () => {
  await page.goto(BASE + "/");
  const weekday = new Date().getDay();
  const expected = { 1: "Upper", 2: "Lower", 3: "Easy 5k", 4: "Upper", 5: "Lower", 6: "Walk or sport", 0: "Rest" }[weekday];
  if (expected === "Rest") { await page.waitForSelector("text=Rest day."); return "rest day today"; }
  await page.waitForSelector(`p:has-text("${expected}")`, { timeout: 8000 });
  await page.waitForTimeout(800);
  await shot("03-today-workout");
  await page.click("button:has-text('Done')");
  await page.waitForSelector(`text=${expected} · done`, { timeout: 5000 });
  return expected;
});
await step("saved meal → plan → shopping", async () => {
  await page.goto(BASE + "/lifestyle/meals");
  await page.click("text=New meal");
  await page.fill('dialog input[placeholder="Chilli con carne"]', "Chilli");
  await page.fill("dialog textarea", "Minced beef\nKidney beans\nRice\nEggs");
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector("text=Minced beef, Kidney beans, Rice, Eggs", { timeout: 5000 });
  await page.click('[data-today] button:has-text("Dinner")');
  await page.fill('dialog input[aria-label="Meal"]', "Chi");
  await page.click("dialog >> text=Chilli");
  await page.waitForSelector("text=Add its 4 ingredients to the shopping list");
  await shot("04-meal-sheet", false);
  await page.click('dialog button[type="submit"]');
  const note = await page.waitForSelector("text=/Added \\d+ to the shopping list/", { timeout: 5000 });
  const text = await note.textContent();
  await page.waitForTimeout(1500);
  await shot("05-meals");
  await page.goto(BASE + "/lists/shopping");
  await page.waitForSelector("text=Minced beef");
  const eggs = await page.locator("main li:has-text('Eggs')").count();
  if (eggs !== 1) throw new Error(`Eggs appears ${eggs} times`);
  return text;
});
await step("today: meals and exam mode", async () => {
  await page.goto(BASE + "/timetable");
  await page.click('[aria-label="New event"]');
  await page.fill('input[aria-label="What"]', "COMP1215 exam");
  await page.fill('dialog input[type="date"]', inDays(3));
  await page.fill('input[type="time"] >> nth=0', "09:30");
  await page.fill('input[type="time"] >> nth=1', "11:30");
  await page.selectOption("dialog select", "exam");
  await page.click('dialog button[type="submit"]');
  await page.waitForTimeout(800);
  await page.goto(BASE + "/");
  await page.waitForSelector("text=Exams coming up", { timeout: 8000 });
  await page.waitForSelector("text=Chilli");
  await page.waitForTimeout(800);
  await shot("06-today-exam-meals");
});
await step("push keys created once", async () => {
  const keys = await page.evaluate(async () => {
    const a = await (await fetch("/api/push/keys", { method: "POST" })).json();
    const b = await (await fetch("/api/push/keys", { method: "POST" })).json();
    return [a.publicKey, b.publicKey];
  });
  if (!keys[0] || keys[0] !== keys[1]) throw new Error("keys differ: " + JSON.stringify(keys));
  return "public key " + keys[0].slice(0, 12) + "…";
});
await step("daily job: token check, delivery, dead devices, no repeats", async () => {
  const session = await (await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "andre@example.com", password: "correct horse" }) })).json();
  const rest = (path, method, body) => fetch(`${SUPA}/rest/v1/${path}`, { method, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: body && JSON.stringify(body) });
  const device = () => { const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys(); return { p256dh: ecdh.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") }; };
  await rest("push_subscriptions", "POST", [{ endpoint: "https://localhost:54500/push/phone", ...device() }, { endpoint: "https://localhost:54500/push/gone-laptop", ...device() }]);
  await rest("reminders", "POST", { title: "Council tax", due_on: TODAY, recurrence: "none", notify_days_before: 3 });
  const { cron_token } = await (await fetch(`${SUPA}/__token`)).json();
  const call = (token) => fetch(`${BASE}/api/cron/reminders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
  const bad = await call(crypto.randomUUID());
  if (bad.status !== 401) throw new Error("bad token answered " + bad.status);
  const first = await (await call(cron_token)).json();
  const received = await (await fetch("https://localhost:54500/__received")).json();
  const subs = await (await rest("push_subscriptions?select=endpoint", "GET")).json();
  const again = await (await call(cron_token)).json();
  if (first.sent !== 1) throw new Error("first run " + JSON.stringify(first));
  if (received.length !== 2 || received.some((r) => r.encoding !== "aes128gcm" || !r.auth.startsWith("vapid"))) throw new Error("push service saw " + JSON.stringify(received));
  if (subs.length !== 1 || !subs[0].endpoint.endsWith("/phone")) throw new Error("subscriptions " + JSON.stringify(subs));
  if (again.sent !== 0) throw new Error("second run sent again " + JSON.stringify(again));
  return `sent ${first.sent}, push service got ${received.length} encrypted requests, dead device forgotten, no repeat`;
});
await step("settings notifications", async () => {
  await page.goto(BASE + "/settings");
  const state = await page.waitForSelector("text=/Turn on for this device|blocked for Glactivity|can’t show notifications/", { timeout: 8000 });
  await shot("07-settings", false);
  return "shows: " + (await state.textContent()).slice(0, 60);
});
await step("laptop today", async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE + "/");
  await page.waitForSelector("text=Exams coming up");
  await page.waitForTimeout(800);
  await shot("08-laptop", false);
});
await browser.close();
console.log(log.join("\n"));
console.log("--- problems:\n" + [...new Set(problems)].join("\n"));
