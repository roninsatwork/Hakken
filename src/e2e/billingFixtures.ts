/** Deterministic browser fixtures, never provider or production data. Backend tests prove authorization. */
export const billingSettingsFixture = {
  config: { schemaVersion: 1, enabled: false, provider: "stripe", mode: "test", appOrigin: "https://product.example.com",
    portalConfigurationId: "", recoveryPortalConfigurationId: "", graceDays: 0, quotaWindow: "calendar-month", offers: [] },
  revision: 0, secretKeyPresent: false, secretKeyModeMatches: false, webhookSecretPresent: false,
  webhookUrl: "https://e2e-placeholder.convex.site/stripe/webhook", lastWebhookAt: null, hasAccounts: false,
};
export const companyBillingFixture = {
  companyId: "company_e2e", companyName: "E2E Company", status: "active", planName: "Pro", managed: true,
  mode: "test", paidThrough: 1_801_000_000_000, accessAllowed: true, cancelAtPeriodEnd: false,
  amountMinor: 9900, currency: "gbp", syncedAt: 1_800_000_000_000, stripeUrl: "https://dashboard.stripe.com/test/customers/cus_fixture",
};
export const customerBillingFixture = {
  enabled: true, managed: true, canCheckout: false, hasCustomer: true, status: "active", accessAllowed: true,
  paidThrough: 1_801_000_000_000, cancelAtPeriodEnd: false, planName: "Pro",
  offers: [{ key: "pro", name: "Pro", amountMinor: 9900, currency: "gbp" }],
};
export const billingActionFixtures: Record<string, () => Promise<unknown>> = {
  "billingMetrics:overview": async () => ({ startedAt: 1_800_000_000_000, completedAt: 1_800_000_000_000, mode: "test",
    totalCompanies: 8, paidCompanies: 3, paidUsers: 18, totalUsers: 42, billingAccounts: 6,
    paymentIssues: 1, pending: 1, canceled: 1, cancelling: 1, staleAccounts: 0,
    monthlyValue: [{ currency: "gbp", amountMinor: 29700 }] }),
  "billingAdminActions:listPrices": async () => ({ prices: [{ id: "price_fixture", name: "Pro monthly", amountMinor: 9900, currency: "gbp" }], cursor: null }),
  "billingAdminActions:checkConnection": async () => { throw new Error("Fixture credentials are not configured."); },
};
