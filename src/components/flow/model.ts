import type { Edge, Node } from "@xyflow/react";
import { createContext, useContext } from "react";

import type { BranchHandle, Graph, NodeKind, Run, RunStep } from "@/lib/flow/types";

/** React Flow's view of the graph. Run state is NOT stored in node data (see RunView below). */
export type NodeData = { label: string; prompt?: string };
export type AppNode = Node<NodeData, NodeKind>;
export type EdgeData = { branch: BranchHandle };
export type AppEdge = Edge<EdgeData, "branch">;

export function toFlow(graph: Graph): { nodes: AppNode[]; edges: AppEdge[] } {
  return {
    nodes: graph.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: { ...n.data } })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      type: "branch",
      data: { branch: e.sourceHandle },
    })),
  };
}

export function toGraph(nodes: AppNode[], edges: AppEdge[]): Graph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: (n.type ?? "decision") as NodeKind,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      data: n.type === "decision" ? { label: n.data.label ?? "", prompt: n.data.prompt ?? "" } : { label: n.data.label ?? "" },
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: (e.sourceHandle ?? e.data?.branch ?? "next") as BranchHandle,
    })),
  };
}

/**
 * What the canvas should show for the run being viewed: each node's latest step, which edges were followed, and
 * which edge is "live" right now. Kept in context so nodes and edges can read it without touching saved state.
 */
export interface RunView {
  stepByNode: Map<string, RunStep>;
  takenEdges: Set<string>;
  activeEdgeId?: string;
  runStatus?: Run["status"];
}

export const EMPTY_VIEW: RunView = { stepByNode: new Map(), takenEdges: new Set() };
export const RunViewContext = createContext<RunView>(EMPTY_VIEW);
export const useRunView = () => useContext(RunViewContext);

export function deriveView(run: Run | null): RunView {
  if (!run) return EMPTY_VIEW;
  const stepByNode = new Map<string, RunStep>();
  const takenEdges = new Set<string>();
  for (const s of run.steps) {
    stepByNode.set(s.nodeId, s);
    if (s.edgeId) takenEdges.add(s.edgeId);
  }
  const last = run.steps.at(-1);
  const live = run.status === "running" || run.status === "queued";
  return { stepByNode, takenEdges, activeEdgeId: live ? last?.edgeId : undefined, runStatus: run.status };
}

let counter = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;
