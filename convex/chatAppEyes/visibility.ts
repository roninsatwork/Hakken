import type { Id } from "../_generated/dataModel";
import { readSiteMoneyPages } from "../moneyPageChecks";
import { pageKindChoicesOf } from "../pageKinds";
import { type SiteReader, findMySite } from "../siteAccess";
import { readOverviewGaps } from "../siteAiOverviewGaps";
import { readListCitedPages, readMentions, readShareOfVoice } from "../siteAi";
import { readBusinessesRecommended, readNotCitedPages } from "../siteAiApps";
import { readAiDemand } from "../siteAiDemand";
import { readAiPageDetail } from "../siteAiPageDetail";
import { readKeywordAngle, readListAngles, readTrackedFanOut } from "../siteAngles";
import { readAnswerQuestions, readAnswerRecord, readListAnswers } from "../siteAnswers";
import { readAnswerShown } from "../siteAnswerShown";
import { readYourAssets } from "../siteAssets";
import { readBandMoves, readListBandMoves } from "../siteBands";
import { readRadarOverview, readRadarSources } from "../siteBrandRadar";
import { readBusinessDetail } from "../siteBusinessDetail";
import { readSiteAndRivals, readSiteSeries } from "../siteCharts";
import { readSiteChecks } from "../siteChecks";
import { readContentGap, readListRivals, readMarketMap, readOrganicCompetitors, readSuggested } from "../siteCompetitors";
import { readSiteAudit } from "../siteCrawl";
import { readCrawlProblemPages } from "../siteCrawlDetail";
import { readDiscoveryTotal, readSharedWithRival } from "../siteDiscovery";
import { readListSearches, readSearchPositions } from "../siteGoogle";
import { readListAbove, readListFeatures, readListQuestions } from "../siteGoogleSerp";
import { readKeywordFigures, readListKeywords, readListMoves, readListPages, readListSections, readPageFigures } from "../siteKeywords";
import {
  readAnchorFigures, readLinkChangeSteps, readListAnchors, readListBacklinks, readListBrokenBacklinks, readListReferringDomains, readListReferringIps,
  readServerFigures, readTopSubnets,
} from "../siteLinkLists";
import { readAnchorRecord, readLinkingWebsiteRecord } from "../siteLinkRecords";
import { readLinkListTotals, readLinkProfile, readLinkProfilesAgainstRivals } from "../siteLinks";
import { readLocalListings } from "../siteLocalListings";
import { readMapRankings, readMapSearch } from "../siteLocalMaps";
import { readLocalMarket, readRivalActivity } from "../siteLocalMarket";
import { readBusinessProfile, readEveryOffice } from "../siteLocalProfile";
import { readOverviewExtras } from "../siteOverview";
import { readListPaidKeywords } from "../sitePaid";
import { readQuestionDetail, readWebsiteDetail } from "../siteRadarDetails";
import { readFeatureKeywords, readKeywordRecord, readPageRecord, readSharedSearches } from "../siteRecords";
import { readReviewsAgainstRivals, readWhatCustomersSay, readYourReviews } from "../siteReviews";
import { readRivalCitedPages } from "../siteRivalCited";
import { readRivalMoves } from "../siteRivalMoves";
import { readMentionsAgainstRivals, readWebMentions, readWhereToGetListed } from "../siteWebMentions";
import { readMySite } from "../sites";
import { readListYourPages } from "../yourPages";
import { periodSpan, spanBefore, stepOf, ukDay, type CalendarPeriod } from "../utils/calendarPeriods";
import {
  aboveSeen, aiDemandSeen, aiMentionsSeen, auditCheckNameFrom, auditSeen, capitalised, engineNameFrom, featureNameFrom, featuresSeen,
  marketMapRows, marketSeen, mentionsRivalsSeen, overviewSeen, paidSeen, radarSeen, reviewsRivalsSeen, reviewsSeen, rivalSeen, searchesSeen,
  shareSeen, sideBySideSeen, trackedFanOutRows, webMentionsSeen, winsLossesSeen, ENGLISH_STEPS,
} from "../utils/sees/eyeData/visibility";
import {
  anchorsSees, comparedSees, ipsSees, linkChangesSees, linkGroupNameFrom, qualitySees, summarySees, whereSees,
} from "../utils/sees/eyeData/visibilityBacklinks";
import { bandSquareSees, bandsSees, keywordsSees, newLostSees, pagesSees, readBandMove, searchSees, structureSees, withoutGuessedMoney } from "../utils/sees/eyeData/visibilityKeywords";
import { allBacklinksSees, anchorSees, brokenLinksSees, linkingWebsiteSees, linkingWebsitesSees } from "../utils/sees/eyeData/visibilityLinkLists";
import { activitySees, businessSees, listingsSees, mapsSees, nearbySees, profileSees } from "../utils/sees/eyeData/visibilityLocal";
import { questionSees, sourceWebsiteSees, sourcesSees, yourPagesEye } from "../utils/sees/eyeData/visibilityRadar";
import { englishDay } from "../utils/sees/eyeData/englishDays";
import { pageKindLabel } from "../utils/sees/eyeData/searchConsoleWords";
import { englishNames, englishWords } from "../utils/sees/serverWords";
import type { EyeBuilders, EyeReads, EyeRun } from "./types";

/**
 * Visibility's screens for a chat app's question, built as the screens build them
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). The pattern is
 * Google Analytics Overview's (`googleAnalytics.ts`): the screens' own reader
 * helpers as reads, the screen's own pure figures function
 * (`utils/sees/eyeData/visibility.ts`, `visibilityBacklinks.ts`,
 * `visibilityKeywords.ts`), English words from `messages/en.json`
 * (`utils/sees/serverWords.ts`). A screen whose eye reads its query's answer as
 * it comes (Local, most of Brand radar, Your pages, the record screens) hands
 * on that answer.
 *
 * Each screen opens as a reader first sees it: every list on its first page of
 * 25 in its opening order, no filter, no search, no office chosen. A screen
 * about one thing (a feature, a rival, an answer, a page the assistants read, an
 * audit problem, a linking website, an anchor, a search, a page, a square of
 * Position bands, a map search, a business, a question, a source website) takes
 * it from the ask's key, and is null without one. Nothing is asked of
 * DataForSEO or Google: every read is of what's saved.
 */

