import { randomUUID } from "node:crypto";

import { inngest, RUN_REQUESTED } from "@/inngest/client";
import { checkGraph } from "@/lib/flow/graph";
import { RunRequestSchema, type Run } from "@/lib/flow/types";
import { MODEL } from "@/lib/llm";
import { saveRun } from "@/lib/runs";

/**
 * POST /api/run  { graph, input, flowName?, startNodeId?, parentRunId? }
 * Validates the request and the graph, stores a queued run, and hands it to Inngest. Answers immediately with the
 * run id; the browser polls GET /api/runs/{id} while Inngest executes the nodes.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const parsed = RunRequestSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return Response.json({ error: `${first.path.join(".") || "body"}: ${first.message}` }, { status: 400 });
  }
  const req = parsed.data;
  const errors = checkGraph(req.graph, req.startNodeId).filter((p) => p.level === "error");
  if (errors.length) return Response.json({ error: errors[0].message, problems: errors }, { status: 400 });

  const run: Run = {
    id: randomUUID().replace(/-/g, "").slice(0, 16),
    flowName: req.flowName || "Untitled flow",
    input: req.input,
    graph: req.graph,
    status: "queued",
    createdAt: new Date().toISOString(),
    steps: [],
    model: MODEL,
    startNodeId: req.startNodeId,
    parentRunId: req.parentRunId,
  };
  await saveRun(run);
  try {
    await inngest.send({ name: RUN_REQUESTED, data: { runId: run.id } });
  } catch {
    run.status = "failed";
    run.error = "Couldn't reach Inngest. Is the dev server running (npm run dev:inngest)?";
    await saveRun(run);
    return Response.json({ error: run.error, runId: run.id }, { status: 503 });
  }
  return Response.json({ runId: run.id }, { status: 202 });
}
