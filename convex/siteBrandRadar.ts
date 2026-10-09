import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { groupOwner, listHold, requireMySite } from "./siteAccess";
import { holdQuestions } from "./holdLists";
import { readFanOutLimits } from "./fanOutLimits";
import { radarRivals } from "./brandRadar";
import { countryCodeOf } from "./utils/seoLocations";
import { unpackColumn } from "./utils/packedColumns";
import { siteKindOf } from "./utils/siteKinds";
import { MAX_PROMPTS_PER_WEBSITE } from "./utils/promptLimits";
import type { Site } from "./websiteSiteRows";

/**
 * Discovery → Brand radar (docs/plans/active/discovery-local-reputation-ai-
 * plan.md, step 4, D18; drawn as "Brand radar · Overview" and "Brand radar ·
 * Websites AI cites"): how often Google's AI answers name the website beside
 * the rivals watched with it, the questions behind them, and the websites
 * those answers quote — every figure worked out here from each website's
 * monthly reading (rule 4).
 */

type Reader = { db: QueryCtx["db"] };
type Reading = { website: Doc<"websites">; you: boolean; part: Doc<"brandRadarQuestionParts"> | null; months: Doc<"brandRadarMonths"> | null };

/** The website's reading and its rivals', in the country it is watched from. */
async function readings(ctx: Reader, site: Site): Promise<{ readings: Reading[]; locationCode: number }> {
  const hold = groupOwner(site);
  const locationCode = countryCodeOf(site.place);
  if (!hold) return { readings: [], locationCode };
  const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
  const own = await ctx.db.get(hold.websiteId);
  const websites = [...(own ? [own] : []), ...await radarRivals(ctx, hold, limits.radarRivals)];
  const out: Reading[] = [];
  for (const website of websites) {
    const [part, months] = await Promise.all([
      ctx.db.query("brandRadarQuestionParts").withIndex("by_website_place", (q) => q.eq("websiteId", website._id).eq("locationCode", locationCode)).unique(),
      ctx.db.query("brandRadarMonths").withIndex("by_website_place", (q) => q.eq("websiteId", website._id).eq("locationCode", locationCode)).unique(),
    ]);
    out.push({ website, you: website._id === hold.websiteId, part, months });
  }
  return { readings: out, locationCode };
}

/** A reading's questions, each with its asks, where the website is named, and the pages quoted. */
function questionsOf(part: Doc<"brandRadarQuestionParts">) {
  const volumes = unpackColumn(part.volumes);
  const firstAt = unpackColumn(part.firstAt);
  const starts = unpackColumn(part.starts);
  const sourceOf = unpackColumn(part.sourceOf);
  return part.questions.map((question, at) => {
    const from = starts[at] ?? 0;
    const to = at + 1 < starts.length ? starts[at + 1] ?? sourceOf.length : sourceOf.length;
    return {
      question,
      volume: volumes[at] ?? 0,
      firstAt: firstAt[at] ?? null,
      pages: sourceOf.slice(from, to).map((index) => part.pages[index ?? 0]).filter((url): url is string => Boolean(url)),
    };
  });
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
};
const pathOf = (url: string) => {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
};
const onHost = (url: string, host: string) => hostOf(url) === host || hostOf(url).endsWith(`.${host}`);

