// Full-page screenshots of the main screens on a small iPhone in WebKit, and
// a check that nothing is wider than the screen (no sideways scrolling).
// Usage: PLAYWRIGHT_BROWSERS_PATH=<webkit folder> node shots-pages.mjs <out dir>
import { createRequire } from "module";
const require = createRequire("/opt/node22/lib/node_modules/");
const { webkit, devices } = require("playwright");
const BASE = "http://localhost:3102", OUT = process.argv[2];
const browser = await webkit.launch();
const context = await browser.newContext({ ...devices["iPhone SE"], timezoneId: "Europe/London" });
const page = await context.newPage();
const nav = { waitUntil: "domcontentloaded" };
await page.goto(BASE + "/login", nav);
await page.waitForTimeout(1500);
await page.fill('input[type="email"]', "andre@example.com");
await page.fill('input[type="password"]', "correct horse");
await page.click('button:has-text("Sign in")');
await page.waitForURL(BASE + "/", nav);
await page.waitForTimeout(1500);
const out = [];
for (const [name, path, before] of [
  ["today", "/"],
  ["tasks", "/tasks"],
  ["timetable-tomorrow", "/timetable", async () => page.locator("button[aria-label='Next']").click()],
  ["timetable-week", "/timetable", async () => page.locator("[role=radio]:has-text('Week')").click()],
  ["assistant-settings", "/settings/assistant"],
  ["lists", "/lists"],
  ["goals", "/tasks/goals"],
  ...(process.env.GOAL ? [["goal", `/tasks/goals/${process.env.GOAL}`]] : []),
  ["listen", "/lists/listen"],
]) {
  try {
    await page.goto(BASE + path, nav);
  } catch {
    await page.waitForTimeout(1500);
    await page.goto(BASE + path, nav);
  }
  await page.waitForTimeout(2000);
  if (before) {
    await before();
    await page.waitForTimeout(1000);
  }
  const wide = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > w + 1 && getComputedStyle(el).position !== "fixed")
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} → ${Math.round(el.getBoundingClientRect().right)}px`);
  });
  out.push(`${name}: ${wide.length ? "TOO WIDE " + wide.join("; ") : "fits"}`);
  await page.screenshot({ path: `${OUT}/se-${name}.png`, fullPage: true });
}
await browser.close();
console.log(out.join("\n"));
