import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { loadSite, type Site } from "./websiteSiteRows";
import { latestFigures } from "./siteFigures";
import { localSetup, officeChecks, officeSearches } from "./localReads";
import { appAnswers } from "./siteAiApps";
import { readOverviews } from "./siteAiOverviewGaps";
import { questionsOf, readings } from "./siteBrandRadar";
import { shownMentionsOf } from "./siteWebMentions";
import type { MentionRow } from "./webMentions";
import { holdBrandNames } from "./holdProfiles";
import { siteKindOf } from "./utils/siteKinds";
import { isTrackedHold } from "./utils/websitePairing";
import { assetRowValidator } from "./radarSchema";
import { stableText } from "./localListings";

/**
 * Your assets (docs/plans/active/discovery-local-reputation-ai-plan.md, step
 * 5; drawn as "Site · Your assets"): every place people can find the
 * business — its website and best pages, its Google profiles, its review
 * pages, the AI answers, and the directories AI quotes — each with how often
 * it is seen, how often it is chosen, the stage where it loses people, and
 * the first thing to fix. Worked out from what the other pages read, after
 * each collection (rule 13), and kept once per website (`assetSummaries`).
 *
 * The stages, as built (said in the plan's change log):
 * - **Not there**: a directory or review site AI quotes beside rivals and
 *   never beside the website; no page on the web naming it in a year.
 * - **Not seen enough**: the website on page one of Google for under ten
 *   searches; a Google profile in the map box for under half its searches; a
 *   review page with under twenty reviews; AI answers that neither name the
 *   website nor read its pages; fewer than twelve pages naming it in a year.
 * - **Seen, not chosen**: the website bringing fewer visits a month than it
 *   has searches on page one; AI answers that read its pages but never
 *   recommend it; AI Overviews quoting it on under half the searches showing one;
 *   pages naming it of which under half link to it.
 * - **Working**: the rest.
 */

type Reader = { db: QueryCtx["db"] };

export type AssetRow = typeof assetRowValidator.type;

/** Directories and review sites listed as places to be: the most quoted few. */
const PLACES_SHOWN = 6;
/** The website's own pages listed: those AI quotes most. */
const PAGES_SHOWN = 3;
/** Collections finished before the assets are worked out: their AI judgements and moves land first. */
const AFTER_COLLECTION_MS = 15 * 60 * 1000;
/** Reviews a page needs before AI answers trust it, as a guide. */
const ENOUGH_REVIEWS = 20;
/** A Google profile's reviews answered past which replies are good, as Business profile judges them. */
const ANSWERED_ENOUGH = 0.8;
/** Pages naming the business in a year that count as seen in the press and on the web: one a month. */
const ENOUGH_MENTIONS = 12;

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
const onHost = (host: string, own: string) => host === own || host.endsWith(`.${own}`);