/** What the keyword list holds of every search the site ranks for (`sites.coverageOf`): the supplier's own moves across them all. */
type Coverage = { moves?: { fresh: number | null; up: number | null; down: number | null; lost: number | null } | null } | null;
type Site = { host: string; relationship: "OWNED" | "TRACKED"; checkDays: string[]; rivals: Array<{ siteId: Id<"companyWebsites">; host: string }>; coverage?: Coverage };

/** The open website's header, as its screens read it (`sites.getMySite`): only the parts the eye's figures name. */
async function siteForEye(reader: SiteReader, args: Record<string, unknown>): Promise<Site | null> {
  const site = await readMySite(reader, args.siteId as Id<"companyWebsites">);
  if (!site) return null;
  return {
    host: site.host,
    relationship: site.relationship,
    checkDays: site.checkDays,
    rivals: site.rivals.map((rival) => ({ siteId: rival.siteId, host: rival.host })),
    coverage: site.coverage,
  };
}

/** The website's Classifications, A to Z, as Top pages' Type column names a page's kind (`usePageKinds`); null for none. */
async function pageKindsForEye(reader: SiteReader, args: Record<string, unknown>) {
  const site = await findMySite(reader, args.siteId as Id<"companyWebsites">);
  return site ? await pageKindChoicesOf(reader, site.hold) : null;
}

/** Its own reads, by name: each one of the screens' reader helpers, which refuses a website that isn't the company's. */
const read = <Args,>(helper: (reader: SiteReader, args: Args) => Promise<unknown>) => (reader: SiteReader, args: Record<string, unknown>) => helper(reader, args as Args);

export const VISIBILITY_EYE_READS: EyeReads = {
  "vis.site": siteForEye,
  "vis.series": read(readSiteSeries),
  "vis.extras": read(readOverviewExtras),
  "vis.above": read(readListAbove),
  "vis.features": read(readListFeatures),
  "vis.questions": read(readListQuestions),
  "vis.searches": read(readListSearches),
  "vis.searchPositions": read(readSearchPositions),
  "vis.trackedFanOut": read(readTrackedFanOut),
  "vis.moves": read(readListMoves),
  "vis.featureKeywords": read(readFeatureKeywords),
  "vis.andRivals": read(readSiteAndRivals),
  "vis.rivals": read(readListRivals),
  "vis.rivalMoves": read(readRivalMoves),
  "vis.contentGap": read(readContentGap),
  "vis.marketMap": read(readMarketMap),
  "vis.organic": read(readOrganicCompetitors),
  "vis.discoveryTotal": read(readDiscoveryTotal),
  "vis.sharedWithRival": read(readSharedWithRival),
  "vis.sharedSearches": read(readSharedSearches),
  "vis.rivalCited": read(readRivalCitedPages),
  "vis.suggested": read(readSuggested),
  "vis.answerQuestions": read(readAnswerQuestions),
  "vis.answers": read(readListAnswers),
  "vis.answerRecord": read(readAnswerRecord),
  "vis.answerShown": read(readAnswerShown),
  "vis.businesses": read(readBusinessesRecommended),
  "vis.aiDemand": read(readAiDemand),
  "vis.mentions": (reader, args) => readMentions(reader, args.siteId as Id<"companyWebsites">),
  "vis.notCited": read(readNotCitedPages),
  "vis.angles": read(readListAngles),
  "vis.share": read(readShareOfVoice),
  "vis.citedPages": read(readListCitedPages),
  "vis.aiPage": read(readAiPageDetail),
  "vis.webMentions": read(readWebMentions),
  "vis.listed": read(readWhereToGetListed),
  "vis.mentionsRivals": read(readMentionsAgainstRivals),
  "vis.reviews": read(readYourReviews),
  "vis.reviewsRivals": read(readReviewsAgainstRivals),
  "vis.reviewsSay": read(readWhatCustomersSay),
  "vis.paidKeywords": read(readListPaidKeywords),
  "vis.audit": read(readSiteAudit),
  "vis.problemPages": read(readCrawlProblemPages),
  "vis.moneyPages": read(readSiteMoneyPages),
  "vis.assets": read(readYourAssets),
  // Backlinks.
  "vis.linkProfile": read(readLinkProfile),
  "vis.linkProfiles": read(readLinkProfilesAgainstRivals),
  "vis.linkTotals": read(readLinkListTotals),
  "vis.backlinks": read(readListBacklinks),
  "vis.brokenBacklinks": read(readListBrokenBacklinks),
  "vis.referringDomains": read(readListReferringDomains),
  "vis.linkingWebsite": read(readLinkingWebsiteRecord),
  "vis.anchors": read(readListAnchors),
  "vis.anchorFigures": read(readAnchorFigures),
  "vis.anchorRecord": read(readAnchorRecord),
  "vis.referringIps": read(readListReferringIps),
  "vis.subnets": read(readTopSubnets),
  "vis.serverFigures": read(readServerFigures),
  "vis.linkChanges": read(readLinkChangeSteps),
  // Keywords.
  "vis.keywords": read(readListKeywords),
  "vis.keywordFigures": read(readKeywordFigures),
  "vis.bandMoves": read(readBandMoves),
  "vis.bandMoved": read(readListBandMoves),
  "vis.checks": read(readSiteChecks),
  "vis.keywordRecord": read(readKeywordRecord),
  "vis.keywordAngle": read(readKeywordAngle),
  "vis.pages": read(readListPages),
  "vis.pageFigures": read(readPageFigures),
  "vis.pageKinds": pageKindsForEye,
  "vis.pageRecord": read(readPageRecord),
  "vis.sections": read(readListSections),
  // Local.
  "vis.localProfile": read(readBusinessProfile),
  "vis.localOffices": read(readEveryOffice),
  "vis.localMaps": read(readMapRankings),
  "vis.localMapSearch": read(readMapSearch),
  "vis.localMarket": read(readLocalMarket),
  "vis.localActivity": read(readRivalActivity),
  "vis.localListings": read(readLocalListings),
  "vis.business": read(readBusinessDetail),
  // Brand radar.
  "vis.radar": read(readRadarOverview),
  "vis.radarSources": read(readRadarSources),
  "vis.overviewGaps": read(readOverviewGaps),
  "vis.radarQuestion": read(readQuestionDetail),
  "vis.radarWebsite": read(readWebsiteDetail),
  // Your pages.
  "vis.yourPages": read(readListYourPages),
};

