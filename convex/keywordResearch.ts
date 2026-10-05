import { v } from "convex/values";
import { lookupOverviewShape, lookupResultsShape, pastLookupsShape, researchListShape, researchListsShape, researchSetupShape } from "./keywordResearchShapes";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireTenant, tenantMutation, tenantQuery, type TenantIdentity } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { isOversightRole } from "./authz";
import { companyHolds } from "./siteAccess";
import { readFanOutLimits } from "./fanOutLimits";
import { startAgentRun } from "./agentRunStartService";
import { readSearchPhrase, addWebsiteKeywordCore } from "./websiteCanonical";
import { holdSearch, holdSearches } from "./holdLists";
import { RESEARCH_COUNTRIES, RESEARCH_COUNTRY_CODES, findResearchCountry, homeCountryOf } from "./utils/researchCountries";
import { hostOf, pageKey } from "./keywordResearchCalls";
import { pageTypeByAddress } from "./utils/siteShapes";
import { newestKeyword, newestSerp, overviewIsFresh, freshnessOf, researchAgent, serpIsFresh } from "./keywordResearchData";
import { researchCosts } from "./keywordResearchPrices";
import { findSeoLocation } from "./utils/seoLocations";
import { researchProblemOf } from "./utils/researchProblems";
import { websiteIconUrl } from "./websiteIcons";
import { creditResearchRun } from "./creditHooks";

/**
 * Keyword research, the company's side (docs/plans/active/keyword-research-
 * plan.md): Look up, Past lookups, a lookup's overview, searches by country,
 * and research lists with Track.
 *
 * What a company looked up and its lists are its own, read and written only
 * through its own company; what was bought is shared. Anyone in the company
 * may look up, list and track but the platform's oversight roles (Anthony,
 * 2026-10-04: "Anyone who can edit"). Look up never buys here: it writes the
 * lookups and starts the Keyword research agent, which buys.
 */

type Reader = { db: QueryCtx["db"] };

/** The most a company's Past lookups show, newest first, and a research list holds: said to Anthony, 2026-10-04. */
const LOOKUPS_READ = 500;
const LISTS_READ = 200;
const LIST_KEYWORDS_READ = 500;
/** A run that has done nothing for this long has stopped; a part waiting on it may be asked for again. */
const RUN_GOING_MS = 10 * 60 * 1000;
/** Enough of a website's tracked searches to know whether one more fits: its limit is at most 1,000. */
const TRACKED_READ = 1_001;
const NAME_MAX = 80;

export function requireLooker(ctx: TenantIdentity): Id<"companies"> {
  if (isOversightRole(ctx.user.role)) throw appError("UNAUTHORIZED", "Your account can read Keyword research, not buy or change it.");
  return requireTenant(ctx);
}

/** The company's own websites, each with the country a lookup opens on. */
export async function ownWebsites(ctx: Reader, companyId: Id<"companies">) {
  const holds = await companyHolds(ctx, companyId);
  return holds
    .filter((row) => row.summary.relationship === "OWNED")
    .map((row) => ({ siteId: row.hold._id, host: row.website.displayHost, websiteId: row.website._id, place: row.hold.locationCode, homeCountry: homeCountryOf(row.hold.locationCode) }));
}

async function requireOwnWebsite(ctx: Reader, companyId: Id<"companies">, siteId: Id<"companyWebsites">) {
  const website = (await ownWebsites(ctx, companyId)).find((row) => row.siteId === siteId);
  if (!website) throw appError("NOT_FOUND", "That website is not one of your company's own.");
  return website;
}

function requireCountry(locationCode: number) {
  if (!RESEARCH_COUNTRY_CODES.includes(locationCode)) throw appError("INVALID_INPUT", "Keyword research can't look up that country yet.");
}

export async function requireLookup(ctx: Reader & TenantIdentity, lookupId: Id<"keywordLookups">): Promise<Doc<"keywordLookups">> {
  const lookup = await ctx.db.get(lookupId);
  if (!lookup || lookup.companyId !== requireTenant(ctx)) throw appError("NOT_FOUND", "That lookup is not your company's.");
  return lookup;
}

async function requireList(ctx: Reader & TenantIdentity, listId: Id<"researchLists">): Promise<Doc<"researchLists">> {
  const list = await ctx.db.get(listId);
  if (!list || list.companyId !== requireTenant(ctx)) throw appError("NOT_FOUND", "That list is not your company's.");
  return list;
}

export type ResearchPart = Doc<"researchJobs">["part"];
export type ResearchJob = { lookup: Pick<Doc<"keywordLookups">, "_id" | "keyword" | "locationCode">; part: ResearchPart; locationCode?: number; again?: boolean };

