import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";
import {
  BUSINESS_POSTS_OPERATION,
  BUSINESS_PROFILE_OPERATION,
  BUSINESS_QUESTIONS_OPERATION,
  LISTING_FIND_OPERATION,
  LOCAL_MARKET_OPERATION,
  MAP_CHECK_OPERATION,
  businessPostsParams,
  businessProfileParams,
  listingFindParams,
  localMarketParams,
  mapCheckParams,
} from "./dataForSeoLocalOperations";
import { officesForSearch } from "./localPlanning";

/**
 * Discovery's Local filing and planning (discovery-local-reputation-ai-plan.md,
 * step 1): each answer filed once into shared records, nothing written when
 * nothing changed (rule 11), an office's place kept for each search, rivals
 * matched to the company's competitors, and nothing planned until the company
 * has Local switched on (D16). The answers are the shapes bought on
 * 2026-10-09, written by hand; nothing here calls the supplier.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

beforeEach(() => useFixedDay());
afterEach(() => vi.useRealTimers());

const GUILDFORD = { latitude: 51.2387555, longitude: -0.5647509 };
const POINT = "51.23876,-0.56475";
const DAILY = JSON.stringify({ version: 2, kind: "recurring", cadence: "daily", timeLocal: "09:00", timezone: "UTC" });

const business = (cid: string, title: string, extra: Record<string, unknown> = {}) => ({
  type: "business_listing", cid, title, category: "Web Designer", category_ids: ["website_designer"],
  address_info: { city: "Guildford" }, rating: { value: 4.8, votes_count: 12 }, total_photos: 9, is_claimed: true, ...extra,
});
const ronins = (extra: Record<string, unknown> = {}) => business("17195342752822652591", "Ronins", {
  type: "google_business_info", domain: "www.ronins.co.uk", ...GUILDFORD, additional_categories: ["Branding agency"], ...extra,
});

async function fileAnswer(t: Harness, operationId: string, params: Record<string, unknown>, result: unknown, family = "Business Data") {
  const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId, family, mode: "LIVE", status: "READY", tag: operationId,
    taskArgsJson: JSON.stringify(params), resultJson: JSON.stringify(result),
    attempts: 0, costUsd: 0.005, sandbox: false, submittedAt: Date.now(), completedAt: Date.now(),
  } as never));
  await t.action(internal.seoCollectionParse.parseSeoResult, { pullId });
  return pullId;
}

/** Ronins with Local switched on, collecting daily, one website, its Guildford office linked. */
async function company(t: Harness, options: { local?: boolean; office?: boolean } = {}) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: Date.now() });
    await ctx.db.insert("schedules", { name: "Collection", companyId, intervalStr: DAILY, isActive: true, createdAt: Date.now() } as never);
    if (options.local !== false) await ctx.db.insert("collectionParts", { companyId, local: true, updatedAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: 2826, createdAt: Date.now() });
    let officeId: Id<"listings"> | null = null;
    if (options.office !== false) {
      officeId = await ctx.db.insert("listings", {
        source: "GOOGLE", key: "17195342752822652591", name: "Ronins", town: "Guildford", point: POINT, ...GUILDFORD,
        category: "Web Designer", categoryIds: ["website_designer"], seenAt: Date.now(),
      });
      await ctx.db.insert("holdListings", { companyWebsiteId: holdId, companyId, listingId: officeId, role: "OWN", addedFrom: "HAND", createdAt: Date.now() });
    }
    return { companyId, websiteId, holdId, officeId };
  });
}

const listingsNamed = (t: Harness, name: string) => t.run(async (ctx) => (await ctx.db.query("listings").collect()).filter((row) => row.name === name));