/** A calendar period's days on a Visibility screen and the step its charts draw in, as the Dates menu reads them (`parseSitePeriod`). */
function datesOf(period: CalendarPeriod) {
  const today = ukDay();
  const span = periodSpan(period, today, today) ?? { from: today, to: today, whole: false };
  const before = spanBefore(period, span);
  return { from: span.from, to: span.to, step: stepOf(period), before: { from: before.from, to: before.to } };
}

/** A list's first page as a screen opens it: 25 rows (`SITE_DEFAULT_ROWS`), in the given order. */
const firstPage = (sort: string, direction: "asc" | "desc") => ({ sort, direction, page: 1, rows: 25 });

/** A list a screen reads a page at a time, or null while its copy is still being built (the screen shows it loading). */
async function listPage(run: EyeRun, name: string, args: Record<string, unknown>) {
  const page = await run(name, args) as { preparing?: boolean } | null;
  return page && page.preparing !== true ? page : null;
}

const site = (run: EyeRun, siteId: Id<"companyWebsites">) => run("vis.site", { siteId }) as Promise<Site | null>;
const series = (run: EyeRun, siteId: Id<"companyWebsites">, dates: { from: string; to: string; step: string }, withRivals = false) =>
  run("vis.series", { siteId, from: dates.from, to: dates.to, step: dates.step, ...(withRivals ? { withRivals } : {}) }) as Promise<never[] | null>;
const engineName = () => engineNameFrom(englishWords("aiEngines"));
/** The names a Backlinks or Keywords screen hands its eye (`sites.seesNames`). */
const seesNames = () => englishWords("sites.seesNames");
/** A link with no words, as Anchors names it. */
const noAnchor = () => englishWords("sites.backlinksAnchors")("noAnchor");
/** A kind of website Google's AI quotes, as Brand radar's Sources names it ("Forum", "Rival"). */
const sourceKind = () => {
  const kinds = englishWords("sites.radar.sources.kinds");
  return (kind: string) => kinds(kind);
};

/** The website, when it's one of the company's own: a competitor's Backlinks lists aren't bought, and their screens show none (`useIsCompetitor`). */
async function ownSite(run: EyeRun, siteId: Id<"companyWebsites">) {
  const open = await site(run, siteId);
  return open && open.relationship !== "TRACKED" ? open : null;
}

