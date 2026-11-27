import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Run, RunStep } from "./flow/types";

/**
 * Run records live as JSON files in .data/runs/. The Inngest function writes them; the browser polls them. Files
 * instead of memory because Next.js may load the API route and the Inngest route as separate module instances, and
 * so the execution history survives a restart.
 */
const DIR = path.join(process.cwd(), ".data", "runs");

function file(id: string) {
  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(id)) throw new Error("bad run id"); // never let an id walk out of the folder
  return path.join(DIR, `${id}.json`);
}

export async function saveRun(run: Run): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const tmp = `${file(run.id)}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(run, null, 2), "utf-8");
  await rename(tmp, file(run.id)); // atomic: a reader never sees half a file
}

export async function getRun(id: string): Promise<Run | null> {
  try {
    return JSON.parse(await readFile(file(id), "utf-8")) as Run;
  } catch {
    return null;
  }
}

export async function updateRun(id: string, change: (run: Run) => void): Promise<Run> {
  const run = await getRun(id);
  if (!run) throw new Error(`run ${id} not found`);
  change(run);
  await saveRun(run);
  return run;
}

/** Insert or replace a step by its execution index, so a re-executed Inngest step never duplicates a log line. */
export function upsertStep(run: Run, step: RunStep): void {
  const i = run.steps.findIndex((s) => s.index === step.index);
  if (i === -1) run.steps.push(step);
  else run.steps[i] = step;
  run.steps.sort((a, b) => a.index - b.index);
}

export async function listRuns(limit = 30): Promise<Omit<Run, "graph">[]> {
  let names: string[] = [];
  try {
    names = (await readdir(DIR)).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const runs = (await Promise.all(names.map((n) => getRun(n.slice(0, -5))))).filter((r): r is Run => r !== null);
  return runs
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((run) => {
      const { graph, ...rest } = run;
      void graph; // the list stays small: each run's graph is only sent by GET /api/runs/{id}
      return rest;
    });
}
