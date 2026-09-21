import { convexTest } from "convex-test";
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import config from "../hakken.billing.json";
import { hasPaidAccess, safeStripeUrl } from "./billingPolicy";
import { resolveChatQuota } from "./chatService";
import { effectiveModulesFor } from "./tenantFunctions";

const provider = vi.hoisted(() => ({
  prices: { retrieve: vi.fn() }, customers: { create: vi.fn(), retrieve: vi.fn() },
  subscriptions: { list: vi.fn(), retrieve: vi.fn() },
  invoices: { list: vi.fn() },
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn(), list: vi.fn() } },
  billingPortal: { configurations: { retrieve: vi.fn() }, sessions: { create: vi.fn() } },
}));
vi.mock("./billingStripe", async original => ({ ...await original<typeof import("./billingStripe")>(), stripeClient: () => provider }));
const originalConfig = structuredClone(config);
const NOW = 1_800_000_000_000;
const END = NOW + 30 * 86_400_000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  Object.assign(config, { ...originalConfig, mode: "test", enabled: true, appOrigin: "https://product.example.com", portalConfigurationId: "bpc_test", recoveryPortalConfigurationId: "bpc_recovery", graceDays: 2, offers: [] });
  provider.prices.retrieve.mockResolvedValue({ id: "price_month", active: true, livemode: false, currency: "gbp", unit_amount: 2900, type: "recurring", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, billing_scheme: "per_unit", product: { id: "prod_team", active: true } });
  provider.customers.create.mockResolvedValue({ id: "cus_owned", livemode: false });
  provider.subscriptions.list.mockResolvedValue({ data: [], has_more: false });
  provider.invoices.list.mockResolvedValue({ data: [], has_more: false });
  provider.checkout.sessions.list.mockResolvedValue({ data: [], has_more: false });
  const portal = { id: "bpc_test", active: true, livemode: false, features: { payment_method_update: { enabled: true }, invoice_history: { enabled: true }, subscription_update: { enabled: true, default_allowed_updates: ["price"], proration_behavior: "always_invoice", billing_cycle_anchor: "unchanged", products: [{ product: "prod_team", prices: ["price_month"], adjustable_quantity: { enabled: false } }] }, subscription_cancel: { enabled: true, mode: "at_period_end" } } };
  const recovery = structuredClone(portal); recovery.id = "bpc_recovery"; recovery.features.subscription_update.enabled = false;
  provider.billingPortal.configurations.retrieve.mockImplementation(async id => id === "bpc_recovery" ? recovery : portal);
  provider.billingPortal.sessions.create.mockResolvedValue({ url: "https://billing.stripe.com/p/session" });
  provider.checkout.sessions.create.mockImplementation(async args => ({ ...args, id: "cs_owned", status: "open", url: "https://checkout.stripe.com/c/session" }));
});
afterEach(() => { Object.assign(config, structuredClone(originalConfig)); vi.restoreAllMocks(); vi.useRealTimers(); });

async function setup() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  const ids = await t.run(async ctx => {
    const plan = await ctx.db.insert("plans", { name: "Team", priceGBP: 29, messageLimit: 100, grantedModules: ["wiki"], isActive: true, createdAt: NOW });
    const company = await ctx.db.insert("companies", { name: "Company", enabledModules: ["tasks"], createdAt: NOW });
    const other = await ctx.db.insert("companies", { name: "Other", createdAt: NOW });
    const admin = await ctx.db.insert("users", { email: "admin@example.com", role: "ADMIN", companyId: company });
    const member = await ctx.db.insert("users", { role: "USER", companyId: company, planOverrideId: plan });
    const readOnly = await ctx.db.insert("users", { role: "READ_ONLY", companyId: company });
    const superAdmin = await ctx.db.insert("users", { role: "SUPER_ADMIN", companyId: other, impersonatingCompanyId: company });
    const foreignAdmin = await ctx.db.insert("users", { role: "ADMIN", companyId: other });
    const thread = await ctx.db.insert("threads", { userId: member, companyId: company, title: "Chat", createdAt: NOW, updatedAt: NOW });
    return { plan, company, other, admin, member, readOnly, superAdmin, foreignAdmin, thread };
  });
  Object.assign(config, { offers: [{ key: "team", planId: ids.plan, stripePriceId: "price_month", amountMinor: 2900, currency: "gbp" }] });
  const admin = t.withIdentity({ subject: ids.admin });
  const account = () => t.run(ctx => ctx.db.query("billingAccounts").withIndex("by_company", q => q.eq("companyId", ids.company)).unique());
  const purchase = () => admin.action(api.billingActions.createCheckout, { offerKey: "team" });
  return { t, ids, admin, account, purchase };
}

async function subscribe(f: Awaited<ReturnType<typeof setup>>, status = "active", paid = true, reconcile = true) {
  const account = (await f.account())!;
  const subscription = {
    id: "sub_owned", customer: "cus_owned", livemode: false, status, collection_method: "charge_automatically", cancel_at_period_end: false,
    metadata: { sonaeBillingAccount: account._id, sonaeCheckoutAttempt: account.attemptId },
    items: { data: [{ id: "si_owned", quantity: 1, price: await provider.prices.retrieve(), current_period_start: NOW / 1000, current_period_end: END / 1000 }], has_more: false },
    latest_invoice: { id: "in_initial", created: NOW / 1000, status: paid ? "paid" : "open", amount_remaining: paid ? 0 : 2900, livemode: false, currency: "gbp", customer: "cus_owned", parent: { subscription_details: { subscription: "sub_owned" } }, billing_reason: "subscription_cycle", lines: { has_more: false, data: [{ parent: { type: "subscription_item_details", subscription_item_details: { proration: false, subscription_item: "si_owned", subscription: "sub_owned" } }, pricing: { price_details: { price: "price_month" } }, quantity: 1, amount: 2900, currency: "gbp", period: { start: NOW / 1000, end: END / 1000 } }] } },
  };
  provider.subscriptions.list.mockResolvedValue({ data: [subscription], has_more: false });
  provider.subscriptions.retrieve.mockResolvedValue(subscription);
  if (reconcile) await f.admin.action(api.billingActions.refresh, {});
  return subscription;
}

