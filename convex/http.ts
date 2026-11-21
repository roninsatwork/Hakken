import { httpRouter } from "convex/server";
import { handleUpload, handleUploadOptions } from "./uploadHttp";
import { registerBillingHttp } from "./billingHttp";
import { auth } from "./auth";
import { handleWebhook } from "./workflows";
import { processApifyWebhook } from "./webhooks";
import { handleSeoPingback } from "./seoPingback";
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
import { handleGoogleAuthorize, handleGoogleCallback } from "./googleConnection";
import { BING_AUTHORIZE_PATH, BING_CALLBACK_PATH, handleBingAuthorize, handleBingCallback } from "./bingWebmasterConnect";
import { handleOneClickUnsubscribe, handleResendWebhook } from "./emailHttp";
import { handleXAuthorize, handleXCallback } from "./xConnect";
import { handleTelegramWebhook } from "./telegramHttp";
import { handleAuthorizationServer, handleOpenOptions, handleProtectedResource, handleRegister, handleToken } from "./chatAppsHttp";
import { handleMcp, handleMcpOther } from "./chatAppDoor";

const http = httpRouter();
http.route({ path: "/api/uploads", method: "POST", handler: handleUpload });
http.route({ path: "/api/uploads", method: "OPTIONS", handler: handleUploadOptions });
registerBillingHttp(http);

http.route({
  path: "/api/webhooks/workflow",
  method: "POST",
  handler: handleWebhook,
});

// DataForSEO's "your task is ready" ping. Carries no result and is trusted
// with nothing; see seoPingback.ts. GET as well as POST because their pingback
// is a GET and their postback is not, and both should be harmless here.
http.route({
  path: "/api/seo/pingback",
  method: "GET",
  handler: handleSeoPingback,
});
http.route({
  path: "/api/seo/pingback",
  method: "POST",
  handler: handleSeoPingback,
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

// An owned website's Google sign-in, shared by Search Console and Google
// Analytics: the admin is sent on to Google's sign-in from here, and Google
// sends them back with a code, exchanged server-side. Both legs are
// authenticated by the section's own single-use state
// (docs/plans/active/search-console-plan.md §3; google-analytics-plan.md §3).
// The paths stay Search Console's: the return address is registered with Google.
http.route({
  path: "/api/search-console/oauth/authorize",
  method: "GET",
  handler: handleGoogleAuthorize,
});

http.route({
  path: "/api/search-console/oauth/callback",
  method: "GET",
  handler: handleGoogleCallback,
});

// An owned website's Bing Webmaster Tools sign-in (docs/plans/active/
// bing-webmaster-plan.md §3): on to Bing's sign-in, and back with a code,
// exchanged server-side; both legs carry the website's single-use state.
// The return address is the one registered with Bing (§7, step 1).
http.route({
  path: BING_AUTHORIZE_PATH,
  method: "GET",
  handler: handleBingAuthorize,
});

http.route({
  path: BING_CALLBACK_PATH,
  method: "GET",
  handler: handleBingCallback,
});

// Attach `@convex-dev/auth` endpoints to the Convex HTTP router
// This enables OAuth callbacks and Magic Link verification endpoints
auth.addHttpRoutes(http);


// Email (docs/plans/active/knowledge-news-and-digest-plan.md, phase 8): a
// mail client's one-click unsubscribe, and Resend's bounces and complaints.
http.route({ path: "/api/email/unsubscribe", method: "POST", handler: handleOneClickUnsubscribe });
http.route({ path: "/api/webhooks/resend", method: "POST", handler: handleResendWebhook });
// Connecting Anthony's X account for his bookmarks (the same plan, phase 6).
http.route({ path: "/api/x/oauth/authorize", method: "GET", handler: handleXAuthorize });
http.route({ path: "/api/x/oauth/callback", method: "GET", handler: handleXCallback });
// Telegram, another way in to the Assistant (docs/plans/active/hakken-tasks-plan.md, item 6.1).
http.route({ path: "/telegram/webhook", method: "POST", handler: handleTelegramWebhook });

// Ask Hakken in ChatGPT and Claude (docs/plans/active/ask-hakken-from-ai-chat-apps-plan-2026-11-21.md): the
// sign-in server's public endpoints, reached at Hakken's own address through Next.js (`src/app/api/chat-apps`).
for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
  http.route({ path, method: "GET", handler: handleProtectedResource });
  http.route({ path, method: "OPTIONS", handler: handleOpenOptions });
}
http.route({ path: "/.well-known/oauth-authorization-server", method: "GET", handler: handleAuthorizationServer });
http.route({ path: "/.well-known/oauth-authorization-server", method: "OPTIONS", handler: handleOpenOptions });
http.route({ path: "/oauth/token", method: "POST", handler: handleToken });
http.route({ path: "/oauth/token", method: "OPTIONS", handler: handleOpenOptions });
http.route({ path: "/oauth/register", method: "POST", handler: handleRegister });
http.route({ path: "/oauth/register", method: "OPTIONS", handler: handleOpenOptions });
// The MCP door itself (phase 2): POST only, plain JSON, no session.
http.route({ path: "/mcp", method: "POST", handler: handleMcp });
http.route({ path: "/mcp", method: "OPTIONS", handler: handleOpenOptions });
http.route({ path: "/mcp", method: "GET", handler: handleMcpOther });
http.route({ path: "/mcp", method: "DELETE", handler: handleMcpOther });

http.route({
  path: "/apify-webhook",
  method: "POST",
  handler: processApifyWebhook,
});


export default http;
