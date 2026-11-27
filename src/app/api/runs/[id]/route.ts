import { connection } from "next/server";

import { getRun } from "@/lib/runs";

/** GET /api/runs/{id}: the current state of one run (polled by the editor while it executes). */
export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]">) {
  await connection(); // always fresh: never prerender or cache a run's state
  const { id } = await ctx.params;
  let run = null;
  try {
    run = await getRun(id);
  } catch {
    return Response.json({ error: "Bad run id." }, { status: 400 });
  }
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
  return Response.json(run);
}
