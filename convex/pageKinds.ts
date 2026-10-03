import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { FAN_OUT_LIMITS } from "./fanOutLimits";
import { readClassificationSetup, ruleInputs } from "./pageClassifications";
import { classificationLineKindValidator, classificationTypeValidator } from "./pagesSchema";
import { requireMySite } from "./siteAccess";
import { tenantQuery } from "./tenantFunctions";
import { normalisePage } from "./utils/pageClassification";
import { pageKindsFrom, type PageKinds, type PageKindSetup } from "./utils/pageKinds";
import { fileNameOf } from "./utils/sitemapReading";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * A website's own classifications on its charts and screens (docs/plans/
 * active/page-groups-plan.md, decision 2): "a website's own groups replace
 * the automated kinds on its charts and screens once filled in; until then
 * the automated kinds show".
 *
 * Every read that hands a screen a page's kind — Search Console's lists and
 * their summaries, the Sites Overview's pages by kind, Top pages, a page's
 * own screen — asks here once, by the caller's own hold, and classifies its
 * pages in memory (`utils/pageKinds.ts`): no read per page, and nothing
 * stored to keep in step. Without a classification nothing changes.
 *
 * **Only the hold's own.** Everything is read by the hold the caller reached
 * through their own company (`requireMySite`), so another company holding
 * the same website never lends its classifications; a competitor has none.
 */

type Reader = { db: QueryCtx["db"] };
type HoldId = Id<"companyWebsites">;

/**
 * Pages read, at most, for the website's "listed in sitemap file" lines in
 * one read: the pages those files list, by the hold's own index. 8,000 fits
 * one Convex array (8,192 items), which is how the live Search Console asks
 * carry them. Past it, a page of those files no other line catches reads as
 * Not sorted.
 */
export const SITEMAP_FILE_PAGES_READ = 8_000;

/** Classifications read for the screens' choices: the largest the limit allows. */
const CLASSIFICATIONS_READ = Math.max(...FAN_OUT_LIMITS.classificationsPerSite.choices);

/**
 * The pages the named sitemap files list, by the hold's own index. A line
 * keeps a file's name in lower case, so each is matched to the name the
 * newest reading gave it, whatever its case.
 */
async function pagesOfFiles(ctx: Reader, hold: Doc<"companyWebsites">, files: ReadonlySet<string>) {
  const reading = await ctx.db.query("siteSitemaps").withIndex("by_website", (q) => q.eq("websiteId", hold.websiteId)).first();
  const names = new Set<string>(files);
  for (const file of reading?.files ?? []) {
    const name = fileNameOf(file.url);
    if (files.has(name.toLowerCase())) names.add(name);
  }
  const pages: Array<{ page: string; file: string }> = [];
  let left = SITEMAP_FILE_PAGES_READ;
  let cut = false;
  for (const name of names) {
    if (left <= 0) {
      cut = true;
      break;
    }
    const rows = await ctx.db
      .query("holdPages")
      .withIndex("by_hold_file", (q) => q.eq("companyWebsiteId", hold._id).eq("sitemapFile", name))
      .take(left + 1);
    if (rows.length > left) cut = true;
    for (const row of rows.slice(0, left)) pages.push({ page: row.page, file: name });
    left -= Math.min(rows.length, left);
  }
  return { pages, cut };
}

/** The sitemap files of a few named pages — one page's own screen — each by its own row. */
async function pagesListed(ctx: Reader, holdId: HoldId, pages: readonly string[]) {
  const rows = await Promise.all(pages.map((page) => ctx.db
    .query("holdPages")
    .withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", holdId).eq("page", normalisePage(page)))
    .first()));
  return {
    pages: rows.flatMap((row) => (row?.sitemapFile ? [{ page: row.page, file: row.sitemapFile }] : [])),
    cut: false,
  };
}

/**
 * What a read needs to classify a website's pages, or null while it has no
 * classification — or is a competitor's, which never has. `pages` names the
 * only pages the read will ask about (one page's own screen), so their
 * sitemap files are looked up one by one rather than file by file; an empty
 * list looks up none, for a caller that knows each page's file already.
 */
export async function readPageKindSetup(ctx: Reader, holdId: HoldId, options: { pages?: readonly string[] } = {}): Promise<PageKindSetup | null> {
  const hold = await ctx.db.get(holdId);
  if (!hold || isTrackedHold(hold)) return null;
  // Most websites have none: one index read says so, before any line or page set by hand is read.
  const any = await ctx.db.query("pageClassifications").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).first();
  if (!any) return null;
  const setup = await readClassificationSetup(ctx, holdId);
  if (setup.classifications.length === 0) return null;
  const inputs = ruleInputs(setup);
  const files = new Set(inputs.lines.filter((line) => line.kind === "SITEMAP_FILE").map((line) => line.value.trim().toLowerCase()));
  const sitemap = files.size === 0
    ? { pages: [], cut: false }
    : options.pages
      ? await pagesListed(ctx, holdId, options.pages)
      : await pagesOfFiles(ctx, hold, files);
  return {
    classifications: setup.classifications.map((classification) => ({ id: classification._id, name: classification.name, type: classification.type })),
    lines: inputs.lines,
    picks: inputs.picks,
    sitemap: sitemap.pages,
    sitemapCut: sitemap.cut,
  };
}

/** The hold's classifier, ready to ask about each page; null while it has no classification. */
export async function readPageKinds(ctx: Reader, holdId: HoldId, options: { pages?: readonly string[] } = {}): Promise<PageKinds | null> {
  const setup = await readPageKindSetup(ctx, holdId, options);
  return setup ? pageKindsFrom(setup) : null;
}

/** A setup as an internal query hands it to a live ask (`searchConsoleLists.ts`). */
export const pageKindSetupValidator = v.object({
  classifications: v.array(v.object({ id: v.string(), name: v.string(), type: classificationTypeValidator })),
  lines: v.array(v.object({ classificationId: v.string(), kind: classificationLineKindValidator, value: v.string() })),
  picks: v.array(v.object({ page: v.string(), classificationId: v.union(v.string(), v.null()) })),
  sitemap: v.array(v.object({ page: v.string(), file: v.string() })),
  sitemapCut: v.boolean(),
});

/**
 * The website's classifications for its screens to name a page's kind and
 * offer them as a filter, A to Z; null while it has none — the screens then
 * show Hakken's own page types, as before. Only the caller's own hold.
 */
export const pageKindChoices = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.array(v.object({ id: v.id("pageClassifications"), name: v.string(), type: classificationTypeValidator }))),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    if (isTrackedHold(site.hold)) return null;
    const classifications = await ctx.db
      .query("pageClassifications")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", site.hold._id))
      .take(CLASSIFICATIONS_READ);
    if (classifications.length === 0) return null;
    return classifications
      .map((classification) => ({ id: classification._id, name: classification.name, type: classification.type }))
      .sort((left, right) => left.name.localeCompare(right.name));
  },
});
