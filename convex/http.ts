import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { handleWebhook } from "./workflows";
// template:remove:start properties
import { processApifyWebhook } from "./webhooks";
// template:remove:end
import {
  handlePublicAgentRunTrigger,
  handlePublicApiPing,
  handlePublicRunStatus,
  handlePublicWorkflowRunTrigger,
} from "./publicApi";
import { handleVoiceKnowledgeLookup } from "./voiceRelay";

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

// The voice relay asking for company knowledge on a spoken session's behalf.
// Authenticated by the session's own signed ticket, not a shared header.
http.route({
  path: "/api/voice/knowledge",
  method: "POST",
  handler: handleVoiceKnowledgeLookup,
});

// Attach `@convex-dev/auth` endpoints to the Convex HTTP router
// This enables OAuth callbacks and Magic Link verification endpoints
auth.addHttpRoutes(http);


// template:remove:start properties
http.route({
  path: "/apify-webhook",
  method: "POST",
  handler: processApifyWebhook,
});
// template:remove:end

export default http;
