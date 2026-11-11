// Walks through stage (b): the Tasks tab, Claude planning study blocks through
// the connector in each autonomy mode, and keeping, moving and skipping blocks.
import { createRequire } from "module";
const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
const BASE = "http://localhost:3102", OUT = process.argv[2];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: "Europe/London" })).newPage();
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
page.on("response", (r) => { if (r.status() >= 400 && !/\/api\/(holidays|search)/.test(r.url())) problems.push(`${r.status()} ${r.url()}`); });
const log = [];
const step = async (name, fn) => { try { const x = await fn(); log.push("ok   " + name + (x ? "  — " + x : "")); } catch (e) { log.push("FAIL " + name + " — " + e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-${name.replace(/\W+/g, "-")}.png`, fullPage: true }); } };

let link, id = 0, ctx, essay, slots;
const tool = async (name, args = {}) => {
  const r = await fetch(link, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) });
  const body = await r.json();
  if (body.error) throw new Error(`${name}: ${body.error.message}`);
  if (body.result.isError) throw new Error(`${name}: ${body.result.content[0].text}`);
  return JSON.parse(body.result.content[0].text);
};
const plusMinutes = (iso, m) => new Date(new Date(iso).getTime() + m * 60_000).toISOString();

await step("sign in + calendar", async () => {
  await page.goto(BASE + "/");
  await page.fill('input[type="email"]', "andre@example.com");
  await page.fill('input[type="password"]', "correct horse");
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(BASE + "/");
  await page.goto(BASE + "/settings");
  await page.click("text=Add calendar link");
  await page.fill('input[type="url"]', "http://localhost:54400/feed.ics");
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector("text=Updated just now", { timeout: 15000 });
});

await step("Tasks tab replaces Fun; /fun goes to Today", async () => {
  const tabs = await page.locator("nav[aria-label=Main] a").allTextContents();
  if (!tabs.includes("Tasks") || tabs.includes("Fun")) throw new Error(tabs.join(","));
  await page.goto(BASE + "/fun");
  await page.waitForURL(BASE + "/");
  return tabs.join(" · ");
});

await step("quick-add a task", async () => {
  await page.goto(BASE + "/tasks");
  await page.waitForSelector("text=Nothing on your plate");
  await page.screenshot({ path: `${OUT}/01-tasks-empty.png`, fullPage: true });
  await page.fill("input[aria-label='Add a task']", "History essay 5h due Fri !");
  await page.press("input[aria-label='Add a task']", "Enter");
  await page.waitForSelector("text=History essay");
  return await page.locator("li:has-text('History essay')").innerText();
});

await step("settings shows Plan as the default", async () => {
  await page.goto(BASE + "/settings/assistant");
  await page.waitForSelector("[role=radio][aria-checked=true]:has-text('Plan')");
  link = (await page.textContent("[data-testid=connector-link]")).trim();
  while (!link.includes("/api/mcp/")) { await page.waitForTimeout(200); link = (await page.textContent("[data-testid=connector-link]")).trim(); }
  await page.locator("section:has(h2:text-is('How much it does'))").screenshot({ path: `${OUT}/02-autonomy.png` });
});

await step("Claude sees the task and finds free time", async () => {
  ctx = await tool("get_context");
  essay = ctx.tasks.find((t) => t.title === "History essay");
  if (!essay || ctx.autonomy !== "plan") throw new Error(JSON.stringify({ autonomy: ctx.autonomy, tasks: ctx.tasks }));
  const free = await tool("find_free_time", { days: 3 });
  slots = free.days.slice(1).flatMap((d) => d.free).filter((f) => f.minutes >= 90);
  await tool("add_task", { title: "Lab report", due_on: free.days[2].day, estimate_minutes: 120, subject: "PHYS1001" });
  return `${essay.title} ${essay.estimate_minutes}min p${essay.priority}; tomorrow: ${free.days[1].free.map((f) => f.local).join(", ")}`;
});

await step("Plan mode pencils blocks in; a clash is explained", async () => {
  const [a, b] = slots;
  const result = await tool("plan_blocks", { blocks: [
    { task_id: essay.id, starts_at: a.starts_at, ends_at: plusMinutes(a.starts_at, 90), note: "Outline and sources" },
    { task_id: essay.id, starts_at: b.starts_at, ends_at: plusMinutes(b.starts_at, 60) },
  ] });
  let clash = "";
  try { await tool("plan_blocks", { blocks: [{ task_id: essay.id, starts_at: plusMinutes(a.starts_at, 30), ends_at: plusMinutes(a.starts_at, 60) }] }); } catch (e) { clash = e.message; }
  if (!/clashes/.test(clash)) throw new Error("no clash: " + clash);
  return `${result.created_as}; ${clash.replace(/^plan_blocks: /, "")}`;
});

await step("the timetable shows pencilled-in blocks", async () => {
  await page.goto(BASE + "/timetable");
  await page.click("button[aria-label='Next']").catch(async () => page.locator("button:has(svg.lucide-chevron-right)").first().click());
  await page.waitForSelector("text=Pencilled in");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/03-timetable-tentative.png`, fullPage: true });
});

