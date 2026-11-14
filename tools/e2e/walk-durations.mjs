// Walks through stage (d): answering study blocks that have ended with one
// tap, what that changes (estimates, time spent, the schedule), what Claude
// learns from it, and the "How long things take" summary in Settings.
import { createRequire } from "module";
const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
const BASE = "http://localhost:3102", SUPA = "http://localhost:54321", OUT = process.argv[2];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: "Europe/London" })).newPage();
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
page.on("response", (r) => { if (r.status() >= 400 && !/\/api\/(holidays|search)/.test(r.url())) problems.push(`${r.status()} ${r.url()}`); });
const log = [];
const step = async (name, fn) => { try { const x = await fn(); log.push("ok   " + name + (x ? "  — " + x : "")); } catch (e) { log.push("FAIL " + name + " — " + e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-${name.replace(/\W+/g, "-")}.png`, fullPage: true }); } };

// Test data straight into the fake database, as the signed-in user.
const H = { "content-type": "application/json", apikey: "x", prefer: "return=representation" };
const { access_token } = await (await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: "POST", headers: H, body: JSON.stringify({ email: "andre@example.com", password: "correct horse" }) })).json();
const U = { ...H, authorization: "Bearer " + access_token };
const insert = async (table, rows) => (await (await fetch(`${SUPA}/rest/v1/${table}`, { method: "POST", headers: U, body: JSON.stringify(rows) })).json());
const ago = (hours) => new Date(Date.now() - hours * 3600_000).toISOString();

let link, id = 0;
const tool = async (name, args = {}) => {
  const r = await fetch(link, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) });
  const body = await r.json();
  if (body.error || body.result.isError) throw new Error(`${name}: ${body.error?.message ?? body.result.content[0].text}`);
  return JSON.parse(body.result.content[0].text);
};

await step("sign in, with three study blocks that have just ended", async () => {
  const [essay, reading, lab] = await insert("tasks", [
    { title: "History essay", subject: "HIST", estimate_minutes: 120 },
    { title: "Read chapter 5", subject: "HIST", estimate_minutes: 60 },
    { title: "Lab report", subject: "PHYS", estimate_minutes: 90 },
  ]);
  await insert("work_blocks", [
    { task_id: essay.id, starts_at: ago(3), ends_at: ago(2), status: "planned", source: "claude" },
    { task_id: reading.id, starts_at: ago(1.5), ends_at: ago(1), status: "tentative", source: "claude" },
    { task_id: lab.id, starts_at: ago(0.75), ends_at: ago(0.25), status: "planned", source: "claude" },
  ]);
  await page.goto(BASE + "/");
  await page.fill('input[type="email"]', "andre@example.com");
  await page.fill('input[type="password"]', "correct horse");
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(BASE + "/");
  await page.goto(BASE + "/settings/assistant");
  await page.waitForFunction(() => document.querySelector("[data-testid=connector-link]")?.textContent?.includes("/api/mcp/"));
  link = (await page.textContent("[data-testid=connector-link]")).trim();
});

await step("Today asks how they went", async () => {
  await page.goto(BASE + "/");
  await page.waitForSelector("text=How did it go?");
  const rows = await page.locator("section:has(h2:text-is('How did it go?')) li").count();
  await page.locator("section:has(h2:text-is('How did it go?'))").screenshot({ path: `${OUT}/01-how-did-it-go.png` });
  return `${rows} blocks`;
});

await step("one tap each: done, needed more (+1 h), didn't do it", async () => {
  const section = page.locator("section:has(h2:text-is('How did it go?'))");
  await section.locator("li:has-text('Lab report') >> button:text-is('Done')").click();
  await section.locator("li:has-text('Lab report')").waitFor({ state: "detached" });
  await section.locator("li:has-text('Read chapter 5') >> button:text-is('Needed more')").click();
  await section.locator("li:has-text('Read chapter 5') >> button:text-is('+1 h')").click();
  await section.locator("li:has-text('Read chapter 5')").waitFor({ state: "detached" });
  await section.locator("li:has-text('History essay') >> button:text-is('Didn’t do it')").click();
  await page.waitForSelector("text=How did it go?", { state: "detached" });
});

await step("the schedule shows what happened", async () => {
  await page.waitForSelector("li:has-text('Read chapter 5'):has-text('Needed more')");
  await page.waitForSelector("li:has-text('History essay'):has-text('Didn’t do it')");
  await page.locator("section:has(h2:text-is('Schedule'))").screenshot({ path: `${OUT}/02-schedule.png` });
});

await step("needed more grew the estimate; the missed hour doesn't count as done", async () => {
  await page.goto(BASE + "/tasks");
  await page.waitForSelector("li:has-text('Read chapter 5')");
  const reading = await page.locator("li:has-text('Read chapter 5')").innerText();
  const essay = await page.locator("li:has-text('History essay')").innerText();
  if (!/2\s*h/.test(reading)) throw new Error("reading: " + reading);
  if (/done/.test(essay)) throw new Error("essay counts the missed block: " + essay);
  return `${reading.split("\n")[1]} | ${essay.split("\n")[1]}`;
});

await step("tapping an answered block shows the answer and lets you change it", async () => {
  await page.goto(BASE + "/");
  await page.locator("li:has-text('History essay'):has-text('Didn’t do it')").click();
  await page.waitForSelector("dialog[open] >> text=You said: didn’t do it");
  await page.locator("dialog[open]").screenshot({ path: `${OUT}/03-answered-sheet.png` });
  await page.click("dialog[open] >> button:text-is('Done')");
  await page.waitForSelector("li:has-text('History essay'):has-text('Done')");
});

await step("Claude sees the answers and what they teach", async () => {
  const ctx = await tool("get_context");
  const outcomes = ctx.learning.recent_blocks.map((b) => b.outcome).join(", ");
  if (ctx.learning.blocks_answered !== 3) throw new Error(JSON.stringify(ctx.learning));
  return `${outcomes}; ratio ${ctx.learning.estimate_ratio}`;
});

await step("Settings explains what it needs, then what it learned", async () => {
  await page.goto(BASE + "/settings/assistant");
  await page.waitForSelector("text=Once a few tasks are finished");
  // Three finished tasks that each took longer than first thought.
  const done = await insert("tasks", [60, 60, 90].map((m, i) => ({ title: `Problem sheet ${i + 1}`, subject: "MATH", estimate_minutes: m, status: "done", completed_at: ago(1) })));
  await insert("work_blocks", done.map((t, i) => ({ task_id: t.id, starts_at: ago(30 + i * 3), ends_at: ago(28 + i * 3), status: "planned", outcome: "done" })));
  await page.reload();
  await page.waitForSelector("text=/Things take about [\\d.]+× the first estimate/");
  await page.locator("section:has(h2:text-is('How long things take'))").screenshot({ path: `${OUT}/04-settings.png` });
  return (await page.locator("section:has(h2:text-is('How long things take')) li").first().innerText());
});

await step("a chat can record a block too", async () => {
  const ctx = await tool("get_context");
  const lab = ctx.learning.recent_blocks.find((b) => b.task === "Lab report");
  await tool("record_block_outcome", { block_id: lab.id, outcome: "more", extra_minutes: 30 });
  await page.goto(BASE + "/tasks");
  await page.waitForSelector("li:has-text('Lab report')");
  return (await page.locator("li:has-text('Lab report')").innerText()).split("\n")[1];
});

await browser.close();
console.log(log.join("\n") + "\n--- problems:\n" + [...new Set(problems)].join("\n"));
