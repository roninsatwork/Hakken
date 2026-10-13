import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { accessTokenFor } from "./searchConsoleConnect";
import { callGoogle } from "./googleApi";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { orphanPagesOf } from "./insightsReading";
import { changeKindValidator, fingerprintChanges } from "./utils/insightTrack";
import { PAGE_READER_AGENT, indexedFrom, originOf, indexedValidator, pageFactsOf, pageFactsValidator, speedFrom, speedValidator, structuredDataOf, type Indexed, type PageFacts, type Speed } from "./utils/moneyPageChecks";

/**
 * The weekly checks on a website's money pages (docs/plans/active/
 * insights-analyst-plan.md §4.4, phase 8): Google's URL inspection through
 * the website's own Search Console sign-in, real-visitor speed from
 * PageSpeed Insights (Google's Chrome figures), and the structured data read
 * from each page. Started by the Insights team's run for a website not
 * checked in a week; one page failing never stops the rest.
 */

/** The money pages checked at most: the home page and services, most clicks first. */
export const MOST_MONEY_PAGES = 12;
/** A website is checked again after this long. */
export const CHECK_EVERY_MS = 7 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000;
/** A plain read showing fewer words than this is a page drawn by its scripts. */
const THIN_PAGE = 80;
/** Pages checked at once: PageSpeed takes ten to twenty seconds a page. */
const AT_ONCE = 4;
const MONEY_KINDS = new Set(["HOME", "SERVICE", "ABOUT"]);

/** What a website's checks need: its address, its Search Console property and its money pages. */
export const checkTargets = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    origin: v.string(),
    consoleId: v.union(v.id("searchConsoleConnections"), v.null()),
    property: v.union(v.string(), v.null()),
    pages: v.array(v.object({ page: v.string(), kind: v.union(v.string(), v.null()), clicks: v.number() })),
    checkedAt: v.union(v.number(), v.null()),
  })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    const website = hold ? await ctx.db.get(hold.websiteId) : null;
    if (!hold || !website) return null;
    const console = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    const held = await ctx.db.query("holdPages").withIndex("by_hold_clicks", (q) => q.eq("companyWebsiteId", hold._id)).order("desc").take(400);
    const pages = held
      .filter((page) => page.page === "/" || MONEY_KINDS.has(page.pageType ?? ""))
      .slice(0, MOST_MONEY_PAGES)
      .map((page) => ({ page: page.page, kind: page.page === "/" ? "HOME" : page.pageType ?? null, clicks: page.clicks }));
    const last = await ctx.db.query("moneyPageChecks").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", hold._id)).first();
    return {
      origin: originOf(website, console),
      consoleId: console?.status === "CONNECTED" ? console._id : null,
      property: console?.status === "CONNECTED" ? console.property ?? null : null,
      pages,
      checkedAt: last?.checkedAt ?? null,
    };
  },
});

const checkRow = v.object({
  page: v.string(),
  kind: v.union(v.string(), v.null()),
  clicks: v.number(),
  indexed: v.union(indexedValidator, v.null()),
  speed: v.union(speedValidator, v.null()),
  structured: v.union(v.array(v.string()), v.null()),
  facts: v.union(pageFactsValidator, v.null()),
});

/** A part of a money page that changed since its last check, for the change log (I25). */
const pageChangeSeen = v.object({ kind: changeKindValidator, page: v.string() });

/**
 * The week's checks, a row a page; pages no longer among the money pages go.
 * Says what changed on each page since the week before, set against the
 * check it replaces: the last one kept.
 */
export const saveChecks = internalMutation({
  args: { holdId: v.id("companyWebsites"), rows: v.array(checkRow) },
  returns: v.array(pageChangeSeen),
  handler: async (ctx, args) => {
    const now = Date.now();
    const held = await ctx.db.query("moneyPageChecks").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", args.holdId)).take(MOST_MONEY_PAGES * 4);
    const wanted = new Set(args.rows.map((row) => row.page));
    for (const row of held) if (!wanted.has(row.page)) await ctx.db.delete(row._id);
    const changed: Array<typeof pageChangeSeen.type> = [];
    for (const row of args.rows) {
      const existing = held.find((entry) => entry.page === row.page);
      const record = { companyWebsiteId: args.holdId, ...row, checkedAt: now };
      if (existing) {
        for (const kind of fingerprintChanges({ kind: existing.kind, facts: existing.facts ?? null, structured: existing.structured }, row)) changed.push({ kind, page: row.page });
        await ctx.db.replace(existing._id, record);
      } else await ctx.db.insert("moneyPageChecks", record);
    }
    return changed;
  },
});