/**
 * Start the Keyword research agent for parts of a company's lookups, each a
 * job of the run — refused plainly when there is no agent holding the role,
 * or it is switched off.
 */
export async function startResearchRun(ctx: MutationCtx & TenantIdentity, companyId: Id<"companies">, what: string, jobs: ResearchJob[]): Promise<Id<"agentRuns">> {
  const agent = await researchAgent(ctx);
  if (!agent) throw appError("NOT_FOUND", "There is no Keyword research agent yet. An admin creates it in Admin → Agents, from the Keyword research template.");
  if (agent.isActive === false) throw appError("CONFLICT", `${agent.name} is switched off. An admin switches it on in Admin → Agents.`);
  const company = await ctx.db.get(companyId);
  const now = Date.now();
  const objective = `Buy ${what} for ${company?.name ?? "the company"}.`;
  const runId = await ctx.db.insert("agentRuns", {
    agentId: agent._id,
    triggerType: "MANUAL",
    objective,
    title: `Look up — ${what}`,
    status: "QUEUED",
    companyId,
    userId: ctx.userId,
    startedAt: now,
    updatedAt: now,
  });
  for (const job of jobs) {
    await ctx.db.insert("researchJobs", {
      runId,
      lookupId: job.lookup._id,
      companyId,
      part: job.part,
      keyword: job.lookup.keyword,
      locationCode: job.locationCode ?? job.lookup.locationCode,
      again: job.again === true,
      createdAt: now,
    });
  }
  // Charged by the keyword; its calls add what they cost as they settle (usage-credits-plan.md).
  await creditResearchRun(ctx, { companyId, userId: ctx.userId, runId, keywords: jobs.map((job) => job.lookup.keyword) });
  const workflowExecutionId = await ctx.db.insert("workflowExecutions", {
    agentId: agent._id,
    agentRunId: runId,
    triggerType: "MANUAL",
    status: "RUNNING",
    startedAt: now,
    startedBy: ctx.userId,
  });
  await startAgentRun(ctx, { agent, runId, workflowExecutionId, objective, triggerType: "MANUAL", companyId, userId: ctx.userId });
  return runId;
}

/**
 * Whether a part of a lookup is being bought now: the newest job asked for it
 * belongs to a run still going — one that has done something in the last ten
 * minutes. A part left waiting by a run that stopped may be asked for again.
 */
export async function partIsBuying(ctx: Reader, lookupId: Id<"keywordLookups">, part: ResearchPart, locationCode?: number): Promise<boolean> {
  const jobs = await ctx.db.query("researchJobs").withIndex("by_lookup_part", (q) => q.eq("lookupId", lookupId).eq("part", part)).order("desc").take(20);
  const job = locationCode === undefined ? jobs[0] : jobs.find((row) => row.locationCode === locationCode);
  if (!job) return false;
  const run = await ctx.db.get(job.runId);
  return Boolean(run && (run.status === "QUEUED" || run.status === "RUNNING") && Date.now() - (run.updatedAt ?? run.startedAt) < RUN_GOING_MS);
}

const keywordsWord = (count: number) => (count === 1 ? "1 keyword" : `${count} keywords`);

/** What the Look up screen offers: the countries, the company's own websites, its limits, and whether the agent is there to buy. */
export const researchSetup = tenantQuery({
  args: {},
  returns: researchSetupShape,
  handler: async (ctx) => {
    const companyId = ctx.companyId;
    if (!companyId) return null;
    const [websites, limits, agent] = await Promise.all([ownWebsites(ctx, companyId), readFanOutLimits(ctx, companyId), researchAgent(ctx)]);
    return {
      canLookUp: !isOversightRole(ctx.user.role),
      countries: RESEARCH_COUNTRIES.map((country) => ({ code: country.code, label: country.label })),
      websites: websites.map(({ siteId, host, homeCountry }) => ({ siteId, host, homeCountry })),
      limits: { keywordsPerLookup: limits.researchKeywordsPerLookup, ideasPerKind: limits.researchIdeasPerKind, reuseDays: limits.researchReuseDays },
      costs: researchCosts(limits),
      agent: agent ? { active: agent.isActive !== false } : null,
    };
  },
});

/**
 * Look up: one keyword or several, in a country, measured against one of the
 * company's own websites or none. A keyword already looked up in that country
 * is opened again rather than written twice; what is held and fresh is not
 * bought again; the rest waits for the agent, started here.
 */
