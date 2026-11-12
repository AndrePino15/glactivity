// Walks through stage (c): describing a goal, Claude drafting it with
// questions, answering them, starting it, planning and logging time, the
// milestone timeline with dates to confirm, Today's next goal step and the
// weekly review.
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

let link, id = 0, goalId, plan, today;
const tool = async (name, args = {}) => {
  const r = await fetch(link, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) });
  const body = await r.json();
  if (body.error) throw new Error(`${name}: ${body.error.message}`);
  if (body.result.isError) throw new Error(`${name}: ${body.result.content[0].text}`);
  return JSON.parse(body.result.content[0].text);
};
const plusDays = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

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
  await page.goto(BASE + "/settings/assistant");
  await page.waitForFunction(() => document.querySelector("[data-testid=connector-link]")?.textContent?.includes("/api/mcp/"));
  link = (await page.textContent("[data-testid=connector-link]")).trim();
});

await step("Goals sit in the Tasks tab", async () => {
  await page.goto(BASE + "/tasks");
  await page.click("nav[aria-label='Tasks and goals'] >> text=Goals");
  await page.waitForURL(BASE + "/tasks/goals");
  await page.waitForSelector("text=No big goals yet");
  await page.screenshot({ path: `${OUT}/01-goals-empty.png`, fullPage: true });
});

await step("describe a goal in your own words", async () => {
  await page.fill("textarea[aria-label='Tell your assistant about a goal']", "Apply to Imperial for an MSc in AI, starting next September. I want to move into machine learning.");
  await page.click("form button:has-text('Send')");
  await page.waitForSelector("text=Waiting for your assistant");
});

await step("Claude drafts a plan with questions and a date to confirm", async () => {
  const ctx = await tool("get_context");
  today = ctx.today;
  const note = ctx.memory.new_from_owner.find((n) => n.topic === "goal");
  const steps = await tool("get_goal_planning_steps", { mode: "draft" });
  if (!steps.steps.includes("questions")) throw new Error("no draft steps");
  plan = await tool("save_goal_plan", {
    from_note_id: note.id,
    goal: { title: "Imperial MSc in AI", why: "Move into machine learning", target_date: plusDays(today, 300) },
    milestones: [
      { title: "Shortlist programmes", target_date: plusDays(today, 14), tasks: [{ title: "Compare entry requirements", estimate_minutes: 120 }, { title: "Read module lists", estimate_minutes: 90 }] },
      { title: "Personal statement", target_date: plusDays(today, 45), tasks: [{ title: "First draft of statement", estimate_minutes: 360 }] },
      { title: "Submit application", target_date: plusDays(today, 70), date_source_url: "https://www.imperial.ac.uk/study/apply/postgraduate-taught/", tasks: [{ title: "Ask two referees", estimate_minutes: 60 }] },
    ],
    sources: [{ title: "Imperial: how to apply", url: "https://www.imperial.ac.uk/study/apply/postgraduate-taught/", note: "application rounds" }],
    questions: ["Which programme: MSc AI, or Computing (AI and ML)?", "Who could your two referees be?"],
  });
  goalId = plan.goal_id;
  return `${plan.status}, ${plan.milestone_ids.length} milestones, ${plan.task_ids.length} tasks`;
});

await step("the draft waits on the Goals page, its tasks stay out of the task list", async () => {
  await page.goto(BASE + "/tasks/goals");
  await page.waitForSelector("text=Drafts to look over");
  await page.waitForSelector("text=2 questions for you");
  await page.screenshot({ path: `${OUT}/02-goals-draft.png`, fullPage: true });
  await page.goto(BASE + "/tasks");
  await page.waitForTimeout(1200);
  if (await page.locator("text=First draft of statement").count()) throw new Error("draft task shown in Tasks");
});

