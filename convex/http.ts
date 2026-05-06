import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { processApifyWebhook } from "./webhooks";

const http = httpRouter();

// Attach `@convex-dev/auth` endpoints to the Convex HTTP router
// This enables OAuth callbacks and Magic Link verification endpoints
auth.addHttpRoutes(http);

http.route({
  path: "/apify-webhook",
  method: "POST",
  handler: processApifyWebhook,
});

export default http;