async function secondOffer(f: Awaited<ReturnType<typeof setup>>) {
  const planId = await f.t.run(ctx => ctx.db.insert("plans", { name: "Pro", priceGBP: 59, messageLimit: 200, grantedModules: ["tasks"], isActive: true, createdAt: NOW }));
  const originalPrice = await provider.prices.retrieve();
  const price = { ...structuredClone(originalPrice), id: "price_pro", unit_amount: 5900, product: { id: "prod_pro", active: true } };
  const offer = { key: "pro", planId, stripePriceId: price.id, amountMinor: 5900, currency: "gbp" };
  Object.assign(config, { offers: [...config.offers, offer] });
  provider.prices.retrieve.mockImplementation(async id => id === price.id ? price : originalPrice);
  (await provider.billingPortal.configurations.retrieve()).features.subscription_update.products.push({ product: "prod_pro", prices: [price.id], adjustable_quantity: { enabled: false } });
  return { offer, price };
}

function changePrice(sub: Awaited<ReturnType<typeof subscribe>>, price: Awaited<ReturnType<typeof secondOffer>>["price"], paid = true) {
  sub.latest_invoice.id += "_change";
  sub.latest_invoice.created = Date.now() / 1000;
  sub.items.data[0].price = price;
  sub.latest_invoice.status = paid ? "paid" : "open";
  sub.latest_invoice.amount_remaining = paid ? 0 : 1500;
  sub.latest_invoice.billing_reason = "subscription_update";
  const line = sub.latest_invoice.lines.data[0];
  line.pricing.price_details.price = price.id;
  line.parent.subscription_item_details.proration = true;
  line.period.start = Date.now() / 1000;
  line.amount = 2950;
}

