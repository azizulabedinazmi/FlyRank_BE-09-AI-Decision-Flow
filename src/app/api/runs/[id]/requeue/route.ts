import { inngest, RUN_REQUESTED } from "@/inngest/client";
import { getRun } from "@/lib/runs";

/**
 * POST /api/runs/{id}/requeue: send the run's event to Inngest again.
 *
 * Why this exists: right after the servers start, the Inngest dev server may not have synced the app's functions
 * yet. An event sent in that window is accepted but never picked up, and the run stays "queued" forever. Re-sending
 * is safe: the function only starts runs that are still queued, so a duplicate delivery does nothing.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/runs/[id]/requeue">) {
  const { id } = await ctx.params;
  const run = await getRun(id);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
  if (run.status !== "queued") return Response.json({ error: `Run is already ${run.status}.` }, { status: 409 });
  try {
    await inngest.send({ name: RUN_REQUESTED, data: { runId: run.id } });
  } catch {
    return Response.json({ error: "Couldn't reach Inngest. Is the dev server running (npm run dev:inngest)?" }, { status: 503 });
  }
  return Response.json({ runId: run.id, requeued: true }, { status: 202 });
}
