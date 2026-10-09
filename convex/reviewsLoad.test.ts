import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { bytesReadBy } from "@/src/test/readMeter";
import budgets from "../code-ratchets.json";
import schema from "./schema";
import { packColumn, packDays } from "./utils/packedColumns";

/**
 * Discovery's Reviews pages at five times a large client
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, step 2 and rule
 * 6): ten offices of a thousand reviews each, words and all (D4), and five
 * rivals an office holding a year of their newest fifty a month — stars and
 * dates only — beside the Business profile, which now reads an office's
 * reviews for each topic's stars.
 *
 * Counted, not timed: what each screen reads, as Convex counts it, against
 * its budget in `code-ratchets.json` (`reviewsReadKiB`, which may shrink,
 * never grow), and under half of what one read may hold.
 * REVIEWS_READ_REPORT=1 prints what each reads.
 */

const OFFICES = 10;
const RIVALS_PER_OFFICE = 5;
const OWN_REVIEWS = 1_000;
const RIVAL_REVIEWS = 600;
const DRAFTS = 200;
/** Half of what Convex lets one function read. */
const HALF_A_READ = 8 * 1024 * 1024;

const dayOf = (offset: number) => new Date(Date.UTC(2026, 9, 9) - offset * 86_400_000).toISOString().slice(0, 10);
const words = (count: number, seed: number) => Array.from({ length: count }, (_, at) => `word${(at + seed) % 97}`).join(" ");

describe("Reviews at five times a large client", () => {
  test("every Reviews screen reads within its budget and half of Convex's limit", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const seeded = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Big Co", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", { name: "Member", email: "big@test.com", role: "ADMIN" as const, companyId, createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "big.co.uk", displayHost: "big.co.uk", firstSeenAt: Date.now() });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: 2826, createdAt: Date.now() });
      await ctx.db.insert("collectionParts", { companyId, local: true, reviews: true, updatedAt: Date.now() });
      await ctx.db.insert("fanOutLimits", { companyId, localOffices: OFFICES, localRivalsPerOffice: RIVALS_PER_OFFICE, updatedAt: Date.now() });
      const topics = Array.from({ length: 12 }, (_, at) => ({ topic: `topic ${at}`, reviews: 200 - at * 10 }));
      const listing = async (at: number, own: boolean) => await ctx.db.insert("listings", {
        source: "GOOGLE", key: `b${at}`, name: `Business ${at}`, town: `Town ${at % OFFICES}`,
        point: `51.${String(10_000 + at).slice(1)},-0.${String(10_000 + at).slice(1)}`, latitude: 51 + at / 10_000, longitude: -at / 10_000,
        category: "Web Designer", categoryIds: ["website_designer"], websiteHost: `business${at}.co.uk`,
        claimed: true, rating: 4.6, reviews: own ? OWN_REVIEWS : 2_000, photos: 30,
        profile: { categories: ["Design agency"], services: [], attributes: [], alsoSearched: [], topics, starCounts: [10, 20, 30, 100, 840] }, profileReadAt: Date.now(), seenAt: Date.now(),
        reviewsHeld: own ? OWN_REVIEWS : RIVAL_REVIEWS, reviewsAnswered: own ? OWN_REVIEWS / 2 : RIVAL_REVIEWS / 2,
      });
      const offices: Array<Id<"listings">> = [];
      const rivals: Array<Id<"listings">> = [];
      for (let at = 0; at < OFFICES; at += 1) offices.push(await listing(at, true));
      for (let at = 0; at < OFFICES * RIVALS_PER_OFFICE; at += 1) rivals.push(await listing(OFFICES + at, false));
      for (const officeId of offices) {
        await ctx.db.insert("holdListings", { companyWebsiteId: holdId, companyId, listingId: officeId, role: "OWN", addedFrom: "HAND", createdAt: Date.now() });
        const rows = Array.from({ length: OWN_REVIEWS }, (_, at) => at);
        await ctx.db.insert("listingReviewParts", {
          listingId: officeId, part: 0, ids: rows.map((at) => `${officeId}-review-${at}`), days: packDays(rows.map((at) => dayOf(at))),
          stars: packColumn(rows.map((at) => 1 + (at % 5))), replyDays: packDays(rows.map((at) => (at % 2 ? dayOf(at - 1) : undefined))),
          guides: packColumn(rows.map((at) => (at % 7 === 0 ? 1 : undefined))),
          texts: rows.map((at) => words(45, at)), names: rows.map((at) => `Reviewer ${at}`),
          topics: rows.map((at) => `topic ${at % 12}+|topic ${(at + 5) % 12}-`), updatedAt: Date.now(),
        });
      }
      for (const [at, rivalId] of rivals.entries()) {
        await ctx.db.insert("holdListings", {
          companyWebsiteId: holdId, companyId, listingId: rivalId, role: "RIVAL", againstListingId: offices[Math.floor(at / RIVALS_PER_OFFICE)], addedFrom: "HAND", createdAt: Date.now(),
        });
        const rows = Array.from({ length: RIVAL_REVIEWS }, (_, row) => row);
        await ctx.db.insert("listingReviewParts", {
          listingId: rivalId, part: 0, ids: rows.map((row) => `${rivalId}-review-${row}`), days: packDays(rows.map((row) => dayOf(Math.floor(row * 0.6)))),
          stars: packColumn(rows.map((row) => 1 + (row % 5))), replyDays: packDays(rows.map((row) => (row % 3 ? dayOf(Math.floor(row * 0.6)) : undefined))),
          guides: packColumn(rows.map(() => undefined)), updatedAt: Date.now(),
        });
      }
      for (let at = 0; at < DRAFTS; at += 1) {
        await ctx.db.insert("reviewReplyDrafts", {
          companyWebsiteId: holdId, listingId: offices[at % OFFICES], reviewId: `${offices[at % OFFICES]}-review-${at * 2}`, text: words(80, at), draftedAt: Date.now(),
        });
      }
      return { userId, holdId, offices };
    });

    const siteId = seeded.holdId;
    const officeId = seeded.offices[0];
    const screens: Array<[string, FunctionReference<"query">, Record<string, unknown>]> = [
      ["your reviews, every office", api.siteReviews.yourReviews, { siteId }],
      ["your reviews, one office", api.siteReviews.yourReviews, { siteId, officeId }],
      ["against rivals", api.siteReviews.reviewsAgainstRivals, { siteId, officeId }],
      ["what customers say", api.siteReviews.whatCustomersSay, { siteId }],
      ["business profile", api.siteLocalProfile.businessProfile, { siteId, officeId }],
    ];
    const modules = import.meta.glob("./*.ts");
    const readBudgets: Record<string, number> = budgets.reviewsReadKiB;
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
    if (process.env.REVIEWS_READ_REPORT) process.stdout.write(`${JSON.stringify(read, null, 2)}\n`);
    expect(over).toEqual([]);

    // What the screens say at this size.
    const asMember = t.withIdentity({ subject: seeded.userId });
    const yours = await asMember.query(api.siteReviews.yourReviews, { siteId });
    expect(yours.rows).toHaveLength(OFFICES * OWN_REVIEWS);
    const against = await asMember.query(api.siteReviews.reviewsAgainstRivals, { siteId, officeId });
    expect(against.rows).toHaveLength(1 + RIVALS_PER_OFFICE);
  });
});
