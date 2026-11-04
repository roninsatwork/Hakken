import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { holdFor } from "./assistantReads";
import type { SiteReader } from "./siteAccess";
import { readSiteAndRivals, readSiteSeries } from "./siteCharts";
import { readListRivals, readMarketMap } from "./siteCompetitors";
import { readRivalMoves } from "./siteRivalMoves";
import { readMentions, readShareOfVoice } from "./siteAi";
import { readAiDemand } from "./siteAiDemand";
import { readRadarOverview } from "./siteBrandRadar";
import { readSiteAudit } from "./siteCrawl";
import { readListAbove, readListFeatures } from "./siteGoogleSerp";
import { readListSearches } from "./siteGoogle";
import { readOverviewExtras } from "./siteOverview";
import { readMentionsAgainstRivals, readWebMentions } from "./siteWebMentions";
import { readReviewsAgainstRivals, readYourReviews } from "./siteReviews";
import { calendarPeriodValidator, periodSpan, spanBefore, stepOf, ukDay, type CalendarPeriod } from "./utils/calendarPeriods";
import { pageDataFor } from "./utils/sees/pageData";
import { VISIBILITY_DATED, VISIBILITY_LINE_MEASURES, VISIBILITY_SCREENS, VISIBILITY_SEGMENT, type VisibilityLineMeasure, type VisibilityScreen } from "./utils/visibilityAskScreens";
import type { PageChart } from "./utils/assistantPageCharts";

/**
 * Every Visibility chart page of Visibility's second half, as Ask Hakken reads it (ask-hakken-every-chart-page-plan-
 * 2026-11-03.md, section 10: "today it can't read any Visibility list and draws only websites and positions at the
 * newest check"). Each screen is read through the very function its page reads through (`readSiteSeries`,
 * `readMarketMap`, `readShareOfVoice`, …), for the conversation's company and the website named, over the period asked
 * where the screen follows the date menu, so a figure in an answer is the figure on the screen, with the screen's
 * address to check it. Cut as the eye cuts a page's figures (`pageDataFor`: lists to their first rows, a dated list to
 * its newest), and never a guessed money figure (decision 4): what adverts cost, what a click costs and what visits
 * would be worth stay stored, unread here. Nothing asks DataForSEO or Google.
 */

/** Never handed over: our data supplier's guesses at money (Anthony, 2026-11-03: "Take it off", then "Yes, all of it"). */
const MONEY = new Set(["trafficValue", "paidTrafficCost", "trafficCost", "cpc", "perCheckUsd"]);

/** An answer without its money fields, its icons or its boxes' codes, at every depth. */
function withoutMoney(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutMoney);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !MONEY.has(key)).map(([key, inner]) => [key, withoutMoney(inner)]));
}

/** A calendar period's days on a Visibility page, and the step its charts are drawn in, as the date menu reads them. */
function datesOf(period: CalendarPeriod) {
  const today = ukDay();
  const span = periodSpan(period, today, today) ?? { from: today, to: today, whole: false };
  const before = spanBefore(period, span);
  return { from: span.from, to: span.to, step: stepOf(period), before: { from: before.from, to: before.to } };
}

/** A tenant read's context for the conversation's company: the screens' reads check the website is the company's. */
const readerOf = (ctx: QueryCtx, companyId: Id<"companies">): SiteReader & QueryCtx => ({ ...ctx, companyId }) as SiteReader & QueryCtx;