await step("the goal page shows the draft, questions and the timeline", async () => {
  await page.goto(BASE + `/tasks/goals/${goalId}`);
  await page.waitForSelector("text=Draft from your assistant");
  await page.waitForSelector("text=Which programme");
  await page.waitForSelector("text=Date to confirm");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/03-goal-draft.png`, fullPage: true });
});

await step("answer the questions in your own words", async () => {
  await page.fill("textarea[aria-label='Answer your assistant']", "The MSc AI. Referees: Dr Patel and my placement manager.");
  await page.click("form button:has-text('Send')");
  await page.waitForSelector("text=You said:");
});

await step("Claude refines the draft from the answers", async () => {
  const ctx = await tool("get_context");
  const goal = ctx.goals.find((g) => g.id === goalId);
  const open = goal.notes.filter((n) => (n.kind === "question" || n.kind === "answer") && !n.resolved);
  const referees = goal.milestones[2].tasks[0];
  await tool("save_goal_plan", { goal: { id: goalId, title: "Imperial MSc in Artificial Intelligence" }, milestones: [{ id: goal.milestones[2].id, tasks: [{ id: referees.id, title: "Ask Dr Patel and placement manager for references" }] }] });
  await tool("add_goal_note", { goal_id: goalId, resolve_ids: open.map((n) => n.id) });
  await page.reload();
  await page.waitForSelector("text=Ask Dr Patel and placement manager");
  if (await page.locator("text=Questions from your assistant").count()) throw new Error("questions still open");
  return `resolved ${open.length}`;
});

await step("start it, then Claude plans its first step and logs time", async () => {
  await page.click("button:has-text('Looks good, start it')");
  await page.waitForSelector("text=Draft from your assistant", { state: "detached" });
  const ctx = await tool("get_context");
  const goal = ctx.goals.find((g) => g.id === goalId);
  const [compare, modules] = goal.milestones[0].tasks;
  const free = await tool("find_free_time", { days: 3 });
  const slot = free.days.slice(1).flatMap((d) => d.free).find((f) => f.minutes >= 90);
  await tool("plan_blocks", { blocks: [{ task_id: compare.id, starts_at: slot.starts_at, ends_at: new Date(Date.parse(slot.starts_at) + 90 * 60000).toISOString() }] });
  await tool("log_progress", { task_id: modules.id, minutes: 60 });
  const after = (await tool("get_context")).goals.find((g) => g.id === goalId);
  return `progress ${after.progress.percent}% (${after.progress.done_minutes} of ${after.progress.total_minutes} min); milestones: ${after.milestones.map((m) => m.state).join(", ")}`;
});

await step("Today shows the next goal step quietly", async () => {
  await page.goto(BASE + "/");
  await page.waitForSelector("text=Next goal step", { timeout: 10000 });
  await page.locator("section:has(h2:text-is('Next goal step'))").screenshot({ path: `${OUT}/05-today-next-step.png` });
  return (await page.locator("section:has(h2:text-is('Next goal step')) li").innerText()).replace(/\n/g, " | ");
});

await step("goal page: progress, what's next, confirm a date, finish a milestone", async () => {
  await page.goto(BASE + `/tasks/goals/${goalId}`);
  await page.waitForSelector("text=What’s next");
  await page.waitForSelector("text=/\\d+% · /");
  await page.screenshot({ path: `${OUT}/04-goal-active.png`, fullPage: true });
  await page.click("button:has-text('Confirm date')");
  await page.waitForSelector("text=Date to confirm", { state: "detached" });
  await page.locator("li:has-text('Shortlist programmes') >> button:has-text('Mark milestone done')").click();
  await page.waitForSelector("li:has-text('Shortlist programmes') >> text=Not done yet");
});

await step("the weekly review shows on the Goals page", async () => {
  await tool("set_brief", { day: today, slot: "week", text: "Shortlist done, nice. This week: one 90-minute block on the statement on Thursday morning; nothing near your deadlines needs to move." });
  await page.goto(BASE + "/tasks/goals");
  await page.waitForSelector("text=This week for your goals");
  await page.screenshot({ path: `${OUT}/06-goals-active.png`, fullPage: true });
});

await step("pausing frees its study time and hides its tasks", async () => {
  await page.goto(BASE + `/tasks/goals/${goalId}`);
  await page.click("button:text-is('Pause')");
  await page.waitForSelector("text=Paused. Its tasks");
  const ctx = await tool("get_context");
  const live = ctx.blocks.filter((b) => b.status === "tentative" || b.status === "planned").filter((b) => new Date(b.starts_at) > new Date());
  if (live.length) throw new Error(`${live.length} blocks still planned`);
  await page.goto(BASE + "/tasks");
  await page.waitForTimeout(1000);
  if (await page.locator("text=First draft of statement").count()) throw new Error("paused task shown");
});

await step("night mode", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(BASE + `/tasks/goals/${goalId}`);
  await page.click("button:has-text('Pick it up again')");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/07-goal-night.png`, fullPage: true });
});

await browser.close();
console.log(log.join("\n") + "\n--- problems:\n" + [...new Set(problems)].join("\n"));