/** Every asset of one of a company's own websites, as it stands. */
export async function workOutAssets(ctx: Reader, site: Site): Promise<AssetRow[]> {
  const rows: AssetRow[] = [];
  const host = site.website.host;

  // The website: page one of Google, and the visits it brings.
  const figures = await latestFigures(ctx, site.website._id, site.place);
  const bands = figures.ranking?.allBands ?? figures.ranking?.bands;
  const pageOne = bands ? (bands.p01_03 ?? 0) + (bands.p04_10 ?? 0) : 0;
  const visits = figures.metrics?.estimatedTraffic ?? null;
  rows.push({
    key: "website",
    kind: "WEBSITE",
    name: site.website.displayHost,
    seen: { code: "pageOne", a: pageOne },
    chosen: visits === null ? null : { code: "visits", a: Math.round(visits) },
    stage: pageOne < 10 ? "NOT_SEEN" : visits !== null && visits < pageOne ? "SEEN_NOT_CHOSEN" : "WORKING",
    fix: pageOne < 10 ? { code: "fewOnPageOne", a: pageOne } : visits !== null && visits < pageOne ? { code: "fewVisits", a: Math.round(visits), b: pageOne } : null,
  });

  // Each office's Google profile: how often it is in the map box. What it brings needs Google's own figures (D12).
  const setup = await localSetup(ctx, site);
  for (const office of setup.offices) {
    const checks = await officeChecks(ctx, office, await officeSearches(ctx, site, office, setup.offices), false);
    const of = checks.size;
    const inBox = [...checks.values()].filter((check) => check.place >= 1 && check.place <= 3).length;
    const answered = office.reviewsHeld ? (office.reviewsAnswered ?? 0) / office.reviewsHeld : null;
    const fewInBox = of > 0 && inBox * 2 < of;
    rows.push({
      key: `profile:${office._id}`,
      kind: "PROFILE",
      name: office.name,
      ...(office.town ? { sub: office.town } : {}),
      seen: { code: "mapBox", a: inBox, b: of },
      chosen: { code: "notRead" },
      stage: of === 0 || fewInBox ? "NOT_SEEN" : "WORKING",
      fix: answered !== null && answered < ANSWERED_ENOUGH ? { code: "answerReviews", a: Math.round(answered * 100) } : fewInBox ? { code: "climbMap" } : null,
    });
  }

  // What Google's AI answers quote, from Brand radar's readings.
  const radar = (await readings(ctx, site)).readings;
  const rivalHosts = radar.filter((reading) => !reading.you).map((reading) => reading.website.host);
  const quoted = new Map<string, { times: number; besideYou: number; rivals: Set<string> }>();
  const pages = new Map<string, number>();
  for (const reading of radar) {
    if (!reading.part) continue;
    for (const entry of questionsOf(reading.part)) {
      for (const url of new Set(entry.pages)) {
        const at = hostOf(url);
        const row = quoted.get(at) ?? { times: 0, besideYou: 0, rivals: new Set<string>() };
        row.times += 1;
        if (reading.you) row.besideYou += 1;
        else row.rivals.add(reading.website.host);
        quoted.set(at, row);
        pages.set(url, (pages.get(url) ?? 0) + 1);
      }
    }
  }

  // The company's own pages on review sites.
  const links = setup.hold ? await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", setup.hold!._id)).take(200) : [];
  for (const link of links.filter((entry) => entry.role === "OWN")) {
    const listing = await ctx.db.get(link.listingId);
    if (!listing || listing.source === "GOOGLE") continue;
    const siteHost = listing.source === "TRUSTPILOT" ? "trustpilot.com" : "tripadvisor.co.uk";
    const times = [...quoted.entries()].filter(([at]) => onHost(at, siteHost)).reduce((sum, [, row]) => sum + row.times, 0);
    const reviews = listing.reviews ?? 0;
    rows.push({
      key: `listing:${listing._id}`,
      kind: "REVIEW_SITE",
      name: listing.source === "TRUSTPILOT" ? "Trustpilot" : "Tripadvisor",
      seen: { code: "aiQuoted", a: times },
      chosen: { code: "reviews", a: reviews, ...(listing.rating !== undefined ? { b: Math.round(listing.rating * 10) } : {}) },
      stage: reviews < ENOUGH_REVIEWS ? "NOT_SEEN" : "WORKING",
      fix: reviews < ENOUGH_REVIEWS ? { code: "moreReviews", a: reviews } : null,
    });
  }

  // The ChatGPT app's answers to the website's questions: its pages read, and whether it recommends the business.
  const answers = [...(await appAnswers(ctx, site, 1)).values()].flatMap((entries) => entries.slice(0, 1));
  if (answers.length > 0) {
    const names = (await holdBrandNames(ctx, site.hold._id)).map((entry) => entry.name.toLowerCase()).filter((name) => name.length > 2);
    const isYou = (business: { name: string; host?: string }) => onHost(business.host ?? "", host) || names.some((name) => business.name.toLowerCase().includes(name));
    const showing = answers.filter((answer) => answer.extras.businesses.length > 0);
    const shown = showing.filter((answer) => answer.extras.businesses.some(isYou)).length;
    const read = new Map<string, number>();
    for (const answer of answers) for (const url of answer.extras.read) if (onHost(hostOf(url), host)) read.set(url, (read.get(url) ?? 0) + 1);
    const readTimes = [...read.values()].reduce((sum, times) => sum + times, 0);
    const mostRead = [...read.entries()].sort((left, right) => right[1] - left[1])[0];
    rows.push({
      key: "ai:app",
      kind: "AI_APP",
      name: "ChatGPT",
      seen: { code: "pagesRead", a: readTimes },
      chosen: { code: "recommended", a: shown, b: showing.length },
      stage: readTimes === 0 && shown === 0 ? "NOT_SEEN" : shown === 0 ? "SEEN_NOT_CHOSEN" : "WORKING",
      fix: shown === 0 && mostRead ? { code: "readNotQuoted", text: pathOf(mostRead[0]), a: mostRead[1] } : readTimes === 0 && shown === 0 ? { code: "getRead" } : null,
    });
  }

  // Google's AI Overviews on the website's tracked searches.
  const overviews = await readOverviews(ctx, site);
  const withOverview = overviews.rows.filter((row) => row.overview);
  if (withOverview.length > 0) {
    const quotesYou = withOverview.filter((row) => row.quotesYou).length;
    const rivalPage = [...pages.entries()].filter(([url]) => rivalHosts.some((rival) => onHost(hostOf(url), rival))).sort((left, right) => right[1] - left[1])[0];
    const short = quotesYou * 2 < withOverview.length;
    rows.push({
      key: "ai:overview",
      kind: "AI_OVERVIEW",
      name: "Google AI Overviews",
      seen: { code: "overviews", a: withOverview.length },
      chosen: { code: "quotesYou", a: quotesYou },
      stage: short ? "SEEN_NOT_CHOSEN" : "WORKING",
      fix: short && rivalPage ? { code: "answerRivalPage", text: `${hostOf(rivalPage[0])}${pathOf(rivalPage[0])}`, a: rivalPage[1] } : short ? { code: "beQuoted" } : null,
    });
  }

  // The website's own pages AI quotes most.
  for (const [url, times] of [...pages.entries()].filter(([url]) => onHost(hostOf(url), host)).sort((left, right) => right[1] - left[1]).slice(0, PAGES_SHOWN)) {
    rows.push({ key: `page:${pathOf(url)}`, kind: "PAGE", name: pathOf(url), seen: { code: "aiQuoted", a: times }, chosen: null, stage: "WORKING", fix: null });
  }

  // Directories and review sites AI quotes: on them beside the website, or only beside its rivals.
  const places = [...quoted.entries()]
    .filter(([at]) => !onHost(at, host) && !rivalHosts.some((rival) => onHost(at, rival)) && ["DIRECTORY", "REVIEWS"].includes(siteKindOf(at)))
    .sort((left, right) => right[1].times - left[1].times)
    .slice(0, PLACES_SHOWN);
  for (const [at, row] of places) {
    const missing = row.besideYou === 0 && row.rivals.size > 0;
    rows.push({
      key: `place:${at}`,
      kind: "DIRECTORY",
      name: at,
      seen: { code: "aiQuoted", a: row.times },
      chosen: null,
      stage: missing ? "NOT_THERE" : "WORKING",
      fix: missing ? { code: "getListed", a: row.rivals.size } : null,
    });
  }
  // Press and the web: the pages naming the business this year (Web mentions), and how many link to it.
  const press = pressAsset(await shownMentionsOf(ctx, site.website._id));
  if (press) rows.push(press);
  return rows;
}

