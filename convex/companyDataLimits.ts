import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";

/**
 * How much a company collects about each website it holds.
 *
 * Anthony, 2026-09-24: "I think we have a limits screen on the company so we
 * can choose this by company. Some may get 100, some may get 1000 or 2000".
 * Two limits, each a count of rows kept per website — its own site and every
 * competitor it watches alike:
 *
 * - **Keywords** — how many of a site's searches are listed, the ones that
 *   bring it the most visits first. DataForSEO charges per keyword returned
 *   ($0.012 a request of up to 1,000, plus $0.00012 a keyword), and a site
 *   with fewer keywords than the limit costs only what it has.
 * - **Backlinks** — how many of the links to a site are listed, strongest
 *   first, every link rather than one per linking website.
 *
 * Absent means the defaults. The screen offers the choices below; anything
 * else is refused, so a typo cannot buy a million rows. Finer steps below a
 * thousand since 2026-09-25, where a competitor's links are cut down (Anthony:
 * "100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000"). A list asks a
 * thousand rows a request and its last page only what is left of the limit
 * (`listPages` in `sitePagedLists.ts`), so any of these is bought exactly.
 */

export const DATA_LIMIT_CHOICES = [100, 250, 500, 750, 1_000, 2_500, 5_000, 7_500, 10_000] as const;

/** Where a company starts: a small business's whole keyword list, and its links. */
export const DEFAULT_DATA_LIMIT = 1_000;

export type CompanyDataLimits = { keywordsPerSite: number; backlinksPerSite: number };

type Reader = { db: QueryCtx["db"] };

/** A company's limits, or the defaults when it has never set them. */
export async function readCompanyDataLimits(ctx: Reader, companyId: Id<"companies"> | undefined): Promise<CompanyDataLimits> {
  const row = companyId
    ? await ctx.db.query("companyDataLimits").withIndex("by_company", (q) => q.eq("companyId", companyId)).unique()
    : null;
  return {
    keywordsPerSite: row?.keywordsPerSite ?? DEFAULT_DATA_LIMIT,
    backlinksPerSite: row?.backlinksPerSite ?? DEFAULT_DATA_LIMIT,
  };
}

/** A website's limits, and for each whether it is the website's own or its company's. */
export type SiteDataLimits = CompanyDataLimits & { keywordsOwn: boolean; backlinksOwn: boolean };

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
  const own = await ctx.db.query("websiteDataLimits").withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId)).unique();
  return {
    keywordsPerSite: own?.keywordsPerSite ?? company.keywordsPerSite,
    backlinksPerSite: own?.backlinksPerSite ?? company.backlinksPerSite,
    keywordsOwn: own?.keywordsPerSite !== undefined,
    backlinksOwn: own?.backlinksPerSite !== undefined,
  };
}

/** One website's limits, as collection reads them: its own, else its company's, else the defaults. */
export async function readSiteDataLimits(
  ctx: Reader,
  companyId: Id<"companies"> | undefined,
  companyWebsiteId: Id<"companyWebsites"> | undefined,
): Promise<CompanyDataLimits> {
  const company = await readCompanyDataLimits(ctx, companyId);
  if (!companyWebsiteId) return company;
  const { keywordsPerSite, backlinksPerSite } = await resolveSiteDataLimits(ctx, company, companyWebsiteId);
  return { keywordsPerSite, backlinksPerSite };
}

function assertChoice(value: number | null) {
  if (value !== null && !(DATA_LIMIT_CHOICES as readonly number[]).includes(value)) {
    throw appError("INVALID_INPUT", `A limit must be one of ${DATA_LIMIT_CHOICES.join(", ")}.`);
  }
}

const limitsShape = v.object({ keywordsPerSite: v.number(), backlinksPerSite: v.number() });

/** The company's limits, for its Data collection screen. */
export const getCompanyDataLimits = superAdminQuery({
  args: { companyId: v.id("companies") },
  returns: v.object({ ...limitsShape.fields, choices: v.array(v.number()), isDefault: v.boolean() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("companyDataLimits").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).unique();
    return {
      ...(await readCompanyDataLimits(ctx, args.companyId)),
      choices: [...DATA_LIMIT_CHOICES],
      isDefault: row === null,
    };
  },
});

