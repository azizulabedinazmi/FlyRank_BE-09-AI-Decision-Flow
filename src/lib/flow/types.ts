import { z } from "zod";

/**
 * The workflow graph, shared by the editor (browser) and the runner (Inngest). Plain JSON, so it can be saved,
 * exported and sent over the wire unchanged.
 *
 *   start    -> where a run begins; one "next" handle
 *   decision -> asks the model a YES/NO question about the input; a "yes" handle and a "no" handle
 *   outcome  -> a terminal node: where the run ends up
 */
export const NODE_KINDS = ["start", "decision", "outcome"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const HANDLES = ["next", "yes", "no"] as const;
export type BranchHandle = (typeof HANDLES)[number];

export const MAX_PROMPT = 500;
export const MAX_INPUT = 2000;
export const MAX_STEPS = 25; // a cycle in the graph can never run forever

export const FlowNodeSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(NODE_KINDS),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({
    label: z.string().max(80).default(""),
    prompt: z.string().max(MAX_PROMPT).optional(),
  }),
});

export const FlowEdgeSchema = z.object({
  id: z.string().min(1).max(128),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.enum(HANDLES),
});

export const GraphSchema = z.object({
  nodes: z.array(FlowNodeSchema).min(1).max(100),
  edges: z.array(FlowEdgeSchema).max(300),
});

export type FlowNode = z.infer<typeof FlowNodeSchema>;
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;
export type Graph = z.infer<typeof GraphSchema>;

export const RunRequestSchema = z.object({
  graph: GraphSchema,
  input: z.string().trim().min(1, "input is required").max(MAX_INPUT),
  flowName: z.string().max(80).optional(),
  /** Retry support: start from this node instead of the start node (e.g. the node that failed). */
  startNodeId: z.string().optional(),
  parentRunId: z.string().optional(),
});
export type RunRequest = z.infer<typeof RunRequestSchema>;

export type StepStatus = "running" | "yes" | "no" | "done" | "error";

export interface RunStep {
  index: number; // execution order, 1-based
  nodeId: string;
  kind: NodeKind;
  label: string;
  prompt?: string;
  answer?: "YES" | "NO";
  raw?: string; // what the model actually said (for the log; never used for branching)
  status: StepStatus;
  edgeId?: string; // the edge followed out of this node
  startedAt: string;
  ms?: number;
  tokens?: { input: number | null; output: number | null };
  attempts?: number;
  error?: string;
}

export type RunStatus = "queued" | "running" | "completed" | "failed";

export interface Run {
  id: string;
  flowName: string;
  input: string;
  graph: Graph;
  status: RunStatus;
  createdAt: string;
  finishedAt?: string;
  steps: RunStep[];
  endReason?: string; // why the run stopped (reached an outcome, no edge for the answer, step limit...)
  error?: string;
  model: string;
  startNodeId?: string;
  parentRunId?: string;
}
