/** Non-secret deployment configuration. Prices and company bindings never come from a browser. */
export type BillingOffer = {
  key: string;
  planId: string;
  stripePriceId: string;
  amountMinor: number;
  currency: "gbp" | "eur" | "usd";
};
export type BillingConfig = {
  schemaVersion: 1;
  enabled: boolean;
  provider: "stripe";
  mode: "test" | "live";
  appOrigin: string;
  portalConfigurationId: string;
  recoveryPortalConfigurationId: string;
  graceDays: number | null;
  quotaWindow: "calendar-month";
  offers: BillingOffer[];
};

export function parseBillingConfig(input: unknown): BillingConfig {
  const fail = (): never => { throw new Error("Invalid hakken.billing.json; see the Stripe billing setup guide."); };
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail();
  const c = input as Record<string, unknown>;
  const keys = ["schemaVersion", "enabled", "provider", "mode", "appOrigin", "portalConfigurationId", "recoveryPortalConfigurationId", "graceDays", "quotaWindow", "offers"];
  if (Object.keys(c).length !== keys.length || keys.some(key => !(key in c))) return fail();
  if (c.schemaVersion !== 1 || typeof c.enabled !== "boolean" || c.provider !== "stripe" || !["test", "live"].includes(String(c.mode))) return fail();
  if (typeof c.appOrigin !== "string" || typeof c.portalConfigurationId !== "string" || typeof c.recoveryPortalConfigurationId !== "string" || c.quotaWindow !== "calendar-month") return fail();
  if (c.graceDays !== null && (!Number.isInteger(c.graceDays) || Number(c.graceDays) < 0 || Number(c.graceDays) > 30)) return fail();
  if (!Array.isArray(c.offers) || c.offers.length > 25) return fail();
  const seen = new Set<string>();
  const prices = new Set<string>();
  for (const item of c.offers) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail();
    const o = item as Record<string, unknown>;
    if (Object.keys(o).length !== 5 || !["key", "planId", "stripePriceId", "amountMinor", "currency"].every(key => key in o)) return fail();
    if (typeof o.key !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(o.key) || seen.has(o.key)) return fail();
    if (typeof o.planId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(o.planId)) return fail();
    if (typeof o.stripePriceId !== "string" || !/^price_[a-zA-Z0-9]+$/.test(o.stripePriceId) || prices.has(o.stripePriceId)) return fail();
    if (!Number.isSafeInteger(o.amountMinor) || Number(o.amountMinor) <= 0 || !["gbp", "eur", "usd"].includes(String(o.currency))) return fail();
    seen.add(o.key);
    prices.add(o.stripePriceId);
  }
  if (c.enabled) {
    if (c.graceDays === null || c.offers.length === 0 || !/^bpc_[a-zA-Z0-9]+$/.test(c.portalConfigurationId) ||
        !/^bpc_[a-zA-Z0-9]+$/.test(c.recoveryPortalConfigurationId) || c.recoveryPortalConfigurationId === c.portalConfigurationId) return fail();
    let url: URL;
    try { url = new URL(c.appOrigin); } catch { return fail(); }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.origin !== c.appOrigin || url.username || url.password || (url.protocol !== "https:" && !(c.mode === "test" && local && url.protocol === "http:"))) return fail();
  }
  return c as BillingConfig;
}
