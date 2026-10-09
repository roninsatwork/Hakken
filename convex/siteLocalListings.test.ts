import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { LISTING_FIND_OPERATION, BUSINESS_PROFILE_OPERATION, emptyIsAnAnswer, BUSINESS_QUESTIONS_OPERATION, MAP_CHECK_OPERATION } from "./dataForSeoLocalOperations";

/**
 * Discovery → Your listings (discovery-local-reputation-ai-plan.md, D3, D16,
 * D19): Find buys one search only while the company has Local on; a listing
 * linked as an office is read whole at once, within the website's limit of
 * offices; nothing reaches another company's website; and the queue keeps a
 * Local purchase while Local is on, whether or not the company's runs are.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function company(t: Harness, name: string, options: { local?: boolean; collecting?: boolean } = {}) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name, createdAt: Date.now() });
    const userId = await ctx.db.insert("users", { name: `${name} member`, email: `${name.toLowerCase()}@test.com`, role: "ADMIN" as const, companyId, createdAt: Date.now() });
    if (options.local !== false) await ctx.db.insert("collectionParts", { companyId, local: true, updatedAt: Date.now() });
    await ctx.db.insert("schedules", { name: "Collection", companyId, intervalStr: "weekly", isActive: options.collecting !== false, createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: `${name.toLowerCase()}.test`, displayHost: `${name.toLowerCase()}.test`, firstSeenAt: Date.now() });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
    return { companyId, userId, siteId };
  });
}

async function collector(t: Harness) {
  await t.run(async (ctx) => await ctx.db.insert("agents", {
    name: "DataForSEO Collector", modelId: "model-test", thinkingMode: false, isActive: true, systemKey: "DATAFORSEO_COLLECTOR",
    createdAt: Date.now(), updatedAt: Date.now(),
  }));
}

const pullsOf = (t: Harness, operationId: string) => t.run(async (ctx) => (await ctx.db.query("seoDataPulls").collect()).filter((pull) => pull.operationId === operationId));

describe("Find", () => {
  test("is refused while Local is off for the company, and buys nothing", async () => {
    const t = harness();
    await collector(t);
    const off = await company(t, "Off", { local: false });
    await expect(t.withIdentity({ subject: off.userId }).mutation(api.siteLocalListings.findListing, { siteId: off.siteId, source: "GOOGLE", text: "Off Guildford" }))
      .rejects.toThrow(/Local is not switched on/);
    expect(await pullsOf(t, LISTING_FIND_OPERATION)).toEqual([]);
  });

  test("buys one search on Maps, shared by a second find of the same words that day, while the runs are off", async () => {
    const t = harness();
    await collector(t);
    const ronins = await company(t, "Ronins", { collecting: false });
    const asRonins = t.withIdentity({ subject: ronins.userId });
    await asRonins.mutation(api.siteLocalListings.findListing, { siteId: ronins.siteId, source: "GOOGLE", text: "  Ronins   Guildford " });
    await asRonins.mutation(api.siteLocalListings.findListing, { siteId: ronins.siteId, source: "GOOGLE", text: "Ronins Guildford" });
    const pulls = await pullsOf(t, LISTING_FIND_OPERATION);
    expect(pulls).toHaveLength(1);
    expect(JSON.parse(pulls[0].taskArgsJson)).toEqual({ keyword: "Ronins Guildford", location_code: 2826, language_code: "en", depth: 20 });
    const view = await asRonins.query(api.siteLocalListings.localListings, { siteId: ronins.siteId });
    expect(view.finds).toHaveLength(1);
    expect(view.finds[0]).toMatchObject({ name: "Ronins Guildford", looking: true });
    // The queue keeps it: Local is on, though the company's runs are off.
    const claimed = await t.mutation(internal.seoCollectionQueue.claimSeoBatch, { workerId: "test" });
    expect(claimed.pulls.map((pull) => pull.pullId)).toEqual([pulls[0]._id]);
  });

  test("nobody reaches another company's website", async () => {
    const t = harness();
    await collector(t);
    const ronins = await company(t, "Ronins");
    const other = await company(t, "Other");
    await expect(t.withIdentity({ subject: other.userId }).mutation(api.siteLocalListings.findListing, { siteId: ronins.siteId, source: "GOOGLE", text: "Ronins Guildford" }))
      .rejects.toThrow();
    await expect(t.withIdentity({ subject: other.userId }).query(api.siteLocalListings.localListings, { siteId: ronins.siteId })).rejects.toThrow();
  });
});

describe("linking", () => {
  test("an office is read whole at once, and past the website's limit of offices a link is refused", async () => {
    const t = harness();
    await collector(t);
    const ronins = await company(t, "Ronins");
    await t.run(async (ctx) => await ctx.db.insert("fanOutLimits", { companyId: ronins.companyId, localOffices: 1, updatedAt: Date.now() }));
    const [guildford, london] = await t.run(async (ctx) => await Promise.all(["1", "2"].map((key) => ctx.db.insert("listings", {
      source: "GOOGLE", key, name: `Ronins ${key}`, seenAt: Date.now(),
    }))));
    const asRonins = t.withIdentity({ subject: ronins.userId });
    await asRonins.mutation(api.siteLocalListings.linkListing, { siteId: ronins.siteId, listingId: guildford, role: "OWN" });
    expect(await pullsOf(t, BUSINESS_PROFILE_OPERATION)).toHaveLength(1);
    await expect(asRonins.mutation(api.siteLocalListings.linkListing, { siteId: ronins.siteId, listingId: london, role: "OWN" }))
      .rejects.toThrow(/1 offices/);
    // Watched as a rival instead, against the one office.
    await asRonins.mutation(api.siteLocalListings.linkListing, { siteId: ronins.siteId, listingId: london, role: "RIVAL" });
    const view = await asRonins.query(api.siteLocalListings.localListings, { siteId: ronins.siteId });
    expect(view.offices.map((row) => row.name)).toEqual(["Ronins 1"]);
    expect(view.rivals).toEqual([expect.objectContaining({ name: "Ronins 2", againstName: "Ronins 1" })]);

    await asRonins.mutation(api.siteLocalListings.unlinkListing, { siteId: ronins.siteId, listingId: guildford });
    const after = await asRonins.query(api.siteLocalListings.localListings, { siteId: ronins.siteId });
    expect(after.offices).toEqual([]);
    expect(after.rivals[0].againstName).toBeNull();
  });
});

test("an empty answer is an answer where nothing is a fact: no posts, no questions, not on Trustpilot", () => {
  expect(emptyIsAnAnswer(BUSINESS_QUESTIONS_OPERATION)).toBe(true);
  expect(emptyIsAnAnswer(MAP_CHECK_OPERATION)).toBe(false);
});