describe("Company Stripe billing", () => {
  test("disabled billing creates no provider objects and preserves manual quotas", async () => {
    const f = await setup(); config.enabled = false;
    expect(await f.admin.query(api.billing.getStatus, {})).toMatchObject({ enabled: false, managed: false });
    await expect(f.purchase()).rejects.toThrow("not enabled");
    expect(provider.customers.create).not.toHaveBeenCalled();
    const quota = await f.t.run(async ctx => resolveChatQuota(ctx, (await ctx.db.get(f.ids.member))!, (await ctx.db.get(f.ids.thread))!));
    expect(quota.messageLimit).toBe(100);
  });

  test("members, read-only users, anonymous callers and impersonation cannot buy or see financial details", async () => {
    const f = await setup();
    for (const id of [f.ids.member, f.ids.readOnly, f.ids.superAdmin]) {
      const client = f.t.withIdentity({ subject: id });
      expect(await client.query(api.billing.getStatus, {})).toBeNull();
      await expect(client.action(api.billingActions.createCheckout, { offerKey: "team" })).rejects.toThrow();
      await expect(client.action(api.billingActions.createPortal, {})).rejects.toThrow();
    }
    await expect(f.t.action(api.billingActions.createCheckout, { offerKey: "team" })).rejects.toThrow();
    expect(provider.customers.create).not.toHaveBeenCalled();
  });

  test("forged offers and manual-plan migrations fail before enrollment", async () => {
    const f = await setup();
    await expect(f.admin.action(api.billingActions.createCheckout, { offerKey: "price_attacker" })).rejects.toThrow("not available");
    await f.t.run(ctx => ctx.db.patch(f.ids.company, { planId: f.ids.plan }));
    await expect(f.purchase()).rejects.toThrow("operator-managed");
    expect(await f.account()).toBeNull();
  });

  test("the server owns price, customer, company, redirect and durable retry keys", async () => {
    const f = await setup();
    expect(await f.purchase()).toBe("https://checkout.stripe.com/c/session");
    const account = (await f.account())!;
    const [params, options] = provider.checkout.sessions.create.mock.calls[0];
    expect(params).toMatchObject({ customer: "cus_owned", client_reference_id: account._id, line_items: [{ price: "price_month", quantity: 1 }], success_url: "https://product.example.com/app/settings/billing" });
    expect(options).toEqual({ idempotencyKey: `hakken-checkout-${account.attemptId}` });
    provider.checkout.sessions.retrieve.mockResolvedValue({ ...params, id: "cs_owned", status: "open", url: "https://checkout.stripe.com/c/session" });
    await f.purchase();
    expect(provider.customers.create).toHaveBeenCalledTimes(1);
    expect(provider.checkout.sessions.create).toHaveBeenCalledTimes(1);
    const foreign = f.t.withIdentity({ subject: f.ids.foreignAdmin });
    expect(await foreign.query(api.billing.getStatus, {})).toMatchObject({ managed: false, hasCustomer: false });
    await expect(foreign.action(api.billingActions.createPortal, {})).rejects.toThrow("no Stripe billing");
  });

  test("an uncertain checkout response retries the same immutable purchase", async () => {
    const f = await setup();
    provider.checkout.sessions.create.mockRejectedValueOnce(new Error("secret provider detail"));
    await expect(f.purchase()).rejects.toThrow("Stripe could not complete");
    const first = provider.checkout.sessions.create.mock.calls[0];
    await f.purchase();
    expect(provider.checkout.sessions.create.mock.calls[1]).toEqual(first);
  });

  test("an expired Stripe session can be replaced, but a completed unbound session cannot", async () => {
    const f = await setup(); await f.purchase();
    const old = (await f.account())!.attemptId;
    const params = provider.checkout.sessions.create.mock.calls[0][0];
    provider.checkout.sessions.retrieve.mockResolvedValue({ ...params, id: "cs_owned", status: "complete", subscription: "sub_not_yet_bound" });
    await expect(f.purchase()).rejects.toThrow("awaiting reconciliation");
    expect(provider.checkout.sessions.create).toHaveBeenCalledTimes(1);
    provider.checkout.sessions.retrieve.mockResolvedValue({ ...params, id: "cs_owned", status: "expired" });
    await f.purchase();
    expect((await f.account())!.attemptId).not.toBe(old);
    expect(provider.checkout.sessions.create).toHaveBeenCalledTimes(2);
  });

  test("changed offers do not silently reuse an open checkout with the old price", async () => {
    const f = await setup(); await f.purchase();
    const params = provider.checkout.sessions.create.mock.calls[0][0];
    provider.checkout.sessions.retrieve.mockResolvedValue({ ...params, status: "open", url: "https://checkout.stripe.com/c/session" });
    const offers = [{ key: "team", planId: f.ids.plan, stripePriceId: "price_month", amountMinor: 3900, currency: "gbp" }];
    Object.assign(config, { offers });
    (await provider.prices.retrieve()).unit_amount = 3900;
    await expect(f.purchase()).rejects.toThrow("offer changed");
    expect(provider.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  test("expired idempotency windows require complete provider history before checkout replacement", async () => {
    const f = await setup();
    provider.checkout.sessions.create.mockRejectedValueOnce(new Error("timeout"));
    await expect(f.purchase()).rejects.toThrow();
    vi.mocked(Date.now).mockReturnValue(NOW + 24 * 3_600_000);
    provider.checkout.sessions.list.mockResolvedValueOnce({ data: [], has_more: true });
    await expect(f.purchase()).rejects.toThrow("operator reconciliation");
    expect(provider.checkout.sessions.create).toHaveBeenCalledTimes(1);
    await f.purchase();
    expect(provider.checkout.sessions.create).toHaveBeenCalledTimes(2);
    expect(provider.checkout.sessions.create.mock.calls[1][1]).not.toEqual(provider.checkout.sessions.create.mock.calls[0][1]);
  });

  test("operator recovery verifies ownership before attaching a lost checkout response", async () => {
    const f = await setup();
    provider.checkout.sessions.create.mockRejectedValueOnce(new Error("timeout"));
    await expect(f.purchase()).rejects.toThrow();
    const account = (await f.account())!;
    const params = provider.checkout.sessions.create.mock.calls[0][0];
    provider.customers.retrieve.mockResolvedValue({ id: "cus_owned", livemode: false, metadata: { sonaeBillingAccount: "foreign" } });
    await expect(f.t.action(internal.billingRecovery.attachProviderObject, { accountId: account._id, customerId: "cus_owned", sessionId: "cs_owned" })).rejects.toThrow("does not match");
    provider.customers.retrieve.mockResolvedValue({ id: "cus_owned", livemode: false, metadata: { sonaeBillingAccount: account._id } });
    provider.checkout.sessions.retrieve.mockResolvedValue({ ...params, id: "cs_owned", status: "open", url: "https://checkout.stripe.com/c/session" });
    await f.t.action(internal.billingRecovery.attachProviderObject, { accountId: account._id, customerId: "cus_owned", sessionId: "cs_owned" });
    await f.purchase();
    expect(provider.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  test("a foreign customer or checkout cannot replace the stored binding", async () => {
    const f = await setup(); await f.purchase();
    const account = (await f.account())!;
    provider.customers.retrieve.mockResolvedValue({ id: "cus_other", livemode: false, metadata: { sonaeBillingAccount: account._id } });
    await expect(f.t.action(internal.billingRecovery.attachProviderObject, { accountId: account._id, customerId: "cus_other" })).rejects.toThrow("already bound");
    provider.customers.retrieve.mockResolvedValue({ id: "cus_owned", livemode: false, metadata: { sonaeBillingAccount: account._id } });
    provider.checkout.sessions.retrieve.mockResolvedValue({ customer: "cus_other", client_reference_id: account._id, metadata: { sonaeCheckoutAttempt: account.attemptId } });
    await expect(f.t.action(internal.billingRecovery.attachProviderObject, { accountId: account._id, customerId: "cus_owned", sessionId: "cs_foreign" })).rejects.toThrow("does not match");
    expect((await f.account())!.customerId).toBe("cus_owned");
  });

  test("a lease refuses parallel requests and stale writes after takeover", async () => {
    const f = await setup();
    const first = (await f.t.mutation(internal.billingState.acquire, { userId: f.ids.admin, enroll: true, offerKey: "team" }))!;
    await expect(f.purchase()).rejects.toThrow("Another billing request");
    vi.mocked(Date.now).mockReturnValue(NOW + 100_000);
    const second = (await f.t.mutation(internal.billingState.acquire, { accountId: first._id }))!;
    await expect(f.t.mutation(internal.billingState.applyProjection, { accountId: first._id, revision: first.revision, status: "active", paidThrough: END, cancelAtPeriodEnd: false })).rejects.toThrow("changed while");
    expect(second.revision).toBe(first.revision + 1);
  });

  test("active without a paid invoice does not grant access; payment and duplicate reconciliation preserve usage", async () => {
    const f = await setup(); await f.purchase();
    await subscribe(f, "active", false);
    expect(await f.admin.query(api.billing.getStatus, {})).toMatchObject({ accessAllowed: false, paidThrough: 0 });
    await f.t.run(ctx => ctx.db.patch(f.ids.company, { messagesUsedThisPeriod: 17 }));
    await subscribe(f);
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.admin.query(api.billing.getStatus, {})).toMatchObject({ accessAllowed: true, paidThrough: END });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.company))).toMatchObject({ planId: f.ids.plan, messagesUsedThisPeriod: 17 });
    await expect(f.purchase()).rejects.toThrow("subscription already exists");
  });

  test("current provider state defeats an old notification, and unpaid accounts cannot use an override or unlimited fallback", async () => {
    const f = await setup(); await f.purchase();
    const subscription = await subscribe(f);
    subscription.status = "canceled";
    await f.t.action(internal.billingSync.reconcile, { accountId: (await f.account())!._id });
    await f.t.action(internal.billingSync.reconcile, { accountId: (await f.account())!._id });
    expect(await f.admin.query(api.billing.getStatus, {})).toMatchObject({ status: "canceled", accessAllowed: false });
    const before = await f.t.run(async ctx => ({
      quota: await resolveChatQuota(ctx, (await ctx.db.get(f.ids.member))!, (await ctx.db.get(f.ids.thread))!),
      modules: await effectiveModulesFor(ctx, await ctx.db.get(f.ids.company)),
    }));
    expect(before.quota.messageLimit).toBe(0);
    expect(before.modules).toContain("tasks");
    expect(before.modules).not.toContain("wiki");
    config.enabled = false;
    expect(await f.admin.query(api.plans.getMyCompanyPlanStatus, {})).toMatchObject({ messageLimit: 0 });
  });

  test("scheduled cancellation keeps the paid period and failed renewal can recover through the portal", async () => {
    const f = await setup(); await f.purchase();
    const sub = await subscribe(f);
    sub.cancel_at_period_end = true;
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.admin.query(api.billing.getStatus, {})).toMatchObject({ cancelAtPeriodEnd: true, accessAllowed: true });
    sub.status = "past_due";
    sub.latest_invoice.status = "open";
    vi.mocked(Date.now).mockReturnValue(END + 86_400_000);
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.admin.query(api.billing.getStatus, {})).toMatchObject({ accessAllowed: true });
    vi.mocked(Date.now).mockReturnValue(END + 3 * 86_400_000);
    expect(await f.admin.query(api.billing.getStatus, {})).toMatchObject({ accessAllowed: false });
    expect(await f.admin.action(api.billingActions.createPortal, {})).toBe("https://billing.stripe.com/p/session");
    expect(provider.billingPortal.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_owned", configuration: "bpc_test" }));
    sub.status = "active";
    sub.latest_invoice.id = "in_renewal";
    sub.latest_invoice.created = END / 1000;
    sub.latest_invoice.status = "paid";
    sub.latest_invoice.lines.data[0].period = { start: END / 1000, end: (END + 30 * 86_400_000) / 1000 };
    sub.items.data[0].current_period_start = END / 1000;
    sub.items.data[0].current_period_end = (END + 30 * 86_400_000) / 1000;
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.admin.query(api.billing.getStatus, {})).toMatchObject({ accessAllowed: true });
  });

  test("a proration or an unrelated invoice cannot extend paid access", async () => {
    const f = await setup(); await f.purchase();
    const sub = await subscribe(f, "active", false);
    sub.latest_invoice.status = "paid";
    sub.latest_invoice.amount_remaining = 0;
    sub.latest_invoice.lines.data[0].parent.subscription_item_details.proration = true;
    await f.admin.action(api.billingActions.refresh, {});
    expect((await f.account())!.paidThrough).toBe(0);
    sub.latest_invoice.lines.data[0].parent.subscription_item_details.proration = false;
    sub.latest_invoice.parent.subscription_details.subscription = "sub_foreign";
    await f.admin.action(api.billingActions.refresh, {});
    expect((await f.account())!.paidThrough).toBe(0);
  });

  test("price mismatch, foreign metadata and multiple subscriptions pause access", async () => {
    const f = await setup(); await f.purchase();
    const sub = await subscribe(f);
    sub.items.data[0].price.unit_amount = 1;
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.account()).toMatchObject({ status: "unsupported", paidThrough: 0 });
    sub.metadata.sonaeBillingAccount = "foreign" as typeof sub.metadata.sonaeBillingAccount;
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.account()).toMatchObject({ status: "unsupported", paidThrough: 0 });
    sub.items.data[0].price.unit_amount = 2900;
    provider.subscriptions.list.mockResolvedValue({ data: [sub, { ...sub, id: "sub_duplicate" }], has_more: false });
    await expect(f.purchase()).rejects.toThrow("subscription already exists");
  });

  test("unsafe portal settings and mismatched prices are rejected before enrollment", async () => {
    const f = await setup();
    const price = await provider.prices.retrieve();
    price.recurring.interval = "year";
    await expect(f.purchase()).rejects.toThrow("does not match");
    expect(await f.account()).toBeNull();
    price.recurring.interval = "month";
    const portal = await provider.billingPortal.configurations.retrieve();
    portal.features.payment_method_update.enabled = false;
    await expect(f.purchase()).rejects.toThrow("payment recovery");
    portal.features.payment_method_update.enabled = true;
    portal.features.subscription_update.enabled = false;
    await expect(f.purchase()).rejects.toThrow("portal plan changes");
    expect(await f.account()).toBeNull();
  });

  test("Stripe portal owns plan changes and exposes only mapped active prices", async () => {
    const f = await setup(); await f.purchase(); await subscribe(f);
    await secondOffer(f);
    await expect(f.admin.action(api.billingActions.createPortal, {})).resolves.toContain("billing.stripe.com");
    expect(provider.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: "cus_owned", configuration: "bpc_test", return_url: "https://product.example.com/app/settings/billing" });
    expect(provider.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  test.each([false, true])("retired plans retain invoices and cancellation (expired=%s)", async expired => {
    const f = await setup(); await f.purchase(); await subscribe(f);
    await f.t.run(ctx => ctx.db.patch(f.ids.superAdmin, { impersonatingCompanyId: undefined }));
    await f.t.withIdentity({ subject: f.ids.superAdmin }).mutation(api.plans.updatePlan, { id: f.ids.plan, isActive: false });
    if (expired) vi.mocked(Date.now).mockReturnValue(END + 3 * 86_400_000);
    expect((await f.admin.query(api.billing.getStatus, {}))?.accessAllowed).toBe(!expired);
    await expect(f.admin.action(api.billingActions.createPortal, {})).resolves.toContain("billing.stripe.com");
    expect(provider.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: "cus_owned", configuration: "bpc_recovery", return_url: "https://product.example.com/app/settings/billing" });
  });

  test.each(["disabled", "wrong-mode", "payment-methods", "invoices", "cancellation", "immediate-cancellation", "plan-changes"])("unsafe recovery portal %s is rejected before enrollment and fallback", async problem => {
    const f = await setup();
    const recovery = await provider.billingPortal.configurations.retrieve("bpc_recovery");
    if (problem === "disabled") recovery.active = false;
    if (problem === "wrong-mode") recovery.livemode = true;
    if (problem === "payment-methods") recovery.features.payment_method_update.enabled = false;
    if (problem === "invoices") recovery.features.invoice_history.enabled = false;
    if (problem === "cancellation") recovery.features.subscription_cancel.enabled = false;
    if (problem === "immediate-cancellation") recovery.features.subscription_cancel.mode = "immediately";
    if (problem === "plan-changes") recovery.features.subscription_update.enabled = true;
    await expect(f.purchase()).rejects.toThrow("recovery portal");
    expect(await f.account()).toBeNull();
    // Set up an existing customer without changing the invalid recovery profile.
    const before = structuredClone(recovery);
    recovery.active = true; recovery.livemode = false;
    recovery.features.payment_method_update.enabled = true; recovery.features.invoice_history.enabled = true;
    recovery.features.subscription_cancel = { enabled: true, mode: "at_period_end" };
    recovery.features.subscription_update.enabled = false;
    await f.purchase(); await subscribe(f);
    Object.assign(recovery, before);
    await f.t.run(ctx => ctx.db.patch(f.ids.plan, { isActive: false }));
    await expect(f.admin.action(api.billingActions.createPortal, {})).rejects.toThrow("recovery portal");
    expect(provider.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  test("a failed sale catalog read can still open a verified recovery portal", async () => {
    const f = await setup(); await f.purchase(); await subscribe(f);
    provider.prices.retrieve.mockRejectedValue(new Error("private provider failure"));
    await expect(f.admin.action(api.billingActions.createPortal, {})).resolves.toContain("billing.stripe.com");
    expect(provider.billingPortal.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ configuration: "bpc_recovery" }));
  });

  test.each(["unknown-price", "missing-price", "quantity", "promotion", "deferred-invoice", "reset-cycle", "wrong-product", "inactive-plan", "inactive-price"])("%s sale catalog uses the financial recovery portal", async problem => {
    const f = await setup(); await f.purchase(); await subscribe(f);
    const { offer, price } = await secondOffer(f);
    const update = (await provider.billingPortal.configurations.retrieve()).features.subscription_update;
    if (problem === "unknown-price") update.products[0].prices.push("price_foreign");
    if (problem === "missing-price") update.products.pop();
    if (problem === "quantity") update.products[0].adjustable_quantity.enabled = true;
    if (problem === "promotion") update.default_allowed_updates.push("promotion_code");
    if (problem === "deferred-invoice") update.proration_behavior = "create_prorations";
    if (problem === "reset-cycle") update.billing_cycle_anchor = "now";
    if (problem === "wrong-product") update.products[0].product = "prod_foreign";
    if (problem === "inactive-plan") await f.t.run(ctx => ctx.db.patch(offer.planId, { isActive: false }));
    if (problem === "inactive-price") price.active = false;
    await expect(f.admin.action(api.billingActions.createPortal, {})).resolves.toContain("billing.stripe.com");
    expect(provider.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: "cus_owned", configuration: "bpc_recovery", return_url: "https://product.example.com/app/settings/billing" });
    await expect(f.purchase()).rejects.toThrow();
  });

  test("a paid mid-period upgrade changes plan grants and quota without extending time or resetting usage", async () => {
    const f = await setup(); await f.purchase(); const sub = await subscribe(f);
    const { offer, price } = await secondOffer(f);
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.company, { messagesUsedThisPeriod: 17 });
      await ctx.db.patch(f.ids.member, { planOverrideId: undefined });
    });
    vi.mocked(Date.now).mockReturnValue(NOW + 15 * 86_400_000);
    changePrice(sub, price);
    await f.t.action(internal.billingSync.reconcile, { accountId: (await f.account())!._id });
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.account()).toMatchObject({ status: "active", offer, paidThrough: END });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.company))).toMatchObject({ planId: offer.planId, messagesUsedThisPeriod: 17 });
    const access = await f.t.run(async ctx => ({
      quota: await resolveChatQuota(ctx, (await ctx.db.get(f.ids.member))!, (await ctx.db.get(f.ids.thread))!),
      modules: await effectiveModulesFor(ctx, await ctx.db.get(f.ids.company)),
    }));
    expect(access.quota.messageLimit).toBe(200);
    expect(access.modules).toContain("tasks");
    expect(access.modules).not.toContain("wiki");
    expect(provider.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  test.each([false, true])("delayed initial payment and upgrade recover from history (reversed=%s)", async reverse => {
    const f = await setup(); await f.purchase();
    const sub = await subscribe(f, "active", true, false);
    sub.latest_invoice.billing_reason = "subscription_create";
    const initial = structuredClone(sub.latest_invoice);
    const { offer, price } = await secondOffer(f);
    await f.t.run(ctx => ctx.db.patch(f.ids.company, { messagesUsedThisPeriod: 17 }));
    vi.mocked(Date.now).mockReturnValue(NOW + 86_400_000); changePrice(sub, price);
    const invoices = [structuredClone(sub.latest_invoice), initial];
    provider.invoices.list.mockResolvedValue({ data: reverse ? invoices.reverse() : invoices, has_more: false });
    await f.admin.action(api.billingActions.refresh, {});
    await f.t.action(internal.billingSync.reconcile, { accountId: (await f.account())!._id });
    expect(await f.admin.query(api.billing.getStatus, {})).toMatchObject({ accessAllowed: true, paidThrough: END });
    expect(await f.account()).toMatchObject({ offer, paidInvoice: { id: sub.latest_invoice.id } });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.company))).toMatchObject({ planId: offer.planId, messagesUsedThisPeriod: 17 });
  });

  test.each(["unpaid", "foreign-customer", "foreign-subscription", "wrong-item", "unmapped-price", "no-base", "truncated-lines", "same-second"])("missing payment baseline refuses %s evidence", async problem => {
    const f = await setup(); await f.purchase();
    const sub = await subscribe(f, "active", true, false);
    const initial = structuredClone(sub.latest_invoice);
    const { price } = await secondOffer(f);
    vi.mocked(Date.now).mockReturnValue(NOW + 86_400_000); changePrice(sub, price);
    if (problem === "unpaid") initial.status = "open";
    if (problem === "foreign-customer") initial.customer = "cus_other";
    if (problem === "foreign-subscription") initial.parent.subscription_details.subscription = "sub_other";
    if (problem === "wrong-item") initial.lines.data[0].parent.subscription_item_details.subscription_item = "si_other";
    if (problem === "unmapped-price") initial.lines.data[0].pricing.price_details.price = "price_other";
    if (problem === "truncated-lines") initial.lines.has_more = true;
    if (problem === "same-second") initial.created = sub.latest_invoice.created;
    provider.invoices.list.mockResolvedValue({ data: [structuredClone(sub.latest_invoice), ...(problem === "no-base" ? [] : [initial])], has_more: problem === "no-base" });
    await f.admin.action(api.billingActions.refresh, {});
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.admin.query(api.billing.getStatus, {})).toMatchObject({ accessAllowed: false, paidThrough: 0 });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.company))).not.toHaveProperty("planId");
  });

  test("a missed renewal followed by a paid upgrade recovers only that renewed period", async () => {
    const f = await setup(); await f.purchase(); const sub = await subscribe(f);
    const item = sub.items.data[0]; const renewedEnd = END + 30 * 86_400_000;
    vi.mocked(Date.now).mockReturnValue(END);
    item.current_period_start = END / 1000; item.current_period_end = renewedEnd / 1000;
    sub.latest_invoice.id = "in_renewal"; sub.latest_invoice.created = END / 1000;
    sub.latest_invoice.lines.data[0].period = { start: END / 1000, end: renewedEnd / 1000 };
    const renewal = structuredClone(sub.latest_invoice);
    const { offer, price } = await secondOffer(f);
    vi.mocked(Date.now).mockReturnValue(END + 86_400_000); changePrice(sub, price);
    provider.invoices.list.mockResolvedValue({ data: [structuredClone(sub.latest_invoice), renewal], has_more: true });
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.account()).toMatchObject({ offer, paidThrough: renewedEnd });
  });

  test.each([false, true])("missed credited downgrades keep the last paid plan (initial recorded=%s)", async recorded => {
    const f = await setup(); await f.purchase(); const sub = await subscribe(f, "active", true, recorded);
    const originalPrice = sub.items.data[0].price;
    const invoices = [structuredClone(sub.latest_invoice)];
    const { price } = await secondOffer(f);
    vi.mocked(Date.now).mockReturnValue(NOW + 86_400_000); changePrice(sub, price);
    invoices.push(structuredClone(sub.latest_invoice));
    vi.mocked(Date.now).mockReturnValue(NOW + 2 * 86_400_000); changePrice(sub, originalPrice);
    invoices.push(structuredClone(sub.latest_invoice));
    vi.mocked(Date.now).mockReturnValue(NOW + 3 * 86_400_000); changePrice(sub, price, false);
    provider.invoices.list.mockResolvedValue({ data: invoices.reverse(), has_more: false });
    await f.admin.action(api.billingActions.refresh, {});
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.admin.query(api.billing.getStatus, {})).toMatchObject({ accessAllowed: true, paidThrough: END });
    expect(await f.account()).toMatchObject({ offer: { planId: f.ids.plan }, paidInvoice: { id: invoices[0].id } });
  });

  test("an unpaid change keeps the old paid plan and switches only after Stripe confirms payment", async () => {
    const f = await setup(); await f.purchase(); const sub = await subscribe(f);
    const { offer, price } = await secondOffer(f);
    changePrice(sub, price, false);
    sub.status = "past_due";
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.account()).toMatchObject({ offer: { planId: f.ids.plan }, paidThrough: END });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.company))).toMatchObject({ planId: f.ids.plan });
    sub.latest_invoice.status = "paid"; sub.latest_invoice.amount_remaining = 0; sub.status = "active";
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.account()).toMatchObject({ offer, paidThrough: END });
  });

  test("a pending Stripe update does not change current access or extend an unpaid renewal", async () => {
    const f = await setup(); await f.purchase(); const sub = await subscribe(f);
    await secondOffer(f);
    Object.assign(sub, { pending_update: { subscription_items: [{ price: "price_pro" }], expires_at: END / 1000 } });
    sub.latest_invoice.status = "open";
    sub.latest_invoice.lines.data[0].pricing.price_details.price = "price_pro";
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.account()).toMatchObject({ offer: { planId: f.ids.plan }, paidThrough: END });
    vi.mocked(Date.now).mockReturnValue(END);
    expect(await f.admin.query(api.billing.getStatus, {})).toMatchObject({ accessAllowed: false });
  });

  test("a scheduled downgrade preserves the current plan until Stripe applies and bills it", async () => {
    const f = await setup(); await f.purchase(); const sub = await subscribe(f);
    const originalPrice = sub.items.data[0].price;
    const { offer, price } = await secondOffer(f);
    changePrice(sub, price);
    await f.admin.action(api.billingActions.refresh, {});
    Object.assign(sub, { schedule: "sub_sched_downgrade" });
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.account()).toMatchObject({ offer });
    const nextEnd = END + 30 * 86_400_000;
    vi.mocked(Date.now).mockReturnValue(END);
    sub.items.data[0].price = originalPrice;
    sub.items.data[0].current_period_start = END / 1000;
    sub.items.data[0].current_period_end = nextEnd / 1000;
    sub.latest_invoice.status = "open";
    sub.latest_invoice.id = "in_downgrade_renewal";
    sub.latest_invoice.created = END / 1000;
    sub.latest_invoice.billing_reason = "subscription_cycle";
    Object.assign(sub.latest_invoice.lines.data[0], { period: { start: END / 1000, end: nextEnd / 1000 }, amount: 2900 });
    sub.latest_invoice.lines.data[0].pricing.price_details.price = "price_month";
    sub.latest_invoice.lines.data[0].parent.subscription_item_details.proration = false;
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.account()).toMatchObject({ offer, paidThrough: END });
    sub.latest_invoice.status = "paid";
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.account()).toMatchObject({ offer: { planId: f.ids.plan }, paidThrough: nextEnd });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.company))).toMatchObject({ planId: f.ids.plan });
  });

  test("a Stripe-paid immediate downgrade accepts its new-price debit line, not the old-price credit", async () => {
    const f = await setup(); await f.purchase(); const sub = await subscribe(f);
    const originalPrice = sub.items.data[0].price;
    const { price } = await secondOffer(f);
    changePrice(sub, price); await f.admin.action(api.billingActions.refresh, {});
    const oldLine = structuredClone(sub.latest_invoice.lines.data[0]); oldLine.amount = -2950;
    changePrice(sub, originalPrice);
    sub.latest_invoice.lines.data[0].amount = 1450;
    sub.latest_invoice.lines.data.unshift(oldLine);
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.account()).toMatchObject({ offer: { planId: f.ids.plan }, paidThrough: END });
  });

  test.each(["foreign-invoice", "wrong-item", "negative-credit", "unpaid", "wrong-currency", "future-period", "truncated-lines"])("%s cannot approve a plan change", async problem => {
    const f = await setup(); await f.purchase(); const sub = await subscribe(f);
    const { price } = await secondOffer(f); changePrice(sub, price);
    const invoice = sub.latest_invoice; const line = invoice.lines.data[0];
    if (problem === "foreign-invoice") invoice.customer = "cus_other";
    if (problem === "wrong-item") line.parent.subscription_item_details.subscription_item = "si_foreign";
    if (problem === "negative-credit") line.amount = -1;
    if (problem === "unpaid") invoice.status = "open";
    if (problem === "wrong-currency") invoice.currency = "usd";
    if (problem === "future-period") line.period.start = END / 1000;
    if (problem === "truncated-lines") invoice.lines.has_more = true;
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.account()).toMatchObject({ offer: { planId: f.ids.plan }, paidThrough: END });
  });

  test("a paid proration alone cannot establish or renew a paid period", async () => {
    const f = await setup(); await f.purchase(); const sub = await subscribe(f, "active", false);
    const { price } = await secondOffer(f); changePrice(sub, price);
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.account()).toMatchObject({ offer: { planId: f.ids.plan }, paidThrough: 0 });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.company))).not.toHaveProperty("planId");
  });

  test("bounded paid history recovers a change hidden by a newer unpaid invoice", async () => {
    const f = await setup(); await f.purchase(); const sub = await subscribe(f);
    vi.mocked(Date.now).mockReturnValue(NOW + 86_400_000);
    const { offer, price } = await secondOffer(f); changePrice(sub, price);
    provider.invoices.list.mockResolvedValue({ data: [structuredClone(sub.latest_invoice)], has_more: true });
    sub.latest_invoice.status = "open";
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.account()).toMatchObject({ offer, paidThrough: END });
    expect(provider.invoices.list).toHaveBeenCalledWith({ customer: "cus_owned", subscription: "sub_owned", status: "paid", limit: 10 });
  });

  test("old paid invoices cannot buy a second upgrade after a credited downgrade", async () => {
    const f = await setup(); await f.purchase(); const sub = await subscribe(f);
    const originalPrice = sub.items.data[0].price;
    const { price } = await secondOffer(f);
    vi.mocked(Date.now).mockReturnValue(NOW + 86_400_000);
    changePrice(sub, price); await f.admin.action(api.billingActions.refresh, {});
    const oldUpgrade = structuredClone(sub.latest_invoice);
    vi.mocked(Date.now).mockReturnValue(NOW + 2 * 86_400_000);
    changePrice(sub, originalPrice); await f.admin.action(api.billingActions.refresh, {});
    vi.mocked(Date.now).mockReturnValue(NOW + 3 * 86_400_000);
    changePrice(sub, price, false);
    provider.invoices.list.mockResolvedValue({ data: [oldUpgrade], has_more: false });
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.account()).toMatchObject({ offer: { planId: f.ids.plan }, paidThrough: END });
  });

  test.each(["unmapped", "inactive", "cross-currency"])("%s changed prices fail closed", async problem => {
    const f = await setup(); await f.purchase(); const sub = await subscribe(f);
    const { offer, price } = await secondOffer(f); changePrice(sub, price);
    if (problem === "unmapped") Object.assign(config, { offers: config.offers.slice(0, 1) });
    if (problem === "inactive") await f.t.run(ctx => ctx.db.patch(offer.planId, { isActive: false }));
    if (problem === "cross-currency") { price.currency = "usd"; offer.currency = "usd"; }
    await f.admin.action(api.billingActions.refresh, {});
    expect(await f.account()).toMatchObject({ status: "unsupported", paidThrough: 0 });
  });

  test("a target plan disabled after the provider read is rechecked before assignment", async () => {
    const f = await setup(); await f.purchase(); await subscribe(f);
    const { offer } = await secondOffer(f);
    const account = (await f.t.mutation(internal.billingState.acquire, { userId: f.ids.admin }))!;
    await f.t.run(ctx => ctx.db.patch(offer.planId, { isActive: false }));
    await f.t.mutation(internal.billingState.applyProjection, {
      accountId: account._id, revision: account.revision, status: "active", paidThrough: END,
      cancelAtPeriodEnd: false, offer: { ...offer, currency: "gbp" },
    });
    expect(await f.account()).toMatchObject({ status: "unsupported", paidThrough: 0 });
    expect(await f.t.run(ctx => ctx.db.get(f.ids.company))).toMatchObject({ planId: f.ids.plan });
  });

  test("billing references prevent manual reassignment, plan deletion and company deletion", async () => {
    const f = await setup(); await f.purchase(); await subscribe(f);
    const admin = f.t.withIdentity({ subject: f.ids.superAdmin });
    await expect(admin.mutation(api.companies.assignPlanToCompany, { id: f.ids.company })).rejects.toThrow("Stripe manages");
    await expect(admin.mutation(api.plans.deletePlan, { id: f.ids.plan })).rejects.toThrow("referenced by billing");
    await expect(admin.mutation(api.companies.deleteCompany, { id: f.ids.company })).rejects.toThrow("Stripe billing history");
    await expect(admin.mutation(api.companies.setCompanyModules, { id: f.ids.company, enabledModules: ["tasks"] })).resolves.toEqual(["tasks"]);
  });

  test("access deadlines schedule cache invalidation without duplicate expiry jobs", async () => {
    const f = await setup(); await f.purchase(); await subscribe(f);
    const account = (await f.account())!;
    expect(account.accessExpiresAt).toBe(END);
    await f.admin.action(api.billingActions.refresh, {});
    const jobs = await f.t.run(ctx => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs.filter(j => j.name.includes("expireAccess"))).toHaveLength(1);
    await f.t.mutation(internal.billingState.expireAccess, { accountId: account._id, deadline: END });
    expect((await f.account())!.accessCheckedAt).toBeUndefined();
    vi.mocked(Date.now).mockReturnValue(END);
    await f.t.mutation(internal.billingState.expireAccess, { accountId: account._id, deadline: END });
    expect((await f.account())!.accessCheckedAt).toBe(END);
  });
});

