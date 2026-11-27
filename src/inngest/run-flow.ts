import { NonRetriableError } from "inngest";

import { nextEdge } from "@/lib/flow/graph";
import { MAX_STEPS, type Graph, type RunStep } from "@/lib/flow/types";
import { askYesNo, InvalidAnswerError } from "@/lib/llm";
import { getRun, updateRun, upsertStep } from "@/lib/runs";

import { inngest, RUN_REQUESTED } from "./client";

const now = () => new Date().toISOString();

interface StepResult {
  answer?: "YES" | "NO";
  edgeId: string | null;
  target: string | null;
  endReason?: string;
}

/**
 * Walks the graph one node at a time. EVERY node is its own `step.run`, so:
 *  - Inngest records each node as a step, in execution order (visible in the Inngest dev server UI too);
 *  - a node that fails is retried on its own (up to 2 more times, with Inngest's backoff), and the nodes before it
 *    are NOT re-run: their results are memoized;
 *  - the traversal code between steps is plain, deterministic TypeScript driven by the memoized answers.
 * Run state is mirrored into .data/runs/<id>.json from inside the steps, which the browser polls.
 */
export const runFlow = inngest.createFunction(
  {
    id: "run-decision-flow",
    triggers: [{ event: RUN_REQUESTED }],
    retries: 2,
    onFailure: async ({ event, error }) => {
      const runId = (event.data.event.data as { runId: string }).runId;
      await updateRun(runId, (run) => {
        run.status = "failed";
        run.error = error.message;
        run.finishedAt = now();
        for (const s of run.steps) if (s.status === "running") s.status = "error";
      });
    },
  },
  async ({ event, step, attempt }) => {
    const { runId } = event.data as { runId: string };

    const plan = await step.run("load-run", async () => {
      const existing = await getRun(runId);
      if (!existing) throw new NonRetriableError(`Run ${runId} not found.`);
      // Only a queued run is started: if the event was sent twice (see POST /api/runs/{id}/requeue), the second
      // delivery finds the run already running or finished and does nothing.
      if (existing.status !== "queued") return { skip: true as const };
      const run = await updateRun(runId, (r) => {
        r.status = "running";
      });
      const start = run.startNodeId ?? run.graph.nodes.find((n) => n.type === "start")?.id;
      if (!start) throw new NonRetriableError("The flow has no Start node.");
      return { skip: false as const, graph: run.graph, input: run.input, start, firstIndex: 1 };
    });
    if (plan.skip) return { runId, skipped: "already started" };
    const graph: Graph = plan.graph;

    let current: string | null = plan.start;
    let endReason = "";
    for (let index = plan.firstIndex; current; index++) {
      if (index > MAX_STEPS) {
        endReason = `Stopped after ${MAX_STEPS} steps: the flow probably loops.`;
        break;
      }
      const node = graph.nodes.find((n) => n.id === current);
      if (!node) {
        endReason = `Node ${current} no longer exists.`;
        break;
      }

      const result: StepResult = await step.run(`${index}. ${node.type}: ${node.data.label || node.id}`, async () => {
        const base: RunStep = {
          index,
          nodeId: node.id,
          kind: node.type,
          label: node.data.label,
          prompt: node.data.prompt,
          status: "running",
          startedAt: now(),
          attempts: attempt + 1,
        };
        await updateRun(runId, (r) => upsertStep(r, base));

        if (node.type === "outcome") {
          await updateRun(runId, (r) => upsertStep(r, { ...base, status: "done", ms: 0 }));
          return { edgeId: null, target: null, endReason: `Reached outcome "${node.data.label || node.id}".` };
        }

        let answer: "YES" | "NO" | undefined;
        if (node.type === "decision") {
          try {
            const d = await askYesNo(node.data.prompt ?? "", plan.input);
            answer = d.answer;
            await updateRun(runId, (r) =>
              upsertStep(r, { ...base, answer, raw: d.raw, ms: d.ms, tokens: d.tokens, status: answer === "YES" ? "yes" : "no" }),
            );
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            await updateRun(runId, (r) => upsertStep(r, { ...base, status: "error", error: message }));
            // A model that won't say YES/NO at temperature 0 will say the same thing again: don't burn retries.
            if (e instanceof InvalidAnswerError) throw new NonRetriableError(message, { cause: e });
            throw e; // timeouts, connection errors, 5xx: Inngest retries this step with backoff
          }
        } else {
          await updateRun(runId, (r) => upsertStep(r, { ...base, status: "done", ms: 0 }));
        }

        const edge = nextEdge(graph, node.id, answer);
        if (edge) await updateRun(runId, (r) => upsertStep(r, { ...(r.steps.find((s) => s.index === index) as RunStep), edgeId: edge.id }));
        return {
          answer,
          edgeId: edge?.id ?? null,
          target: edge?.target ?? null,
          endReason: edge ? undefined : `"${node.data.label || node.id}" answered ${answer ?? "-"} and has no ${answer ?? "next"} path.`,
        };
      });

      if (result.endReason) endReason = result.endReason;
      current = result.target;
    }

    await step.run("finish", async () => {
      const run = await getRun(runId);
      if (!run) return;
      await updateRun(runId, (r) => {
        r.status = "completed";
        r.endReason = endReason || "Finished.";
        r.finishedAt = now();
      });
    });
    return { runId, endReason };
  },
);
