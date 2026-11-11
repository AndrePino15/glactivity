// Walks through the assistant (stage a): connector link, Claude writing a brief,
// ideas and notes through /api/mcp/<secret>, and the owner answering on Today.
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

let link, id = 0, today;
const mcp = async (method, params) => {
  const r = await fetch(link, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  if (r.status !== 200) throw new Error(`${method} → HTTP ${r.status}`);
  const body = await r.json();
  if (body.error) throw new Error(`${method} → ${body.error.message}`);
  return body.result;
};
const tool = async (name, args = {}) => {
  const result = await mcp("tools/call", { name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
};

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

await step("settings → assistant shows the connector link", async () => {
  await page.click("text=What Glactivity has learned");
  await page.waitForURL(BASE + "/settings/assistant");
  await page.waitForFunction(() => document.querySelector("[data-testid=connector-link]")?.textContent?.includes("/api/mcp/"));
  link = (await page.textContent("[data-testid=connector-link]")).trim();
  await page.screenshot({ path: `${OUT}/01-settings-empty.png`, fullPage: true });
  return link.replace(/[0-9a-f]{56}$/, "…");
});

await step("Claude connects and sees the tools", async () => {
  const init = await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "walk", version: "1" } });
  const tools = (await mcp("tools/list")).tools.map((t) => t.name);
  const prompts = (await mcp("prompts/list")).prompts.map((p) => p.name);
  return `${init.serverInfo.name} ${init.protocolVersion}; ${tools.length} tools; prompts: ${prompts.join(", ")}`;
});

await step("you tell the assistant something on Today", async () => {
  await page.goto(BASE + "/");
  await page.waitForSelector("text=Assistant");
  await page.fill('input[aria-label="Tell your assistant"]', "Dentist next Tuesday at 3pm");
  await page.press('input[aria-label="Tell your assistant"]', "Enter");
  await page.waitForSelector("text=Noted.");
});

await step("Claude reads context, including your note and the free suggestions", async () => {
  const ctx = await tool("get_context", { days_back: 7, days_ahead: 7 });
  today = ctx.today;
  const notes = ctx.memory.new_from_owner.map((n) => n.body);
  if (!notes.includes("Dentist next Tuesday at 3pm")) throw new Error("note missing: " + JSON.stringify(notes));
  await tool("update_note", { id: ctx.memory.new_from_owner[0].id, status: "used" });
  return `today ${today}; ${ctx.events.length} events; free suggestions: ${ctx.free_suggestions_on_today.map((s) => s.title).join(" | ") || "none"}`;
});

await step("Claude writes brief, ideas, memory and a log line", async () => {
  await tool("set_brief", { day: today, slot: "morning", text: "A steady day: lectures this morning, then free from mid-afternoon. Gym fits well around 17:30, and pasta tonight uses what's already in." });
  const bad = await mcp("tools/call", { name: "add_suggestions", arguments: { day: today, items: [{ title: "Gym", change: { type: "add_event", title: "Gym" } }] } });
  if (!bad.isError) throw new Error("bad change was accepted");
  await tool("add_suggestions", {
    day: today,
    items: [
      { title: "Get the bits for Wednesday’s pasta", detail: "You usually cook pasta midweek and the list has no pasta or parmesan.", change: { type: "add_shopping_items", items: ["Pasta", "Parmesan", "Eggs"] } },
      { title: "Squash with Tom on Friday?", detail: "Your Friday evening is free.", change: { type: "add_event", title: "Squash with Tom", starts_at: `${today}T18:00:00Z`, ends_at: `${today}T19:00:00Z`, category: "social" } },
      { title: "Ring home this weekend", detail: "It’s been a couple of weeks." },
    ],
  });
  await tool("write_note", { kind: "learned", body: "Usually trains around 17:30 on lecture days." });
  await tool("set_profile", { body: "Second-year student at Southampton. Focuses best in the mornings; trains late afternoon. Plans pasta most Wednesdays." });
  await tool("log_run", { summary: "Morning check: brief, 3 suggestions, filed 1 note, learned 1 thing" });
  return `bad change refused: "${bad.content[0].text}"`;
});

