// README screenshots of the running app (npm run dev:all must be up). Uses Playwright with the installed Edge:
//   node scripts/screenshots.mjs   (needs: npm i -D playwright  or any global playwright install)
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = fileURLToPath(new URL("../docs/", import.meta.url)); // (not .pathname: that keeps %20 for spaces)

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1 });
await page.goto(BASE);
await page.waitForSelector(".react-flow__node");
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}editor.png` });

async function runSample(n) {
  await page.getByRole("tab", { name: "Run" }).click();
  await page.getByRole("button", { name: `Sample ${n}` }).click();
  await page.getByRole("button", { name: "Run flow" }).click();
  await page.waitForFunction(() => /completed|failed/.test(document.querySelector("[role=tabpanel] [data-slot=badge]")?.textContent ?? ""), null, { timeout: 120000 });
  await page.waitForTimeout(600);
}

await runSample(1);
await page.screenshot({ path: `${OUT}run-support.png` });
await runSample(2);
await page.screenshot({ path: `${OUT}run-sales.png` });
await page.getByRole("tab", { name: "History" }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}history.png`, clip: { x: 1060, y: 0, width: 380, height: 860 } });

// The Inngest dev server's own view: every node is a step of the function run
const inngest = await browser.newPage({ viewport: { width: 1440, height: 860 } });
await inngest.goto("http://localhost:8288/runs");
await inngest.waitForTimeout(2500);
await inngest.screenshot({ path: `${OUT}inngest-runs.png` });
// Open the newest run: its trace lists one step per node, in execution order
const runId = (await inngest.locator("tbody tr").first().innerText()).match(/01[0-9A-Z]{24}/)?.[0];
await inngest.goto(`http://localhost:8288/run?runID=${runId}`);
await inngest.waitForTimeout(3000);
await inngest.screenshot({ path: `${OUT}inngest-dev-server.png` });
await browser.close();
console.log("saved to", OUT);
