import { connection } from "next/server";

import { listRuns } from "@/lib/runs";

/** GET /api/runs: execution history, newest first (without each run's graph, to keep it small). */
export async function GET() {
  await connection();
  return Response.json(await listRuns(30));
}
