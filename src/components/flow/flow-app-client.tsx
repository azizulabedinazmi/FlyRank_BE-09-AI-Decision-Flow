"use client";

import dynamic from "next/dynamic";

/**
 * The editor lives entirely in the browser (React Flow + localStorage), so it skips server prerendering. That lets it
 * read the autosaved graph straight into its initial state instead of patching it in after the first render.
 */
export const FlowAppClient = dynamic(() => import("./flow-app").then((m) => m.FlowApp), {
  ssr: false,
  loading: () => <div className="grid h-dvh place-items-center text-sm text-muted-foreground">Loading the flow editor…</div>,
});
