import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { bytesReadBy, metered } from "@/src/test/readMeter";
import budgets from "../code-ratchets.json";
import schema from "./schema";
import { packColumn, packDays } from "./utils/packedColumns";
import { ACTIVITY_KINDS } from "./localSchema";

/**
 * Discovery's Local pages at five times a large client
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, §8 and rule 6):
 * ten offices with five rivals each, a hundred tracked searches checked from
 * every office every day for a year, a market of 250 businesses round each,
 * two years of weeks and a full activity record for every business watched.
 *
 * Counted, not timed, so it holds on any machine, GitHub's included: what
 * each screen reads, as Convex counts it, against its budget in
 * `code-ratchets.json` (`localReadKiB`, which may shrink, never grow), and
 * under half of Convex's limits on one read — 16 MiB and 32,000 records.
 * LOCAL_READ_REPORT=1 prints what each reads.
 *
 * The map checks are a year of one day's place each in the offices' series
 * (`mapPositionWeeks`), and the newest two days of every search's check
 * itself: the screens read a check by its newest two through an index, so
 * older ones are records nobody reads.
 */

const OFFICES = 10;
const RIVALS_PER_OFFICE = 5;
const SEARCHES = 100;
const MARKET = 250;
const MAP_DEPTH = 20;
const DAYS = 365;
const WEEKS = 104;
const BUSINESSES = 600;
/** Half of what Convex lets one function read. */
const HALF_A_READ = 8 * 1024 * 1024;
const HALF_THE_RECORDS = 16_000;

const dayOf = (offset: number) => new Date(Date.UTC(2026, 9, 9) - offset * 86_400_000).toISOString().slice(0, 10);
const words = (count: number) => Array.from({ length: count }, (_, at) => `word${at}`).join(" ");

