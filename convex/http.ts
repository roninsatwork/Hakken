import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { handleWebhook } from "./workflows";
import { processApifyWebhook } from "./webhooks";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/api/webhooks/workflow",
  method: "POST",
  handler: handleWebhook,
});

// Attach `@convex-dev/auth` endpoints to the Convex HTTP router
// This enables OAuth callbacks and Magic Link verification endpoints
auth.addHttpRoutes(http);

http.route({
  path: "/apify-webhook",
  method: "POST",
  handler: processApifyWebhook,
});

http.route({
  path: "/api/movements",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const movements = await ctx.runQuery(api.movements.list);
    return new Response(JSON.stringify(movements), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
    });
  }),
});

export default http;
