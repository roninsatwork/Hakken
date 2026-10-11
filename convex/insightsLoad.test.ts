import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { getFunctionName } from "convex/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { readBy } from "@/src/test/readMeter";
import budgets from "../code-ratchets.json";
import schema from "./schema";
import { packColumn } from "./utils/packedColumns";

/**
 * Insights' screens at their largest (docs/plans/active/insights-analyst-plan.md
 * §8, phase 2b): a company whose website has been read every week for the two
 * years findings and reports are kept (I7) — thirty findings a week, each with
 * twenty facts, and every brief, monthly report and board report — against
 * ten rivals with two years of market history each, AI mentions and answers,
 * and twenty Business Profiles.
 *
 * Counted, not timed: what each screen reads, as Convex counts it, against
 * its budget in `code-ratchets.json` (`insightsReadKiB`, which may shrink,
 * never grow), and under half of what one read may hold.
 * INSIGHTS_READ_REPORT=1 prints what each reads.
 */

const WEEKS = 104;
const FINDINGS_A_WEEK = 30;
const RIVALS = 10;
const HALF_A_READ = 8 * 1024 * 1024;

const dayOf = (offset: number) => new Date(Date.UTC(2026, 9, 5) - offset * 86_400_000).toISOString().slice(0, 10);

const fact = (key: string, value: number) => ({ key, value, unit: "count" as const, source: "analytics" as const, label: `the figure ${key}`, from: "2025-10-06", to: "2026-10-05", country: "gbr" });
const score = (measure: "enquiries" | "visitors") => ({ measure, now: 26, before: 74, unit: "count" as const, lowerIsBetter: false, place: 3, places: 11, status: "BEHIND" as const });
const months = Array.from({ length: 12 }, (_, at) => ({ month: `2026-${String(at + 1).padStart(2, "0")}`, visits: 400, conversions: 12 }));
const shares = Array.from({ length: 22 }, (_, at) => ({ month: `20${25 + Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, "0")}`, you: 900, total: 9000 }));
const body = (findings: number) => ({
  headline: "Winning the market, losing the enquiries", summary: "A paragraph about the quarter against the same weeks last year and our rivals. ".repeat(4),
  points: ["One point about the period, in a sentence.", "Another point.", "A third point."], next: ["A next step.", "Another next step.", "A third."],
  risks: ["A risk."], opportunities: ["An opportunity."], decision: "The decision we recommend.",
  scorecard: [score("enquiries"), score("visitors")],
  findings: Array.from({ length: findings }, () => ({ findingId: null, headline: "A finding's headline, a sentence long.", action: "What to do first, a sentence long." })),
  did: [{ work: "findings", count: 9 }], enquiriesByMonth: months, shareByMonth: shares,
  facts: Array.from({ length: 20 }, (_, at) => ({ key: `month.figure.${at}`, label: "a figure", value: at, unit: "count" })),
});

