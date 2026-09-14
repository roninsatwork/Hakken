import { convexTest } from "convex-test";
import Stripe from "stripe";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import schema from "./schema";
// The pinned package publishes its component sources, but its advertised /test export is absent.
import stripeSchema from "../node_modules/@convex-dev/stripe/src/component/schema";
import { components } from "./_generated/api";
import config from "../sonae.billing.json";

const original = structuredClone(config);
const secret = "whsec_local_fixture_only";
beforeEach(() => {
  Object.assign(config, { ...original, mode: "test", enabled: true, appOrigin: "https://product.example.com", portalConfigurationId: "bpc_test", recoveryPortalConfigurationId: "bpc_recovery", graceDays: 0,
    offers: [{ key: "team", planId: "test", stripePriceId: "price_test", currency: "gbp", amountMinor: 2900 }],
  });
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_local_fixture_only");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => { Object.assign(config, original); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

test("the installed Convex component verifies a valid signed event and rejects a modified body", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  const stripe = new Stripe("sk_test_local_fixture_only");
  t.registerComponent("stripe", stripeSchema, import.meta.glob("../node_modules/@convex-dev/stripe/src/component/**/*.ts"));
  // Exercise both the real signature adapter and the installed component mirror offline.
  const body = JSON.stringify({ id: "evt_fixture", type: "invoice.finalized", livemode: false, data: { object: { id: "in_fixture", customer: "cus_unknown", amount_due: 2900, amount_paid: 0, created: Math.floor(Date.now() / 1000), status: "open" } } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  const headers = { "stripe-signature": signature, "content-type": "application/json" };
  expect((await t.fetch("/stripe/webhook", { method: "POST", headers, body })).status).toBe(200);
  expect(await t.query(components.stripe.public.listInvoices, { stripeCustomerId: "cus_unknown" })).toEqual([expect.objectContaining({ stripeInvoiceId: "in_fixture", amountDue: 2900 })]);
  const tampered = await t.fetch("/stripe/webhook", { method: "POST", headers, body: body + " " });
  expect(tampered.status).toBe(400);
  expect(await tampered.text()).not.toContain(secret);
});

test("disabled, unsigned and oversized webhook requests cannot reach provider processing", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  expect((await t.fetch("/stripe/webhook", { method: "POST", body: "{}" })).status).toBe(400);
  expect((await t.fetch("/stripe/webhook", { method: "POST", headers: { "stripe-signature": "invalid" }, body: "x".repeat(256 * 1024 + 1) })).status).toBe(413);
  config.enabled = false;
  expect((await t.fetch("/stripe/webhook", { method: "POST", body: "{}" })).status).toBe(404);
});
