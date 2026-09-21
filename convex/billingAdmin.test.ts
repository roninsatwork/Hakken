import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import source from "../hakken.billing.json";
import { hasPaidAccess } from "./billingPolicy";

const provider = vi.hoisted(() => ({
  prices: { list: vi.fn(), retrieve: vi.fn() }, balance: { retrieve: vi.fn() },
  billingPortal: { configurations: { create: vi.fn(), retrieve: vi.fn() } },
}));
vi.mock("./billingStripe", async original => ({ ...await original<typeof import("./billingStripe")>(), stripeClient: () => provider }));
const original = structuredClone(source);
const NOW = 1_800_000_000_000;
const monthlyPrice = (id = "price_month", currency = "gbp", unit_amount = 2900) => ({
  id, currency, unit_amount, active: true, livemode: false, type: "recurring", billing_scheme: "per_unit",
  recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, product: { id: "prod_team", name: "Team", active: true },
});
beforeEach(() => {
  vi.clearAllMocks(); vi.spyOn(Date, "now").mockReturnValue(NOW);
  Object.assign(source, { ...original, enabled: false, mode: "test", appOrigin: "https://product.example.com", graceDays: 2, offers: [], portalConfigurationId: "", recoveryPortalConfigurationId: "" });
  provider.prices.retrieve.mockResolvedValue(monthlyPrice());
  provider.prices.list.mockResolvedValue({ data: [monthlyPrice()], has_more: false });
  provider.balance.retrieve.mockResolvedValue({ livemode: false });
  const profiles = new Map<string, unknown>();
  provider.billingPortal.configurations.create.mockImplementation(async args => {
    const profile = { ...args, id: args.features.subscription_update.enabled ? "bpc_sales" : "bpc_recovery", active: true, livemode: false };
    profiles.set(profile.id, profile); return profile;
  });
  provider.billingPortal.configurations.retrieve.mockImplementation(async id => profiles.get(id));
});
afterEach(() => { Object.assign(source, structuredClone(original)); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function setup() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  const ids = await t.run(async ctx => {
    const plan = await ctx.db.insert("plans", { name: "Team", isActive: true, priceGBP: 29, messageLimit: 100, createdAt: NOW });
    const company = await ctx.db.insert("companies", { name: "Paid company", createdAt: NOW });
    const other = await ctx.db.insert("companies", { name: "Other company", createdAt: NOW });
    const operator = await ctx.db.insert("users", { role: "SUPER_ADMIN" });
    const admin = await ctx.db.insert("users", { role: "ADMIN", companyId: company });
    const member = await ctx.db.insert("users", { role: "USER", companyId: company });
    const reader = await ctx.db.insert("users", { role: "READ_ONLY", companyId: company });
    const auditor = await ctx.db.insert("users", { role: "AUDITOR", companyId: company });
    const foreign = await ctx.db.insert("users", { role: "ADMIN", companyId: other });
    const impersonator = await ctx.db.insert("users", { role: "SUPER_ADMIN", companyId: other, impersonatingCompanyId: company });
    return { plan, company, other, operator, admin, member, reader, auditor, foreign, impersonator };
  });
  return { t, ids, operator: t.withIdentity({ subject: ids.operator }) };
}

describe("platform billing authorization", () => {
  test("company roles, other tenants, readers, auditors and impersonation cannot read or change platform billing", async () => {
    const f = await setup();
    for (const subject of [undefined, f.ids.admin, f.ids.member, f.ids.reader, f.ids.auditor, f.ids.foreign, f.ids.impersonator]) {
      const client = subject ? f.t.withIdentity({ subject }) : f.t;
      await expect(client.query(api.billingAdmin.getSettings, {})).rejects.toThrow();
      await expect(client.query(api.billingAdmin.getCompany, { companyId: f.ids.company })).rejects.toThrow();
      await expect(client.query(api.billingAdmin.listCompanies, { paginationOpts: { cursor: null, numItems: 15 } })).rejects.toThrow();
      await expect(client.query(api.billingAdmin.getPlan, { planId: f.ids.plan })).rejects.toThrow();
      await expect(client.action(api.billingMetrics.overview, {})).rejects.toThrow();
      await expect(client.action(api.billingAdminActions.listPrices, {})).rejects.toThrow();
      await expect(client.action(api.billingAdminActions.checkConnection, {})).rejects.toThrow();
      await expect(client.action(api.billingAdminActions.linkPrice, { planId: f.ids.plan, priceId: "price_month", revision: 0 })).rejects.toThrow();
      await expect(client.action(api.billingAdminActions.saveSettings, { enabled: false, mode: "test", appOrigin: "https://product.example.com", graceDays: 2, revision: 0 })).rejects.toThrow();
    }
    expect(provider.prices.retrieve).not.toHaveBeenCalled();
    expect(provider.billingPortal.configurations.create).not.toHaveBeenCalled();
    expect(await f.t.withIdentity({ subject: f.ids.admin }).query(api.billing.getStatus, {})).toMatchObject({ enabled: false });
  });

  test("setup returns credential presence, never credential values", async () => {
    const f = await setup();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_private_fixture"); vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_private_fixture");
    const result = await f.operator.query(api.billingAdmin.getSettings, {});
    expect(result).toMatchObject({ secretKeyPresent: true, webhookSecretPresent: true, secretKeyModeMatches: true, lastWebhookAt: null });
    expect(JSON.stringify(result)).not.toContain("private_fixture");
  });
});

