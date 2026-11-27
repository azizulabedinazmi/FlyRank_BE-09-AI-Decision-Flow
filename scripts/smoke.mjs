// End-to-end smoke test against a running app (npm run dev:all):  node scripts/smoke.mjs [input text]
// Sends the example flow + an input to POST /api/run, then polls GET /api/runs/{id} and prints each step.
import { readFile } from "node:fs/promises";

const BASE = process.env.BASE ?? "http://localhost:3000";
const input = process.argv.slice(2).join(" ") || "Hi, the app crashes every time I open the invoices page. Please help!";
const { graph } = JSON.parse(await readFile(new URL("../src/lib/flow/example-flow.json", import.meta.url), "utf-8"));

const res = await fetch(`${BASE}/api/run`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ graph, input, flowName: "Example: support vs sales" }),
});
const body = await res.json();
console.log(`POST /api/run -> ${res.status}`, body);
if (res.status !== 202) process.exit(1);

const t0 = Date.now();
let run;
let printed = 0;
while (Date.now() - t0 < 120_000) {
  run = await (await fetch(`${BASE}/api/runs/${body.runId}`)).json();
  for (const s of run.steps.slice(printed)) {
    if (s.status === "running") break;
    console.log(`  ${s.index}. [${s.kind}] ${s.label}${s.answer ? ` -> ${s.answer} (raw "${s.raw}", ${s.ms} ms)` : ""}${s.error ? ` ERROR ${s.error}` : ""}`);
    printed++;
  }
  if (run.status === "completed" || run.status === "failed") break;
  await new Promise((r) => setTimeout(r, 400));
}
console.log(`status=${run.status} in ${((Date.now() - t0) / 1000).toFixed(1)} s | ${run.endReason ?? run.error}`);
console.log(`path: ${run.steps.map((s) => s.label).join(" -> ")}`);
