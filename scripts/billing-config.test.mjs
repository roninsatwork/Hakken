import { describe, expect, test } from "vitest";
import { parseBillingConfig } from "../billing.config.ts";
import { readBilling } from "./billing-config.mjs";
import { readProduct } from "./product-config.mjs";
import { evaluateProviderRequirements } from "./provider-requirements.mjs";
import { evaluateSetup } from "./validate-setup.mjs";
import { evaluateDeployment } from "./verify-deployment-environment.mjs";

const enabled = () => ({ ...readBilling(), mode: "test", enabled: true, appOrigin: "https://product.example.com", portalConfigurationId: "bpc_portal", recoveryPortalConfigurationId: "bpc_recovery", graceDays: 0,
  offers: [{ key: "team", planId: "plan-id", stripePriceId: "price_team", amountMinor: 2900, currency: "gbp" }],
});

describe("optional billing configuration", () => {
  test("disabled billing does not require Stripe credentials", () => {
    const billing = { ...readBilling(), enabled: false };
    const result = evaluateProviderRequirements(readProduct(), [], { billing });
    expect(result.missingRequired).not.toContain("STRIPE_SECRET_KEY");
  });
  test("enabled Stripe needs both backend secrets, without printing values", () => {
    const billing = parseBillingConfig(enabled());
    expect(evaluateProviderRequirements(readProduct(), [], { billing }).missingRequired).toContain("STRIPE_WEBHOOK_SECRET");
    expect(evaluateDeployment([], [], readProduct(), billing).missingRequired).toContain("STRIPE_SECRET_KEY");
    const result = evaluateSetup({ STRIPE_SECRET_KEY: "sk_live_never_echo" }, readProduct(), { billing });
    expect(result.failures).toContain("STRIPE_SECRET_KEY: wrong billing mode.");
    expect(JSON.stringify(result)).not.toContain("never_echo");
  });
  test.each([
    { graceDays: null }, { graceDays: -1 }, { graceDays: 31 }, { quotaWindow: "subscription-period" },
    { appOrigin: "http://product.example.com" }, { appOrigin: "https://product.example.com/path" },
    { appOrigin: "https://user:password@product.example.com" }, { portalConfigurationId: "" },
    { recoveryPortalConfigurationId: "" }, { recoveryPortalConfigurationId: "bpc_portal" },
    { offers: [] }, { provider: "other" }, { mode: "unknown" }, { secret: "sk_live_never_echo" },
  ])("refuses incomplete or unsupported policy %j", change => {
    expect(() => parseBillingConfig({ ...enabled(), ...change })).toThrow("Invalid hakken.billing.json");
  });
  test("requires unique prices and integer amounts in supported currencies", () => {
    const c = enabled();
    expect(() => parseBillingConfig({ ...c, offers: [c.offers[0], { ...c.offers[0], key: "other" }] })).toThrow();
    for (const change of [{ currency: "jpy" }, { amountMinor: 29.99 }, { stripePriceId: "prod_wrong" }]) {
      expect(() => parseBillingConfig({ ...c, offers: [{ ...c.offers[0], ...change }] })).toThrow();
    }
  });
});
