import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { runFlow } from "@/inngest/run-flow";

// The Inngest dev server (and Inngest Cloud) calls this endpoint to discover and run the functions.
export const { GET, POST, PUT } = serve({ client: inngest, functions: [runFlow] });
