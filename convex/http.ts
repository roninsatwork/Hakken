import { httpRouter } from "convex/server";
import { handleUpload, handleUploadOptions } from "./uploadHttp";
import { registerBillingHttp } from "./billingHttp";
import { auth } from "./auth";
import { handleWebhook } from "./workflows";
import { processApifyWebhook } from "./webhooks";
import {
  handlePublicAgentRunTrigger,
  handlePublicApiPing,
  handlePublicRunStatus,
  handlePublicWorkflowRunTrigger,
} from "./publicApi";
import { handleVoiceControl, handleVoiceKnowledgeLookup, handleVoiceTicketRedemption } from "./voiceRelay";
import { handleCallStatus, handleCallTurns, handleIncomingCall } from "./telephony";
import {
  handleConnectorOAuthAuthorize,
  handleConnectorOAuthCallback,
} from "./connectorOAuth";

const http = httpRouter();
http.route({ path: "/api/uploads", method: "POST", handler: handleUpload });
http.route({ path: "/api/uploads", method: "OPTIONS", handler: handleUploadOptions });
registerBillingHttp(http);

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

// A signed live-voice ticket opens one provider session, on one relay
// instance. Convex owns the atomic redemption so horizontal scaling cannot
// turn the one-minute ticket into a fan-out credential.
http.route({
  path: "/api/voice/redeem",
  method: "POST",
  handler: handleVoiceTicketRedemption,
});

http.route({
  path: "/api/voice/control",
  method: "POST",
  handler: handleVoiceControl,
});

// Somebody dialled the number. Verified as the telephony provider by its own
// signature before a single model call is spent.
http.route({
  path: "/api/telephony/voice",
  method: "POST",
  handler: handleIncomingCall,
});

// The bridge posting both sides of the transcript as the call happens,
// authenticated by the call's own ticket.
http.route({
  path: "/api/telephony/turns",
  method: "POST",
  handler: handleCallTurns,
});

// The provider reporting the call has ended — which starts the finale:
// summary, CRM match, follow-up task, bell.
http.route({
  path: "/api/telephony/status",
  method: "POST",
  handler: handleCallStatus,
});

// The connector consent flow: an admin starting a connection is redirected
// to the provider from here, and the provider sends them back with a code.
// Both legs are authenticated by the connection's own single-use random
// state; the code exchange happens server-side only.
http.route({
  path: "/api/connectors/oauth/authorize",
  method: "GET",
  handler: handleConnectorOAuthAuthorize,
});

http.route({
  path: "/api/connectors/oauth/callback",
  method: "GET",
  handler: handleConnectorOAuthCallback,
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