test("a disabled clone can link a verified price and enable billing through saved configuration", async () => {
  const f = await setup();
  await f.operator.action(api.billingAdminActions.linkPrice, { planId: f.ids.plan, priceId: "price_month", revision: 0 });
  expect(provider.billingPortal.configurations.create).not.toHaveBeenCalled();
  await f.operator.action(api.billingAdminActions.saveSettings, { enabled: true, mode: "test", appOrigin: "https://product.example.com", graceDays: 2, revision: 1 });
  const settings = await f.operator.query(api.billingAdmin.getSettings, {});
  expect(settings).toMatchObject({ revision: 2, config: { enabled: true, portalConfigurationId: "bpc_sales", recoveryPortalConfigurationId: "bpc_recovery" } });
  const customer = await f.t.withIdentity({ subject: f.ids.admin }).query(api.billing.getStatus, {});
  expect(customer).toMatchObject({ enabled: true, canCheckout: true, offers: [{ name: "Team", amountMinor: 2900, currency: "gbp" }] });
  expect(source.enabled).toBe(false);
  expect(await f.operator.action(api.billingAdminActions.checkConnection, {})).toEqual({ connected: true, portalReady: true, recoveryReady: true });
  const sales = provider.billingPortal.configurations.create.mock.calls.find(([a]) => a.features.subscription_update.enabled)![0];
  expect(sales.features.subscription_update).toMatchObject({ default_allowed_updates: ["price"], proration_behavior: "always_invoice", billing_cycle_anchor: "unchanged" });
  expect(sales.features.subscription_cancel.mode).toBe("at_period_end");
});

test("stale editors cannot overwrite saved prices", async () => {
  const f = await setup();
  await f.operator.action(api.billingAdminActions.linkPrice, { planId: f.ids.plan, priceId: "price_month", revision: 0 });
  await expect(f.operator.action(api.billingAdminActions.linkPrice, { planId: f.ids.plan, priceId: null, revision: 0 })).rejects.toThrow("changed");
  expect((await f.operator.query(api.billingAdmin.getSettings, {})).config.offers).toHaveLength(1);
});

test.each([
  { recurring: { interval: "year", interval_count: 1, usage_type: "licensed" } },
  { recurring: { interval: "month", interval_count: 1, usage_type: "metered" } },
  { livemode: true }, { active: false }, { currency: "jpy" }, { transform_quantity: { divide_by: 5 } },
  { product: { id: "prod_team", active: false } }, { unit_amount: 0 },
])("unsupported provider prices cannot become offers: %j", async change => {
  const f = await setup(); provider.prices.retrieve.mockResolvedValue({ ...monthlyPrice(), ...change });
  await expect(f.operator.action(api.billingAdminActions.linkPrice, { planId: f.ids.plan, priceId: "price_month", revision: 0 })).rejects.toThrow();
  expect((await f.operator.query(api.billingAdmin.getSettings, {})).config.offers).toEqual([]);
});

test("price picker pages beyond unsupported prices without reporting the first page as the whole catalogue", async () => {
  const f = await setup();
  provider.prices.list.mockResolvedValueOnce({ data: [{ ...monthlyPrice("price_old"), active: false }], has_more: true });
  expect(await f.operator.action(api.billingAdminActions.listPrices, {})).toEqual({ prices: [], cursor: "price_old" });
  expect(await f.operator.action(api.billingAdminActions.listPrices, { cursor: "price_old" })).toMatchObject({ prices: [{ id: "price_month" }], cursor: null });
  expect(provider.prices.list).toHaveBeenLastCalledWith(expect.objectContaining({ starting_after: "price_old", limit: 25 }));
});

test("mode switches and disabling cannot strand existing subscribers", async () => {
  const f = await setup();
  await f.operator.action(api.billingAdminActions.linkPrice, { planId: f.ids.plan, priceId: "price_month", revision: 0 });
  const current = await f.operator.query(api.billingAdmin.getSettings, {});
  await f.t.run(ctx => ctx.db.insert("billingAccounts", { companyId: f.ids.company, mode: "test", status: "active", paidThrough: NOW + 1000, cancelAtPeriodEnd: false, revision: 0, leaseUntil: 0, createdAt: NOW }));
  await expect(f.t.mutation(internal.billingConfiguration.publish, { config: { ...current.config, mode: "live" }, revision: 1, userId: f.ids.operator })).rejects.toThrow("different Stripe mode");
  await f.operator.action(api.billingAdminActions.saveSettings, { enabled: true, mode: "test", appOrigin: "https://product.example.com", graceDays: 2, revision: 1 });
  await expect(f.operator.action(api.billingAdminActions.saveSettings, { enabled: false, mode: "test", appOrigin: "https://product.example.com", graceDays: 2, revision: 2 })).rejects.toThrow("Existing subscribers");
});

