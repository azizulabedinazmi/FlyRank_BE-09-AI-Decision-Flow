"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";

import { useRunView, type AppEdge } from "./model";

const COLORS = { yes: "#10b981", no: "#f43f5e", next: "#64748b" } as const;

/** YES edges are green, NO edges red. The edge the run just took is animated; every edge it took is thicker. */
export function BranchEdge(props: EdgeProps<AppEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd } = props;
  const { takenEdges, activeEdgeId, runStatus } = useRunView();
  const branch = data?.branch ?? "next";
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const taken = takenEdges.has(id);
  const active = activeEdgeId === id;
  const finished = runStatus === "completed" || runStatus === "failed";
  const color = COLORS[branch];

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={cn(active && "adf-edge-active")}
        style={{
          stroke: color,
          strokeWidth: taken || selected ? 3.5 : 1.75,
          opacity: finished && !taken ? 0.3 : 1,
          strokeDasharray: active ? "8 6" : undefined,
        }}
      />
      {branch !== "next" && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, background: color, opacity: finished && !taken ? 0.4 : 1 }}
          >
            {branch.toUpperCase()}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = { branch: BranchEdge };