await step("keep one block", async () => {
  await page.locator("li:has-text('Pencilled in')").first().click();
  await page.waitForSelector("dialog[open] >> text=Pencilled in by your assistant");
  await page.locator("dialog[open]").screenshot({ path: `${OUT}/04-block-sheet.png` });
  await page.click("dialog[open] >> button:has-text('Keep')");
  await page.waitForSelector("li:has-text('Study')");
});

await step("move the other block, then skip it", async () => {
  await page.locator("li:has-text('Pencilled in')").first().click();
  await page.click("dialog[open] >> button:text-is('Move')");
  await page.fill("dialog[open] input[type=time] >> nth=0", "16:00");
  await page.fill("dialog[open] input[type=time] >> nth=1", "17:00");
  await page.click("dialog[open] >> button:has-text('Save time')");
  await page.waitForSelector("li:has-text('16:00'):has-text('Study')");
  await page.screenshot({ path: `${OUT}/04b-after-move.png`, fullPage: true });
  await page.locator("li:has-text('16:00')").click();
  await page.click("dialog[open] >> button:text-is('Skip')");
  await page.waitForSelector("li:has-text('16:00')", { state: "detached" });
});

await step("Claude sees kept, moved and skipped blocks", async () => {
  const c = await tool("get_context");
  return c.blocks.map((b) => `${b.status}/${b.source}`).join(", ");
});

await step("Suggest mode turns blocks into ideas on Today", async () => {
  await page.goto(BASE + "/settings/assistant");
  await page.click("[role=radio]:has-text('Suggest')");
  await page.waitForSelector("text=It only suggests");
  const free = await tool("find_free_time", { days: 3 });
  const slot = free.days.slice(1).flatMap((d) => d.free).find((f) => f.minutes >= 60);
  const r = await tool("plan_blocks", { blocks: [{ task_id: essay.id, starts_at: slot.starts_at, ends_at: plusMinutes(slot.starts_at, 60) }] });
  await page.goto(BASE + "/");
  await page.waitForSelector("text=Study: History essay");
  await page.locator("li:has-text('Study: History essay')").screenshot({ path: `${OUT}/05-today-suggested-block.png` });
  return r.created_as;
});

await step("the tasks page shows progress and planned time", async () => {
  await page.goto(BASE + "/tasks");
  await page.waitForSelector("text=Lab report");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/06-tasks.png`, fullPage: true });
  await page.click("li:has-text('History essay')");
  await page.waitForSelector("dialog[open] >> text=Study time");
  await page.screenshot({ path: `${OUT}/07-task-sheet.png`, fullPage: true });
  const detail = await page.locator("li:has-text('History essay')").first().innerText();
  await page.keyboard.press("Escape");
  return detail.replace(/\n/g, " | ");
});

await step("marking done in a chat takes back future blocks", async () => {
  await tool("update_task", { id: essay.id, status: "done" });
  const c = await tool("get_context");
  const live = c.blocks.filter((b) => b.task_id === essay.id && ["planned", "tentative"].includes(b.status) && new Date(b.starts_at) > new Date());
  if (live.length) throw new Error(`${live.length} blocks still live`);
  await page.goto(BASE + "/tasks");
  await page.waitForSelector("text=Done recently");
});

await step("album 'Pick another' on Today, history on Listen", async () => {
  await page.goto(BASE + "/");
  await page.waitForSelector("text=Pick another");
  await page.goto(BASE + "/lists/listen");
  await page.waitForSelector("h2:text-is('Album of the week')");
});

await browser.close();
console.log(log.join("\n") + "\n--- problems:\n" + [...new Set(problems)].join("\n"));