describe("Insights' screens at their largest", () => {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  let seeded: { userId: Id<"users">; holdId: Id<"companyWebsites">; findingId: Id<"insightFindings">; reportId: Id<"insightReports"> };
  const readBudgets: Record<string, number> = budgets.insightsReadKiB;
  const read: Record<string, number> = {};

  beforeAll(async () => {
    seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const companyId = await ctx.db.insert("companies", { name: "Big Co", createdAt: now });
      const userId = await ctx.db.insert("users", { name: "Member", email: "big@test.com", role: "ADMIN" as const, companyId, createdAt: now });
      const websiteId = await ctx.db.insert("websites", { host: "big.co.uk", displayHost: "big.co.uk", firstSeenAt: now });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: 2826, createdAt: now });
      // The website and its rivals: two years of market history each, a week a row, and a year of AI mentions.
      const sites = [websiteId];
      for (let rival = 0; rival < RIVALS; rival += 1) {
        const rivalId = await ctx.db.insert("websites", { host: `rival${rival}.co.uk`, displayHost: `rival${rival}.co.uk`, firstSeenAt: now });
        await ctx.db.insert("companyWebsites", { companyId, websiteId: rivalId, relationship: "TRACKED", againstWebsiteId: websiteId, locationCode: 2826, createdAt: now });
        sites.push(rivalId);
      }
      for (const site of sites) {
        for (let week = 0; week < WEEKS; week += 1) {
          await ctx.db.insert("siteDaySummaries", {
            websiteId: site, locationCode: 2826, day: dayOf(week * 7), updatedAt: now,
            estimatedTraffic: 1000 + week, domainRank: 300, referringDomains: 500, keywords: 900, aiOverviewRefs: 120,
            allBands: { p01_03: 60, p04_10: 100, p11_20: 120, p21_50: 300, p51_up: 400 },
          } as never);
        }
        await ctx.db.insert("brandRadarMonths", {
          websiteId: site, locationCode: 2826, months: months.map((month) => month.month),
          mentions: packColumn(months.map(() => 220)), asks: packColumn(months.map(() => 400)), pages: packColumn(months.map(() => 9)), updatedAt: now,
        });
      }
      // Two years of weeks, each with thirty findings of twenty facts, and every report.
      let findingId: Id<"insightFindings"> | null = null;
      let reportId: Id<"insightReports"> | null = null;
      for (let week = 0; week < WEEKS; week += 1) {
        const monday = dayOf(week * 7);
        await ctx.db.insert("insightWeeks", {
          companyId, companyWebsiteId: holdId, week: monday, verdict: "The week's verdict, a sentence long.",
          sources: [{ source: "analytics", facts: 1800 }], problems: [], published: FINDINGS_A_WEEK, sentBack: 3, costUsd: 0.2,
          summary: { scorecard: [score("enquiries"), score("visitors")], enquiriesByMonth: months, shareByMonth: shares, checked: 2000, ruledOut: 15 },
          createdAt: now - week * 7 * 86_400_000,
        });
        for (let rank = 1; rank <= FINDINGS_A_WEEK; rank += 1) {
          const id = await ctx.db.insert("insightFindings", {
            companyId, companyWebsiteId: holdId, week: monday, specialist: "conversion", pattern: "trafficThatDoesntPay", status: "PUBLISHED", rank,
            headline: "A finding's headline, a sentence long, naming its figure.", story: "The story across sources, three sentences long. ".repeat(3),
            ruledOut: ["An explanation: why it doesn't hold."], action: "What to do first.", howWeKnow: "The figure to watch, and when.", sure: "MEDIUM",
            sources: ["analytics", "searchConsole"], facts: Array.from({ length: 20 }, (_, at) => fact(`ga.figure.${at}.365.now`, at)),
            comparisons: [["ga.figure.0.365.now", "ga.figure.1.365.now"]], checkOn: "2027-01-09", createdAt: now - week * 7 * 86_400_000,
          });
          findingId ??= id;
        }
        const weekly = await ctx.db.insert("insightReports", { companyId, companyWebsiteId: holdId, kind: "WEEKLY", from: monday, to: monday, period: monday, title: "Weekly brief", status: "READ", body: body(5), createdAt: now - week * 7 * 86_400_000 });
        reportId ??= weekly;
      }
      for (let month = 0; month < 24; month += 1) {
        await ctx.db.insert("insightReports", { companyId, companyWebsiteId: holdId, kind: "MONTHLY", from: dayOf(month * 30), to: dayOf(month * 30), period: `m${month}`, title: "Monthly report", status: "READ", body: body(6), createdAt: now - month * 30 * 86_400_000 });
      }
      for (let quarter = 0; quarter < 8; quarter += 1) {
        await ctx.db.insert("insightReports", { companyId, companyWebsiteId: holdId, kind: "BOARD", from: dayOf(quarter * 91), to: dayOf(quarter * 91), period: `q${quarter}`, title: "Board report", status: "READ", body: body(6), createdAt: now - quarter * 91 * 86_400_000 });
      }
      return { userId, holdId, findingId: findingId!, reportId: reportId! };
    });
  });

  const withinBudget = (name: string, bytes: number) => {
    read[name] = Math.ceil(bytes / 1024);
    if (process.env.INSIGHTS_READ_REPORT) console.log(`${name}: ${read[name]} KiB`);
    expect(bytes).toBeLessThan(HALF_A_READ);
    expect(read[name], `${name} reads more than its budget in code-ratchets.json (insightsReadKiB)`).toBeLessThanOrEqual(readBudgets[name]);
  };

  const screens: Array<[string, () => [Parameters<typeof getFunctionName>[0], Record<string, unknown>]]> = [
    ["home", () => [api.insightsReads.insightsHome, {}]],
    ["leagues", () => [api.insightsReads.insightsLeagues, { siteId: seeded.holdId }]],
    ["this week", () => [api.insightsReads.insightsThisWeek, {}]],
    ["all findings", () => [api.insightsReads.insightsAllFindings, {}]],
    ["a finding", () => [api.insightsReads.insightsFinding, { findingId: seeded.findingId }]],
    ["reports", () => [api.insightsReads.insightsReports, {}]],
    ["a report", () => [api.insightsReads.insightsReport, { reportId: seeded.reportId }]],
    ["your month", () => [api.insightsReads.insightsLatestReport, { kind: "MONTHLY" }]],
  ];
  const modules = import.meta.glob("./*.ts");

  test.each(screens)("%s reads within its budget and half of Convex's limit", async (name, ask) => {
    const [query, args] = ask();
    const [file, exported] = getFunctionName(query).split(":");
    const loaded = (await modules[`./${file}.ts`]()) as Record<string, { _handler?: unknown }>;
    const { bytes } = await readBy(t, seeded.userId, loaded[exported], args);
    withinBudget(name, bytes);
  });
});