describe("filing", () => {
  test("a find on Maps files each business and tells the find what it found", async () => {
    const t = harness();
    const { companyId, holdId } = await company(t, { office: false });
    const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
      operationId: LISTING_FIND_OPERATION, family: "SERP", mode: "LIVE", status: "PENDING", tag: "find",
      taskArgsJson: JSON.stringify(listingFindParams("Ronins Guildford")), attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    } as never));
    await t.run(async (ctx) => await ctx.db.insert("listingFinds", { companyWebsiteId: holdId, companyId, source: "GOOGLE", name: "Ronins", pullId, found: [], createdAt: Date.now() }));
    await t.run(async (ctx) => await ctx.db.patch(pullId, {
      status: "READY", resultJson: JSON.stringify([{ items: [ronins({ type: "maps_search" }), business("14141435933897419818", "Ronins Group", { type: "maps_search" })] }]),
    } as never));

    await t.action(internal.seoCollectionParse.parseSeoResult, { pullId });

    const find = await t.run(async (ctx) => (await ctx.db.query("listingFinds").collect())[0]);
    expect(find.found).toHaveLength(2);
    expect(find.filedAt).toBeDefined();
    const [listing] = await listingsNamed(t, "Ronins");
    expect(listing).toMatchObject({ town: "Guildford", point: POINT, websiteHost: "ronins.co.uk" });
    expect(listing.profileReadAt).toBeUndefined();
  });

  test("a profile read twice the same week changes only when it was read; a new category is a line of its activity", async () => {
    const t = harness();
    await company(t);
    const params = businessProfileParams("17195342752822652591");
    await fileAnswer(t, BUSINESS_PROFILE_OPERATION, params, [{ items: [ronins()] }]);
    const first = (await listingsNamed(t, "Ronins"))[0];
    const weeks = await t.run(async (ctx) => (await ctx.db.query("listingWeeks").collect())[0]);
    expect(first.profileReadAt).toBeDefined();

    vi.advanceTimersByTime(60_000);
    await fileAnswer(t, BUSINESS_PROFILE_OPERATION, params, [{ items: [ronins()] }]);
    const again = (await listingsNamed(t, "Ronins"))[0];
    expect(again.profileReadAt).toBeGreaterThan(first.profileReadAt!);
    expect(again.profile).toEqual(first.profile);
    expect(await t.run(async (ctx) => (await ctx.db.query("listingWeeks").collect())[0])).toEqual(weeks);

    await fileAnswer(t, BUSINESS_PROFILE_OPERATION, params, [{ items: [ronins({ additional_categories: ["Branding agency", "E-commerce service"] })] }]);
    const activity = await t.run(async (ctx) => (await ctx.db.query("listingActivityParts").collect())[0]);
    expect(activity.texts).toEqual(["E-commerce service"]);
  });

  test("a map check keeps Google's order, and the office's place for the search", async () => {
    const t = harness();
    const { officeId } = await company(t);
    const params = mapCheckParams("web design guildford", POINT, 20);
    await fileAnswer(t, MAP_CHECK_OPERATION, params, [{ items: [
      { type: "maps_search", cid: "1", title: "Up There Digital", local_justifications: [{ text: "Their website mentions \"web design guildford\"" }] },
      { type: "maps_search", cid: "17195342752822652591", title: "Ronins", ...GUILDFORD },
    ] }], "SERP");

    const check = await t.run(async (ctx) => (await ctx.db.query("mapChecks").collect())[0]);
    expect(check).toMatchObject({ keyword: "web design guildford", point: POINT, reasons: ["Their website mentions \"web design guildford\""] });
    expect(check.listingIds[1]).toBe(officeId);
    const places = await t.run(async (ctx) => await ctx.db.query("mapPositionWeeks").collect());
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ listingId: officeId, keyword: "web design guildford" });

    // The same businesses the next hour: nothing about them is written again (plan rule 11).
    const before = await listingsNamed(t, "Up There Digital");
    vi.advanceTimersByTime(3_600_000);
    await fileAnswer(t, MAP_CHECK_OPERATION, params, [{ items: [
      { type: "maps_search", cid: "1", title: "Up There Digital" },
      { type: "maps_search", cid: "17195342752822652591", title: "Ronins", ...GUILDFORD },
    ] }], "SERP");
    expect(await listingsNamed(t, "Up There Digital")).toEqual(before);
  });

  test("a market lists its businesses nearest first and links a tracked competitor as a rival", async () => {
    const t = harness();
    const { companyId, websiteId, holdId, officeId } = await company(t);
    await t.run(async (ctx) => {
      const rivalSite = await ctx.db.insert("websites", { host: "brightside.example", displayHost: "brightside.example", firstSeenAt: Date.now() });
      await ctx.db.insert("companyWebsites", { companyId, websiteId: rivalSite, relationship: "TRACKED", againstWebsiteId: websiteId, createdAt: Date.now() });
    });
    await fileAnswer(t, LOCAL_MARKET_OPERATION, localMarketParams("website_designer", POINT, 10, 100), [{ total_count: 64, items: [
      business("2", "Far Away", { latitude: 51.30, longitude: -0.57 }),
      business("3", "Brightside Digital", { latitude: 51.24, longitude: -0.565, domain: "www.brightside.example" }),
    ] }]);

    const part = await t.run(async (ctx) => (await ctx.db.query("localMarketParts").collect())[0]);
    expect(part.total).toBe(64);
    const names = await t.run(async (ctx) => await Promise.all(part.listingIds.map(async (id) => (await ctx.db.get(id))!.name)));
    expect(names).toEqual(["Brightside Digital", "Far Away"]);
    const links = await t.run(async (ctx) => await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).collect());
    expect(links.find((link) => link.role === "RIVAL")).toMatchObject({ addedFrom: "MATCHED", againstListingId: officeId });
    // The menu's numbers are booked once, not once a business.
    await finishScheduled(t);
    const summary = await t.run(async (ctx) => (await ctx.db.query("localSummaries").collect())[0]);
    expect(summary).toMatchObject({ ownListings: 1, marketBusinesses: 64 });
    expect(summary.rebuildAt).toBeUndefined();
  });

  test("a post read again next week is the same post", async () => {
    const t = harness();
    await company(t);
    const params = businessPostsParams("17195342752822652591");
    const posts = [{ items: [{ type: "google_business_post", post_text: "Free website check", timestamp: "2026-09-30 00:00:00 +00:00" }] }];
    await fileAnswer(t, BUSINESS_POSTS_OPERATION, params, posts);
    await fileAnswer(t, BUSINESS_POSTS_OPERATION, params, posts);
    const activity = await t.run(async (ctx) => await ctx.db.query("listingActivityParts").collect());
    expect(activity).toHaveLength(1);
    expect(activity[0].texts).toEqual(["Free website check"]);
  });
});

