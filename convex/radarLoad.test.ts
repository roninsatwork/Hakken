import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { bytesReadBy, metered } from "@/src/test/readMeter";
import { loadSite } from "./websiteSiteRows";
import { workOutAssets } from "./assetSummaries";
import budgets from "../code-ratchets.json";
import schema from "./schema";
import { packColumn } from "./utils/packedColumns";

/**
 * Discovery's Brand radar screens at their largest
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, step 4 and rule
 * 6): the website and six rivals watched beside it, each read at the most
 * questions a month a website may take (500), ten pages quoted under each
 * answer, and three years of months.
 *
 * Counted, not timed: what each screen reads, as Convex counts it, against
 * its budget in `code-ratchets.json` (`radarReadKiB`, which may shrink, never
 * grow), and under half of what one read may hold.
 * RADAR_READ_REPORT=1 prints what each reads.
 */

const RIVALS = 6;
const QUESTIONS = 500;
const SOURCES = 10;
const MONTHS = 36;
const HALF_A_READ = 8 * 1024 * 1024;

describe("Brand radar at its largest", () => {
  test("every Brand radar screen reads within its budget and half of Convex's limit", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const seeded = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Big Co", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", { name: "Member", email: "big@test.com", role: "ADMIN" as const, companyId, createdAt: Date.now() });
      const pullId = await ctx.db.insert("seoDataPulls", { operationId: "radar_mentions", family: "AI Optimization", mode: "LIVE", taskArgsJson: "{}", status: "READY", tag: "r", attempts: 0, costUsd: 0.6, sandbox: false, submittedAt: Date.now() });
      const websites: Array<Id<"websites">> = [];
      for (let at = 0; at <= RIVALS; at += 1) {
        websites.push(await ctx.db.insert("websites", { host: `business${at}.co.uk`, displayHost: `business${at}.co.uk`, firstSeenAt: Date.now() }));
      }
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId: websites[0], relationship: "OWNED", locationCode: 2826, createdAt: Date.now() });
      for (const websiteId of websites.slice(1)) {
        await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "TRACKED", againstWebsiteId: websites[0], locationCode: 2826, createdAt: Date.now() });
      }
      await ctx.db.insert("fanOutLimits", { companyId, radarQuestions: QUESTIONS, radarRivals: RIVALS, updatedAt: Date.now() });
      const months = Array.from({ length: MONTHS }, (_, at) => `${2023 + Math.floor((at + 10) / 12)}-${String(((at + 10) % 12) + 1).padStart(2, "0")}`);
      for (const [index, websiteId] of websites.entries()) {
        const pages = Array.from({ length: QUESTIONS * 4 }, (_, at) => `https://source${at % 300}.co.uk/a-long-guide-to-thing-${at}-for-${index}/`);
        await ctx.db.insert("brandRadarQuestionParts", {
          websiteId, locationCode: 2826, month: "2026-10", total: 900,
          questions: Array.from({ length: QUESTIONS }, (_, at) => `how much does thing ${at} cost in the uk for a small business`),
          volumes: packColumn(Array.from({ length: QUESTIONS }, (_, at) => 1_000 + at)),
          firstAt: packColumn(Array.from({ length: QUESTIONS }, (_, at) => (at % 3 === 0 ? undefined : at * 7))),
          pages,
          starts: packColumn(Array.from({ length: QUESTIONS }, (_, at) => at * SOURCES)),
          sourceOf: packColumn(Array.from({ length: QUESTIONS * SOURCES }, (_, at) => (at * 13) % pages.length)),
          pullId, updatedAt: Date.now(),
        });
        await ctx.db.insert("brandRadarMonths", {
          websiteId, locationCode: 2826, months,
          mentions: packColumn(months.map((_, at) => 500 + at)), asks: packColumn(months.map((_, at) => 50_000 + at)), pages: packColumn(months.map(() => 40)), updatedAt: Date.now(),
        });
      }
      return { userId, holdId };
    });

    const siteId = seeded.holdId;
    const screens: Array<[string, FunctionReference<"query">, Record<string, unknown>]> = [
      ["brand radar", api.siteBrandRadar.radarOverview, { siteId }],
      ["websites ai cites", api.siteBrandRadar.radarSources, { siteId }],
      // The detail screens they open (discovery-detail-and-hakken-sees-plan.md §3).
      ["one website", api.siteRadarDetails.websiteDetail, { siteId, host: "source7.co.uk" }],
      ["one question", api.siteRadarDetails.questionDetail, { siteId, question: "how much does thing 7 cost in the uk for a small business" }],
      ["one business", api.siteBusinessDetail.businessDetail, { siteId, business: "business1.co.uk" }],
    ];
    const modules = import.meta.glob("./*.ts");
    const readBudgets: Record<string, number> = budgets.radarReadKiB;
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
    // And Your assets, worked out after each collection from what these screens read (`assetSummaries.ts`).
    const assetBytes = await t.run(async (ctx) => {
      const meter = metered(ctx.db);
      const site = await loadSite({ db: meter.db } as never, siteId);
      if (site) await workOutAssets({ db: meter.db } as never, site);
      return meter.bytes();
    });
    read["your assets"] = Math.ceil(assetBytes / 1024);
    if (assetBytes > HALF_A_READ) over.push(`your assets: ${read["your assets"]} KiB, past half of what one read may hold`);
    if (!(read["your assets"] <= (readBudgets["your assets"] ?? -1))) over.push(`your assets: ${read["your assets"]} KiB read, its budget ${readBudgets["your assets"] ?? "not set"}`);
    if (process.env.RADAR_READ_REPORT) process.stdout.write(`${JSON.stringify(read, null, 2)}\n`);
    expect(over).toEqual([]);

    const overview = await t.withIdentity({ subject: seeded.userId }).query(api.siteBrandRadar.radarOverview, { siteId });
    expect(overview.businesses).toHaveLength(1 + RIVALS);
    expect(overview.questions).toHaveLength(QUESTIONS);
  });
});