/** A website a chat app names, as a screen's address carries it: "example.com" of "https://example.com/page". */
const hostOfKey = (key: string) => key.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "");
/** A page a chat app names, as Top pages' rows carry it: its path, "/door-handles.html" of the whole address. */
function pathOfKey(key: string): string {
  const asked = key.trim();
  if (!/^https?:\/\//i.test(asked)) return asked;
  try {
    return new URL(asked).pathname || "/";
  } catch {
    return asked;
  }
}

// The reads' answers come back as the screens' own; each figures function checks the parts it reads.
type Any = never;

export const VISIBILITY_EYES: EyeBuilders = {
  // --- The website's Overview ---

  /** Overview (`sites/[siteId]/page.tsx`). */
  "visibility.overview": async (run, { siteId, period }) => {
    const dates = datesOf(period);
    const [own, extras] = await Promise.all([series(run, siteId, dates), run("vis.extras", { siteId })]);
    return overviewSeen(own?.[0], (extras ?? undefined) as Any, engineName(), englishNames("sites.overview.eye", ["middle", "shared"])) ?? null;
  },

  // --- Google results ---

  /** Who ranks above you (`google/above`). */
  "visibility.googleAbove": async (run, { siteId }) => {
    const rows = await run("vis.above", { siteId });
    return rows ? aboveSeen(rows as Any, englishNames("sites.googleAbove.eye", ["aboveYou", "first", "notOnPage"])) : null;
  },

  /** Tracked fan-out queries (`google/fan-out`). */
  "visibility.googleFanOut": async (run, { siteId }) => {
    const [standings, fanOut] = await Promise.all([run("vis.searches", { siteId }), run("vis.trackedFanOut", { siteId })]) as [Any[] | null, { rows: Any[]; own: boolean; tracking: unknown } | null];
    if (!standings || !fanOut) return null;
    return { rows: trackedFanOutRows(standings, fanOut), own: fanOut.own, tracking: fanOut.tracking };
  },

  /** Search features (`google/features`). */
  "visibility.googleFeatures": async (run, { siteId, period }) => {
    const [open, data, own] = await Promise.all([site(run, siteId), run("vis.features", { siteId }), series(run, siteId, datesOf(period))]);
    if (!data) return null;
    return featuresSeen(data as Any, own?.[0], featureNameFrom(englishWords("sites.common.features")), { host: open?.host ?? "", withSite: englishWords("sites.googleFeatures")("seriesWithSite") });
  },

  /** A search feature's searches (`google/features/feature`): the feature from the key. */
  "visibility.googleFeature": async (run, { siteId, key }) => {
    if (!key || !["ai_overview_reference", "featured_snippet", "local_pack"].includes(key)) return null;
    return await listPage(run, "vis.featureKeywords", { siteId, feature: key, ...firstPage("volume", "desc") });
  },

  /** Wins and losses (`google/moves`): the moves up, the biggest first. */
  "visibility.googleMoves": async (run, { siteId, period }) => {
    const dates = datesOf(period);
    const open = await site(run, siteId);
    if (!open) return null;
    // A site checked once has nothing to compare with, and lists no moves.
    const firstCheckOnly = open.checkDays.length === 1;
    const [now, before, moves] = await Promise.all([
      series(run, siteId, dates),
      series(run, siteId, { ...dates.before, step: dates.step }),
      firstCheckOnly ? Promise.resolve(null) : listPage(run, "vis.moves", { siteId, status: "UP", ...firstPage("change", "desc") }),
    ]);
    if (!now) return null;
    const t = englishWords("sites.googleMoves");
    const tp = englishWords("common.periods");
    const names = { up: t("up"), down: t("down"), dates: tp(period), usual: englishWords("sites.googleMoves.eye")("usual", { step: dates.step }), before: capitalised(tp(`before.${period}`)) };
    return winsLossesSeen(now[0], before?.[0], (moves as { rows?: Any[] } | null)?.rows, dates.step, names);
  },

  /** Questions people ask (`google/questions`). */
  "visibility.googleQuestions": async (run, { siteId }) => await run("vis.questions", { siteId }),

  /** Your searches (`google/searches`): the chart's lines are the first five searches ranking. */
  "visibility.googleSearches": async (run, { siteId, period }) => {
    const rows = await run("vis.searches", { siteId }) as Array<{ keyword: string; lastPosition: number | null }> | null;
    if (!rows) return null;
    const dates = datesOf(period);
    const charted = rows.filter((row) => row.lastPosition !== null).slice(0, 5).map((row) => row.keyword);
    const positions = charted.length > 0 ? await run("vis.searchPositions", { siteId, keywords: charted, from: dates.from, to: dates.to, step: dates.step }) : undefined;
    return searchesSeen(rows as Any, positions, { ...englishNames("sites.googleSearches.eye", ["pageOne", "best"]), slipping: englishWords("sites.googleSearches")("verdicts.SLIPPING") });
  },

  // --- Competitors ---

  /** Side by side (`competitors`). */
  "visibility.competitors": async (run, { siteId, period }) => {
    const [figures, rivals, lines, moves] = await Promise.all([
      run("vis.andRivals", { siteId }), run("vis.rivals", { siteId }), series(run, siteId, datesOf(period), true), run("vis.rivalMoves", { siteId, period }),
    ]);
    if (!figures || !rivals) return null;
    return sideBySideSeen(figures as Any, rivals as Any, lines ?? undefined, (moves ?? undefined) as Any, englishNames("sites.sideBySide.eye", ["middle", "youAbove"]));
  },

  /** Content gap (`competitors/gap`): bought for a company's own websites only. */
  "visibility.competitorsGap": async (run, { siteId }) => {
    const open = await site(run, siteId);
    if (!open || open.relationship === "TRACKED") return null;
    return await listPage(run, "vis.contentGap", { siteId, ...firstPage("volume", "desc") });
  },

  /** Market map (`competitors/map`). */
  "visibility.competitorsMap": async (run, { siteId }) => {
    const rows = await run("vis.marketMap", { siteId }) as Array<{ role: string; kind: string | null }> | null;
    return rows ? marketSeen(marketMapRows(rows, false) as Any, englishNames("sites.marketMap.eye", ["middle", "more"])) : null;
  },

  /** Organic competitors (`competitors/organic`): bought for a company's own websites only. */
  "visibility.competitorsOrganic": async (run, { siteId }) => {
    const open = await site(run, siteId);
    if (!open || open.relationship === "TRACKED") return null;
    const [competitors, everyOne] = await Promise.all([run("vis.organic", { siteId }), run("vis.discoveryTotal", { siteId })]);
    return competitors ? { competitors, everyOne } : null;
  },

  /** A rival's own screen (`competitors/rival`): the rival from the key, its Sites id or its address. */
  "visibility.competitorsRival": async (run, { siteId, period, key }) => {
    if (!key) return null;
    const open = await site(run, siteId);
    const asked = key.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    const hold = open?.rivals.find((rival) => rival.siteId === key || rival.host.toLowerCase().replace(/^www\./, "") === asked);
    if (!open || !hold) return null;
    const rivalId = hold.siteId;
    const [figures, rivals, sharedAll, shared, trend, cited] = await Promise.all([
      run("vis.andRivals", { siteId }),
      run("vis.rivals", { siteId }) as Promise<Array<{ host: string; verdict: string }> | null>,
      run("vis.sharedWithRival", { siteId, rivalId }) as Promise<number | null>,
      listPage(run, "vis.sharedSearches", { siteId, rivalId, lead: "THEM", ...firstPage("theirVisits", "desc") }),
      series(run, siteId, datesOf(period), true),
      run("vis.rivalCited", { siteId, rivalId }),
    ]);
    if (!figures || !shared) return null;
    const verdict = rivals?.find((row) => row.host === hold.host)?.verdict ?? null;
    const theyLead = englishWords("sites.rivalRecord.eye")("theyLead", { rival: hold.host });
    return rivalSeen(hold.host, figures as Any, verdict, sharedAll, "THEM", shared as Any, trend ?? undefined, (cited ?? undefined) as Any, { you: open.host, theyLead }) ?? null;
  },

  /** Suggested competitors (`competitors/suggested`). */
  "visibility.competitorsSuggested": async (run, { siteId }) => await run("vis.suggested", { siteId }),

  // --- AI answers ---

  /** Full answers (`ai/answers`): the first question on the list, its newest answers in the dates. */
  "visibility.aiAnswers": async (run, { siteId, period }) => {
    const catalogue = await run("vis.answerQuestions", { siteId }) as { questions: Array<{ prompt: string }> } | null;
    if (!catalogue) return null;
    const chosen = catalogue.questions[0] ?? null;
    const dates = datesOf(period);
    const answers = chosen ? await listPage(run, "vis.answers", { siteId, prompt: chosen.prompt, from: dates.from, to: dates.to, ...firstPage("day", "desc") }) : null;
    return { catalogue, ...(answers ? { answers } : {}) };
  },

  /** An answer's own screen (`ai/answers/answer`): the answer from the key. */
  "visibility.aiAnswer": async (run, { siteId, key }) => {
    if (!key || !/^[a-z0-9]{32}$/.test(key)) return null;
    const [record, shown] = await Promise.all([run("vis.answerRecord", { siteId, answerId: key }), run("vis.answerShown", { siteId, answerId: key })]);
    return record && shown ? { record, shown } : null;
  },

  /** Businesses recommended (`ai/businesses`). */
  "visibility.aiBusinesses": async (run, { siteId }) => await run("vis.businesses", { siteId }),

  /** AI demand (`ai/demand`). */
  "visibility.aiDemand": async (run, { siteId }) => {
    const data = await run("vis.aiDemand", { siteId }) as { month: string | null; rows: Any[] } | null;
    if (!data) return null;
    const eye = englishWords("sites.aiApps.demand.eye");
    return aiDemandSeen({ month: data.month, rows: data.rows }, { searches: eye("searches"), google: englishWords("sites.aiApps.demand")("figures.google"), onGoogle: eye("onGoogle"), every: eye("every") });
  },

  /** Mentions (`ai/mentions`). */
  "visibility.aiMentions": async (run, { siteId, period }) => {
    const [rows, own] = await Promise.all([run("vis.mentions", { siteId }), series(run, siteId, datesOf(period))]);
    return rows ? aiMentionsSeen(rows as Any, own?.[0], engineName(), englishNames("sites.aiMentions.eye", ["never", "warned", "before"])) : null;
  },

  /** Pages read, not cited (`ai/read`). */
  "visibility.aiRead": async (run, { siteId }) => await run("vis.notCited", { siteId }),

  /** A page the assistants read (`ai/read/page`): its address from the key. */
  "visibility.aiPage": async (run, { siteId, key }) => (key ? await run("vis.aiPage", { siteId, url: key }) : null),

  /** What the assistants searched (`ai/searched`). */
  "visibility.aiSearched": async (run, { siteId }) => await run("vis.angles", { siteId }),

  /** Share of voice (`ai/share-of-voice`). */
  "visibility.aiShare": async (run, { siteId }) => {
    const engines = await run("vis.share", { siteId });
    return engines ? shareSeen(engines as Any, engineName()) : null;
  },

  /** Cited pages (`ai/sources`). */
  "visibility.aiSources": async (run, { siteId }) => await run("vis.citedPages", { siteId }),

  // --- Web mentions ---

  /** All mentions (`mentions`). */
  "visibility.mentions": async (run, { siteId, period }) => {
    const [open, data] = await Promise.all([site(run, siteId), run("vis.webMentions", { siteId, period }) as Promise<{ rows: Any[]; names: string[] } | null>]);
    if (!data) return null;
    const dates = datesOf(period);
    const t = englishWords("sites.mentions");
    return webMentionsSeen(data.rows, { from: dates.from, to: dates.to, before: dates.before }, {
      kinds: (kind) => t(`kindsMany.${kind}`), kind: (kind) => t(`kinds.${kind}`), tone: (tone) => t(`toneOne.${tone}`),
    }, { business: data.names[0] ?? open?.host ?? "", noLink: englishWords("sites.mentions.eye")("noLink"), badly: t("figures.badly") });
  },

  /** Where to get listed (`mentions/listed`). */
  "visibility.mentionsListed": async (run, { siteId }) => await run("vis.listed", { siteId }),

  /** Mentions against rivals (`mentions/rivals`). */
  "visibility.mentionsRivals": async (run, { siteId, period }) => {
    const data = await run("vis.mentionsRivals", { siteId, period, step: datesOf(period).step });
    return data ? mentionsRivalsSeen(data as Any, englishNames("sites.mentions.rivals.eye", ["middle"])) : null;
  },

  // --- Reviews ---

  /** Your reviews (`reviews`): every office together. */
  "visibility.reviews": async (run, { siteId, period }) => {
    const dates = datesOf(period);
    const [open, data] = await Promise.all([site(run, siteId), run("vis.reviews", { siteId, period, step: dates.step }) as Promise<{ offices: Array<{ name: string }> } | null>]);
    if (!data) return null;
    const t = englishWords("sites.reviews.yours");
    const tp = englishWords("common.periods");
    return reviewsSeen(data as Any, { from: dates.from, to: dates.to, before: dates.before }, {
      business: data.offices[0]?.name ?? open?.host ?? "", stars: englishWords("sites.reviews.yours.eye")("stars", { period: tp(period) }), before: capitalised(tp(`before.${period}`)),
      waiting: t("figures.waiting"), low: t("stars.low"), reply: t("figures.daysToAnswer"),
    });
  },

  /** Reviews against rivals (`reviews/rivals`). */
  "visibility.reviewsRivals": async (run, { siteId, period }) => {
    const data = await run("vis.reviewsRivals", { siteId, period, step: datesOf(period).step });
    if (!data) return null;
    const sources = englishWords("sites.reviews");
    return reviewsRivalsSeen(data as Any, (source) => sources(`sources.${source}`), englishNames("sites.reviews.rivals.eye", ["answering"]));
  },

  /** What customers say (`reviews/say`): every office together. */
  "visibility.reviewsSay": async (run, { siteId }) => await run("vis.reviewsSay", { siteId }),

  // --- Paid search, Site audit and Your assets ---

  /** Paid search (`paid`). */
  "visibility.paid": async (run, { siteId, period }) => {
    const [open, own] = await Promise.all([site(run, siteId), series(run, siteId, datesOf(period))]);
    const line = own?.[0];
    if (!line) return null;
    return paidSeen(line, { name: open?.host ?? "", visitsName: englishWords("sites.paid")("traffic"), beforeName: englishWords("sites.paid.eye")("before") });
  },

  /** Paid keywords (`paid/keywords`): the most visits first. */
  "visibility.paidKeywords": async (run, { siteId }) => await listPage(run, "vis.paidKeywords", { siteId, ...firstPage("traffic", "desc") }),

  /** Site audit (`audit`): bought for a company's own websites only. */
  "visibility.audit": async (run, { siteId, period }) => {
    const open = await site(run, siteId);
    if (!open || open.relationship === "TRACKED") return null;
    const [audit, own, money] = await Promise.all([run("vis.audit", { siteId }), series(run, siteId, datesOf(period)), run("vis.moneyPages", { siteId })]);
    if (!audit) return null;
    return auditSeen(audit as Any, own?.[0], money, auditCheckNameFrom(englishWords("sites.audit")), { host: open.host, errors: englishWords("sites.audit.eye")("errors") });
  },

  /** An audit problem's pages (`audit/problem`): the check from the key. */
  "visibility.auditProblem": async (run, { siteId, key }) => {
    if (!key) return null;
    const [audit, found] = await Promise.all([run("vis.audit", { siteId }) as Promise<{ issues: Array<{ check: string }> } | null>, run("vis.problemPages", { siteId, check: key })]);
    if (!found) return null;
    return { check: key, issue: audit?.issues.find((entry) => entry.check === key) ?? null, found };
  },

  /** Your assets (`assets`). */
  "visibility.assets": async (run, { siteId }) => await run("vis.assets", { siteId }),

  // --- Backlinks ---

  /** Summary (`backlinks`): yours and each rival's lines on the dates. */
  "visibility.backlinks": async (run, { siteId, period }) => summarySees((await series(run, siteId, datesOf(period), true)) ?? undefined, { rivals: seesNames()("rivals") }) ?? null,

  /** Referring domains (`backlinks/domains`): the strongest first, the box's counts over the whole list, and every link counted. */
  "visibility.backlinksDomains": async (run, { siteId }) => {
    const [domains, totals] = await Promise.all([listPage(run, "vis.referringDomains", { siteId, ...firstPage("rank", "desc") }), run("vis.linkTotals", { siteId })]);
    return linkingWebsitesSees(domains as Any, totals as Any, englishNames("sites.seesNames", ["linkingNow", "stoppedLinking"]) as Any) ?? null;
  },

  /** A linking website's own screen (`backlinks/domains/domain`): the website from the key, beside every link counted. */
  "visibility.backlinksDomain": async (run, { siteId, key }) => {
    if (!key) return null;
    const [record, totals] = await Promise.all([run("vis.linkingWebsite", { siteId, domain: hostOfKey(key) }), run("vis.linkTotals", { siteId })]);
    return linkingWebsiteSees(record as Any, totals as Any, { noAnchor: noAnchor(), ...englishNames("sites.seesNames", ["followedHeld", "lostHeld"]) } as Any) ?? null;
  },

  /** Referring IPs (`backlinks/ips`): bought for a company's own websites only; the most links first. */
  "visibility.backlinksIps": async (run, { siteId }) => {
    if (!(await ownSite(run, siteId))) return null;
    const [profile, subnets, servers, figures] = await Promise.all([
      run("vis.linkProfile", { siteId }), run("vis.subnets", { siteId }), listPage(run, "vis.referringIps", { siteId, ...firstPage("backlinks", "desc") }), run("vis.serverFigures", { siteId }),
    ]);
    const names = seesNames();
    return ipsSees(profile as Any, (subnets ?? undefined) as Any, (servers ?? undefined) as Any, (figures ?? undefined) as Any, { oneWebsite: names("oneWebsite"), busiestThree: names("busiestThree") }) ?? null;
  },

  /** Broken backlinks (`backlinks/broken`): bought for a company's own websites only; the strongest linking website first. */
  "visibility.backlinksBroken": async (run, { siteId }) => {
    if (!(await ownSite(run, siteId))) return null;
    const [broken, totals] = await Promise.all([listPage(run, "vis.brokenBacklinks", { siteId, ...firstPage("domainRank", "desc") }), run("vis.linkTotals", { siteId })]);
    return brokenLinksSees(broken as Any, totals as Any, englishNames("sites.seesNames", ["brokenLinks", "brokenFollowed", "brokenWebsites"]) as Any) ?? null;
  },

  /** Link quality (`backlinks/quality`): the newest summary, the lines on the dates and each rival's summary. */
  "visibility.backlinksQuality": async (run, { siteId, period }) => {
    const [profile, lines, profiles] = await Promise.all([run("vis.linkProfile", { siteId }), series(run, siteId, datesOf(period), true), run("vis.linkProfiles", { siteId })]);
    return qualitySees(profile as Any, lines ?? undefined, (profiles ?? undefined) as Any, { rivals: seesNames()("rivals") }) ?? null;
  },

  /** Compared with rivals (`backlinks/compared`). */
  "visibility.backlinksCompared": async (run, { siteId }) => comparedSees(((await run("vis.andRivals", { siteId })) ?? undefined) as Any, { rivals: seesNames()("rivals") }) ?? null,

  /** All backlinks (`backlinks/all`): bought for a company's own websites only; the strongest link from each website. */
  "visibility.backlinksAll": async (run, { siteId }) => {
    if (!(await ownSite(run, siteId))) return null;
    const [backlinks, totals] = await Promise.all([listPage(run, "vis.backlinks", { siteId, ...firstPage("domainRank", "desc") }), run("vis.linkTotals", { siteId })]);
    return allBacklinksSees(backlinks as Any, totals as Any, englishNames("sites.seesNames", ["lostLinks", "lostStrongest", "redirectedLinks", "notFollowedLinks"]) as Any) ?? null;
  },

  /** New and lost links (`backlinks/new-lost`): bought for a company's own websites only; the dates and the span before. */
  "visibility.backlinksNewLost": async (run, { siteId, period }) => {
    if (!(await ownSite(run, siteId))) return null;
    const dates = datesOf(period);
    const [points, before] = await Promise.all([
      run("vis.linkChanges", { siteId, from: dates.from, to: dates.to, step: dates.step }),
      run("vis.linkChanges", { siteId, from: dates.before.from, to: dates.before.to, step: dates.step }),
    ]);
    const other = dates.step === "month" ? "otherMonths" : dates.step === "week" ? "otherWeeks" : "otherDays";
    // Each step named as the table names it: a month as "October 2026", else its day (`formatMonth`, `formatDay`).
    const stepName = (day: string) => (dates.step === "month" ? ENGLISH_STEPS.month(day.slice(0, 7)) : englishDay(day));
    return linkChangesSees((points ?? undefined) as Any, (before ?? undefined) as Any, dates, stepName, { otherSteps: seesNames()(other) }) ?? null;
  },

  /** Where links come from (`backlinks/where`): every breakdown the picker offers, yours beside a typical rival's. */
  "visibility.backlinksWhere": async (run, { siteId }) => {
    const profiles = await run("vis.linkProfiles", { siteId });
    const words = englishWords("sites.linkSources");
    const regions = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
    return whereSees((profiles ?? undefined) as Any, linkGroupNameFrom(words, regions), (breakdown) => words(`breakdowns.${breakdown}`), { rivals: seesNames()("rivals") }) ?? null;
  },

  /** Anchors (`backlinks/anchors`): bought for a company's own websites only; the most links first, and the whole list summed. */
  "visibility.backlinksAnchors": async (run, { siteId }) => {
    if (!(await ownSite(run, siteId))) return null;
    const [anchors, figures] = await Promise.all([listPage(run, "vis.anchors", { siteId, ...firstPage("backlinks", "desc") }), run("vis.anchorFigures", { siteId })]);
    const names = seesNames();
    return anchorsSees((anchors ?? undefined) as Any, (figures ?? undefined) as Any, {
      noAnchor: noAnchor(), noWords: names("noWords"), brand: names("brand"), spammy: names("spammy"), fresh: names("fresh"),
    }) ?? null;
  },

  /** An anchor's own screen (`backlinks/anchors/anchor`): the words from the key, beside every link counted. */
  "visibility.backlinksAnchor": async (run, { siteId, key }) => {
    if (!key) return null;
    const [record, totals] = await Promise.all([run("vis.anchorRecord", { siteId, anchor: key }), run("vis.linkTotals", { siteId })]);
    return anchorSees(record as Any, totals as Any, { noAnchor: noAnchor(), wholeWebsite: seesNames()("wholeWebsite") }) ?? null;
  },

  // --- Keywords ---

  /** Keywords (`keywords`): the best placed first, the whole list summed, and the lines on the dates. */
  "visibility.keywords": async (run, { siteId, period }) => {
    const [page, figures, lines] = await Promise.all([
      listPage(run, "vis.keywords", { siteId, ...firstPage("position", "asc") }), run("vis.keywordFigures", { siteId }), series(run, siteId, datesOf(period), true),
    ]);
    const names = seesNames();
    return keywordsSees((page ?? undefined) as Any, figures as Any, lines ?? undefined, { rivals: names("rivals"), rose: names("rose"), fell: names("fell") }) ?? null;
  },

  /** Position bands (`keywords/bands`): the lines on the dates, the moves between bands and the searches that made them. */
  "visibility.keywordsBands": async (run, { siteId, period }) => {
    const [lines, moves, moved] = await Promise.all([series(run, siteId, datesOf(period), true), run("vis.bandMoves", { siteId }), run("vis.bandMoved", { siteId })]);
    const names = seesNames();
    const bands = englishWords("sites.bands");
    return bandsSees(lines ?? undefined, (moves ?? undefined) as Any, (moved ?? undefined) as Any, { rivals: names("rivals"), pageOne: bands("pageOne"), pageTwo: bands("pageTwo"), closestOthers: names("closestOthers") }) ?? null;
  },

  /** One square of Position bands' grid (`keywords/bands/moved`): the move from the key, `p04_10.p01_03`, and each band's searches now. */
  "visibility.keywordsBandsMoved": async (run, { siteId, key }) => {
    const move = key ? readBandMove(key) : null;
    if (!move) return null;
    const [moved, moves] = await Promise.all([run("vis.bandMoved", { siteId, from: move.from, to: move.to }), run("vis.bandMoves", { siteId })]);
    const band = englishWords("sites.overview.bands");
    const square = englishWords("sites.bands");
    const names = move.from === "none"
      ? { square: square("cell.titleNew", { to: band(move.to) }), from: null, to: band(move.to) }
      : { square: square("cell.title", { from: band(move.from), to: band(move.to) }), from: band(move.from), to: band(move.to) };
    return bandSquareSees(moved as Any, moves as Any, move, names) ?? null;
  },

  /** New and lost keywords (`keywords/new-lost`): the checks on the dates and before, the newest check's moves up, each website's searches. */
  "visibility.keywordsNewLost": async (run, { siteId, period }) => {
    const dates = datesOf(period);
    const [open, checks, before, lines] = await Promise.all([
      site(run, siteId),
      run("vis.checks", { siteId, from: dates.from, to: dates.to, step: dates.step }) as Promise<{ newest: { kind: string } | null } | null>,
      run("vis.checks", { siteId, from: dates.before.from, to: dates.before.to, step: dates.step }),
      series(run, siteId, dates, true),
    ]);
    if (!checks) return null;
    // A newest check with nothing before it lists no moves, and the screen asks for none.
    const start = checks.newest === null || checks.newest.kind === "FIRST" || checks.newest.kind === "FIRST_LIST";
    const moves = start ? null : await listPage(run, "vis.moves", { siteId, status: "UP", ...firstPage("volume", "desc") });
    const names = seesNames();
    return newLostSees(checks as Any, (before ?? undefined) as Any, (moves ?? undefined) as Any, open?.coverage?.moves, lines ?? undefined, { rivals: names("rivals"), rose: names("rose"), fell: names("fell") }) ?? null;
  },

  /** A search's own screen (`keywords/keyword`): the search from the key, its place on the dates, and what the assistants did with it. */
  "visibility.keywordRecord": async (run, { siteId, period, key }) => {
    const keyword = key?.trim();
    if (!keyword) return null;
    const [open, record, fromAi] = await Promise.all([site(run, siteId), run("vis.keywordRecord", { siteId, keyword }) as Promise<{ keyword: string } | null>, run("vis.keywordAngle", { siteId, keyword })]);
    if (!record) return null;
    const dates = datesOf(period);
    const positions = await run("vis.searchPositions", { siteId, keywords: [record.keyword], from: dates.from, to: dates.to, step: dates.step });
    const names = seesNames();
    return searchSees(record as Any, (positions ?? undefined) as Any, fromAi as Any, open?.host ?? "", { rivals: names("rivals"), rivalsAbove: names("rivalsAbove"), rivalsMissing: names("rivalsMissing") }) ?? null;
  },

  /** Top pages (`keywords/pages`): the most searches first, every page summed, each kind of page by the name its Type column gives it. */
  "visibility.keywordsPages": async (run, { siteId, period }) => {
    const [open, page, figures, lines, choices] = await Promise.all([
      site(run, siteId), listPage(run, "vis.pages", { siteId, ...firstPage("keywords", "desc") }), run("vis.pageFigures", { siteId }), series(run, siteId, datesOf(period)),
      run("vis.pageKinds", { siteId }) as Promise<Array<{ id: string; name: string }> | null>,
    ]);
    const names = seesNames();
    const kindName = pageKindLabel(choices, englishWords("sites.common"));
    return pagesSees((page ?? undefined) as Any, figures as Any, lines ?? undefined, kindName, {
      website: open?.host ?? names("wholeWebsite"), itsSearches: names("itsSearches"), quietPages: names("quietPages"), topFive: names("topFive"), oneSearch: names("oneSearch"),
    }) ?? null;
  },

  /** A page's own screen (`keywords/pages/page`): the page from the key, its record and its searches, best placed first, without guessed money. */
  "visibility.pageRecord": async (run, { siteId, key }) => {
    const page = key ? pathOfKey(key) : null;
    if (!page) return null;
    const [record, keywords] = await Promise.all([run("vis.pageRecord", { siteId, page }), listPage(run, "vis.keywords", { siteId, path: page, ...firstPage("position", "asc") })]);
    return record ? withoutGuessedMoney({ record, keywords: keywords ?? undefined }) : null;
  },

  /** Site structure (`keywords/structure`): every section, each one's share worked out over them all. */
  "visibility.keywordsStructure": async (run, { siteId }) => {
    const answer = await run("vis.sections", { siteId });
    const names = seesNames();
    return structureSees((answer ?? undefined) as Any, { itsSearches: names("itsSearches"), wholeWebsite: names("wholeWebsite") }) ?? null;
  },

  // --- Local: every screen hands its eye what its read answers, for the first office where it shows one ---

  /** Business profile (`local`): each detail to put right by its name on the screen. */
  "visibility.localProfile": async (run, { siteId }) => {
    const details = englishWords("sites.local.profile.details");
    return profileSees((await run("vis.localProfile", { siteId })) as Any, (detail) => details(`names.${detail}`), englishNames("sites.seesNames", ["searchesChecked", "rivalsAverage", "reviewsAnswered", "detailsToFix"]) as Any) ?? null;
  },

  /** Google Maps (`local/maps`). */
  "visibility.localMaps": async (run, { siteId }) => mapsSees((await run("vis.localMaps", { siteId })) as Any, englishNames("sites.seesNames", ["searchesChecked"]) as Any) ?? null,

  /** One search on Google Maps (`local/maps/search`): the search from the key. */
  "visibility.localMapSearch": async (run, { siteId, key }) => (key?.trim() ? await run("vis.localMapSearch", { siteId, keyword: key.trim() }) : null),

  /** Rivals' activity (`local/activity`): the dates chosen, and you by your website's name. */
  "visibility.localActivity": async (run, { siteId, period }) => {
    const [open, answer] = await Promise.all([site(run, siteId), run("vis.localActivity", { siteId, period })]);
    return activitySees(answer as Any, { yourRivals: seesNames()("yourRivals"), you: open?.host ?? "" }) ?? null;
  },

  /** Listings (`local/listings`). */
  "visibility.localListings": async (run, { siteId }) => listingsSees((await run("vis.localListings", { siteId })) as Any, englishNames("sites.seesNames", ["yourOffices", "rivalsAhead"]) as Any) ?? null,

  /** Every office (`local/offices`). */
  "visibility.localOffices": async (run, { siteId }) => await run("vis.localOffices", { siteId }),

  /** Local market (`local/market`). */
  "visibility.localMarket": async (run, { siteId }) => nearbySees((await run("vis.localMarket", { siteId })) as Any, englishNames("sites.seesNames", ["moreReviewsNearby"]) as Any) ?? null,

  /** One business (`local/market/business`): the business from the key, its address or its name, its posts counted to today. */
  "visibility.business": async (run, { siteId, key }) => {
    if (!key?.trim()) return null;
    const [open, answer] = await Promise.all([site(run, siteId), run("vis.business", { siteId, business: key.trim() })]);
    return businessSees(answer as Any, ukDay(), { you: open?.host ?? "" }) ?? null;
  },

  // --- Brand radar ---

  /** Overview (`radar`): each business against the month before, and the questions naming rivals and not you. */
  "visibility.radarOverview": async (run, { siteId }) => {
    const data = await run("vis.radar", { siteId });
    return data ? radarSeen(data as Any, englishNames("sites.radar.eye", ["rivalsNotYou"])) : null;
  },

  /** AI Overview gaps (`radar/gaps`). */
  "visibility.overviewGaps": async (run, { siteId }) => await run("vis.overviewGaps", { siteId }),

  /** One question (`radar/question`): the question from the key. */
  "visibility.question": async (run, { siteId, key }) => {
    if (!key?.trim()) return null;
    const [open, answer] = await Promise.all([site(run, siteId), run("vis.radarQuestion", { siteId, question: key.trim() })]);
    return questionSees(answer as Any, sourceKind(), open?.host ?? "", { yourRivals: seesNames()("yourRivals") }) ?? null;
  },

  /** Sources (`radar/sources`). */
  "visibility.radarSources": async (run, { siteId }) => sourcesSees((await run("vis.radarSources", { siteId })) as Any, sourceKind(), englishNames("sites.seesNames", ["namingYou", "neverBesideYou", "besideRivals"]) as Any) ?? null,

  /** One source website (`radar/sources/website`): the website from the key. */
  "visibility.website": async (run, { siteId, key }) => {
    if (!key) return null;
    return sourceWebsiteSees((await run("vis.radarWebsite", { siteId, host: hostOfKey(key) })) as Any, sourceKind(), englishNames("sites.seesNames", ["besideRivals", "pagesNamingYou"]) as Any) ?? null;
  },

  // --- Your pages ---

  /** Your pages (`your-pages`): the most clicks first; a competitor's website has none of its own, and its screen says so. */
  "visibility.yourPages": async (run, { siteId }) => {
    const page = await listPage(run, "vis.yourPages", { siteId, ...firstPage("clicks", "desc") }) as { own?: boolean } | null;
    return page && page.own !== false ? yourPagesEye(page as Any, englishNames("sites.seesNames", ["shownOnGoogle", "neverShown", "notInSitemap", "ranking", "notCrawled"]) as Any) ?? null : null;
  },
};
