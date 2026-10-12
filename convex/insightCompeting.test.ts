import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { competingGroups, type CompetingPair } from "./utils/insightCompeting";

/**
 * Keyword cannibalisation kept (insightCompeting.ts, phase 3): the week's
 * groups replace the last, their searches' volumes are asked of DataForSEO
 * once, and only the company's own people read them.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => {
  useFixedDay("2026-10-12");
});

afterEach(() => {
  vi.useRealTimers();
});

const pair = (search: string, page: string, impressions: number): CompetingPair => ({ search, page, clicks: 0, impressions });

/** One group: two branding pages splitting five searches, none with a volume yet. */
function group() {
  const pairs = ["brand agency", "branding agency", "brand design agency", "brand identity agency", "branding company"]
    .flatMap((search) => [pair(search, "/brand-identity-agency/", 500), pair(search, "/brand-design-agency/", 400)]);
  return competingGroups({
    pairs, brandSearches: new Set(), brandWords: [], searchOf: () => ({ position: 14, volume: null }),
    pageOf: () => ({ kind: "Service", type: "SERVICE", visits: 10, enquiries: 0, recent: 0, recentBefore: null, shownAll: 3_000 }),
    clickRates: { top3: 0.1 }, websiteRate: 0.04, months: 3,
  })[0];
}

async function seeded(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const otherId = await ctx.db.insert("companies", { name: "Rival", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme-shop.test", role: "ADMIN", companyId, createdAt: 1 });
    const strangerId = await ctx.db.insert("users", { name: "Stranger", email: "someone@rival.test", role: "ADMIN", companyId: otherId, createdAt: 1 });
    return { holdId, userId, strangerId };
  });
}

describe("keyword cannibalisation kept", () => {
  test("the week's groups replace the last, and their searches' volumes are asked for once", async () => {
    const t = harness();
    const { holdId, userId } = await seeded(t);
    const kept = group();
    const args = { holdId, week: "2026-10-12", from: "2026-07-13", to: "2026-10-10", groups: [{ group: kept }] };
    expect(await t.mutation(internal.insightCompeting.saveGroups, args)).toEqual({ saved: 1, volumesAsked: 5 });
    // Asked again the same day: the groups are written over, the volumes not bought twice.
    expect(await t.mutation(internal.insightCompeting.saveGroups, args)).toEqual({ saved: 1, volumesAsked: 5 });
    const pulls = await t.run(async (ctx) => await ctx.db.query("seoDataPulls").take(10));
    expect(pulls).toHaveLength(1);
    expect(JSON.parse(pulls[0].taskArgsJson)).toMatchObject({ keywords: ["brand agency", "brand design agency", "brand identity agency", "branding agency", "branding company"], language_code: "en" });

    const list = await t.withIdentity({ subject: userId }).query(api.insightCompeting.insightsCannibalisation, {});
    expect(list?.groups.map((row) => [row.rank, row.group.owner, row.group.split])).toEqual([[1, "/brand-identity-agency/", 5]]);
    const one = await t.withIdentity({ subject: userId }).query(api.insightCompeting.insightsCompetingGroup, { key: kept.key });
    // Each page owns the searches its own words fit: "brand design agency" is /brand-design-agency/'s.
    expect(one?.kept?.group.pages.map((page) => [page.decision, page.owns])).toEqual([["OWNER", 4], ["OWNER", 1]]);
    expect(one?.finding).toBeNull();
  });

  test("another company reads none of them", async () => {
    const t = harness();
    const { holdId, strangerId } = await seeded(t);
    await t.mutation(internal.insightCompeting.saveGroups, { holdId, week: "2026-10-12", from: "2026-07-13", to: "2026-10-10", groups: [{ group: group() }] });
    expect(await t.withIdentity({ subject: strangerId }).query(api.insightCompeting.insightsCannibalisation, {})).toBeNull();
    await expect(t.withIdentity({ subject: strangerId }).query(api.insightCompeting.insightsCannibalisation, { siteId: holdId })).rejects.toThrow();
  });
});
