import { Inngest } from "inngest";

/** One Inngest client for the app. In development it talks to the local Inngest dev server (INNGEST_DEV=1). */
export const inngest = new Inngest({ id: "ai-decision-flow" });

export const RUN_REQUESTED = "flow/run.requested";