test("overview counts paid companies and covered users, excludes grace/expired/test-mode mismatches and separates currencies", async () => {
  const f = await setup();
  await f.t.run(async ctx => {
    const base = { mode: "test" as const, status: "active", paidThrough: NOW + 86_400_000, cancelAtPeriodEnd: false, revision: 0, leaseUntil: 0, createdAt: NOW, reconciledAt: NOW, subscriptionId: "sub_paid" };
    const offer = { key: "team", planId: f.ids.plan, stripePriceId: "price_month", amountMinor: 2900, currency: "gbp" as const };
    await ctx.db.insert("billingAccounts", { ...base, companyId: f.ids.company, offer, cancelAtPeriodEnd: true });
    await ctx.db.insert("users", { role: "USER", companyId: f.ids.company, isAnonymous: true });
    for (const [i, change] of [
      { status: "past_due", paidThrough: NOW - 1 }, { status: "active", paidThrough: NOW - 1 },
      { mode: "live" as const }, { status: "canceled" }, { status: "incomplete", paidThrough: 0 },
      { offer: { ...offer, currency: "eur" as const, amountMinor: 4900 } },
    ].entries()) {
      const companyId = await ctx.db.insert("companies", { name: `Fixture ${i}`, createdAt: NOW });
      await ctx.db.insert("users", { companyId, role: "USER" });
      await ctx.db.insert("billingAccounts", { ...base, offer, ...change, companyId });
    }
  });
  expect(await f.operator.action(api.billingMetrics.overview, {})).toMatchObject({
    paidCompanies: 2, paidUsers: 3, totalUsers: 9, totalCompanies: 8, billingAccounts: 6,
    paymentIssues: 2, pending: 1, canceled: 1, cancelling: 1,
    monthlyValue: [{ currency: "eur", amountMinor: 4900 }, { currency: "gbp", amountMinor: 2900 }],
  });
});

test("report walks beyond a database page and company search stays paginated", async () => {
  const f = await setup();
  await f.t.run(async ctx => {
    for (let i = 0; i < 510; i++) await ctx.db.insert("users", { companyId: f.ids.company, role: "USER" });
    for (let i = 0; i < 255; i++) {
      const companyId = await ctx.db.insert("companies", { name: `Subscriber ${i}`, createdAt: NOW });
      await ctx.db.insert("billingAccounts", { companyId, mode: "test", status: "pending", paidThrough: 0, cancelAtPeriodEnd: false, revision: 0, leaseUntil: 0, createdAt: NOW });
    }
  });
  expect(await f.operator.action(api.billingMetrics.overview, {})).toMatchObject({ totalUsers: 513, totalCompanies: 257, billingAccounts: 255, pending: 255 });
  const page = await f.operator.query(api.billingAdmin.listCompanies, { searchTerm: "Subscriber", paginationOpts: { cursor: null, numItems: 15 } });
  expect(page.page).toHaveLength(15); expect(page.isDone).toBe(false);
  const second = await f.operator.query(api.billingAdmin.listCompanies, { searchTerm: "Subscriber", paginationOpts: { cursor: page.continueCursor, numItems: 15 } });
  expect(new Set([...page.page, ...second.page].map(c => c.companyId)).size).toBe(30);
});

test("stored grace deadline cannot be extended by a config edit without an expiry job", () => {
  expect(hasPaidAccess({ status: "past_due", paidThrough: NOW - 1000, accessExpiresAt: NOW - 1 }, 30, NOW)).toBe(false);
});


test("historical Stripe prices cannot be reassigned to a different product plan", async () => {
  const f = await setup();
  const second = await f.t.run(async ctx => {
    const plan = await ctx.db.insert("plans", { name: "Other plan", isActive: true, priceGBP: 50, messageLimit: 200, createdAt: NOW });
    const accountId = await ctx.db.insert("billingAccounts", { companyId: f.ids.company, mode: "test", status: "pending", paidThrough: 0, cancelAtPeriodEnd: false, revision: 0, leaseUntil: 0, createdAt: NOW });
    await ctx.db.insert("billingCheckouts", { accountId, offer: { key: "original", planId: f.ids.plan, stripePriceId: "price_month", amountMinor: 2900, currency: "gbp" }, returnUrl: "https://product.example.com/app/settings/billing", expiresAt: NOW - 1, createdAt: NOW - 1000 });
    return plan;
  });
  await expect(f.operator.action(api.billingAdminActions.linkPrice, { planId: second, priceId: "price_month", revision: 0 })).rejects.toThrow("different product plan");
  expect((await f.operator.query(api.billingAdmin.getSettings, {})).config.offers).toEqual([]);
});