/** Set how many keywords and backlinks this company keeps per website. Audited. */
export const setCompanyDataLimits = superAdminMutation({
  args: { companyId: v.id("companies"), ...limitsShape.fields },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertChoice(args.keywordsPerSite);
    assertChoice(args.backlinksPerSite);
    const company = await ctx.db.get(args.companyId);
    if (!company) throw appError("NOT_FOUND", "There is no such company.");

    const before = await readCompanyDataLimits(ctx, args.companyId);
    const row = await ctx.db.query("companyDataLimits").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).unique();
    const fields = { keywordsPerSite: args.keywordsPerSite, backlinksPerSite: args.backlinksPerSite, updatedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, fields);
    else await ctx.db.insert("companyDataLimits", { companyId: args.companyId, ...fields });

    const changes = (["keywordsPerSite", "backlinksPerSite"] as const)
      .filter((field) => before[field] !== args[field])
      .map((field) => ({ field, from: before[field], to: args[field] }));
    if (changes.length > 0) {
      await ctx.db.insert("auditLogs", {
        actorId: ctx.userId,
        actionType: "DATA_LIMITS_CHANGED",
        entityType: "companies",
        entityId: args.companyId,
        companyId: args.companyId,
        timestamp: Date.now(),
        metadata: JSON.stringify({ company: company.name, changes }),
      });
    }
    return null;
  },
});

/** One website's own limits (null where it follows its company) and its company's, for its settings. */
export const getSiteDataLimits = superAdminQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    own: v.object({ keywordsPerSite: v.union(v.number(), v.null()), backlinksPerSite: v.union(v.number(), v.null()) }),
    company: limitsShape,
    choices: v.array(v.number()),
  })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold) return null;
    const own = await ctx.db.query("websiteDataLimits").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).unique();
    return {
      own: { keywordsPerSite: own?.keywordsPerSite ?? null, backlinksPerSite: own?.backlinksPerSite ?? null },
      company: await readCompanyDataLimits(ctx, hold.companyId),
      choices: [...DATA_LIMIT_CHOICES],
    };
  },
});

/** Set one website's own limits; null follows the company. A website following on both keeps no row. Audited. */
export const setSiteDataLimits = superAdminMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    keywordsPerSite: v.union(v.number(), v.null()),
    backlinksPerSite: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertChoice(args.keywordsPerSite);
    assertChoice(args.backlinksPerSite);
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold) throw appError("NOT_FOUND", "There is no such website on this company.");
    const website = await ctx.db.get(hold.websiteId);

    const row = await ctx.db.query("websiteDataLimits").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).unique();
    const before = { keywordsPerSite: row?.keywordsPerSite ?? null, backlinksPerSite: row?.backlinksPerSite ?? null };
    if (args.keywordsPerSite === null && args.backlinksPerSite === null) {
      if (row) await ctx.db.delete(row._id);
    } else {
      const fields = {
        companyWebsiteId: hold._id,
        companyId: hold.companyId,
        ...(args.keywordsPerSite !== null ? { keywordsPerSite: args.keywordsPerSite } : {}),
        ...(args.backlinksPerSite !== null ? { backlinksPerSite: args.backlinksPerSite } : {}),
        updatedAt: Date.now(),
      };
      if (row) await ctx.db.replace(row._id, fields);
      else await ctx.db.insert("websiteDataLimits", fields);
    }

    const changes = (["keywordsPerSite", "backlinksPerSite"] as const)
      .filter((field) => before[field] !== args[field])
      .map((field) => ({ field, from: before[field] ?? "company", to: args[field] ?? "company" }));
    if (changes.length > 0) {
      await ctx.db.insert("auditLogs", {
        actorId: ctx.userId,
        actionType: "DATA_LIMITS_CHANGED",
        entityType: "companyWebsites",
        entityId: hold._id,
        companyId: hold.companyId,
        timestamp: Date.now(),
        metadata: JSON.stringify({ website: website?.host ?? "", changes }),
      });
    }
    return null;
  },
});

/** A hold's own limits, removed with the hold. */
export async function purgeHoldDataLimits(ctx: { db: MutationCtx["db"] }, companyWebsiteId: Id<"companyWebsites">): Promise<void> {
  for (const row of await ctx.db.query("websiteDataLimits").withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(5)) {
    await ctx.db.delete(row._id);
  }
}
