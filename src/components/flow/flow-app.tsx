"use client";

import {
  addEdge,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/style.css";
import {
  AlertTriangle, Download, FilePlus2, Flag, GitBranch, History, ListOrdered, Loader2, Play, RotateCcw, Save, Trash2, Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import example from "@/lib/flow/example-flow.json";
import { checkGraph } from "@/lib/flow/graph";
import { GraphSchema, MAX_INPUT, type BranchHandle, type Graph, type Run } from "@/lib/flow/types";
import { cn } from "@/lib/utils";

import { edgeTypes } from "./branch-edge";
import { deriveView, newId, RunViewContext, toFlow, toGraph, type AppEdge, type AppNode } from "./model";
import { nodeTypes } from "./nodes";

const CURRENT_KEY = "adf:current"; // the graph on the canvas, autosaved
const LIBRARY_KEY = "adf:workflows"; // named saved workflows
const EXAMPLE = { name: example.name, graph: GraphSchema.parse(example.graph) };
const SAMPLE_INPUTS = [
  "Hi, the app crashes every time I open the invoices page. Please help!",
  "How much does the team plan cost, and can we book a demo next week?",
  "I can't log in to my account since yesterday, it says my password is wrong.",
  "Lovely weather today, see you at the party on Saturday!",
];

type Library = Record<string, { graph: Graph; savedAt: string }>;
type RunSummary = Omit<Run, "graph">;

function readLibrary(): Library {
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function readCurrent(): { name: string; flow: ReturnType<typeof toFlow> } {
  try {
    const saved = JSON.parse(localStorage.getItem(CURRENT_KEY) ?? "null");
    if (saved?.graph) return { name: saved.name ?? "Untitled flow", flow: toFlow(GraphSchema.parse(saved.graph)) };
  } catch {
    /* corrupted or an old format: fall back to the example */
  }
  return { name: EXAMPLE.name, flow: toFlow(EXAMPLE.graph) };
}

function Editor() {
  // The editor renders client-only (see FlowApp below), so the saved graph can be read straight into the initial
  // state: no effect, no flash of the example, no hydration mismatch.
  const [initial] = useState(readCurrent);
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>(initial.flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>(initial.flow.edges);
  const [flowName, setFlowName] = useState(initial.name);
  const [input, setInput] = useState(SAMPLE_INPUTS[0]);
  const [run, setRun] = useState<Run | null>(null);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [library, setLibrary] = useState<Library>(readLibrary);
  const [tab, setTab] = useState("run");
  const fileInput = useRef<HTMLInputElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const graph = useMemo(() => toGraph(nodes, edges), [nodes, edges]);
  const problems = useMemo(() => checkGraph(graph), [graph]);
  const errors = problems.filter((p) => p.level === "error");
  const view = useMemo(() => deriveView(run), [run]);
  const running = run?.status === "queued" || run?.status === "running";

  const loadGraph = useCallback((g: Graph, name: string) => {
    const f = toFlow(g);
    setNodes(f.nodes);
    setEdges(f.edges);
    setFlowName(name);
    setRun(null);
    requestAnimationFrame(() => fitView({ padding: 0.15 }));
  }, [setNodes, setEdges, fitView]);

  // ---------------------------------------------------------------- local persistence (autosave, debounced)
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(CURRENT_KEY, JSON.stringify({ name: flowName, graph })), 300);
    return () => clearTimeout(t);
  }, [graph, flowName]);

  // ---------------------------------------------------------------- editing
  const onConnect = useCallback((c: Connection) => {
    const branch = (c.sourceHandle ?? "next") as BranchHandle;
    setEdges((eds) =>
      addEdge(
        { ...c, id: newId("e"), type: "branch", data: { branch } },
        // one edge per YES / NO / next handle: a new connection replaces the old one, so the path is never ambiguous
        eds.filter((e) => !(e.source === c.source && (e.sourceHandle ?? "next") === branch)),
      ),
    );
  }, [setEdges]);

  const addNode = (type: "decision" | "outcome") => {
    const pos = screenToFlowPosition({ x: window.innerWidth * 0.38, y: window.innerHeight * 0.45 });
    const node: AppNode = {
      id: newId(type),
      type,
      position: { x: pos.x + Math.random() * 40, y: pos.y + Math.random() * 40 },
      data: type === "decision" ? { label: "New decision", prompt: "" } : { label: "New outcome" },
    };
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { ...node, selected: true }]);
  };

  // ---------------------------------------------------------------- save / load / export / import
  const saveToLibrary = () => {
    const lib = { ...readLibrary(), [flowName.trim() || "Untitled flow"]: { graph, savedAt: new Date().toISOString() } };
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
    setLibrary(lib);
    toast.success(`Saved "${flowName}"`);
  };

  const deleteFromLibrary = (name: string) => {
    const lib = readLibrary();
    delete lib[name];
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
    setLibrary(lib);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ name: flowName, graph }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(flowName || "flow").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const parsed = GraphSchema.safeParse(data.graph ?? data);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "not a flow");
      loadGraph(parsed.data, data.name ?? file.name.replace(/\.json$/, ""));
      toast.success(`Imported "${data.name ?? file.name}"`);
    } catch (e) {
      toast.error(`That file isn't a valid flow: ${e instanceof Error ? e.message : e}`);
    }
  };

  // ---------------------------------------------------------------- running
  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/runs");
      if (res.ok) setHistory(await res.json());
    } catch {
      /* server not up yet */
    }
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/runs")
      .then((res) => (res.ok ? res.json() : []))
      .then((h: RunSummary[]) => alive && setHistory(h))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const startRun = async (extra?: { startNodeId?: string; parentRunId?: string; graphOverride?: Graph }) => {
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph: extra?.graphOverride ?? graph, input, flowName, ...extra, graphOverride: undefined }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? `Run failed to start (${res.status})`);
        return;
      }
      setRun({ id: body.runId, flowName, input, graph, status: "queued", createdAt: new Date().toISOString(), steps: [], model: "" });
      setTab("log");
    } catch {
      toast.error("Couldn't reach the server.");
    }
  };

  // Poll the run while it's live. Inngest executes the nodes; we just watch the record it writes.
  useEffect(() => {
    if (!run || !running) return;
    let cancelled = false;
    const id = run.id;
    const tick = async () => {
      try {
        const res = await fetch(`/api/runs/${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const next: Run = await res.json();
        if (cancelled) return;
        setRun(next);
        if (next.status === "completed") {
          toast.success(next.endReason ?? "Run finished");
          refreshHistory();
        }
        if (next.status === "failed") {
          toast.error(next.error ?? "Run failed");
          refreshHistory();
        }
      } catch {
        /* transient: try again next tick */
      }
    };
    const timer = setInterval(tick, 400);
    tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [run?.id, running, refreshHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  const failedStep = run?.status === "failed" ? run.steps.find((s) => s.status === "error") : undefined;

  // A run that's still "queued" after a few seconds was probably sent before the Inngest dev server synced the app.
  const [stuckRunId, setStuckRunId] = useState<string | null>(null);
  useEffect(() => {
    if (run?.status !== "queued") return;
    const id = run.id;
    const t = setTimeout(() => setStuckRunId(id), 8000);
    return () => clearTimeout(t);
  }, [run?.id, run?.status]);
  const stuck = stuckRunId !== null && stuckRunId === run?.id && run?.status === "queued";
  const requeue = async () => {
    if (!run) return;
    const res = await fetch(`/api/runs/${run.id}/requeue`, { method: "POST" });
    const body = await res.json();
    if (res.ok) {
      toast.info("Sent to Inngest again");
      setStuckRunId(null);
    } else toast.error(body.error ?? "Couldn't requeue the run");
  };

  const openRun = async (id: string) => {
    const res = await fetch(`/api/runs/${id}`);
    if (res.ok) {
      setRun(await res.json());
      setTab("log");
    }
  };

  // ---------------------------------------------------------------- UI
  return (
    <div className="flex h-dvh flex-col bg-muted/30">
      <header className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2">
        <GitBranch className="size-5 text-violet-600" />
        <span className="font-semibold">AI Decision Flow</span>
        <Input value={flowName} onChange={(e) => setFlowName(e.target.value)} className="h-8 w-60" aria-label="Flow name" />
        <div className="mx-2 h-6 w-px bg-border" />
        <Button size="sm" variant="outline" onClick={() => addNode("decision")}><GitBranch /> Decision</Button>
        <Button size="sm" variant="outline" onClick={() => addNode("outcome")}><Flag /> Outcome</Button>
        <div className="mx-2 h-6 w-px bg-border" />
        <Button size="sm" variant="outline" onClick={saveToLibrary}><Save /> Save</Button>
        <Button size="sm" variant="outline" onClick={exportJson}><Download /> Export JSON</Button>
        <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}><Upload /> Import JSON</Button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ""; }} />
        <Button size="sm" variant="ghost" onClick={() => loadGraph(EXAMPLE.graph, EXAMPLE.name)}><FilePlus2 /> Example</Button>
        <span className="ml-auto text-xs text-muted-foreground">Autosaved in this browser</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <RunViewContext.Provider value={view}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={{ type: "branch", markerEnd: { type: MarkerType.ArrowClosed } }}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              forceColorMode="light" // v13: match the (light) shadcn theme instead of following the OS
              minZoom={0.2}
              deleteKeyCode={["Backspace", "Delete"]}
              proOptions={{ hideAttribution: false }}
            >
              <Background gap={20} />
              <Controls />
              <MiniMap pannable zoomable className="!bg-background" />
              <Panel position="top-left" className="rounded-md border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                Drag from a <b className="text-emerald-600">YES</b> / <b className="text-rose-600">NO</b> handle to connect · select + Delete to remove
              </Panel>
            </ReactFlow>
          </RunViewContext.Provider>
        </div>

        <aside className="flex w-[380px] shrink-0 flex-col border-l bg-background">
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-3 mt-3 grid grid-cols-4">
              <TabsTrigger value="run"><Play className="size-3.5" /> Run</TabsTrigger>
              <TabsTrigger value="log"><ListOrdered className="size-3.5" /> Log</TabsTrigger>
              <TabsTrigger value="history"><History className="size-3.5" /> History</TabsTrigger>
              <TabsTrigger value="saved"><Save className="size-3.5" /> Saved</TabsTrigger>
            </TabsList>

            <TabsContent value="run" className="min-h-0 flex-1 overflow-auto p-4">
              <Label htmlFor="run-input">Input the flow decides about</Label>
              <Textarea id="run-input" className="mt-2 h-28" value={input} maxLength={MAX_INPUT} onChange={(e) => setInput(e.target.value)} />
              <div className="mt-2 flex flex-wrap gap-1">
                {SAMPLE_INPUTS.map((s, i) => (
                  <Button key={s} size="xs" variant="secondary" onClick={() => setInput(s)} title={s}>Sample {i + 1}</Button>
                ))}
              </div>
              <Button className="mt-4 w-full" disabled={running || errors.length > 0 || !input.trim()} onClick={() => startRun()}>
                {running ? <Loader2 className="animate-spin" /> : <Play />} {running ? "Running…" : "Run flow"}
              </Button>
              {failedStep && (
                <Button className="mt-2 w-full" variant="outline" onClick={() => startRun({ startNodeId: failedStep.nodeId, parentRunId: run!.id })}>
                  <RotateCcw /> Retry from “{failedStep.label || failedStep.nodeId}”
                </Button>
              )}
              <div className="mt-4 space-y-2">
                {problems.length === 0 && <p className="text-sm text-emerald-700">✓ The flow is valid.</p>}
                {problems.map((p, i) => (
                  <p key={i} className={cn("flex gap-2 rounded-md border p-2 text-xs", p.level === "error" ? "border-red-300 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200" : "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100")}>
                    <AlertTriangle className="size-3.5 shrink-0" /> {p.message}
                  </p>
                ))}
              </div>
              <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
                Each node runs as its own <b>Inngest step</b>. Decision nodes send their prompt and your input to the model,
                which must answer exactly <b>YES</b> or <b>NO</b>; the run follows that edge. A failing node is retried by
                Inngest (2×, with backoff) without re-running the nodes before it.
              </p>
            </TabsContent>

            <TabsContent value="log" className="min-h-0 flex-1">
              <ScrollArea className="h-full p-4">
                {!run && <p className="text-sm text-muted-foreground">Run the flow to see each step here.</p>}
                {run && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={run.status === "failed" ? "destructive" : run.status === "completed" ? "default" : "secondary"}>{run.status}</Badge>
                      <code className="text-xs text-muted-foreground">run {run.id}</code>
                    </div>
                    <p className="rounded-md bg-muted p-2 text-xs">“{run.input}”</p>
                    {stuck && run.status === "queued" && (
                      <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                        <p>
                          Still waiting for Inngest to pick this run up. Is the dev server running (<code>npm run dev:inngest</code>)?
                          Right after a restart it can take a few seconds to sync the app, and a run sent before that is never picked up.
                        </p>
                        <Button size="xs" variant="outline" className="mt-2" onClick={requeue}><RotateCcw /> Send again</Button>
                      </div>
                    )}
                    <ol className="space-y-2">
                      {run.steps.map((s) => (
                        <li key={s.index} className="rounded-md border p-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-muted-foreground">#{s.index}</span>
                            <span className="flex-1 font-medium">{s.label || s.nodeId}</span>
                            {s.status === "running" && <Loader2 className="size-3.5 animate-spin" />}
                            {s.answer && <Badge className={s.answer === "YES" ? "bg-emerald-600" : "bg-rose-600"}>{s.answer}</Badge>}
                            {s.status === "done" && <Badge variant="secondary">{s.kind}</Badge>}
                            {s.status === "error" && <Badge variant="destructive">error</Badge>}
                          </div>
                          {s.prompt && <p className="mt-1 text-muted-foreground">{s.prompt}</p>}
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                            {s.ms !== undefined && `${s.ms} ms`}
                            {s.tokens && ` · ${s.tokens.input} in / ${s.tokens.output} out tokens`}
                            {s.raw !== undefined && ` · model said ${JSON.stringify(s.raw)}`}
                            {s.attempts && s.attempts > 1 && ` · attempt ${s.attempts}`}
                          </p>
                          {s.error && <p className="mt-1 text-red-600">{s.error}</p>}
                        </li>
                      ))}
                    </ol>
                    {run.endReason && <p className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{run.endReason}</p>}
                    {run.error && <p className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">{run.error}</p>}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="history" className="min-h-0 flex-1">
              <ScrollArea className="h-full p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Last 30 runs (stored by the server)</p>
                  <Button size="xs" variant="ghost" onClick={refreshHistory}>Refresh</Button>
                </div>
                <ul className="space-y-2">
                  {history.map((h) => (
                    <li key={h.id}>
                      <button className={cn("w-full rounded-md border p-2 text-left text-xs hover:bg-muted", run?.id === h.id && "border-primary")} onClick={() => openRun(h.id)}>
                        <div className="flex items-center gap-2">
                          <Badge variant={h.status === "failed" ? "destructive" : "secondary"}>{h.status}</Badge>
                          <span className="flex-1 truncate font-medium">{h.flowName}</span>
                          <span className="text-muted-foreground">{new Date(h.createdAt).toLocaleTimeString()}</span>
                        </div>
                        <p className="mt-1 truncate text-muted-foreground">“{h.input}”</p>
                        <p className="mt-1 truncate">{h.steps.map((s) => s.answer ?? s.label).join(" → ")}</p>
                      </button>
                    </li>
                  ))}
                  {history.length === 0 && <li className="text-sm text-muted-foreground">No runs yet.</li>}
                </ul>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="saved" className="min-h-0 flex-1">
              <ScrollArea className="h-full p-4">
                <p className="mb-2 text-xs text-muted-foreground">Saved in this browser (localStorage). Use Export/Import JSON to move flows between machines.</p>
                <ul className="space-y-2">
                  {Object.entries(library).sort((a, b) => b[1].savedAt.localeCompare(a[1].savedAt)).map(([name, item]) => (
                    <li key={name} className="flex items-center gap-2 rounded-md border p-2 text-xs">
                      <button className="flex-1 text-left font-medium hover:underline" onClick={() => loadGraph(item.graph, name)}>{name}</button>
                      <span className="text-muted-foreground">{item.graph.nodes.length} nodes</span>
                      <Button size="icon-xs" variant="ghost" onClick={() => deleteFromLibrary(name)} aria-label={`Delete ${name}`}><Trash2 /></Button>
                    </li>
                  ))}
                  {Object.keys(library).length === 0 && <li className="text-sm text-muted-foreground">Nothing saved yet: press Save.</li>}
                </ul>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}

export function FlowApp() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
