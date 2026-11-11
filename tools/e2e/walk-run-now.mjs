// Walks through stage (e): setting up Run now in Settings → Assistant and
// pressing it on Today. With a made-up token Anthropic answers 401, which
// shows the whole path works up to the real trigger and fails politely.
import { createRequire } from "module";
const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
const BASE = "http://localhost:3102", OUT = process.argv[2];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: "Europe/London" })).newPage();
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
const log = [];
const step = async (name, fn) => { try { const x = await fn(); log.push("ok   " + name + (x ? "  — " + x : "")); } catch (e) { log.push("FAIL " + name + " — " + e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-${name.replace(/\W+/g, "-")}.png`, fullPage: true }); } };

await step("sign in", async () => {
  await page.goto(BASE + "/");
  await page.fill('input[type="email"]', "andre@example.com");
  await page.fill('input[type="password"]', "correct horse");
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(BASE + "/");
});

await step("no Run now button until it's set up", async () => {
  await page.waitForSelector("h2:text-is('Assistant')");
  await page.waitForTimeout(800);
  if (await page.locator("button:text-is('Run now')").count()) throw new Error("button shown too early");
});

await step("settings refuses a wrong URL and accepts the trigger", async () => {
  await page.goto(BASE + "/settings/assistant");
  await page.waitForSelector("text=Automatic checks");
  await page.locator("section:has(h2:text-is('Automatic checks'))").screenshot({ path: `${OUT}/01-setup.png` });
  await page.fill("input[type=url]", "https://example.com/fire");
  await page.fill("input[type=password]", "sk-ant-oat01-" + "x".repeat(40));
  await page.click("button:has-text('Turn on Run now')");
  await page.waitForSelector("text=That doesn’t look like the trigger URL");
  await page.fill("input[type=url]", "https://api.anthropic.com/v1/claude_code/routines/trig_test123/fire");
  await page.click("button:has-text('Turn on Run now')");
  await page.waitForSelector("text=Run now is on");
  await page.locator("section:has(h2:text-is('Automatic checks'))").screenshot({ path: `${OUT}/02-on.png` });
});

await step("Run now on Today reaches Claude and reports the answer", async () => {
  await page.goto(BASE + "/");
  await page.click("button:text-is('Run now')");
  await page.waitForSelector("text=/didn’t accept|It didn’t start|Checking now/", { timeout: 20000 });
  await page.locator("section:has(h2:text-is('Assistant'))").screenshot({ path: `${OUT}/03-today.png` });
  return (await page.locator("section:has(h2:text-is('Assistant')) p").first().innerText()).slice(0, 80);
});

await step("the activity log shows it, and it can be turned off", async () => {
  await page.goto(BASE + "/settings/assistant");
  await page.waitForSelector("text=Run now didn’t start: Claude answered 401");
  await page.click("text=Turn off Run now");
  await page.click("text=Yes, turn off Run now");
  await page.waitForSelector("text=To add a Run now button");
});

await browser.close();
console.log(log.join("\n") + "\n--- problems:\n" + [...new Set(problems)].join("\n"));
