import { httpRouter, type HttpRouter } from "convex/server";
import { registerRoutes } from "@convex-dev/stripe";
import { components, internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import { billingConfig } from "./billingPolicy";
import { STRIPE_API_VERSION, objectId } from "./billingStripe";
import { readBoundedBody } from "./utils/boundedRequestBody";

const PATH = "/stripe/webhook";
const MAX_BODY_BYTES = 256 * 1024;

export function registerBillingHttp(http: HttpRouter) {
  const componentRouter = httpRouter();
  registerRoutes(componentRouter, components.stripe, {
    webhookPath: PATH, apiVersion: STRIPE_API_VERSION,
    onEvent: async (ctx, event) => {
      if (event.livemode !== ((await billingConfig(ctx)).mode === "live")) return;
      await ctx.runMutation(internal.billingConfiguration.recordWebhook, { eventId: event.id, eventType: event.type });
      const object = event.data.object;
      const customerId = "customer" in object ? objectId(object.customer) : undefined;
      if (!customerId) return;
      const accountId = await ctx.runQuery(internal.billingState.findCustomer, { customerId });
      if (accountId) await ctx.runAction(internal.billingSync.reconcile, { accountId, auditProviderEventId: event.id });
    },
  });
  const endpoint = componentRouter.lookup(PATH, "POST")!;
  const invoke = (endpoint[0] as unknown as { _handler: (ctx: ActionCtx, request: Request) => Promise<Response> })._handler;
  http.route({ path: PATH, method: "POST", handler: httpAction(async (ctx, request) => {
    if (!(await billingConfig(ctx)).enabled) return new Response("Billing disabled", { status: 404 });
    if (!request.headers.get("stripe-signature")) return new Response("Missing signature", { status: 400 });
    const body = await readBoundedBody(request, MAX_BODY_BYTES);
    if (!body.ok) return new Response("Invalid request body", { status: body.reason === "too_large" ? 413 : 400 });
    // The pinned component owns signature verification and mirroring. Convex's registered
    // handler adapter lets us cap its otherwise unbounded req.text() without reimplementing either.
    const result = await invoke(ctx, new Request(request.url, { method: "POST", headers: request.headers, body: body.text }));
    return result.ok ? result : new Response("Stripe webhook could not be processed", { status: result.status });
  }) });
}