/** One screen's figures, through the screen's own reads. */
async function screenFigures(ctx: SiteReader & QueryCtx, siteId: Id<"companyWebsites">, screen: VisibilityScreen, period: CalendarPeriod, rivalHost: string | undefined) {
  const dates = datesOf(period);
  const series = (withRivals = false) => readSiteSeries(ctx, { siteId, from: dates.from, to: dates.to, step: dates.step, withRivals });
  switch (screen) {
    case "overview": return { series: await series(), competitors: (await readOverviewExtras(ctx, { siteId })).competitors };
    case "googleAbove": return { searches: await readListAbove(ctx, { siteId }) };
    case "googleFeatures": return { features: await readListFeatures(ctx, { siteId }), series: await series() };
    case "googleMoves": return {
      series: await series(),
      seriesBefore: await readSiteSeries(ctx, { siteId, from: dates.before.from, to: dates.before.to, step: dates.step }),
    };
    case "googleSearches": return { searches: await readListSearches(ctx, { siteId }) };
    case "competitors": return {
      figures: await readSiteAndRivals(ctx, { siteId }),
      compared: await readListRivals(ctx, { siteId }),
      series: await series(true),
      moves: await readRivalMoves(ctx, { siteId, period }),
    };
    case "competitorsMap": return { market: await readMarketMap(ctx, { siteId }) };
    case "competitorsRival": {
      const figures = await readSiteAndRivals(ctx, { siteId });
      // The rival named, else the one with the most estimated visitors at its newest check.
      const named = rivalHost?.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
      const rival = named
        ? figures.find((row) => !row.isYou && row.host.replace(/^www\./, "").toLowerCase() === named)
        : [...figures].filter((row) => !row.isYou).sort((left, right) => (right.estimatedTraffic ?? -1) - (left.estimatedTraffic ?? -1))[0];
      if (!rival) return { problem: `${rivalHost ?? "That website"} is not one of the rivals watched beside this website. Its rivals: ${figures.filter((row) => !row.isYou).map((row) => row.host).join(", ")}.` };
      const lines = (await series(true)).filter((line) => line.isYou || line.host === rival.host);
      return { rival: rival.host, figures: figures.filter((row) => row.isYou || row.host === rival.host), lines };
    }
    case "aiDemand": return { demand: await readAiDemand(ctx, { siteId }) };
    case "aiMentions": return { mentions: await readMentions(ctx, siteId), series: await series() };
    case "aiShare": return { engines: await readShareOfVoice(ctx, { siteId }) };
    case "radar": return { radar: await readRadarOverview(ctx, { siteId }) };
    case "mentions": {
      const answer = await readWebMentions(ctx, { siteId, period });
      // The page's boxes: the pages found in the dates and in the span before, as the page counts them.
      const inDates = (span: { from: string; to: string }) => answer.rows.filter((row) => row.day >= span.from && row.day <= span.to);
      const now = inDates(dates);
      const was = inDates(dates.before);
      return {
        names: answer.names,
        boxes: {
          newMentions: now.length, newMentionsBefore: was.length,
          speakWell: now.filter((row) => row.tone === 1).length, speakBadly: now.filter((row) => row.tone === 2).length,
          withoutLink: now.filter((row) => row.linked === 0).length, withoutLinkBefore: was.filter((row) => row.linked === 0).length,
        },
        mentions: answer.rows,
      };
    }
    case "mentionsRivals": return { rivals: await readMentionsAgainstRivals(ctx, { siteId, period, step: dates.step }) };
    case "reviews": return { reviews: await readYourReviews(ctx, { siteId, period, step: dates.step }) };
    case "reviewsRivals": return { rivals: await readReviewsAgainstRivals(ctx, { siteId, period, step: dates.step }) };
    case "paid": return { series: await series() };
    case "audit": return { audit: await readSiteAudit(ctx, { siteId }), series: await series() };
  }
}

export const visibilityScreenInternal = internalQuery({
  args: {
    companyId: v.id("companies"),
    website: v.string(),
    screen: v.union(...VISIBILITY_SCREENS.map((screen) => v.literal(screen))),
    period: calendarPeriodValidator,
    /** A rival's address, for its own screen (`competitorsRival`); the biggest rival where none is named. */
    rival: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const found = await holdFor(ctx, args.companyId, args.website);
    if ("problem" in found) return { ok: false, problem: found.problem };
    const siteId = found.held.hold._id;
    const host = found.held.summary.host;
    const figures = await screenFigures(readerOf(ctx, args.companyId), siteId, args.screen, args.period, args.rival);
    if ("problem" in figures && typeof figures.problem === "string") return { ok: false, problem: figures.problem };
    const dated = VISIBILITY_DATED.has(args.screen);
    const segment = VISIBILITY_SEGMENT[args.screen];
    // A rival's own screen is opened by its hold, as Side by side's rows open it.
    const rivalHold = args.screen === "competitorsRival" && "rival" in figures && typeof figures.rival === "string" ? await holdFor(ctx, args.companyId, figures.rival) : null;
    const query = [...(dated ? [`period=${args.period}`] : []), ...(rivalHold?.held ? [`rival=${rivalHold.held.hold._id}`] : [])];
    return {
      ok: true,
      website: host,
      screen: args.screen,
      ...(dated ? { period: args.period, dates: datesOf(args.period) } : { period: "the newest check, whatever the dates" }),
      // Checks come on set days, a month apart: a span holding none shows nothing, and the check before the dates is
      // each line's `before`.
      figures: pageDataFor(withoutMoney(figures)),
      link: `/app/sites/${siteId}${segment ? `/${segment}` : ""}${query.length > 0 ? `?${query.join("&")}` : ""}`,
    };
  },
});