test.each(["incomplete", "incomplete_expired", "trialing", "unpaid", "canceled", "paused", "unsupported"])("%s does not grant paid access", status => {
  expect(hasPaidAccess({ status, paidThrough: END }, 2, NOW)).toBe(false);
});
test("paid access expires without a webhook; grace is explicit and never unlimited", () => {
  expect(hasPaidAccess({ status: "active", paidThrough: END }, 2, END)).toBe(false);
  expect(hasPaidAccess({ status: "past_due", paidThrough: END }, 2, END + 86_400_000)).toBe(true);
  expect(hasPaidAccess({ status: "past_due", paidThrough: END }, 0, END)).toBe(false);
  expect(hasPaidAccess({ status: "past_due", paidThrough: 0 }, 30, NOW)).toBe(false);
});
test.each(["https://checkout.stripe.com.evil.example/session", "javascript:alert(1)", "https://user@checkout.stripe.com/session", "http://checkout.stripe.com/session"])("refuses unsafe provider redirect %s", url => {
  expect(() => safeStripeUrl(url, "checkout.stripe.com")).toThrow("valid hosted billing link");
});


test("saved operator configuration drives checkout, reconciliation and the portal while clone defaults stay disabled", async () => {
  const f = await setup();
  const saved = (await f.t.query(internal.billingConfiguration.read, {})).config;
  await f.t.run(ctx => ctx.db.insert("billingSettings", {
    key: "stripe", config: saved,
    revision: 1, updatedBy: f.ids.superAdmin, updatedAt: NOW,
  }));
  Object.assign(config, { enabled: false, offers: [] });
  await expect(f.purchase()).resolves.toContain("checkout.stripe.com");
  await subscribe(f);
  expect(await f.admin.query(api.billing.getStatus, {})).toMatchObject({ enabled: true, accessAllowed: true, planName: "Team" });
  await expect(f.admin.action(api.billingActions.createPortal, {})).resolves.toContain("billing.stripe.com");
});

