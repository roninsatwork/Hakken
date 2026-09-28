import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { readPlatformLimitRow } from "./platformLimitRow";
import { superAdminMutation } from "./tenantFunctions";
import { appError } from "./utils/appError";

/**
 * How much a company collects about each website it holds.
 *
 * Anthony, 2026-09-24: "I think we have a limits screen on the company so we
 * can choose this by company. Some may get 100, some may get 1000 or 2000".
 * Three limits, each a count of rows kept per website — its own site and every
 * competitor it watches alike:
 *
 * - **Keywords** — how many of a site's searches are listed, the ones that
 *   bring it the most visits first. DataForSEO charges per keyword returned
 *   ($0.012 a request of up to 1,000, plus $0.00012 a keyword), and a site
 *   with fewer keywords than the limit costs only what it has.
 * - **Backlinks** — how many of the links to a site are listed, strongest
 *   first, every link rather than one per linking website.
 * - **Everyday check** — of the keywords kept, how many are checked again on
 *   every run; the rest are refreshed weekly. Anthony, 2026-09-27, on finding
 *   every run re-checked only a site's first hundred searches — DataForSEO's
 *   default, left in place when collection was built and never raised with
 *   him: "this should be 1,000 and configurable on each website and company
 *   default in our limits section", "it could be 10,000 from the drop down".
 *   Above a hundred the rows come from the keyword list's first pages, bought
 *   on every run (`planPagedList` in `seoCollection.ts`).
 *
 * Three levels since 2026-09-28 (docs/plans/active/platform-limits-plan.md;
 * Anthony: "it should be Platform - company - website"): a website's own
 * number, else its company's, else the platform's (System Settings → Limits,
 * `platformLimits`), else Hakken's starting number below. Each level stores
 * only the limits it sets itself.
 *
 * The screens offer the choices below; anything else is refused, so a typo
 * cannot buy a million rows. Finer steps below a thousand since 2026-09-25,
 * where a competitor's links are cut down (Anthony: "100, 250, 500, 750, 1000,
 * 2500, 5000, 7500, 10000"). A list asks a thousand rows a request and its last
 * page only what is left of the limit (`listPages` in `sitePagedLists.ts`), so
 * any of these is bought exactly.
 */

export const DATA_LIMIT_CHOICES = [100, 250, 500, 750, 1_000, 2_500, 5_000, 7_500, 10_000] as const;

/** Where the platform starts: a small business's whole keyword list, and its links. */
export const DEFAULT_DATA_LIMIT = 1_000;

/** Where the platform starts on the everyday check: a small business's whole list, every run. */
export const DEFAULT_EVERYDAY_KEYWORDS = 1_000;

export type CompanyDataLimits = { keywordsPerSite: number; backlinksPerSite: number; everydayKeywords: number };

/** The fields a limit is kept in, in the order the screens show them. */
export const DATA_LIMIT_KEYS = ["keywordsPerSite", "everydayKeywords", "backlinksPerSite"] as const;
export type DataLimitKey = (typeof DATA_LIMIT_KEYS)[number];

/** Hakken's starting number for each, before anyone sets the platform's. */
export const DATA_LIMIT_STARTS: CompanyDataLimits = {
  keywordsPerSite: DEFAULT_DATA_LIMIT,
  backlinksPerSite: DEFAULT_DATA_LIMIT,
  everydayKeywords: DEFAULT_EVERYDAY_KEYWORDS,
};

/** One level's own numbers: a number where it set one, null where it uses the level above. */
export type OwnDataLimits = Record<DataLimitKey, number | null>;
export type DataLimitChanges = Partial<Record<DataLimitKey, number | null>>;

type Reader = { db: QueryCtx["db"] };

function ownOf(row: Partial<Record<DataLimitKey, number>> | null): OwnDataLimits {
  return {
    keywordsPerSite: row?.keywordsPerSite ?? null,
    everydayKeywords: row?.everydayKeywords ?? null,
    backlinksPerSite: row?.backlinksPerSite ?? null,
  };
}

async function companyRow(ctx: Reader, companyId: Id<"companies">) {
  return await ctx.db.query("companyDataLimits").withIndex("by_company", (q) => q.eq("companyId", companyId)).unique();
}

async function holdRow(ctx: Reader, companyWebsiteId: Id<"companyWebsites">) {
  return await ctx.db.query("websiteDataLimits").withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId)).unique();
}

/** The platform's numbers: its own where it set them, else Hakken's starting ones. */
export function platformDataLimits(platform: Doc<"platformLimits"> | null): CompanyDataLimits {
  return {
    keywordsPerSite: platform?.keywordsPerSite ?? DATA_LIMIT_STARTS.keywordsPerSite,
    backlinksPerSite: platform?.backlinksPerSite ?? DATA_LIMIT_STARTS.backlinksPerSite,
    everydayKeywords: platform?.everydayKeywords ?? DATA_LIMIT_STARTS.everydayKeywords,
  };
}