await step("Today shows the brief and ideas", async () => {
  await page.reload();
  await page.waitForSelector("text=A steady day");
  await page.waitForSelector("text=Get the bits for Wednesday’s pasta");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/02-today-assistant.png`, fullPage: true });
  const section = page.locator("section:has(h2:text-is('Assistant'))");
  await section.screenshot({ path: `${OUT}/03-today-assistant-close.png` });
});

await step("accept adds to shopping (and skips what's already there)", async () => {
  await page.click("li:has-text('Wednesday’s pasta') >> text=Add to shopping");
  await page.waitForSelector("text=Get the bits for Wednesday’s pasta", { state: "detached" });
  await page.goto(BASE + "/lists/shopping");
  await page.waitForSelector("text=Parmesan");
  const eggs = await page.locator("li:has-text('Eggs')").count();
  if (eggs !== 1) throw new Error(`Eggs appears ${eggs} times`);
});

await step("not now hides an idea and nothing is added", async () => {
  await page.goto(BASE + "/");
  await page.waitForSelector("text=Squash with Tom on Friday?");
  await page.click("li:has-text('Squash with Tom') >> text=Not now");
  await page.waitForSelector("text=Squash with Tom on Friday?", { state: "detached" });
  await page.reload();
  await page.waitForSelector("text=Ring home this weekend");
  if (await page.locator("text=Squash with Tom").count()) throw new Error("dismissed idea came back, or event was added");
});

await step("Claude sees your answers next time", async () => {
  const ctx = await tool("get_context", { days_back: 1, days_ahead: 1 });
  return ctx.my_suggestions.map((s) => `${s.title.slice(0, 18)}… ${s.status}`).join(" | ");
});

await step("settings shows memory and activity; a learned note can be forgotten", async () => {
  await page.goto(BASE + "/settings/assistant");
  await page.waitForSelector("text=Usually trains around 17:30");
  await page.waitForSelector("text=Accepted: Get the bits");
  await page.screenshot({ path: `${OUT}/04-settings-learned.png`, fullPage: true });
  await page.click("button[aria-label='Forget: Usually trains around 17:30 on lecture days.']");
  // The activity log still says what it learned, so look only at the learned list.
  const learned = page.locator("section:has(h2:text-is('What it has learned'))");
  await learned.locator("text=Nothing yet").waitFor();
  await page.reload();
  await page.waitForSelector("text=Second-year student");
  if (await learned.locator("text=Usually trains around 17:30").count()) throw new Error("note came back");
});

await step("lists hub has the assistant box", async () => {
  await page.goto(BASE + "/lists");
  await page.fill("input[aria-label='Add to Assistant']", "Train mornings this month");
  await page.press("input[aria-label='Add to Assistant']", "Enter");
  await page.waitForSelector("text=1 new note for its next check");
  await page.screenshot({ path: `${OUT}/05-lists.png`, fullPage: true });
});

await step("a new link locks out the old one", async () => {
  const old = link;
  await page.goto(BASE + "/settings/assistant");
  await page.click("text=Make a new link");
  await page.click("text=Yes, make a new link");
  await page.waitForFunction((o) => { const t = document.querySelector("[data-testid=connector-link]")?.textContent; return t && t.trim() !== o; }, old);
  const r = await fetch(old, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) });
  if (r.status !== 404) throw new Error("old link still answers " + r.status);
  link = (await page.textContent("[data-testid=connector-link]")).trim();
  await mcp("ping", {});
});

await step("night mode", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(BASE + "/");
  await page.waitForSelector("text=A steady day");
  await page.waitForTimeout(500);
  await page.locator("section:has(h2:text-is('Assistant'))").screenshot({ path: `${OUT}/06-today-night.png` });
});

await browser.close();
console.log(log.join("\n") + "\n--- problems:\n" + [...new Set(problems)].join("\n"));
