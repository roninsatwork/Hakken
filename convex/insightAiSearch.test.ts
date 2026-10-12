import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { aiSearchView } from "./insightAiSearch";
import { SOURCE_JOIN } from "./utils/insightHistory";

/**
 * AI search over time (insightAiSearch.ts, phase 5): the visits each
 * assistant sent from the history, the newest three months against the three
 * before and a year ago, and each assistant's answers to the company's
 * questions naming it and its rival — read only by the company's own people.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => {
  useFixedDay("2026-10-12");
});

afterEach(() => {
  vi.useRealTimers();
});

const monthEnd = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
};

async function seeded(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const otherId = await ctx.db.insert("companies", { name: "Rival", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const rivalId = await ctx.db.insert("websites", { host: "rival-shop.test", displayHost: "rival-shop.test", firstSeenAt: 1 });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: 2826, createdAt: 1 });
    await ctx.db.insert("companyWebsites", { companyId, websiteId: rivalId, relationship: "TRACKED", againstWebsiteId: websiteId, createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme-shop.test", role: "ADMIN", companyId, createdAt: 1 });
    const strangerId = await ctx.db.insert("users", { name: "Stranger", email: "someone@rival.test", role: "ADMIN", companyId: otherId, createdAt: 1 });
    // ChatGPT's visits a month: 10 a month a year ago, 8 in the spring, 2 now.
    const visits: Record<string, number> = { "2025-07": 10, "2025-08": 10, "2025-09": 10, "2026-04": 8, "2026-05": 8, "2026-06": 8, "2026-07": 2, "2026-08": 2, "2026-09": 2 };
    for (const [month, count] of Object.entries(visits)) {
      const span = { month, from: `${month}-01`, to: monthEnd(month) };
      await ctx.db.insert("insightHistory", { companyWebsiteId: holdId, kind: "GA_SOURCES", ...span, rows: [{ key: ["Referral", "chatgpt.com"].join(SOURCE_JOIN), visits: count, enquiries: month === "2026-09" ? 1 : 0 }, { key: ["Organic Search", "google"].join(SOURCE_JOIN), visits: 100, enquiries: 3 }], fetchedAt: 1 });
      await ctx.db.insert("insightHistory", { companyWebsiteId: holdId, kind: "GA_PAGES", ...span, rows: [{ key: "/", visits: 100 + count, enquiries: 3 }], fetchedAt: 1 });
    }
    // Perplexity's answers to the company's questions in October: 20 asked, 9 naming it, 4 naming the rival.
    await ctx.db.insert("siteListAiDays", { companyWebsiteId: holdId, askerWebsiteId: websiteId, locationCode: 2826, websiteId, day: "2026-10-05", ai: [{ engine: "perplexity", asked: 20, named: 9, recommended: 7 }], updatedAt: 1 });
    await ctx.db.insert("siteListAiDays", { companyWebsiteId: holdId, askerWebsiteId: websiteId, locationCode: 2826, websiteId: rivalId, day: "2026-10-05", ai: [{ engine: "perplexity", asked: 0, named: 4, recommended: 4 }], updatedAt: 1 });
    return { holdId, userId, strangerId };
  });
}

describe("AI search over time", () => {
  test("each assistant's visits against the three months before and a year ago, and its answers naming you and your rival", async () => {
    const t = harness();
    const { holdId } = await seeded(t);
    const view = await t.run(async (ctx) => await aiSearchView(ctx, (await ctx.db.get(holdId))!, "acme-shop.test"));
    expect(view?.windows).toMatchObject({ now: { visits: 6, enquiries: 1 }, before: { visits: 24 }, yearAgo: { visits: 30 } });
    expect(view?.assistants).toEqual([{ name: "ChatGPT", now: 6, before: 24, yearAgo: 30, enquiries: 1 }]);
    expect(view?.sites.map((site) => [site.host, site.own, site.months])).toEqual([
      ["acme-shop.test", true, [{ month: "2026-10", engine: "perplexity", asked: 20, named: 9, recommended: 7, cited: 0 }]],
      ["rival-shop.test", false, [{ month: "2026-10", engine: "perplexity", asked: 0, named: 4, recommended: 4, cited: 0 }]],
    ]);
    expect(view?.since).toBe("2026-10-05");
    // Neither Google's AI nor ChatGPT's mentions are bought while their switches are off.
    expect(view?.radar).toBeNull();
    expect(view?.chatgpt).toBeNull();
  });

  test("another company reads none of it", async () => {
    const t = harness();
    const { holdId, strangerId } = await seeded(t);
    expect(await t.withIdentity({ subject: strangerId }).query(api.insightAiSearch.insightsAiSearch, {})).toBeNull();
    await expect(t.withIdentity({ subject: strangerId }).query(api.insightAiSearch.insightsAiSearch, { siteId: holdId })).rejects.toThrow();
  });
});