/** A company's own numbers, null where it uses the platform's. */
export async function readOwnCompanyDataLimits(ctx: Reader, companyId: Id<"companies">): Promise<OwnDataLimits> {
  return ownOf(await companyRow(ctx, companyId));
}

/** A website's own numbers, null where it uses its company's. */
export async function readOwnSiteDataLimits(ctx: Reader, companyWebsiteId: Id<"companyWebsites">): Promise<OwnDataLimits> {
  return ownOf(await holdRow(ctx, companyWebsiteId));
}

/** A company's limits: its own where it set them, else the platform's. */
export async function readCompanyDataLimits(ctx: Reader, companyId: Id<"companies"> | undefined): Promise<CompanyDataLimits> {
  const [row, platform] = await Promise.all([
    companyId ? companyRow(ctx, companyId) : Promise.resolve(null),
    readPlatformLimitRow(ctx),
  ]);
  const fallback = platformDataLimits(platform);
  return {
    keywordsPerSite: row?.keywordsPerSite ?? fallback.keywordsPerSite,
    backlinksPerSite: row?.backlinksPerSite ?? fallback.backlinksPerSite,
    everydayKeywords: row?.everydayKeywords ?? fallback.everydayKeywords,
  };
}

/** A website's limits, and for each whether it is the website's own or its company's. */
export type SiteDataLimits = CompanyDataLimits & { keywordsOwn: boolean; backlinksOwn: boolean; everydayOwn: boolean };

/**
 * One website's limits: its own where it set them, else its company's —
 * field by field, so a site can keep more keywords and follow its company on
 * backlinks. Given the company's, so a list of its websites reads them once.
 */
export async function resolveSiteDataLimits(
  ctx: Reader,
  company: CompanyDataLimits,
  companyWebsiteId: Id<"companyWebsites">,
): Promise<SiteDataLimits> {
  const own = await holdRow(ctx, companyWebsiteId);
  return {
    keywordsPerSite: own?.keywordsPerSite ?? company.keywordsPerSite,
    backlinksPerSite: own?.backlinksPerSite ?? company.backlinksPerSite,
    everydayKeywords: own?.everydayKeywords ?? company.everydayKeywords,
    keywordsOwn: own?.keywordsPerSite !== undefined,
    backlinksOwn: own?.backlinksPerSite !== undefined,
    everydayOwn: own?.everydayKeywords !== undefined,
  };
}

/** One website's limits, as collection reads them: its own, else its company's, else the platform's. */
export async function readSiteDataLimits(
  ctx: Reader,
  companyId: Id<"companies"> | undefined,
  companyWebsiteId: Id<"companyWebsites"> | undefined,
): Promise<CompanyDataLimits> {
  const company = await readCompanyDataLimits(ctx, companyId);
  if (!companyWebsiteId) return company;
  const { keywordsPerSite, backlinksPerSite, everydayKeywords } = await resolveSiteDataLimits(ctx, company, companyWebsiteId);
  return { keywordsPerSite, backlinksPerSite, everydayKeywords };
}

/** Refuses anything but one of the choices; null (use the level above) and a limit left out pass. */
export function assertDataLimitChoices(changes: DataLimitChanges) {
  for (const key of DATA_LIMIT_KEYS) {
    const value = changes[key];
    if (value !== null && value !== undefined && !(DATA_LIMIT_CHOICES as readonly number[]).includes(value)) {
      throw appError("INVALID_INPUT", `A limit must be one of ${DATA_LIMIT_CHOICES.join(", ")}.`);
    }
  }
}

/** Applies the changes to what a level holds: a limit left out keeps what it was. */
function applyChanges(before: OwnDataLimits, changes: DataLimitChanges): OwnDataLimits {
  const after = { ...before };
  for (const key of DATA_LIMIT_KEYS) {
    if (changes[key] !== undefined) after[key] = changes[key] ?? null;
  }
  return after;
}

/** The fields to store: only the numbers a level set itself. */
function storedFields(own: OwnDataLimits): Partial<Record<DataLimitKey, number>> {
  return Object.fromEntries(DATA_LIMIT_KEYS.flatMap((key) => (own[key] === null ? [] : [[key, own[key]]])));
}

function changesBetween(before: OwnDataLimits, after: OwnDataLimits, above: string) {
  return DATA_LIMIT_KEYS
    .filter((key) => before[key] !== after[key])
    .map((key) => ({ field: key, from: before[key] ?? above, to: after[key] ?? above }));
}

/**
 * Set a company's own Data limits; null uses the platform's, a limit left out
 * keeps what it was. A company using the platform's on all three keeps no row.
 * Audited. Shared by its mutation here and the company's Limits screen.
 */
