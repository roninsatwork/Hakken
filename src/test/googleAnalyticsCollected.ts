import type { TestConvex } from "convex-test";
import { api, internal } from "@/convex/_generated/api";
import type schema from "@/convex/schema";
import { finishScheduled } from "./finishScheduled";
import { seedGoogleSignIn } from "./googleGrant";
import { PROPERTY, fakeGoogle, type Visit } from "./googleAnalyticsFake";

/**
 * A website collected from a fake Google Analytics log (`googleAnalyticsFake.ts`):
 * Acme's own website, connected, its key events listed — generate_lead worth
 * £250 in Hakken, click_tel with no value, sign_up worth Analytics' own £10,
 * all three counted, and form_submit listed but not counted — then collected
 * whole, and its two years filled as its first night does
 * (ga-big-site-reliability-plan.md BR7). With a rival company's admin, to
 * prove a read is the caller's own.
 * The token's encryption is the test's to hand in (`connectorTokenCrypto`), as
 * `seedGoogleSignIn` takes it: this folder never imports a Convex module.
 */
/**
 * A website counted by Google's own counts already, its finished periods fetched and settled on 9 October: for a test
 * that reads none of them, so its runs ask the periods still going alone (AGENTS.md: a test asks no more than its
 * assertions read; calendar-periods-plan.md, phase 6).
 */
export const FINISHED_ON_9_OCTOBER = {
  countedWith: "EVENT_COUNT",
  periodsFetched: [
    { key: "lastWeek", from: "2026-09-28", settled: true },
    { key: "lastMonth", from: "2026-09-01", settled: true },
    { key: "lastQuarter", from: "2026-07-01", settled: true },
  ],
};

export async function collectedWebsite(
  t: TestConvex<typeof schema>,
  visits: Visit[],
  encryptConnectorToken: Parameters<typeof seedGoogleSignIn>[1],
  /**
   * `firstNight: false`: only connected and collected, its two years not filled yet. `connection`: fields set on the
   * connection before it is collected — the finished periods fetched already, say, for a test that reads none of them.
   */
  options: { firstNight?: boolean; connection?: { periodsFetched?: Array<{ key: string; from: string; settled: boolean }>; countedWith?: string } } = {},
) {
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme-shop.test", role: "ADMIN", companyId, createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "User", email: "user@acme-shop.test", role: "USER", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const connectionId = await ctx.db.insert("googleAnalyticsConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "COUNTING", property: PROPERTY, propertyName: "Acme",
      stream: "https://www.acme-shop.test", addresses: ["www.acme-shop.test"], otherAddresses: [], timeZone: "Europe/London", currency: "GBP", eventsReadAt: 1, listedWith: "EVENT_COUNT_ADDRESSES",
      events: [
        { eventName: "generate_lead", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 0 },
        { eventName: "click_tel", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 0 },
        { eventName: "sign_up", counted: true, analyticsValue: 10, hakkenValue: null, lastThirtyDays: 0 },
        { eventName: "form_submit", counted: false, analyticsValue: null, hakkenValue: null, lastThirtyDays: 0 },
      ],
      ...options.connection,
      createdAt: 1, updatedAt: 1,
    });
    await seedGoogleSignIn(ctx, encryptConnectorToken, { companyWebsiteId: siteId, connectionId });
    await ctx.db.insert("agents", {
      name: "Google Analytics: Collector Agent", modelId: "model-test", thinkingMode: false, isActive: true,
      systemKey: "GOOGLE_ANALYTICS_COLLECTOR", createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("users", { name: "Super", email: "super@platform.test", role: "SUPER_ADMIN", createdAt: 1 });
    const rivalCompany = await ctx.db.insert("companies", { name: "Rival", createdAt: 1 });
    const rivalId = await ctx.db.insert("users", { name: "Rival", email: "rival@rival.test", role: "ADMIN", companyId: rivalCompany, createdAt: 1 });
    return { siteId, connectionId, adminId, userId, rivalId };
  });
  const google = fakeGoogle(visits);
  const admin = t.withIdentity({ subject: ids.adminId });
  await admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, {
    siteId: ids.siteId,
    events: [
      { eventName: "generate_lead", counted: true, hakkenValue: 250 },
      { eventName: "click_tel", counted: true, hakkenValue: null },
      { eventName: "sign_up", counted: true, hakkenValue: null },
      { eventName: "form_submit", counted: false, hakkenValue: null },
    ],
  });
  await finishScheduled(t);
  // The first night: the two-year fills follow its run (BR7).
  if (options.firstNight !== false) {
    await t.mutation(internal.googleAnalyticsFillAfter.startFills, { connectionId: ids.connectionId });
    await finishScheduled(t);
  }
  return { ...ids, google, admin, user: t.withIdentity({ subject: ids.userId }), rival: t.withIdentity({ subject: ids.rivalId }) };
}
