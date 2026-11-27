import { describe, expect, it } from "vitest";

import example from "@/lib/flow/example-flow.json";
import { checkGraph, nextEdge } from "@/lib/flow/graph";
import { GraphSchema, RunRequestSchema, type Graph } from "@/lib/flow/types";
import { parseYesNo } from "@/lib/llm";

const graph: Graph = GraphSchema.parse(example.graph);
const clone = (): Graph => structuredClone(graph);

describe("parseYesNo: the model must answer exactly YES or NO", () => {
  it.each([["YES", "YES"], ["NO", "NO"], ["yes", "YES"], [" No. ", "NO"], ['"YES"', "YES"], ["**NO**", "NO"]])(
    "accepts %j as %s", (raw, want) => expect(parseYesNo(raw)).toBe(want));

  it.each(["Yes, it is.", "YES NO", "Maybe", "", "Y", "I think YES", "NOPE", "YESS"])(
    "rejects %j (never guesses)", (raw) => expect(parseYesNo(raw)).toBeNull());
});

describe("nextEdge: the answer picks the path", () => {
  it("start always follows its single next edge", () => {
    expect(nextEdge(graph, "start")?.target).toBe("is-support");
  });
  it("YES and NO follow their own edges", () => {
    expect(nextEdge(graph, "is-support", "YES")?.target).toBe("is-outage");
    expect(nextEdge(graph, "is-support", "NO")?.target).toBe("is-buying");
  });
  it("outcomes are terminal", () => {
    expect(nextEdge(graph, "sales")).toBeNull();
  });
  it("a missing branch ends the run instead of jumping somewhere else", () => {
    const g = clone();
    g.edges = g.edges.filter((e) => e.id !== "e-buying-no");
    expect(nextEdge(g, "is-buying", "NO")).toBeNull();
    expect(nextEdge(g, "is-buying", "YES")?.target).toBe("sales");
  });
});

describe("checkGraph: problems are caught before a run is accepted", () => {
  const errors = (g: Graph, start?: string) => checkGraph(g, start).filter((p) => p.level === "error").map((p) => p.message);

  it("the example flow is valid", () => {
    expect(checkGraph(graph)).toEqual([]);
  });
  it("needs exactly one start", () => {
    const g = clone();
    g.nodes.push({ ...g.nodes[0], id: "start-2" });
    expect(errors(g).join()).toMatch(/exactly one Start node \(found 2\)/);
  });
  it("a decision without a prompt is an error", () => {
    const g = clone();
    g.nodes.find((n) => n.id === "is-outage")!.data.prompt = "  ";
    expect(errors(g).join()).toMatch(/has no prompt/);
  });
  it("two YES edges from one node would be ambiguous", () => {
    const g = clone();
    g.edges.push({ id: "dup", source: "is-support", target: "sales", sourceHandle: "yes" });
    expect(errors(g).join()).toMatch(/two YES edges/);
  });
  it("an outcome can't have outgoing edges, a decision can't use 'next'", () => {
    const g = clone();
    g.edges.push({ id: "x1", source: "sales", target: "inbox", sourceHandle: "yes" });
    g.edges.push({ id: "x2", source: "is-support", target: "inbox", sourceHandle: "next" });
    expect(errors(g)).toHaveLength(2);
  });
  it("an edge to a missing node is an error", () => {
    const g = clone();
    g.edges.push({ id: "ghost", source: "is-buying", target: "nowhere", sourceHandle: "yes" });
    expect(errors(g).join()).toMatch(/missing node/);
  });
  it("a missing NO path is only a warning", () => {
    const g = clone();
    g.edges = g.edges.filter((e) => e.id !== "e-buying-no");
    const p = checkGraph(g);
    expect(p.filter((x) => x.level === "error")).toEqual([]);
    expect(p.find((x) => x.level === "warning")?.message).toMatch(/no NO path/);
  });
  it("retrying from a node doesn't require a start node", () => {
    const g = clone();
    g.nodes = g.nodes.filter((n) => n.type !== "start");
    g.edges = g.edges.filter((e) => e.source !== "start");
    expect(errors(g, "is-support")).toEqual([]);
    expect(errors(g, "not-a-node").join()).toMatch(/doesn't exist/);
  });
});

describe("RunRequestSchema: the API's input contract", () => {
  it("rejects blank input and over-long input", () => {
    expect(RunRequestSchema.safeParse({ graph, input: "   " }).success).toBe(false);
    expect(RunRequestSchema.safeParse({ graph, input: "x".repeat(2001) }).success).toBe(false);
    expect(RunRequestSchema.safeParse({ graph, input: "hello" }).success).toBe(true);
  });
  it("rejects unknown node types and edge handles", () => {
    const g = clone() as unknown as { nodes: { type: string }[]; edges: { sourceHandle: string }[] };
    g.nodes[1].type = "loop";
    expect(RunRequestSchema.safeParse({ graph: g, input: "hi" }).success).toBe(false);
    const g2 = clone() as unknown as { edges: { sourceHandle: string }[] };
    g2.edges[0].sourceHandle = "maybe";
    expect(RunRequestSchema.safeParse({ graph: g2, input: "hi" }).success).toBe(false);
  });
});
