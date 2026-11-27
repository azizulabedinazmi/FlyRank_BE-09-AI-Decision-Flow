"use client";

import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { CheckCircle2, CircleDot, Flag, GitBranch, Loader2, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { MAX_PROMPT } from "@/lib/flow/types";

import { useRunView, type AppNode } from "./model";

/** Colour and badge for a node, from the run being viewed. Nodes not on the path fade once a run has finished. */
function useNodeState(id: string) {
  const { stepByNode, runStatus } = useRunView();
  const step = stepByNode.get(id);
  const finished = runStatus === "completed" || runStatus === "failed";
  const ring =
    step?.status === "running"
      ? "ring-4 ring-amber-400/70 animate-pulse"
      : step?.status === "yes"
        ? "ring-4 ring-emerald-500/60"
        : step?.status === "no"
          ? "ring-4 ring-rose-500/60"
          : step?.status === "error"
            ? "ring-4 ring-red-600/80"
            : step?.status === "done"
              ? "ring-4 ring-sky-500/60"
              : "";
  return { step, ring, faded: finished && !step };
}

function Shell({ id, selected, icon, title, accent, children }: {
  id: string; selected?: boolean; icon: ReactNode; title: string; accent: string; children?: ReactNode;
}) {
  const { step, ring, faded } = useNodeState(id);
  return (
    <div
      className={cn(
        "relative w-64 rounded-xl border bg-card text-card-foreground shadow-sm transition-all",
        selected && "border-primary shadow-md",
        ring,
        faded && "opacity-40",
      )}
    >
      <div className={cn("flex items-center gap-2 rounded-t-xl px-3 py-2 text-xs font-semibold uppercase tracking-wide", accent)}>
        {icon}
        <span className="flex-1">{title}</span>
        {step && (
          <span className="flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[10px] text-foreground" title="Execution order">
            #{step.index}
            {step.status === "running" && <Loader2 className="size-3 animate-spin" />}
            {step.status === "yes" && <CheckCircle2 className="size-3 text-emerald-600" />}
            {step.status === "no" && <XCircle className="size-3 text-rose-600" />}
            {step.status === "error" && <XCircle className="size-3 text-red-600" />}
            {step.answer && <b className={step.answer === "YES" ? "text-emerald-700" : "text-rose-700"}>{step.answer}</b>}
          </span>
        )}
      </div>
      <div className="px-3 pb-3 pt-2">{children}</div>
      {step?.error && <p className="border-t px-3 py-2 text-xs text-red-600">{step.error}</p>}
    </div>
  );
}

export function StartNode({ id, data, selected }: NodeProps<AppNode>) {
  return (
    <Shell id={id} selected={selected} icon={<CircleDot className="size-4" />} title="Start" accent="bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100">
      <p className="text-sm font-medium">{data.label || "Start"}</p>
      <p className="text-xs text-muted-foreground">The run input enters here.</p>
      <Handle type="source" position={Position.Right} id="next" className="!size-3 !bg-sky-500" />
    </Shell>
  );
}

export function DecisionNode({ id, data, selected }: NodeProps<AppNode>) {
  const { updateNodeData } = useReactFlow();
  return (
    <Shell id={id} selected={selected} icon={<GitBranch className="size-4" />} title="AI decision" accent="bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100">
      <Handle type="target" position={Position.Left} className="!size-3 !bg-muted-foreground" />
      <input
        className="nodrag mb-1 w-full rounded border-transparent bg-transparent text-sm font-medium outline-none focus:border-input focus:bg-background"
        value={data.label}
        placeholder="Name this step"
        maxLength={80}
        onChange={(e) => updateNodeData(id, { label: e.target.value })}
        aria-label="Decision name"
      />
      <textarea
        className="nodrag nowheel h-20 w-full resize-none rounded-md border bg-background p-2 text-xs leading-snug outline-none focus:ring-2 focus:ring-ring"
        value={data.prompt ?? ""}
        placeholder="A yes/no question about the input, e.g. Is this a support request?"
        maxLength={MAX_PROMPT}
        onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
        aria-label="Decision prompt"
      />
      <div className="mt-1 flex justify-end gap-3 pr-1 text-[10px] font-bold">
        <span className="text-emerald-700">YES →</span>
        <span className="text-rose-700">NO →</span>
      </div>
      <Handle type="source" position={Position.Right} id="yes" style={{ top: "38%" }} className="!size-3 !bg-emerald-500" />
      <Handle type="source" position={Position.Right} id="no" style={{ top: "72%" }} className="!size-3 !bg-rose-500" />
    </Shell>
  );
}

export function OutcomeNode({ id, data, selected }: NodeProps<AppNode>) {
  const { updateNodeData } = useReactFlow();
  return (
    <Shell id={id} selected={selected} icon={<Flag className="size-4" />} title="Outcome" accent="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <Handle type="target" position={Position.Left} className="!size-3 !bg-muted-foreground" />
      <input
        className="nodrag w-full rounded border-transparent bg-transparent text-sm font-medium outline-none focus:border-input focus:bg-background"
        value={data.label}
        placeholder="Where the run ends, e.g. Sales team"
        maxLength={80}
        onChange={(e) => updateNodeData(id, { label: e.target.value })}
        aria-label="Outcome name"
      />
      <p className="text-xs text-muted-foreground">End of the path.</p>
    </Shell>
  );
}

export const nodeTypes = { start: StartNode, decision: DecisionNode, outcome: OutcomeNode };