test("billing actions audit tenant, actor, outcome and safe metadata", async () => {
  const f = await setup();
  await f.purchase();
  provider.billingPortal.sessions.create.mockRejectedValueOnce(new Error("provider-secret-and-private-url"));
  await expect(f.admin.action(api.billingActions.createPortal, {})).rejects.toThrow("Stripe could not complete");
  const logs = await f.t.run(ctx => ctx.db.query("auditLogs").collect());
  const operations = logs.filter(row => row.actionType === "BILLING_OPERATION_FINISHED");
  expect(operations.map(row => JSON.parse(row.metadata!))).toEqual(expect.arrayContaining([
    expect.objectContaining({ source: "checkout", outcome: "succeeded" }),
    expect.objectContaining({ source: "portal", outcome: "failed" }),
  ]));
  for (const row of operations) {
    expect(row.actorId).toBe(f.ids.admin);
    expect(row.companyId).toBe((await f.account())!.companyId);
  }
  expect(JSON.stringify(logs)).not.toMatch(/provider-secret-and-private-url|checkout\.stripe\.com|billing\.stripe\.com/);
});

test("subscription changes are auditable without duplicate changes on reconciliation", async () => {
  const f = await setup();
  await f.purchase();
  await subscribe(f, "active", true, false);
  await f.t.action(internal.billingSync.reconcile, { accountId: (await f.account())!._id, auditProviderEventId: "evt_paid" });
  const changes = () => f.t.run(ctx => ctx.db.query("auditLogs")
    .withIndex("by_action_entity_timestamp", q => q.eq("actionType", "BILLING_SUBSCRIPTION_CHANGED")).collect());
  const before = await changes();
  expect(JSON.parse(before.at(-1)!.metadata!)).toMatchObject({
    source: "webhook", providerEventId: "evt_paid", after: { status: "active" },
  });
  expect(before.at(-1)!.actorId).toBeUndefined();
  await f.t.action(internal.billingSync.reconcile, { accountId: (await f.account())!._id, auditProviderEventId: "evt_paid" });
  expect(await changes()).toHaveLength(before.length);
  for (let i = 0; i < 2; i++) await f.t.mutation(internal.billingConfiguration.recordWebhook, { eventId: "evt_paid", eventType: "invoice.paid" });
  const receipts = await f.t.run(ctx => ctx.db.query("auditLogs")
    .withIndex("by_action_entity_timestamp", q => q.eq("actionType", "BILLING_WEBHOOK_RECEIVED").eq("entityId", "evt_paid")).collect());
  expect(receipts).toHaveLength(1);
});
