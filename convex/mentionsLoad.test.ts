import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { bytesReadBy } from "@/src/test/readMeter";
import budgets from "../code-ratchets.json";
import schema from "./schema";
import { packColumn } from "./utils/packedColumns";

/**
 * Discovery's Web mentions screens at their largest
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, step 6 and rule
 * 6): the website and six rivals, each holding the most pages kept (1,000
 * within a year), the rivals' shared links for every pair, and Brand radar's
 * readings at 500 questions — what Where to get listed reads beside them.
 *
 * Counted, not timed: what each screen reads against its budget in
 * `code-ratchets.json` (`mentionsReadKiB`, which may shrink, never grow), and
 * under half of what one read may hold. MENTIONS_READ_REPORT=1 prints it.
 */

const RIVALS = 6;
const PAGES = 1_000;
const QUESTIONS = 500;
const HALF_A_READ = 8 * 1024 * 1024;

describe("Web mentions at their largest", () => {
  test("every Web mentions screen reads within its budget and half of Convex's limit", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const seeded = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Big Co", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", { name: "Member", email: "big@test.com", role: "ADMIN" as const, companyId, createdAt: Date.now() });
      const pullId = await ctx.db.insert("seoDataPulls", { operationId: "radar_mentions", family: "AI Optimization", mode: "LIVE", taskArgsJson: "{}", status: "READY", tag: "r", attempts: 0, costUsd: 0.6, sandbox: false, submittedAt: Date.now() });
      const websites: Array<Id<"websites">> = [];
      for (let at = 0; at <= RIVALS; at += 1) websites.push(await ctx.db.insert("websites", { host: `business${at}.co.uk`, displayHost: `business${at}.co.uk`, firstSeenAt: Date.now() }));
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId: websites[0], relationship: "OWNED", locationCode: 2826, createdAt: Date.now() });
      for (const websiteId of websites.slice(1)) await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "TRACKED", againstWebsiteId: websites[0], locationCode: 2826, createdAt: Date.now() });
      await ctx.db.insert("fanOutLimits", { companyId, radarQuestions: QUESTIONS, radarRivals: RIVALS, mentionsPerCheck: 200, updatedAt: Date.now() });
      const today = Math.round(Date.now() / 86_400_000);
      for (const [index, websiteId] of websites.entries()) {
        await ctx.db.insert("webMentionParts", {
          websiteId,
          urls: Array.from({ length: PAGES }, (_, at) => `https://source${at % 400}.co.uk/a-long-article-about-business-${index}-number-${at}/`),
          titles: Array.from({ length: PAGES }, (_, at) => `The ten best agencies in the south east for ${at}`),
          days: packColumn(Array.from({ length: PAGES }, (_, at) => today - Math.floor(at / 3))),
          kinds: packColumn(Array.from({ length: PAGES }, (_, at) => at % 6)),
          tones: packColumn(Array.from({ length: PAGES }, (_, at) => at % 3)),
          strength: packColumn(Array.from({ length: PAGES }, (_, at) => at % 900)),
          linked: packColumn(Array.from({ length: PAGES }, (_, at) => at % 2)),
          about: packColumn(Array.from({ length: PAGES }, (_, at) => (at % 9 === 0 ? 0 : 1))),
          updatedAt: Date.now(),
        });
        const pages = Array.from({ length: QUESTIONS * 4 }, (_, at) => `https://source${at % 300}.co.uk/a-long-guide-to-thing-${at}-for-${index}/`);
        await ctx.db.insert("brandRadarQuestionParts", {
          websiteId, locationCode: 2826, month: "2026-10", total: 900,
          questions: Array.from({ length: QUESTIONS }, (_, at) => `how much does thing ${at} cost in the uk`),
          volumes: packColumn(Array.from({ length: QUESTIONS }, () => 1_000)),
          firstAt: packColumn(Array.from({ length: QUESTIONS }, (_, at) => at)),
          pages,
          starts: packColumn(Array.from({ length: QUESTIONS }, (_, at) => at * 10)),
          sourceOf: packColumn(Array.from({ length: QUESTIONS * 10 }, (_, at) => (at * 13) % pages.length)),
          pullId, updatedAt: Date.now(),
        });
      }
      for (let first = 1; first <= RIVALS; first += 1) {
        for (let second = first + 1; second <= RIVALS; second += 1) {
          await ctx.db.insert("linkGapPairs", {
            websiteId: websites[0], rivals: [`business${first}.co.uk`, `business${second}.co.uk`], month: "2026-10",
            domains: Array.from({ length: 100 }, (_, at) => `linker${at}.co.uk`), strength: packColumn(Array.from({ length: 100 }, (_, at) => at)), updatedAt: Date.now(),
          });
        }
      }
      return { userId, holdId };
    });

    const siteId = seeded.holdId;
    const screens: Array<[string, FunctionReference<"query">, Record<string, unknown>]> = [
      ["all mentions", api.siteWebMentions.webMentions, { siteId }],
      ["mentions against rivals", api.siteWebMentions.mentionsAgainstRivals, { siteId }],
      ["where to get listed", api.siteWebMentions.whereToGetListed, { siteId }],
    ];
    const modules = import.meta.glob("./*.ts");
    const readBudgets: Record<string, number> = budgets.mentionsReadKiB;
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
    if (process.env.MENTIONS_READ_REPORT) process.stdout.write(`${JSON.stringify(read, null, 2)}\n`);
    expect(over).toEqual([]);
    const all = await t.withIdentity({ subject: seeded.userId }).query(api.siteWebMentions.webMentions, { siteId });
    expect(all.rows.length).toBeGreaterThan(800);
  });
});