export const lookUp = tenantMutation({
  args: { keywords: v.array(v.string()), locationCode: v.number(), siteId: v.optional(v.id("companyWebsites")) },
  returns: v.object({ lookupIds: v.array(v.id("keywordLookups")), waiting: v.number() }),
  handler: async (ctx, args) => {
    const companyId = requireLooker(ctx);
    requireCountry(args.locationCode);
    if (args.siteId) await requireOwnWebsite(ctx, companyId, args.siteId);
    const limits = await readFanOutLimits(ctx, companyId);

    const typed = new Map<string, string>();
    for (const raw of args.keywords) {
      if (!raw.trim()) continue;
      const { keyword, text } = readSearchPhrase(raw);
      if (!typed.has(keyword)) typed.set(keyword, text);
    }
    if (typed.size === 0) throw appError("INVALID_INPUT", "Type a keyword to look up.");
    if (typed.size > limits.researchKeywordsPerLookup) {
      throw appError("INVALID_INPUT", `One Look up can hold at most ${keywordsWord(limits.researchKeywordsPerLookup)}: the limit in Limits.`);
    }

    const fresh = freshnessOf(limits.researchReuseDays);
    const now = Date.now();
    const lookupIds: Id<"keywordLookups">[] = [];
    const waiting: ResearchJob[] = [];
    for (const [keyword, text] of typed) {
      const held = (await overviewIsFresh(ctx, keyword, args.locationCode, fresh)) && (await serpIsFresh(ctx, keyword, args.locationCode, fresh));
      const existing = await ctx.db
        .query("keywordLookups")
        .withIndex("by_company_keyword_place", (q) => q.eq("companyId", companyId).eq("keyword", keyword).eq("locationCode", args.locationCode))
        .first();
      const stillBuying = existing?.overview === "WAITING" && (await partIsBuying(ctx, existing._id, "OVERVIEW"));
      const overview = held ? ("READY" as const) : ("WAITING" as const);
      if (existing) {
        await ctx.db.patch(existing._id, {
          text,
          openedAt: now,
          companyWebsiteId: args.siteId,
          ...(stillBuying ? {} : { overview, problem: undefined }),
        });
        lookupIds.push(existing._id);
        if (!stillBuying && !held) waiting.push({ lookup: existing, part: "OVERVIEW" });
      } else {
        const id = await ctx.db.insert("keywordLookups", {
          companyId, keyword, text, locationCode: args.locationCode, ...(args.siteId ? { companyWebsiteId: args.siteId } : {}),
          createdBy: ctx.userId, createdAt: now, openedAt: now, overview,
        });
        lookupIds.push(id);
        if (!held) waiting.push({ lookup: { _id: id, keyword, locationCode: args.locationCode }, part: "OVERVIEW" });
      }
    }
    if (waiting.length > 0) await startResearchRun(ctx, companyId, keywordsWord(waiting.length), waiting);
    return { lookupIds, waiting: waiting.length };
  },
});