export const radarOverview = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    month: v.union(v.string(), v.null()),
    perCheckUsd: v.union(v.number(), v.null()),
    businesses: v.array(v.object({
      websiteId: v.id("websites"),
      host: v.string(),
      you: v.boolean(),
      mentions: v.union(v.number(), v.null()),
      before: v.union(v.number(), v.null()),
      asks: v.union(v.number(), v.null()),
      pagesCited: v.number(),
      /** Each month's mentions, for the chart: as many as `months`. */
      series: v.array(v.union(v.number(), v.null())),
    })),
    months: v.array(v.string()),
    /** Answers naming the website that cite one of its pages. */
    yourCitedAnswers: v.number(),
    questions: v.array(v.object({
      question: v.string(),
      volume: v.number(),
      /** Where the website came among those named, or null when not named. */
      you: v.union(v.number(), v.null()),
      rivals: v.array(v.string()),
      yourPage: v.union(v.string(), v.null()),
      tracked: v.boolean(),
    })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const { readings: all } = await readings(ctx, site);
    const months = [...new Set(all.flatMap((reading) => reading.months?.months ?? []))].sort().slice(-12);
    const tracked = new Set((await holdQuestions(ctx, listHold(site), MAX_PROMPTS_PER_WEBSITE)).map((question) => question.prompt.toLowerCase()));
    const businesses = all.map((reading) => {
      const series = reading.months;
      const mentions = series ? unpackColumn(series.mentions) : [];
      const asks = series ? unpackColumn(series.asks) : [];
      const at = (month: string) => series?.months.indexOf(month) ?? -1;
      const last = series?.months.at(-1) ?? null;
      const ownPages = new Set((reading.part?.pages ?? []).filter((url) => onHost(url, reading.website.host)));
      return {
        websiteId: reading.website._id,
        host: reading.website.displayHost,
        you: reading.you,
        mentions: last ? mentions[at(last)] ?? null : null,
        before: series && series.months.length > 1 ? mentions[series.months.length - 2] ?? null : null,
        asks: last ? asks[at(last)] ?? null : null,
        pagesCited: ownPages.size,
        series: months.map((month) => (at(month) >= 0 ? mentions[at(month)] ?? null : null)),
      };
    });

    // Every question naming the website or a rival, once: where each business came, by where the answer first names it.
    const byQuestion = new Map<string, { question: string; volume: number; named: Array<{ host: string; you: boolean; at: number }>; yourPage: string | null }>();
    let yourCitedAnswers = 0;
    for (const reading of all) {
      if (!reading.part) continue;
      for (const entry of questionsOf(reading.part)) {
        const key = entry.question.toLowerCase();
        const row = byQuestion.get(key) ?? { question: entry.question, volume: entry.volume, named: [], yourPage: null };
        if (entry.firstAt !== null) row.named.push({ host: reading.website.displayHost, you: reading.you, at: entry.firstAt });
        if (reading.you) {
          const own = entry.pages.find((url) => onHost(url, reading.website.host));
          if (own) {
            row.yourPage = pathOf(own);
            yourCitedAnswers += 1;
          }
        }
        byQuestion.set(key, row);
      }
    }
    const pull = all.find((reading) => reading.you)?.part?.pullId;
    const cost = pull ? (await ctx.db.get(pull as Id<"seoDataPulls">))?.costUsd ?? null : null;
    return {
      month: months.at(-1) ?? null,
      perCheckUsd: cost && cost > 0 ? cost : null,
      businesses,
      months,
      yourCitedAnswers,
      questions: [...byQuestion.values()].map((row) => {
        const order = [...row.named].sort((left, right) => left.at - right.at);
        const you = order.findIndex((entry) => entry.you);
        return {
          question: row.question,
          volume: row.volume,
          you: you >= 0 ? you + 1 : null,
          rivals: order.filter((entry) => !entry.you).map((entry) => entry.host),
          yourPage: row.yourPage,
          tracked: tracked.has(row.question.toLowerCase()),
        };
      }),
    };
  },
});

const kindValidator = v.union(v.literal("DIRECTORY"), v.literal("REVIEWS"), v.literal("FORUM"), v.literal("NEWS"), v.literal("VIDEO"), v.literal("REFERENCE"), v.literal("WEBSITE"), v.literal("RIVAL"), v.literal("YOURS"));

export const radarSources = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    websites: v.array(v.object({
      host: v.string(),
      kind: kindValidator,
      times: v.number(),
      besideYou: v.number(),
      besideRivals: v.number(),
      /** How many of the rivals watched it cites beside. */
      rivalsBeside: v.number(),
    })),
    pages: v.array(v.object({ url: v.string(), host: v.string(), kind: kindValidator, times: v.number(), citedFor: v.string() })),
    yourPages: v.number(),
    yourTimes: v.number(),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const { readings: all } = await readings(ctx, site);
    const own = all.find((reading) => reading.you)?.website.host ?? site.website.host;
    const rivalHosts = all.filter((reading) => !reading.you).map((reading) => reading.website.host);
    const kindOf = (host: string) => (host === own || host.endsWith(`.${own}`) ? "YOURS" as const
      : rivalHosts.some((rival) => host === rival || host.endsWith(`.${rival}`)) ? "RIVAL" as const : siteKindOf(host));
    const websites = new Map<string, { times: number; besideYou: number; besideRivals: number; rivals: Set<string> }>();
    const pages = new Map<string, { times: number; citedFor: string }>();
    for (const reading of all) {
      if (!reading.part) continue;
      for (const entry of questionsOf(reading.part)) {
        for (const url of new Set(entry.pages)) {
          const host = hostOf(url);
          const row = websites.get(host) ?? { times: 0, besideYou: 0, besideRivals: 0, rivals: new Set<string>() };
          row.times += 1;
          if (reading.you) row.besideYou += 1;
          else {
            row.besideRivals += 1;
            row.rivals.add(reading.website.host);
          }
          websites.set(host, row);
          const page = pages.get(url) ?? { times: 0, citedFor: entry.question };
          page.times += 1;
          pages.set(url, page);
        }
      }
    }
    const yours = [...pages.entries()].filter(([url]) => kindOf(hostOf(url)) === "YOURS");
    return {
      websites: [...websites.entries()].map(([host, row]) => ({ host, kind: kindOf(host), times: row.times, besideYou: row.besideYou, besideRivals: row.besideRivals, rivalsBeside: row.rivals.size })),
      pages: [...pages.entries()].sort((left, right) => right[1].times - left[1].times).slice(0, 5)
        .map(([url, row]) => ({ url, host: hostOf(url), kind: kindOf(hostOf(url)), times: row.times, citedFor: row.citedFor })),
      yourPages: yours.length,
      yourTimes: yours.reduce((sum, [, row]) => sum + row.times, 0),
    };
  },
});
