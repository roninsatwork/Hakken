import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { handleWebhook } from "./workflows";

const http = httpRouter();

http.route({
  path: "/api/webhooks/workflow",
  method: "POST",
  handler: handleWebhook,
});

// Attach `@convex-dev/auth` endpoints to the Convex HTTP router
// This enables OAuth callbacks and Magic Link verification endpoints
auth.addHttpRoutes(http);

export default http;