/** One page's three checks; each failing on its own reads as unknown. */
async function checkPage(origin: string, page: string, inspect: ((address: string) => Promise<Indexed | null>) | null, problems: Set<string>): Promise<{ indexed: Indexed | null; speed: Speed | null; structured: string[] | null; facts: PageFacts | null }> {
  const address = `${origin}${page}`;
  const key = process.env.PAGESPEED_API_KEY;
  const [indexed, speed, read] = await Promise.all([
    inspect ? inspect(address).catch(() => null) : Promise.resolve(null),
    (async () => {
      const url = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(address)}&strategy=mobile&category=performance${key ? `&key=${key}` : ""}`;
      const response = await fetch(url);
      if (!response.ok) problems.add(`PageSpeed: ${response.status}`);
      return response.ok ? speedFrom(await response.json()) : null;
    })().catch(() => null),
    readPage(address).catch(() => null),
  ]);
  return { indexed, speed, structured: read?.structured ?? null, facts: read?.facts ?? null };
}

/**
 * What a page of the website says, as the weekly checks read it: its words
 * and asks, and its structured data. Null when it can't be read. Also read
 * for a finding's own page, so a change to it restarts the finding's check
 * (utils/insightClock.ts).
 */
export async function readPage(address: string): Promise<{ structured: string[]; facts: PageFacts } | null> {
  const response = await fetch(address, { headers: { "User-Agent": PAGE_READER_AGENT, Accept: "text/html" } });
  if (!response.ok) return null;
  const html = await response.text();
  let facts = pageFactsOf(html);
  // A page drawn by its scripts shows almost no words to a plain read: Firecrawl renders it (plan §9).
  if (facts.words < THIN_PAGE && process.env.FIRECRAWL_API_KEY) {
    const rendered = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: address, formats: ["markdown"], onlyMainContent: false }),
    }).then((answer) => (answer.ok ? answer.json() : null)).catch(() => null) as { data?: { markdown?: string } } | null;
    if (rendered?.data?.markdown) facts = pageFactsOf(html, rendered.data.markdown);
  }
  return { structured: structuredDataOf(html), facts };
}

/** A website's money pages, checked: started by the team's run, or by hand for a first check. */
export const checkWebsite = internalAction({
  args: { holdId: v.id("companyWebsites"), force: v.optional(v.boolean()) },
  /** How many pages, why any check failed, as Google said, for the run's log; and what changed on them, for the change log. */
  returns: v.object({ checked: v.number(), problems: v.array(v.string()), changed: v.array(pageChangeSeen) }),
  handler: async (ctx, args) => {
    const targets = await ctx.runQuery(internal.moneyPageChecks.checkTargets, { holdId: args.holdId });
    if (!targets || targets.pages.length === 0) return { checked: 0, problems: [], changed: [] };
    if (!args.force && targets.checkedAt !== null && Date.now() - targets.checkedAt < CHECK_EVERY_MS) return { checked: 0, problems: [], changed: [] };
    const problems = new Set<string>();
    let inspect: ((address: string) => Promise<Indexed | null>) | null = null;
    if (targets.consoleId && targets.property) {
      const token = await accessTokenFor(ctx, targets.consoleId as Id<"searchConsoleConnections">);
      if (token.ok) {
        const property = targets.property;
        inspect = async (address) => {
          const answer = await callGoogle("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", token.accessToken, { inspectionUrl: address, siteUrl: property });
          if (!answer.ok) problems.add(`URL inspection: ${answer.reason} ${answer.status} ${answer.detail}`.slice(0, 300));
          return answer.ok ? indexedFrom(answer.json, address) : null;
        };
      } else problems.add(`Search Console sign-in: ${token.problem}`);
    } else problems.add("No Search Console connection: indexing is not checked.");
    if (!process.env.PAGESPEED_API_KEY) problems.add("No PAGESPEED_API_KEY: Google gives no speed figures without one.");
    const rows: Array<typeof checkRow.type> = [];
    for (let at = 0; at < targets.pages.length; at += AT_ONCE) {
      const batch = targets.pages.slice(at, at + AT_ONCE);
      const found = await Promise.all(batch.map((page) => checkPage(targets.origin, page.page, inspect, problems)));
      batch.forEach((page, index) => rows.push({ ...page, ...found[index] }));
    }
    // Typed here: a result inferred from this module's own mutation collapses the API's types.
    const changed: Array<typeof pageChangeSeen.type> = await ctx.runMutation(internal.moneyPageChecks.saveChecks, { holdId: args.holdId, rows });
    return { checked: rows.length, problems: [...problems], changed };
  },
});

/**
 * A website's money pages as the newest weekly check found them, for
 * Visibility's audit and Search Console's Indexing (§4.4): one row a page,
 * the most clicks first; and the pages no other page links to, from the
 * newest crawl. Null for a rival's website, which Hakken doesn't check.
 */
export const siteMoneyPages = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    checkedAt: v.union(v.number(), v.null()),
    pages: v.array(v.object({
      page: v.string(),
      /** Its title, as Analytics last saw it (I41). */
      title: v.union(v.string(), v.null()),
      kind: v.union(v.string(), v.null()),
      clicks: v.number(),
      indexed: v.union(indexedValidator, v.null()),
      speed: v.union(speedValidator, v.null()),
      structured: v.union(v.array(v.string()), v.null()),
    })),
    orphans: v.union(v.number(), v.null()),
    orphanPages: v.array(v.string()),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    if (site.hold.relationship !== "OWNED") return null;
    const rows = await ctx.db.query("moneyPageChecks").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", site.hold._id)).take(MOST_MONEY_PAGES * 4);
    const crawl = await ctx.db.query("siteCrawls").withIndex("by_site_day", (q) => q.eq("websiteId", site.hold.websiteId)).order("desc").first();
    const orphans = crawl ? await orphanPagesOf(ctx, crawl.pullId) : null;
    const titles = new Map<string, string | null>();
    for (const row of rows) titles.set(row.page, (await ctx.db.query("holdPages").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", site.hold._id).eq("page", row.page)).first())?.title ?? null);
    return {
      checkedAt: rows.length > 0 ? Math.max(...rows.map((row) => row.checkedAt)) : null,
      pages: rows.sort((a, b) => b.clicks - a.clicks).map(({ page, kind, clicks, indexed, speed, structured }) => ({ page, title: titles.get(page) ?? null, kind, clicks, indexed, speed, structured })),
      orphans: orphans ? orphans.length : null,
      orphanPages: (orphans ?? []).slice(0, 20).map((page) => page.page),
    };
  },
});