export async function writeCompanyDataLimits(
  ctx: MutationCtx,
  actorId: Id<"users">,
  companyId: Id<"companies">,
  changes: DataLimitChanges,
): Promise<void> {
  assertDataLimitChoices(changes);
  const company = await ctx.db.get(companyId);
  if (!company) throw appError("NOT_FOUND", "There is no such company.");

  const row = await companyRow(ctx, companyId);
  const before = ownOf(row);
  const after = applyChanges(before, changes);
  const fields = storedFields(after);
  if (Object.keys(fields).length === 0) {
    if (row) await ctx.db.delete(row._id);
  } else if (row) {
    await ctx.db.replace(row._id, { companyId, ...fields, updatedAt: Date.now() });
  } else {
    await ctx.db.insert("companyDataLimits", { companyId, ...fields, updatedAt: Date.now() });
  }

  const changed = changesBetween(before, after, "platform");
  if (changed.length > 0) {
    await ctx.db.insert("auditLogs", {
      actorId,
      actionType: "DATA_LIMITS_CHANGED",
      entityType: "companies",
      entityId: companyId,
      companyId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ company: company.name, changes: changed }),
    });
  }
}

/**
 * Set one website's own Data limits; null follows its company, a limit left
 * out keeps what it was. A website following on all three keeps no row.
 * Audited. Shared by its mutation here and the website's Limits screen.
 */
export async function writeSiteDataLimits(
  ctx: MutationCtx,
  actorId: Id<"users">,
  companyWebsiteId: Id<"companyWebsites">,
  changes: DataLimitChanges,
): Promise<void> {
  assertDataLimitChoices(changes);
  const hold = await ctx.db.get(companyWebsiteId);
  if (!hold) throw appError("NOT_FOUND", "There is no such website on this company.");
  const website = await ctx.db.get(hold.websiteId);

  const row = await holdRow(ctx, hold._id);
  const before = ownOf(row);
  const after = applyChanges(before, changes);
  const fields = storedFields(after);
  if (Object.keys(fields).length === 0) {
    if (row) await ctx.db.delete(row._id);
  } else if (row) {
    await ctx.db.replace(row._id, { companyWebsiteId: hold._id, companyId: hold.companyId, ...fields, updatedAt: Date.now() });
  } else {
    await ctx.db.insert("websiteDataLimits", { companyWebsiteId: hold._id, companyId: hold.companyId, ...fields, updatedAt: Date.now() });
  }

  const changed = changesBetween(before, after, "company");
  if (changed.length > 0) {
    await ctx.db.insert("auditLogs", {
      actorId,
      actionType: "DATA_LIMITS_CHANGED",
      entityType: "companyWebsites",
      entityId: hold._id,
      companyId: hold.companyId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ website: website?.host ?? "", changes: changed }),
    });
  }
}

const limitChange = v.optional(v.union(v.number(), v.null()));

/**
 * Set how many keywords and backlinks this company keeps per website, and how
 * many keywords each run checks again; null uses the platform's number, a
 * limit left out keeps what it was. Audited.
 */
export const setCompanyDataLimits = superAdminMutation({
  args: {
    companyId: v.id("companies"),
    keywordsPerSite: limitChange,
    backlinksPerSite: limitChange,
    everydayKeywords: limitChange,
  },
  returns: v.null(),
  handler: async (ctx, { companyId, ...changes }) => {
    await writeCompanyDataLimits(ctx, ctx.userId, companyId, changes);
    return null;
  },
});

/**
 * Set one website's own limits; null follows the company, a limit left out
 * keeps what it was. Audited.
 */
export const setSiteDataLimits = superAdminMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    keywordsPerSite: limitChange,
    backlinksPerSite: limitChange,
    everydayKeywords: limitChange,
  },
  returns: v.null(),
  handler: async (ctx, { companyWebsiteId, ...changes }) => {
    await writeSiteDataLimits(ctx, ctx.userId, companyWebsiteId, changes);
    return null;
  },
});

/**
 * Migration `2026-09-28-company-limits-follow-platform`: a company's saved
 * Data limit that equals Hakken's starting number becomes "use the platform's",
 * so a later change on the platform's Limits reaches it; any other number
 * stays the company's own. Nothing collected changes — the numbers are the
 * same. A row left with nothing of its own goes.
 */
export async function followPlatformWhereStartingNumber(ctx: MutationCtx, cursor: string | null, batchSize: number) {
  const page = await ctx.db.query("companyDataLimits").paginate({ cursor, numItems: batchSize });
  let updated = 0;
  for (const row of page.page) {
    const own = ownOf(row);
    const kept = { ...own };
    for (const key of DATA_LIMIT_KEYS) {
      if (own[key] === DATA_LIMIT_STARTS[key]) kept[key] = null;
    }
    if (DATA_LIMIT_KEYS.every((key) => kept[key] === own[key])) continue;
    const fields = storedFields(kept);
    if (Object.keys(fields).length === 0) await ctx.db.delete(row._id);
    else await ctx.db.replace(row._id, { companyId: row.companyId, ...fields, updatedAt: row.updatedAt });
    updated += 1;
  }
  return { cursor: page.continueCursor, isDone: page.isDone, processed: page.page.length, updated };
}

/** A hold's own limits, removed with the hold. */
export async function purgeHoldDataLimits(ctx: { db: MutationCtx["db"] }, companyWebsiteId: Id<"companyWebsites">): Promise<void> {
  for (const row of await ctx.db.query("websiteDataLimits").withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(5)) {
    await ctx.db.delete(row._id);
  }
}
