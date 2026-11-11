// Screenshots every sheet with date or time fields on iPhone-sized WebKit
// (Safari's engine) and reports fields that spill out of the sheet or overlap.
// Needs WebKit: PLAYWRIGHT_BROWSERS_PATH=<folder> playwright install webkit (+ install-deps webkit).
// Usage: PLAYWRIGHT_BROWSERS_PATH=<folder> TASK="<task title>" node shots-sheets.mjs <out dir>
import { createRequire } from "module";
const require = createRequire("/opt/node22/lib/node_modules/");
const { webkit, devices } = require("playwright");
const BASE = "http://localhost:3102", OUT = process.argv[2];
const browser = await webkit.launch();
const results = [];
const nav = { waitUntil: "domcontentloaded" };

for (const [name, device] of [["iphone-se", devices["iPhone SE"]], ["iphone-15", devices["iPhone 15"]]]) {
  const context = await browser.newContext({ ...device, timezoneId: "Europe/London" });
  const page = await context.newPage();
  // WebKit refuses a new navigation while the app is still settling; wait and retry once.
  const go = async (path) => {
    try {
      await page.goto(BASE + path, nav);
    } catch {
      await page.waitForTimeout(1500);
      await page.goto(BASE + path, nav);
    }
  };

  /** Screenshot the open sheet and check its fields. */
  const check = async (label) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}-${label}.png` });
    const issues = await page.evaluate(() => {
      const dialog = document.querySelector("dialog[open]");
      if (!dialog) return ["no sheet open"];
      const box = dialog.getBoundingClientRect();
      const fields = [...dialog.querySelectorAll("input, select, textarea, button")].filter((el) => el.offsetParent);
      const id = (el) => `${el.tagName.toLowerCase()}${el.type ? `[${el.type}]` : ""}${el.textContent?.trim() ? ` "${el.textContent.trim().slice(0, 20)}"` : ""}`;
      const out = [];
      for (const el of fields) {
        const r = el.getBoundingClientRect();
        if (r.right > box.right - 4 || r.left < box.left + 4) out.push(`${id(el)} spills out (${Math.round(r.left)}–${Math.round(r.right)}, sheet ${Math.round(box.left)}–${Math.round(box.right)})`);
      }
      for (let i = 0; i < fields.length; i++)
        for (let j = i + 1; j < fields.length; j++) {
          const a = fields[i].getBoundingClientRect(), b = fields[j].getBoundingClientRect();
          if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`${id(fields[i])} overlaps ${id(fields[j])}`);
        }
      return out;
    });
    results.push(`${name} ${label}: ${issues.length ? issues.join("; ") : "ok"}`);
  };
  const attempt = async (label, fn) => {
    try {
      await fn();
    } catch (e) {
      results.push(`${name} ${label}: COULDN'T OPEN — ${e.message.split("\n")[0]}`);
      await page.screenshot({ path: `${OUT}/${name}-${label}-error.png` }).catch(() => {});
    }
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(300);
  };

  await go("/login");
  await page.waitForTimeout(1500); // let the sign-in form come alive first
  await page.fill('input[type="email"]', "andre@example.com");
  await page.fill('input[type="password"]', "correct horse");
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(BASE + "/", nav);
  await page.waitForTimeout(1500);

  await attempt("new-event", async () => {
    await go("/timetable");
    await page.locator("button[aria-label='New event']").click({ timeout: 10000 });
    await page.waitForSelector("dialog[open]");
    await check("new-event");
  });

  await attempt("plan-day", async () => {
    await go("/lifestyle");
    await page.waitForTimeout(1200);
    const starter = page.locator("li").filter({ hasText: "Push · Pull · Legs" });
    if (await starter.count()) {
      await starter.first().click();
      await page.waitForTimeout(1200);
    }
    await page.locator("li").filter({ hasText: /^(Mon|Tue|Wed)/ }).first().click({ timeout: 10000 });
    await page.waitForSelector("dialog[open]", { timeout: 5000 });
    await check("plan-day");
  });

  await attempt("reminders", async () => {
    await go("/lists/reminders");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${name}-reminders.png`, fullPage: true });
  });

  if (process.env.TASK) {
    await attempt("task", async () => {
      await go("/tasks");
      await page.locator("li").filter({ hasText: process.env.TASK }).first().click({ timeout: 10000 });
      await page.waitForSelector("dialog[open]");
      await check("task");
      const add = page.locator("dialog[open] button", { hasText: "Add study time" });
      if (await add.count()) {
        await add.click();
        await check("task-add-time");
      }
    });
  }

  await attempt("block", async () => {
    await go("/timetable");
    await page.locator("button[aria-label='Next']").click({ timeout: 10000 });
    await page.waitForTimeout(800);
    const block = page.locator("li").filter({ hasText: /Pencilled in|Study ·/ }).first();
    if (!(await block.count())) return results.push(`${name} block: no block to open`);
    await block.click();
    await page.locator("dialog[open] button", { hasText: /^Move$/ }).click();
    await check("block-move");
  });

  await context.close();
}
await browser.close();
console.log(results.join("\n"));
