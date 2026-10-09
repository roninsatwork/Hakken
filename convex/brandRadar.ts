import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { PlannedCheck } from "./fanOutFirstCheckSteps";
import { partIsOn } from "./collectionParts";
import { readFanOutLimits } from "./fanOutLimits";
import { localPeriodStart } from "./dataForSeoLocalOperations";
import { RADAR_DAYS, radarHostAskedFor, radarParams } from "./dataForSeoRadarOperations";
import type { PullForParse } from "./seoCollectionParse";
import { findBrandMentions, type BrandName } from "./utils/websiteBrands";
import { isTrackedHold } from "./utils/websitePairing";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { getErrorMessage } from "./utils/lang";
import { appError } from "./utils/appError";
import { packColumn, unpackColumn } from "./utils/packedColumns";

/**
 * Brand radar (docs/plans/active/discovery-local-reputation-ai-plan.md, step
 * 4): each month, the questions where Google's AI answers name a website —
 * the company's own and the rivals watched beside it — read once for everyone
 * (`radarSchema.ts`) and written only when something moved (rule 11).
 */

type Reader = { db: QueryCtx["db"] };
/** Sources kept from one answer: the pages quoted under it. */
const SOURCES_KEPT = 10;
/** Months kept in a website's series. */
const MONTHS_KEPT = 36;

/** The rivals watched beside a website: the company's competitors tracked against it, first tracked first. */
export async function radarRivals(ctx: Reader, hold: Doc<"companyWebsites">, limit: number): Promise<Doc<"websites">[]> {
  const holds = await ctx.db
    .query("companyWebsites")
    .withIndex("by_company_against", (q) => q.eq("companyId", hold.companyId).eq("againstWebsiteId", hold.websiteId))
    .take(limit);
  const websites = [];
  for (const rival of holds.filter(isTrackedHold)) {
    const website = await ctx.db.get(rival.websiteId);
    if (website) websites.push(website);
  }
  return websites;
}

/** A website's reading this month and its rivals', while the company has Brand radar on (D16). */
export async function radarSteps(
  ctx: MutationCtx,
  cycle: Pick<Doc<"seoCollectionCycles">, "companyId" | "startedAt">,
  hold: Doc<"companyWebsites">,
  plan: (params: Record<string, unknown>, keyStartedAt: number, sendIndex: number) => Promise<PlannedCheck>,
) {
  if (isTrackedHold(hold) || !(await partIsOn(ctx, cycle.companyId, "brandRadar"))) return [];
  const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
  const own = await ctx.db.get(hold.websiteId);
  if (!own) return [];
  const websites = [own, ...await radarRivals(ctx, hold, limits.radarRivals)];
  const month = localPeriodStart(cycle.startedAt, RADAR_DAYS);
  return websites.map((website) => async (sendIndex: number, room: number) => {
    if (room < 1) return { planned: 0, reused: 0, capped: true };
    const outcome = await plan(radarParams(website.host, hold.locationCode, limits.radarQuestions), month, sendIndex);
    return outcome.reused ? { planned: 0, reused: 1 } : { planned: 1, reused: 0 };
  });
}

type Item = Record<string, unknown>;
const asItem = (value: unknown): Item | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Item) : null);
const asText = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);

export type RadarItem = { question: string; volume: number; firstAt: number | null; sources: string[] };

/** One reading: how many answers in all, and each question with its asks, where the website is named, and the pages quoted. */
export function parseRadar(result: unknown, names: readonly BrandName[]): { total: number; items: RadarItem[] } {
  const first = asItem(Array.isArray(result) ? result[0] : result) ?? {};
  const total = typeof first.total_count === "number" ? first.total_count : 0;
  const seen = new Set<string>();
  const items: RadarItem[] = [];
  for (const entry of Array.isArray(first.items) ? first.items : []) {
    const item = asItem(entry);
    const question = asText(item?.question);
    if (!item || !question || seen.has(question.toLowerCase())) continue;
    seen.add(question.toLowerCase());
    const answer = asText(item.answer) ?? "";
    const found = names.length > 0 ? findBrandMentions(answer, names) : null;
    const sources = [...new Set((Array.isArray(item.sources) ? item.sources : []).map((source) => asText(asItem(source)?.url)).filter((url): url is string => Boolean(url)))];
    items.push({
      question,
      volume: typeof item.ai_search_volume === "number" ? item.ai_search_volume : 0,
      firstAt: found ? found.at : null,
      sources: sources.slice(0, SOURCES_KEPT),
    });
  }
  return { total, items };
}

