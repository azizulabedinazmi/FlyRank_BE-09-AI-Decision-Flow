import type { BranchHandle, FlowEdge, FlowNode, Graph } from "./types";

/** Which handle leaves a node for a given answer. Decisions branch on YES/NO; start has a single "next". */
export function handleFor(node: FlowNode, answer?: "YES" | "NO"): BranchHandle | null {
  if (node.type === "start") return "next";
  if (node.type === "decision") return answer === "YES" ? "yes" : answer === "NO" ? "no" : null;
  return null; // outcomes are terminal
}

/** The edge to follow out of `nodeId` for `answer`, or null when there is none (the run ends there). */
export function nextEdge(graph: Graph, nodeId: string, answer?: "YES" | "NO"): FlowEdge | null {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const handle = handleFor(node, answer);
  if (!handle) return null;
  return graph.edges.find((e) => e.source === nodeId && e.sourceHandle === handle) ?? null;
}

export interface GraphProblem {
  level: "error" | "warning";
  message: string;
  nodeId?: string;
}

/**
 * Checked before a run is accepted. Errors block the run (the API answers 400); warnings are shown in the editor
 * but allowed (a missing NO branch just ends the run there).
 */
export function checkGraph(graph: Graph, startNodeId?: string): GraphProblem[] {
  const problems: GraphProblem[] = [];
  const ids = new Set(graph.nodes.map((n) => n.id));
  if (ids.size !== graph.nodes.length) problems.push({ level: "error", message: "Two nodes share an id." });

  const starts = graph.nodes.filter((n) => n.type === "start");
  if (!startNodeId && starts.length !== 1)
    problems.push({ level: "error", message: `A flow needs exactly one Start node (found ${starts.length}).` });
  if (startNodeId && !ids.has(startNodeId))
    problems.push({ level: "error", message: "The node to start from doesn't exist." });

  const seen = new Set<string>();
  for (const e of graph.edges) {
    const source = graph.nodes.find((n) => n.id === e.source);
    if (!source || !ids.has(e.target)) {
      problems.push({ level: "error", message: `Edge ${e.id} points at a missing node.` });
      continue;
    }
    const allowed: BranchHandle[] = source.type === "start" ? ["next"] : source.type === "decision" ? ["yes", "no"] : [];
    if (!allowed.includes(e.sourceHandle))
      problems.push({ level: "error", nodeId: source.id, message: `"${source.data.label || source.id}" can't have a ${e.sourceHandle} edge.` });
    const key = `${e.source}:${e.sourceHandle}`;
    if (seen.has(key))
      problems.push({ level: "error", nodeId: source.id, message: `"${source.data.label || source.id}" has two ${e.sourceHandle.toUpperCase()} edges: the path would be ambiguous.` });
    seen.add(key);
  }

  for (const n of graph.nodes) {
    if (n.type === "decision") {
      if (!n.data.prompt?.trim())
        problems.push({ level: "error", nodeId: n.id, message: `"${n.data.label || n.id}" has no prompt.` });
      for (const h of ["yes", "no"] as const)
        if (!seen.has(`${n.id}:${h}`))
          problems.push({ level: "warning", nodeId: n.id, message: `"${n.data.label || n.id}" has no ${h.toUpperCase()} path: a ${h.toUpperCase()} answer ends the run there.` });
    }
    if (n.type === "start" && !seen.has(`${n.id}:next`))
      problems.push({ level: "error", nodeId: n.id, message: "The Start node isn't connected to anything." });
  }
  return problems;
}