/** Look up again: buy the keyword afresh now, however recently it was bought. */
export const lookUpAgain = tenantMutation({
  args: { lookupId: v.id("keywordLookups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const companyId = requireLooker(ctx);
    const lookup = await requireLookup(ctx, args.lookupId);
    if (lookup.overview === "WAITING" && (await partIsBuying(ctx, lookup._id, "OVERVIEW"))) return null;
    await startResearchRun(ctx, companyId, keywordsWord(1), [{ lookup, part: "OVERVIEW", again: true }]);
    await ctx.db.patch(lookup._id, { overview: "WAITING", openedAt: Date.now(), problem: undefined });
    return null;
  },
});

/** Searches by country: look the keyword up in one more country, its overview alone (about 1 cent: `researchCosts`). */
export const lookUpInCountry = tenantMutation({
  args: { lookupId: v.id("keywordLookups"), locationCode: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const companyId = requireLooker(ctx);
    requireCountry(args.locationCode);
    const lookup = await requireLookup(ctx, args.lookupId);
    if (args.locationCode === lookup.locationCode) return null;
    const asked = lookup.countries?.find((country) => country.locationCode === args.locationCode);
    if (asked?.state === "WAITING" && (await partIsBuying(ctx, lookup._id, "COUNTRY", args.locationCode))) return null;
    const limits = await readFanOutLimits(ctx, companyId);
    const fresh = freshnessOf(limits.researchReuseDays);
    const others = (lookup.countries ?? []).filter((country) => country.locationCode !== args.locationCode);
    if (await overviewIsFresh(ctx, lookup.keyword, args.locationCode, fresh)) {
      await ctx.db.patch(lookup._id, { countries: [...others, { locationCode: args.locationCode, state: "READY" }] });
      return null;
    }
    await startResearchRun(ctx, companyId, `"${lookup.text}" in ${findResearchCountry(args.locationCode)?.label ?? "another country"}`, [
      { lookup, part: "COUNTRY", locationCode: args.locationCode },
    ]);
    await ctx.db.patch(lookup._id, { countries: [...others, { locationCode: args.locationCode, state: "WAITING" }], problem: undefined });
    return null;
  },
});

/** The figures a lookup row shows, from what is held now. */
async function figuresOf(ctx: Reader, lookup: Pick<Doc<"keywordLookups">, "keyword" | "locationCode">, host: string | null) {
  const [overview, serp] = await Promise.all([newestKeyword(ctx, lookup.keyword, lookup.locationCode), newestSerp(ctx, lookup.keyword, lookup.locationCode)]);
  const position = host && serp ? serp.results.find((result) => result.domain === host)?.position ?? null : null;
  return {
    volume: overview?.searchVolume ?? null,
    difficulty: overview?.difficulty ?? null,
    intent: overview?.intent ?? null,
    position,
    /** Google's top 100 was read and the website is not in it. */
    notInTop100: Boolean(host && serp && position === null),
    sample: Boolean(overview?.sandbox || serp?.sandbox),
  };
}

/** Past lookups: every keyword the company looked up, newest first, with its figures and its website's position. */
export const pastLookups = tenantQuery({
  args: {},
  returns: pastLookupsShape,
  handler: async (ctx) => {
    const companyId = ctx.companyId;
    if (!companyId) return [];
    const [lookups, websites] = await Promise.all([
      ctx.db.query("keywordLookups").withIndex("by_company_opened", (q) => q.eq("companyId", companyId)).order("desc").take(LOOKUPS_READ),
      ownWebsites(ctx, companyId),
    ]);
    const hostOfSite = new Map(websites.map((website) => [website.siteId, hostOf(website.host)]));
    return await Promise.all(lookups.map(async (lookup) => ({
      lookupId: lookup._id,
      keyword: lookup.text,
      locationCode: lookup.locationCode,
      country: findResearchCountry(lookup.locationCode)?.label ?? "",
      host: lookup.companyWebsiteId ? hostOfSite.get(lookup.companyWebsiteId) ?? null : null,
      state: lookup.overview,
      openedAt: lookup.openedAt,
      ...(await figuresOf(ctx, lookup, lookup.companyWebsiteId ? hostOfSite.get(lookup.companyWebsiteId) ?? null : null)),
    })));
  },
});

/**
 * "For acme-agency.test" (plan, "How it is built"): one of four answers, worked
 * out from the figures on the page. Null where they are not all there.
 *
 * With no page in the top 100, a new page is within reach when the website is
 * at least as strong as the top ten's websites are on average — its domain's
 * strength against theirs, like for like, both 0 to 100.
 */
function verdictOf(position: number | null, notInTop100: boolean, siteStrength: number | null, topTenStrength: number | null) {
  if (position !== null) return position <= 3 ? ("WINNING" as const) : ("IMPROVE" as const);
  if (!notInTop100 || siteStrength === null || topTenStrength === null) return null;
  return siteStrength >= topTenStrength ? ("NEW_PAGE" as const) : ("TOO_HARD" as const);
}

/** A website's own strength, 0 to 100 — its domain's rank of 0 to 1,000 divided by ten — from its newest day that has it. */
async function strengthOfWebsite(ctx: Reader, websiteId: Id<"websites">, place: number): Promise<number | null> {
  const days = await ctx.db.query("siteDaySummaries").withIndex("by_site_day", (q) => q.eq("websiteId", websiteId).eq("locationCode", place)).order("desc").take(30);
  const rank = days.find((day) => day.domainRank !== undefined)?.domainRank;
  return rank === undefined ? null : Math.round(rank / 10);
}

/** Whether what Websites holds for a website — its positions, its visits — is for the lookup's country: it is watched from one place only. */
export const watchedIn = (website: { homeCountry: number } | null, locationCode: number) => Boolean(website && website.homeCountry === locationCode);

/** A lookup's overview (board 2): its figures, its 24 months, Google's top results, and what it means for the website measured. */
export const lookupOverview = tenantQuery({
  args: { lookupId: v.id("keywordLookups") },
  returns: lookupOverviewShape,
  handler: async (ctx, args) => {
    const companyId = ctx.companyId;
    const lookup = await ctx.db.get(args.lookupId);
    if (!companyId || !lookup || lookup.companyId !== companyId) return null;
    const [overview, serp, websites, holds] = await Promise.all([
      newestKeyword(ctx, lookup.keyword, lookup.locationCode),
      newestSerp(ctx, lookup.keyword, lookup.locationCode),
      ownWebsites(ctx, companyId),
      companyHolds(ctx, companyId),
    ]);
    const website = lookup.companyWebsiteId ? websites.find((row) => row.siteId === lookup.companyWebsiteId) ?? null : null;
    const host = website ? hostOf(website.host) : null;
    const position = host && serp ? serp.results.find((result) => result.domain === host) ?? null : null;

    let forWebsite = null;
    if (website && host) {
      const [ranked, strength] = await Promise.all([
        watchedIn(website, lookup.locationCode)
          ? ctx.db.query("siteKeywordRanks").withIndex("by_site_keyword", (q) => q.eq("websiteId", website.websiteId).eq("locationCode", website.place ?? lookup.locationCode).eq("keyword", lookup.keyword)).first()
          : null,
        strengthOfWebsite(ctx, website.websiteId, website.place ?? lookup.locationCode),
      ]);
      const rivals = holds.filter((row) => row.summary.relationship === "TRACKED" && row.summary.ofSiteId === website.siteId);
      forWebsite = {
        siteId: website.siteId,
        host: website.host,
        position: position?.position ?? null,
        url: position?.url ?? null,
        notInTop100: Boolean(serp && !position),
        visits: ranked?.traffic ?? null,
        checkedDay: ranked?.day ?? null,
        strength,
        tracked: Boolean(await holdSearch(ctx, website.siteId, lookup.keyword)),
        verdict: verdictOf(position?.position ?? null, Boolean(serp && !position), strength, overview?.topTenDomainStrength ?? null),
        competitors: await Promise.all(rivals.map(async (row) => {
          const rival = hostOf(row.website.displayHost);
          return {
            host: row.website.displayHost,
            iconUrl: await websiteIconUrl(ctx, row.website._id),
            position: serp?.results.find((result) => result.domain === rival)?.position ?? null,
          };
        })),
      };
    }

    const countryRows = await Promise.all(RESEARCH_COUNTRIES.map(async (country) => {
      const asked: "HOME" | "WAITING" | "READY" | "FAILED" | null =
        country.code === lookup.locationCode ? "HOME" : lookup.countries?.find((row) => row.locationCode === country.code)?.state ?? null;
      const held = asked ? await newestKeyword(ctx, lookup.keyword, country.code) : null;
      return { code: country.code, label: country.label, state: asked, volume: held?.searchVolume ?? null };
    }));

    const lists = await ctx.db.query("researchLists").withIndex("by_company_updated", (q) => q.eq("companyId", companyId)).order("desc").take(LISTS_READ);
    const costs = researchCosts(await readFanOutLimits(ctx, companyId));
    return {
      lookupId: lookup._id,
      keyword: lookup.text,
      locationCode: lookup.locationCode,
      country: findResearchCountry(lookup.locationCode)?.label ?? "",
      state: lookup.overview,
      problem: researchProblemOf(lookup.problem),
      openedAt: lookup.openedAt,
      boughtAt: overview?.boughtAt ?? null,
      costUsd: lookup.spentUsd ?? null,
      buying: lookup.overview === "WAITING" && (await partIsBuying(ctx, lookup._id, "OVERVIEW")),
      costs: {
        ...costs,
        // Opening Keyword ideas buys the top ten in full too, for "also rank for", unless Google's results already have it.
        ideas: costs.ideas + (lookup.results === "READY" ? 0 : costs.results),
      },
      sample: Boolean(overview?.sandbox || serp?.sandbox),
      overview: overview
        ? {
            volume: overview.searchVolume,
            cpc: overview.cpc,
            competitionLevel: overview.competitionLevel,
            difficulty: overview.difficulty,
            intent: overview.intent,
            monthly: overview.monthly,
            serpKinds: overview.serpKinds,
            resultsCount: overview.resultsCount,
            topTenLinkingSites: overview.topTenLinkingSites,
            topTenStrength: overview.topTenDomainStrength ?? null,
          }
        : null,
      top: serp ? topPages(serp).slice(0, 5) : null,
      topResult: serp ? topPages(serp)[0] ?? null : null,
      resultsCount: serp ? Math.min(serp.results.length, 10) : null,
      results: lookup.results ?? null,
      serpBoughtAt: serp?.boughtAt ?? null,
      serpFrom: serp?.from ? findSeoLocation(serp.from)?.city ?? null : null,
      forWebsite,
      countries: countryRows,
      lists: lists.map((list) => ({ listId: list._id, name: list.name })),
      canLookUp: !isOversightRole(ctx.user.role),
    };
  },
});

/** A page's kind from its address — Home page, Service, Article… — or null where the address doesn't say. */
function kindOf(url: string) {
  try {
    return pageTypeByAddress(new URL(url).pathname);
  } catch {
    return null;
  }
}

/** The top ten of Google's results, each with what is held of its figures. */
function topPages(serp: Doc<"researchSerps">) {
  return serp.results.slice(0, 10).map((result) => {
    const page = serp.pages?.find((entry) => pageKey(entry.url) === pageKey(result.url));
    return {
      position: result.position,
      url: result.url,
      domain: result.domain,
      title: result.title,
      kind: kindOf(result.url),
      strength: page?.strength ?? null,
      linkingSites: page?.linkingSites ?? null,
      visits: page?.visits ?? null,
      keywords: page?.keywords ?? null,
      topKeyword: page?.topKeyword ?? null,
    };
  });
}

/**
 * Google's results opened (board 3): the top ten's strength, linking websites
 * and top keyword are bought the first time, and again once older than the
 * company's days; the agent buys them.
 */
export const openResults = tenantMutation({
  args: { lookupId: v.id("keywordLookups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lookup = await requireLookup(ctx, args.lookupId);
    if (isOversightRole(ctx.user.role) || lookup.overview !== "READY") return null;
    if (lookup.results === "WAITING" && (await partIsBuying(ctx, lookup._id, "RESULTS"))) return null;
    const companyId = requireTenant(ctx);
    const limits = await readFanOutLimits(ctx, companyId);
    const fresh = freshnessOf(limits.researchReuseDays);
    const serp = await newestSerp(ctx, lookup.keyword, lookup.locationCode);
    if (serp?.detailsBoughtAt && serp.detailsBoughtAt >= fresh.since && (fresh.sandbox || !serp.sandbox)) {
      if (lookup.results !== "READY") await ctx.db.patch(lookup._id, { results: "READY" });
      return null;
    }
    await startResearchRun(ctx, companyId, `Google's results for "${lookup.text}"`, [{ lookup, part: "RESULTS" }]);
    await ctx.db.patch(lookup._id, { results: "WAITING", problem: undefined });
    return null;
  },
});

/** Google's results (board 3): the top ten with each page's figures, and where the website and its competitors are in the top 100. */
export const lookupResults = tenantQuery({
  args: { lookupId: v.id("keywordLookups") },
  returns: lookupResultsShape,
  handler: async (ctx, args) => {
    const companyId = ctx.companyId;
    const lookup = await ctx.db.get(args.lookupId);
    if (!companyId || !lookup || lookup.companyId !== companyId) return null;
    const [serp, websites, holds] = await Promise.all([newestSerp(ctx, lookup.keyword, lookup.locationCode), ownWebsites(ctx, companyId), companyHolds(ctx, companyId)]);
    const website = lookup.companyWebsiteId ? websites.find((row) => row.siteId === lookup.companyWebsiteId) ?? null : null;
    const host = website ? hostOf(website.host) : null;
    const rivalWebsites = website
      ? holds.filter((row) => row.summary.relationship === "TRACKED" && row.summary.ofSiteId === website.siteId).map((row) => row.website)
      : [];
    const rivals = rivalWebsites.map((row) => hostOf(row.displayHost));
    const whoOf = (domain: string) => (domain === host ? ("YOU" as const) : rivals.includes(domain) ? ("RIVAL" as const) : null);
    const beyond = serp && host && website
      ? await Promise.all([
          { domain: host, websiteId: website.websiteId },
          ...rivalWebsites.map((row) => ({ domain: hostOf(row.displayHost), websiteId: row._id })),
        ].map(async ({ domain, websiteId }) => {
          const found = serp.results.find((result) => result.domain === domain);
          return { domain, who: whoOf(domain), iconUrl: await websiteIconUrl(ctx, websiteId), position: found?.position ?? null, url: found?.url ?? null };
        }))
      : [];
    return {
      lookupId: lookup._id,
      keyword: lookup.text,
      country: findResearchCountry(lookup.locationCode)?.label ?? "",
      state: lookup.results ?? null,
      problem: researchProblemOf(lookup.problem),
      checkedAt: serp?.boughtAt ?? null,
      /** The city Google was asked from, when the keyword names one. */
      from: serp?.from ? findSeoLocation(serp.from)?.city ?? null : null,
      detailsAt: serp?.detailsBoughtAt ?? null,
      sample: Boolean(serp?.sandbox),
      rows: serp ? topPages(serp).map((page) => ({ ...page, who: whoOf(page.domain) })) : [],
      beyond,
    };
  },
});

/** Research lists (board 1's second table): each list, its keywords and their searches added together. */
export const researchLists = tenantQuery({
  args: {},
  returns: researchListsShape,
  handler: async (ctx) => {
    const companyId = ctx.companyId;
    if (!companyId) return [];
    const [lists, websites] = await Promise.all([
      ctx.db.query("researchLists").withIndex("by_company_updated", (q) => q.eq("companyId", companyId)).order("desc").take(LISTS_READ),
      ownWebsites(ctx, companyId),
    ]);
    return await Promise.all(lists.map(async (list) => {
      const keywords = await ctx.db.query("researchListKeywords").withIndex("by_list_added", (q) => q.eq("listId", list._id)).take(LIST_KEYWORDS_READ);
      const volumes = await Promise.all(keywords.map(async (row) => (await newestKeyword(ctx, row.keyword, row.locationCode))?.searchVolume ?? 0));
      return {
        listId: list._id,
        name: list.name,
        keywords: keywords.length,
        volume: volumes.reduce((sum, volume) => sum + volume, 0),
        host: list.companyWebsiteId ? websites.find((row) => row.siteId === list.companyWebsiteId)?.host ?? null : null,
        updatedAt: list.updatedAt,
      };
    }));
  },
});

/** A research list (board 7): its keywords with their figures, whether each is worth it, and whether it is tracked. */
export const researchList = tenantQuery({
  args: { listId: v.id("researchLists") },
  returns: researchListShape,
  handler: async (ctx, args) => {
    const companyId = ctx.companyId;
    const list = await ctx.db.get(args.listId);
    if (!companyId || !list || list.companyId !== companyId) return null;
    const [keywords, websites, creator] = await Promise.all([
      ctx.db.query("researchListKeywords").withIndex("by_list_added", (q) => q.eq("listId", list._id)).take(LIST_KEYWORDS_READ),
      ownWebsites(ctx, companyId),
      list.createdBy ? ctx.db.get(list.createdBy) : Promise.resolve(null),
    ]);
    const website = list.companyWebsiteId ? websites.find((row) => row.siteId === list.companyWebsiteId) ?? null : null;
    const host = website ? hostOf(website.host) : null;
    const strength = website ? await strengthOfWebsite(ctx, website.websiteId, website.place ?? keywords[0]?.locationCode ?? 2826) : null;
    const rows = await Promise.all(keywords.map(async (row) => {
      const [overview, serp] = await Promise.all([newestKeyword(ctx, row.keyword, row.locationCode), newestSerp(ctx, row.keyword, row.locationCode)]);
      const result = host && serp ? serp.results.find((entry) => entry.domain === host) ?? null : null;
      return {
        keyword: row.keyword,
        text: row.text,
        locationCode: row.locationCode,
        volume: overview?.searchVolume ?? null,
        difficulty: overview?.difficulty ?? null,
        intent: overview?.intent ?? null,
        position: result?.position ?? null,
        url: result?.url ?? null,
        verdict: website ? verdictOf(result?.position ?? null, Boolean(serp && !result), strength, overview?.topTenDomainStrength ?? null) : null,
        tracked: website ? Boolean(await holdSearch(ctx, website.siteId, row.keyword)) : false,
        addedAt: row.addedAt,
      };
    }));
    return {
      listId: list._id,
      name: list.name,
      siteId: website?.siteId ?? null,
      host: website?.host ?? null,
      createdBy: creator?.name ?? creator?.email ?? null,
      createdAt: list.createdAt,
      rows,
      canChange: !isOversightRole(ctx.user.role),
    };
  },
});

function readListName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw appError("INVALID_INPUT", "Give the list a name.");
  if (trimmed.length > NAME_MAX) throw appError("INVALID_INPUT", `A list's name can be at most ${NAME_MAX} characters.`);
  return trimmed;
}

const itemValidator = v.object({ keyword: v.string(), locationCode: v.number() });

/**
 * Add keywords to a list — an existing one, or a new one named here, measured
 * against a website or none. A keyword already on the list stays once.
 */
export const addToResearchList = tenantMutation({
  args: {
    listId: v.optional(v.id("researchLists")),
    newList: v.optional(v.object({ name: v.string(), siteId: v.optional(v.id("companyWebsites")) })),
    items: v.array(itemValidator),
  },
  returns: v.object({ listId: v.id("researchLists"), added: v.number() }),
  handler: async (ctx, args) => {
    const companyId = requireLooker(ctx);
    const now = Date.now();
    let listId = args.listId;
    if (!listId) {
      if (!args.newList) throw appError("INVALID_INPUT", "Choose a list, or name a new one.");
      if (args.newList.siteId) await requireOwnWebsite(ctx, companyId, args.newList.siteId);
      listId = await ctx.db.insert("researchLists", {
        companyId,
        name: readListName(args.newList.name),
        ...(args.newList.siteId ? { companyWebsiteId: args.newList.siteId } : {}),
        createdBy: ctx.userId,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await requireList(ctx, listId);
    }
    const present = await ctx.db.query("researchListKeywords").withIndex("by_list_added", (q) => q.eq("listId", listId!)).take(LIST_KEYWORDS_READ + 1);
    const held = new Set(present.map((row) => `${row.locationCode}\u0000${row.keyword}`));
    let added = 0;
    for (const item of args.items) {
      requireCountry(item.locationCode);
      const { keyword, text } = readSearchPhrase(item.keyword);
      const key = `${item.locationCode}\u0000${keyword}`;
      if (held.has(key)) continue;
      if (held.size >= LIST_KEYWORDS_READ) throw appError("INVALID_INPUT", `A list can hold at most ${LIST_KEYWORDS_READ.toLocaleString("en-GB")} keywords.`);
      await ctx.db.insert("researchListKeywords", { listId, companyId, keyword, text, locationCode: item.locationCode, addedBy: ctx.userId, addedAt: now });
      held.add(key);
      added += 1;
    }
    await ctx.db.patch(listId, { updatedAt: now });
    return { listId, added };
  },
});

/** Take keywords off a list. A keyword tracked from it stays tracked: the list and the tracked searches never sync. */
export const removeFromResearchList = tenantMutation({
  args: { listId: v.id("researchLists"), items: v.array(itemValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireLooker(ctx);
    const list = await requireList(ctx, args.listId);
    for (const item of args.items) {
      const keyword = readSearchPhrase(item.keyword).keyword;
      const row = await ctx.db
        .query("researchListKeywords")
        .withIndex("by_list_keyword", (q) => q.eq("listId", list._id).eq("keyword", keyword).eq("locationCode", item.locationCode))
        .first();
      if (row) await ctx.db.delete(row._id);
    }
    await ctx.db.patch(list._id, { updatedAt: Date.now() });
    return null;
  },
});

export const renameResearchList = tenantMutation({
  args: { listId: v.id("researchLists"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireLooker(ctx);
    const list = await requireList(ctx, args.listId);
    await ctx.db.patch(list._id, { name: readListName(args.name), updatedAt: Date.now() });
    return null;
  },
});

export const deleteResearchList = tenantMutation({
  args: { listId: v.id("researchLists") },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireLooker(ctx);
    const list = await requireList(ctx, args.listId);
    const keywords = await ctx.db.query("researchListKeywords").withIndex("by_list_added", (q) => q.eq("listId", list._id)).take(LIST_KEYWORDS_READ + 1);
    for (const row of keywords) await ctx.db.delete(row._id);
    await ctx.db.delete(list._id);
    return null;
  },
});

/**
 * Track: copy a list's keywords into its website's tracked Google searches,
 * checked every run at the usual cost, within the website's tracked limit.
 * The list is left as it is (Anthony: research lists stay separate).
 */
export const trackFromResearchList = tenantMutation({
  args: { listId: v.id("researchLists"), keywords: v.array(v.string()) },
  returns: v.object({ tracked: v.number() }),
  handler: async (ctx, args) => {
    const companyId = requireLooker(ctx);
    const list = await requireList(ctx, args.listId);
    if (!list.companyWebsiteId) throw appError("INVALID_INPUT", "Choose the website this list is measured against before tracking its keywords.");
    await requireOwnWebsite(ctx, companyId, list.companyWebsiteId);
    // The tracked list read once, and counted up as each is added, rather than read again for every keyword.
    let listSize = (await holdSearches(ctx, list.companyWebsiteId, TRACKED_READ)).length;
    let tracked = 0;
    for (const raw of args.keywords) {
      const { keyword } = readSearchPhrase(raw);
      if (await holdSearch(ctx, list.companyWebsiteId, keyword)) continue;
      await addWebsiteKeywordCore(ctx, { companyWebsiteId: list.companyWebsiteId, keyword, userId: ctx.userId, addedFrom: "HAND", listSize });
      listSize += 1;
      tracked += 1;
    }
    return { tracked };
  },
});
