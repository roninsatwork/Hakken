import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { handleWebhook } from "./workflows";
import { processApifyWebhook } from "./webhooks";
import {
  handlePublicAgentRunTrigger,
  handlePublicApiPing,
  handlePublicRunStatus,
  handlePublicWorkflowRunTrigger,
} from "./publicApi";

const http = httpRouter();

http.route({
  path: "/api/webhooks/workflow",
  method: "POST",
  handler: handleWebhook,
});

http.route({
  path: "/api/public/v1/ping",
  method: "GET",
  handler: handlePublicApiPing,
});

http.route({
  path: "/api/public/v1/run-status",
  method: "GET",
  handler: handlePublicRunStatus,
});

http.route({
  path: "/api/public/v1/agent-runs",
  method: "POST",
  handler: handlePublicAgentRunTrigger,
});

http.route({
  path: "/api/public/v1/workflow-runs",
  method: "POST",
  handler: handlePublicWorkflowRunTrigger,
});

// Attach `@convex-dev/auth` endpoints to the Convex HTTP router
// This enables OAuth callbacks and Magic Link verification endpoints
auth.addHttpRoutes(http);


http.route({
  path: "/apify-webhook",
  method: "POST",
  handler: processApifyWebhook,
});

export default http;