/** Each line measure's figure at a point, as the Overview's chart reads it. */
const LINE_FIELD: Record<VisibilityLineMeasure, (point: Record<string, unknown>) => number | null> = {
  estimatedVisitors: (point) => (typeof point.estimatedTraffic === "number" ? point.estimatedTraffic : null),
  searches: (point) => (typeof point.rankedKeywordsTotal === "number" ? point.rankedKeywordsTotal : typeof point.keywords === "number" ? point.keywords : null),
  topThree: (point) => {
    const bands = (point.allBands ?? point.bands) as { p01_03?: number } | undefined;
    return typeof bands?.p01_03 === "number" ? bands.p01_03 : null;
  },
  linkingWebsites: (point) => (typeof point.referringDomains === "number" ? point.referringDomains : null),
};
const LINE_TITLE: Record<VisibilityLineMeasure, string> = {
  estimatedVisitors: "Estimated visitors from Google",
  searches: "Searches ranked for",
  topThree: "Searches in Google's top 3",
  linkingWebsites: "Linking websites",
};

/**
 * A line over the period's checks: the website against one rival watched beside it — the one named, else the one with
 * the most at the newest check — on estimated visitors, searches ranked for, searches in the top 3 or linking websites,
 * drawn as a page's chart is (`pageChart`): the website's line, and the rival's beside it. Each point a check, dated by
 * its step, with the check before the dates first where one was held. The figures are the screens' own.
 */
export const visibilityLineInternal = internalQuery({
  args: {
    companyId: v.id("companies"),
    website: v.string(),
    period: calendarPeriodValidator,
    measure: v.union(...VISIBILITY_LINE_MEASURES.map((measure) => v.literal(measure))),
    rival: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: true; chart: PageChart; figures: PageChart["groups"] } | { ok: false; problem: string }> => {
    const found = await holdFor(ctx, args.companyId, args.website);
    if (!found.held) return { ok: false, problem: found.problem ?? "That website is not one of this company's." };
    const siteId = found.held.hold._id;
    const dates = datesOf(args.period);
    const lines = await readSiteSeries(readerOf(ctx, args.companyId), { siteId, from: dates.from, to: dates.to, step: dates.step, withRivals: true });
    const read = LINE_FIELD[args.measure];
    // Each point by its step's first day, as the screens' charts date it; the check before the dates by its own day.
    const pointsOf = (line: (typeof lines)[number]) => [...(line.before ? [line.before] : []), ...line.points]
      .map((point) => ({ day: point.day, value: read(point as unknown as Record<string, unknown>) }))
      .filter((point): point is { day: string; value: number } => point.value !== null);
    const own = lines.find((line) => line.isYou);
    const rivals = lines.filter((line) => !line.isYou);
    if (!own) return { ok: false, problem: "That website has no checks to draw." };
    const named = args.rival?.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
    const rival = named
      ? rivals.find((line) => line.host.replace(/^www\./, "").toLowerCase() === named)
      : [...rivals].sort((left, right) => (pointsOf(right).at(-1)?.value ?? -1) - (pointsOf(left).at(-1)?.value ?? -1))[0];
    if (named && !rival) return { ok: false, problem: `${args.rival} is not one of the rivals drawn beside ${own.host}. Its rivals: ${rivals.map((line) => line.host).join(", ")}.` };
    const mine = pointsOf(own);
    if (mine.length === 0) return { ok: false, problem: `${own.host} has no check with that figure in those dates, nor before them: Visibility checks a website about once a month.` };
    const theirs = new Map((rival ? pointsOf(rival) : []).map((point) => [point.day, point.value]));
    // Each check of the website; the rival's in the same step, where it was checked then.
    const groups = mine.map((point) => ({ name: point.day, value: point.value, ...(theirs.has(point.day) ? { before: theirs.get(point.day)! } : {}) }));
    const chart: PageChart = {
      look: "pageChart",
      kind: "line",
      title: LINE_TITLE[args.measure],
      measure: own.host,
      ...(rival ? { against: rival.host } : {}),
      groups,
      link: `/app/sites/${siteId}?period=${args.period}`,
    };
    return { ok: true, chart, figures: groups };
  },
});