describe("planning", () => {
  async function expand(t: Harness, companyId: Id<"companies">, startedAt = Date.now()) {
    const cycleId = await t.run(async (ctx) => await ctx.db.insert("seoCollectionCycles", {
      companyId, trigger: "SCHEDULE", status: "EXPANDING", plannedCount: 0, reusedCount: 0, sentCount: 0,
      readyCount: 0, failedCount: 0, totalCostUsd: 0, startedAt,
    }));
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });
  }
  const localPulls = (t: Harness) => t.run(async (ctx) => (await ctx.db.query("seoDataPulls").collect())
    .filter((pull) => [BUSINESS_PROFILE_OPERATION, BUSINESS_POSTS_OPERATION, BUSINESS_QUESTIONS_OPERATION, MAP_CHECK_OPERATION, LOCAL_MARKET_OPERATION].includes(pull.operationId)));
  async function track(t: Harness, ids: { websiteId: Id<"websites">; holdId: Id<"companyWebsites"> }, keyword: string) {
    await t.run(async (ctx) => await ctx.db.insert("websiteKeywords", { websiteId: ids.websiteId, companyWebsiteId: ids.holdId, keyword, isActive: true, createdAt: Date.now() }));
  }

  test("nothing is bought while the company has Local switched off", async () => {
    const t = harness();
    const ids = await company(t, { local: false });
    await track(t, ids, "web design guildford");
    await expand(t, ids.companyId);
    expect(await localPulls(t)).toEqual([]);
  });

  test("an office's profile, posts and market, and each tracked search from its office", async () => {
    const t = harness();
    const ids = await company(t);
    await track(t, ids, "web design guildford");
    await track(t, ids, "seo agency");
    await expand(t, ids.companyId);
    const pulls = await localPulls(t);
    expect(pulls.map((pull) => pull.operationId).sort()).toEqual([
      BUSINESS_POSTS_OPERATION, BUSINESS_PROFILE_OPERATION, BUSINESS_QUESTIONS_OPERATION, LOCAL_MARKET_OPERATION, MAP_CHECK_OPERATION, MAP_CHECK_OPERATION,
    ].sort());
    expect(pulls.find((pull) => pull.operationId === LOCAL_MARKET_OPERATION)!.taskArgsJson)
      .toBe(JSON.stringify(localMarketParams("website_designer", POINT, 10, 100)));

    // The next day's run checks the searches again; the profile and the market are held for their week and month.
    await expand(t, ids.companyId, Date.now() + 86_400_000);
    const after = await localPulls(t);
    expect(after.filter((pull) => pull.operationId === MAP_CHECK_OPERATION)).toHaveLength(4);
    expect(after.filter((pull) => pull.operationId === LOCAL_MARKET_OPERATION)).toHaveLength(1);
  });

  test("a search naming one office's town is checked from that office only", () => {
    const offices = [{ town: "Guildford" }, { town: "London" }];
    expect(officesForSearch("web design agency london", offices)).toEqual([{ town: "London" }]);
    expect(officesForSearch("seo agency", offices)).toEqual(offices);
    expect(officesForSearch("web design woking", offices)).toEqual(offices);
  });
});