/** The press line from the website's pages found by Web mentions (a year of them), or none before any were read. */
export function pressAsset(mentions: MentionRow[] | null): AssetRow | null {
  if (!mentions) return null;
  const linked = mentions.filter((row) => row.linked === 1).length;
  const unlinked = mentions.length - linked;
  const stage = mentions.length === 0 ? "NOT_THERE" : mentions.length < ENOUGH_MENTIONS ? "NOT_SEEN" : linked * 2 < mentions.length ? "SEEN_NOT_CHOSEN" : "WORKING";
  return {
    key: "press",
    kind: "PRESS",
    name: "press",
    seen: { code: "mentions", a: mentions.length },
    chosen: mentions.length === 0 ? null : { code: "linked", a: linked, b: mentions.length },
    stage,
    fix: stage === "NOT_THERE"
      ? { code: "getMentioned" }
      : stage === "NOT_SEEN"
        ? { code: "fewMentions", a: mentions.length }
        : stage === "SEEN_NOT_CHOSEN"
          ? { code: "askForLinks", a: unlinked }
          : null,
  };
}

/** Work a website's assets out now and keep them, writing nothing when nothing changed (rule 11). */
export async function writeAssets(ctx: MutationCtx, holdId: Id<"companyWebsites">): Promise<void> {
  const held = await ctx.db.query("assetSummaries").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).unique();
  const site = await loadSite(ctx, holdId);
  if (!site || isTrackedHold(site.hold)) {
    if (held) await ctx.db.delete(held._id);
    return;
  }
  const rows = await workOutAssets(ctx, site);
  if (!held) await ctx.db.insert("assetSummaries", { companyWebsiteId: holdId, rows, updatedAt: Date.now() });
  // Compared field by field, whatever order the stored rows come back in.
  else if (stableText(held.rows) !== stableText(rows)) await ctx.db.patch(held._id, { rows, updatedAt: Date.now() });
}

export const rebuildAssets = internalMutation({
  args: { holdId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await writeAssets(ctx, args.holdId);
    return null;
  },
});

/** After a collection: each of the company's own websites' assets, one at a time. */
export const rebuildCompanyAssets = internalMutation({
  args: { cycleId: v.id("seoCollectionCycles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) return null;
    const holds = await ctx.db.query("companyWebsites").withIndex("by_company", (q) => q.eq("companyId", cycle.companyId)).take(200);
    for (const [at, hold] of holds.filter((entry) => !isTrackedHold(entry)).entries()) {
      // One website a mutation: each reads what its own pages read.
      await ctx.scheduler.runAfter(at * 1_000, internal.assetSummaries.rebuildAssets, { holdId: hold._id });
    }
    return null;
  },
});

/** Book the company's assets to be worked out once its collection's answers have landed. */
export async function bookAssetsAfter(ctx: MutationCtx, cycleId: Id<"seoCollectionCycles">): Promise<void> {
  await ctx.scheduler.runAfter(AFTER_COLLECTION_MS, internal.assetSummaries.rebuildCompanyAssets, { cycleId });
}

/** A website's assets as kept, or none before they are first worked out. */
export async function assetsOf(ctx: Reader, holdId: Id<"companyWebsites">): Promise<Doc<"assetSummaries"> | null> {
  return await ctx.db.query("assetSummaries").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).unique();
}