const radarItemValidator = v.object({ question: v.string(), volume: v.number(), firstAt: v.union(v.number(), v.null()), sources: v.array(v.string()) });

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** A month's reading kept: the questions record replaced when it moved, and the month's figures in the series. */
export const writeRadar = internalMutation({
  args: { websiteId: v.id("websites"), locationCode: v.number(), month: v.string(), total: v.number(), items: v.array(radarItemValidator), pullId: v.id("seoDataPulls") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const website = await ctx.db.get(args.websiteId);
    if (!website) return null;
    const pages: string[] = [];
    const pageIndex = new Map<string, number>();
    const starts: number[] = [];
    const sourceOf: number[] = [];
    for (const item of args.items) {
      starts.push(sourceOf.length);
      for (const url of item.sources) {
        let at = pageIndex.get(url);
        if (at === undefined) {
          at = pages.length;
          pages.push(url);
          pageIndex.set(url, at);
        }
        sourceOf.push(at);
      }
    }
    const record = {
      websiteId: args.websiteId,
      locationCode: args.locationCode,
      month: args.month,
      total: args.total,
      questions: args.items.map((item) => item.question),
      volumes: packColumn(args.items.map((item) => item.volume)),
      firstAt: packColumn(args.items.map((item) => item.firstAt ?? undefined)),
      pages,
      starts: packColumn(starts),
      sourceOf: packColumn(sourceOf),
      pullId: args.pullId,
      updatedAt: Date.now(),
    };
    const held = await ctx.db.query("brandRadarQuestionParts").withIndex("by_website_place", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", args.locationCode)).unique();
    const same = held && held.month === record.month && held.total === record.total && JSON.stringify([held.questions, held.volumes, held.firstAt, held.pages, held.starts, held.sourceOf]) === JSON.stringify([record.questions, record.volumes, record.firstAt, record.pages, record.starts, record.sourceOf]);
    if (!held) await ctx.db.insert("brandRadarQuestionParts", record);
    else if (!same) await ctx.db.replace(held._id, record);

    // The month in the series: answers naming it, the asks behind them, its own pages cited.
    const own = new Set(pages.filter((url) => hostOf(url) === website.host || hostOf(url).endsWith(`.${website.host}`)));
    const figures = { mentions: args.total, asks: args.items.reduce((sum, item) => sum + item.volume, 0), pages: own.size };
    const series = await ctx.db.query("brandRadarMonths").withIndex("by_website_place", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", args.locationCode)).unique();
    const months = series?.months ?? [];
    const columns = {
      mentions: series ? unpackColumn(series.mentions) : [],
      asks: series ? unpackColumn(series.asks) : [],
      pages: series ? unpackColumn(series.pages) : [],
    };
    const at = months.indexOf(args.month);
    if (at >= 0 && columns.mentions[at] === figures.mentions && columns.asks[at] === figures.asks && columns.pages[at] === figures.pages) return null;
    if (at >= 0) {
      columns.mentions[at] = figures.mentions;
      columns.asks[at] = figures.asks;
      columns.pages[at] = figures.pages;
    } else {
      months.push(args.month);
      columns.mentions.push(figures.mentions);
      columns.asks.push(figures.asks);
      columns.pages.push(figures.pages);
    }
    const order = months.map((month, index) => ({ month, index })).sort((left, right) => left.month.localeCompare(right.month)).slice(-MONTHS_KEPT);
    const kept = {
      months: order.map((entry) => entry.month),
      mentions: packColumn(order.map((entry) => columns.mentions[entry.index] ?? undefined)),
      asks: packColumn(order.map((entry) => columns.asks[entry.index] ?? undefined)),
      pages: packColumn(order.map((entry) => columns.pages[entry.index] ?? undefined)),
      updatedAt: Date.now(),
    };
    if (series) await ctx.db.patch(series._id, kept);
    else await ctx.db.insert("brandRadarMonths", { websiteId: args.websiteId, locationCode: args.locationCode, ...kept });
    return null;
  },
});

/** File one reading (`seoCollectionParse.ts` hands it here). Failures are recorded on the pull. */
export async function fileRadarPull(ctx: ActionCtx, pullId: Id<"seoDataPulls">, pull: PullForParse): Promise<null> {
  try {
    const sent = JSON.parse(pull.taskArgsJson ?? "{}") as Record<string, unknown>;
    const host = radarHostAskedFor(sent);
    if (!host) throw appError("INVALID_INPUT", "This reading does not say which website it was for.");
    const [resolved] = await ctx.runQuery(internal.websites.resolveWebsiteIdsByHostInternal, { hosts: [host] });
    if (!resolved) return null;
    const named = await ctx.runQuery(internal.holdProfiles.listNamedWebsitesInternal, { limit: 2_000 });
    // Its names as companies hold them; its host's first word where none are held.
    const names = named.find((website) => website.websiteId === resolved.websiteId)?.brandNames
      ?? [{ name: host.split(".")[0], isPrimary: true }];
    const { total, items } = parseRadar(JSON.parse(pull.resultJson ?? "null"), names);
    const locationCode = typeof sent.location_code === "number" ? sent.location_code : DEFAULT_LOCATION_CODE;
    const month = pull.runDay.slice(0, 7);
    await ctx.runMutation(internal.brandRadar.writeRadar, { websiteId: resolved.websiteId, locationCode, month, total, items, pullId });
  } catch (error) {
    await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, { pullId, error: getErrorMessage(error) });
  }
  return null;
}