describe("Local at five times a large client", () => {
  test("every Local screen reads within its budget and half of Convex's limits", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const seeded = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Big Co", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", { name: "Member", email: "big@test.com", role: "ADMIN" as const, companyId, createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "big.co.uk", displayHost: "big.co.uk", firstSeenAt: Date.now() });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: 2826, createdAt: Date.now() });
      await ctx.db.insert("collectionParts", { companyId, local: true, updatedAt: Date.now() });
      await ctx.db.insert("fanOutLimits", { companyId, localOffices: OFFICES, localRivalsPerOffice: RIVALS_PER_OFFICE, localMarketBusinesses: MARKET, updatedAt: Date.now() });
      for (let at = 0; at < SEARCHES; at += 1) {
        await ctx.db.insert("websiteKeywords", { websiteId, companyWebsiteId: holdId, keyword: `search ${at}`, isActive: true, createdAt: Date.now() });
      }
      const profile = (at: number) => ({
        description: words(120),
        categories: ["Branding agency", "Design agency"],
        hours: ["09:00–18:00", "09:00–18:00", "09:00–18:00", "09:00–18:00", "09:00–17:30", "Closed", "Closed"],
        services: Array.from({ length: 30 }, (_, service) => ({ name: `Service ${service}`, price: "£500" })),
        attributes: ["offers_online_appointments"],
        topics: Array.from({ length: 20 }, (_, topic) => ({ topic: `topic ${topic}`, reviews: 20 - topic })),
        alsoSearched: Array.from({ length: 10 }, (_, other) => ({ key: `b${(at + other) % BUSINESSES}`, name: `Business ${other}`, rating: 4.5, reviews: 40 })),
        starCounts: [1, 2, 3, 10, 50],
      });
      const listing = async (key: string, name: string, at: number, whole: boolean) => await ctx.db.insert("listings", {
        source: "GOOGLE", key, name, address: `${at} High Street, Town ${at % OFFICES}`, town: `Town ${at % OFFICES}`,
        point: `51.${String(10_000 + at).slice(1)},-0.${String(10_000 + at).slice(1)}`, latitude: 51 + at / 10_000, longitude: -at / 10_000,
        category: "Web Designer", categoryIds: ["website_designer"], websiteHost: `business${at}.co.uk`, phone: "+441483000000",
        claimed: true, rating: 4.6, reviews: 120 + at, photos: 30 + at, ...(whole ? { profile: profile(at), profileReadAt: Date.now() } : {}), seenAt: Date.now(),
      });
      const businesses: Array<Id<"listings">> = [];
      for (let at = 0; at < BUSINESSES; at += 1) businesses.push(await listing(`b${at}`, `Business ${at}`, at, at < 60));
      const offices = businesses.slice(0, OFFICES);
      const rivals = businesses.slice(OFFICES, OFFICES + OFFICES * RIVALS_PER_OFFICE);
      for (const officeId of offices) {
        await ctx.db.insert("holdListings", { companyWebsiteId: holdId, companyId, listingId: officeId, role: "OWN", addedFrom: "HAND", createdAt: Date.now() });
      }
      for (const [at, rivalId] of rivals.entries()) {
        await ctx.db.insert("holdListings", {
          companyWebsiteId: holdId, companyId, listingId: rivalId, role: "RIVAL", againstListingId: offices[Math.floor(at / RIVALS_PER_OFFICE)], addedFrom: "HAND", createdAt: Date.now(),
        });
      }
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "google_maps_check", family: "SERP", mode: "LIVE", taskArgsJson: "{}", status: "READY",
        tag: "seed", attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
      });
      return { companyId, userId, websiteId, holdId, offices, rivals, businesses, pullId };
    });

    // A year of places and two days of checks for every search from every office; markets, weeks and activity.
    for (const [officeAt, officeId] of seeded.offices.entries()) {
      await t.run(async (ctx) => {
        const office = (await ctx.db.get(officeId))!;
        const days = Array.from({ length: DAYS }, (_, at) => dayOf(DAYS - 1 - at));
        for (let search = 0; search < SEARCHES; search += 1) {
          await ctx.db.insert("mapPositionWeeks", {
            listingId: officeId, keyword: `search ${search}`, days: packDays(days),
            places: packColumn(days.map((_, at) => (at + search) % 25)), updatedAt: Date.now(),
          });
          for (const day of [dayOf(1), dayOf(0)]) {
            const ids = Array.from({ length: MAP_DEPTH }, (_, place) => seeded.businesses[(search + place + officeAt) % seeded.businesses.length]);
            await ctx.db.insert("mapChecks", {
              keyword: `search ${search}`, point: office.point!, day, listingIds: ids,
              reasons: ["Their website mentions \"search\"", "Provides: Website design"], reasonOf: packColumn(ids.map((_, at) => at % 2)),
              pullId: seeded.pullId,
            });
          }
        }
        const market = Array.from({ length: MARKET }, (_, at) => seeded.businesses[(OFFICES + at + officeAt) % seeded.businesses.length]);
        await ctx.db.insert("localMarketParts", {
          category: "website_designer", point: office.point!, km: 10, listingIds: market,
          metres: packColumn(market.map((_, at) => at * 37)), total: 1_200, day: dayOf(0), pullId: seeded.pullId,
        });
      });
    }
    await t.run(async (ctx) => {
      const weeks = Array.from({ length: WEEKS }, (_, at) => dayOf((WEEKS - 1 - at) * 7));
      for (const listingId of [...seeded.offices, ...seeded.rivals]) {
        await ctx.db.insert("listingWeeks", {
          listingId, days: packDays(weeks), rating: packColumn(weeks.map((_, at) => 45 + (at % 4))),
          reviews: packColumn(weeks.map((_, at) => 50 + at)), photos: packColumn(weeks.map((_, at) => 20 + at)),
          claimed: packColumn(weeks.map(() => 1)), updatedAt: Date.now(),
        });
        const lines = Array.from({ length: 100 }, (_, at) => ({ kind: at % 2, day: dayOf(at * 3), text: `${words(40)} ${at}` }));
        await ctx.db.insert("listingActivityParts", {
          listingId, kinds: packColumn(lines.map((line) => line.kind)), days: packDays(lines.map((line) => line.day)),
          texts: lines.map((line) => line.text), updatedAt: Date.now(),
        });
      }
      expect(ACTIVITY_KINDS[0]).toBe("POST");
    });

    const siteId = seeded.holdId;
    const officeId = seeded.offices[0];
    const screens: Array<[string, FunctionReference<"query">, Record<string, unknown>]> = [
      ["business profile", api.siteLocalProfile.businessProfile, { siteId, officeId }],
      ["every office", api.siteLocalProfile.everyOffice, { siteId }],
      ["map rankings", api.siteLocalMaps.mapRankings, { siteId, officeId }],
      ["one search on the map", api.siteLocalMaps.mapSearch, { siteId, officeId, keyword: "search 7" }],
      ["local market", api.siteLocalMarket.localMarket, { siteId, officeId }],
      ["rival activity", api.siteLocalMarket.rivalActivity, { siteId }],
      ["your listings", api.siteLocalListings.localListings, { siteId }],
    ];

    const modules = import.meta.glob("./*.ts");
    const readBudgets: Record<string, number> = budgets.localReadKiB;
    const read: Record<string, number> = {};
    const over: string[] = [];
    for (const [name, query, args] of screens) {
      const [file, exported] = getFunctionName(query).split(":");
      const loaded = (await modules[`./${file}.ts`]()) as Record<string, { _handler?: unknown }>;
      const bytes = await bytesReadBy(t, seeded.userId, loaded[exported], args);
      read[name] = Math.ceil(bytes / 1024);
      if (bytes > HALF_A_READ) over.push(`${name}: ${read[name]} KiB, past half of what one read may hold`);
      if (!(read[name] <= (readBudgets[name] ?? -1))) over.push(`${name}: ${read[name]} KiB read, its budget ${readBudgets[name] ?? "not set"}`);
    }
    // And records: the screen with the most to read stays under half of 32,000.
    const records = await t.withIdentity({ subject: seeded.userId }).run(async (ctx) => {
      const meter = metered(ctx.db);
      const loaded = (await modules["./siteLocalProfile.ts"]()) as Record<string, { _handler?: (c: object, a: object) => Promise<unknown> }>;
      await loaded.everyOffice._handler!({ ...ctx, db: meter.db }, { siteId });
      return meter.documents();
    });
    if (process.env.LOCAL_READ_REPORT) console.log(JSON.stringify({ ...read, everyOfficeRecords: records }, null, 2));
    expect(over).toEqual([]);
    expect(records).toBeLessThan(HALF_THE_RECORDS);

    // What the screens say at this size.
    const asMember = t.withIdentity({ subject: seeded.userId });
    const maps = await asMember.query(api.siteLocalMaps.mapRankings, { siteId, officeId });
    // No search names an office's town, so every one is checked from every office.
    expect(maps.rows).toHaveLength(SEARCHES);
    const market = await asMember.query(api.siteLocalMarket.localMarket, { siteId, officeId });
    expect(market.total).toBe(1_200);
  });
});
