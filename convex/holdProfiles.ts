import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { BRAND_NAME_MESSAGES, readBrandNames, type BrandName } from "./utils/websiteBrands";
import { isTrackedHold } from "./utils/websitePairing";
import { holdBrandNameValidator } from "./holdProfileSchema";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";

/**
 * The names a company knows each of its websites by, and — for its own — what
 * the business is (docs/plans/active/company-level-website-facts-plan.md).
 * Set on the company's own screen for the website, its Profile tab; no other
 * company sees them.
 *
 * Every company starts with a copy of what the shared record said on
 * 2026-09-28 (CL3), so nothing moved on the day; they part only when one
 * company edits. A website a company adds after that starts with no names of
 * its own: another company's are never handed across.
 */

/** A sector or a market: a few words, not a sentence. */
const MAX_PROFILE_LABEL = 120;

/** What the business does: a sentence or two — every judgment about the site carries it. */
const MAX_BUSINESS_DESCRIPTION = 600;

type Reader = { db: QueryCtx["db"] };

/** A hold's own profile row, or null before it has one. */
export async function holdProfileOf(ctx: Reader, companyWebsiteId: Id<"companyWebsites">): Promise<Doc<"holdProfiles"> | null> {
  return await ctx.db.query("holdProfiles").withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId)).unique();
}

/** The names a company knows one of its websites by. */
export async function holdBrandNames(ctx: Reader, companyWebsiteId: Id<"companyWebsites">): Promise<BrandName[]> {
  return (await holdProfileOf(ctx, companyWebsiteId))?.brandNames ?? [];
}

/**
 * Every website some company names, with every name any company holds for
 * it — what an AI answer is read against once, for everyone. Each company then
 * counts only the mentions of its own names (`holdNamedIn`). A name two
 * companies spell alike is one name; one company's misspelling is another's
 * name only for that other company, so the kind is left to each company's own
 * list when counting.
 */
export const listNamedWebsitesInternal = internalQuery({
  args: { limit: v.number() },
  returns: v.array(v.object({ websiteId: v.id("websites"), host: v.string(), brandNames: v.array(holdBrandNameValidator) })),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("holdProfiles")
      .withIndex("by_has_brand_names", (q) => q.eq("hasBrandNames", true))
      .take(args.limit);
    const byWebsite = new Map<Id<"websites">, Map<string, BrandName>>();
    for (const row of rows) {
      const names = byWebsite.get(row.websiteId) ?? new Map<string, BrandName>();
      for (const entry of row.brandNames) {
        const key = entry.name.toLowerCase();
        const held = names.get(key);
        // A correct name anywhere wins: a misspelling to one company is still a name to another.
        if (!held || (held.kind === "MISSPELLING" && entry.kind !== "MISSPELLING")) {
          names.set(key, { name: entry.name, isPrimary: false, kind: entry.kind ?? "NAME" });
        }
      }
      byWebsite.set(row.websiteId, names);
    }
    const named = [];
    for (const [websiteId, names] of byWebsite) {
      const website = await ctx.db.get(websiteId);
      if (website) named.push({ websiteId, host: website.host, brandNames: [...names.values()] });
    }
    return named;
  },
});

/**
 * What a company says one of its own websites' business does: what the AI
 * check on a page naming the business reads beside its name, so a casino
 * game that shares an agency's name is told apart (discovery plan, D20).
 * Only the asking company's own words, never another's.
 */
export const businessOfInternal = internalQuery({
  args: { companyId: v.id("companies"), websiteId: v.id("websites") },
  returns: v.union(v.object({ sector: v.union(v.string(), v.null()), description: v.union(v.string(), v.null()) }), v.null()),
  handler: async (ctx, args) => {
    const holds = await ctx.db
      .query("companyWebsites")
      .withIndex("by_company_website", (q) => q.eq("companyId", args.companyId).eq("websiteId", args.websiteId))
      .take(5);
    for (const hold of holds) {
      const profile = await holdProfileOf(ctx, hold._id);
      if (profile?.sector || profile?.businessDescription) {
        return { sector: profile.sector ?? null, description: profile.businessDescription ?? null };
      }
    }
    return null;
  },
});

/**
 * Whether a mention of a website counts for a company: whether any name found
 * in the answer is one of the company's own for that website. A mention filed
 * before names were each company's names only the one matched.
 */
export function holdNamedIn(names: ReadonlyArray<BrandName>, mention: { mentionedText: string; mentionedTexts?: string[] }): BrandName | null {
  const found = new Set((mention.mentionedTexts ?? [mention.mentionedText]).map((text) => text.toLowerCase()));
  // The longest of the company's names that was found, as the matcher prefers.
  return [...names]
    .sort((left, right) => right.name.length - left.name.length)
    .find((entry) => found.has(entry.name.toLowerCase())) ?? null;
}

type SeenAnswer = {
  named: Id<"websites">[];
  recommended: Id<"websites">[];
  warnedAgainst: Id<"websites">[];
  mentions?: Array<{ websiteId: Id<"websites">; texts: string[] }>;
};

/**
 * Answers as one company reads them. A website the company names — its own,
 * or a competitor it watches — counts as named, recommended or warned against
 * only where one of the company's own names for it was found; any other
 * website counts as every company's names found it. An answer filed before
 * names were each company's (no `mentions`) counts as it always did: every
 * company started with the same names.
 */
export function answersSeenBy<Answer extends SeenAnswer>(
  answers: readonly Answer[],
  names: ReadonlyMap<Id<"websites">, ReadonlyArray<BrandName>>,
): Answer[] {
  return answers.map((answer) => {
    const mentions = answer.mentions;
    if (!mentions) return answer;
    const counts = (websiteId: Id<"websites">) => {
      const own = names.get(websiteId);
      if (!own) return true;
      const found = mentions.find((mention) => mention.websiteId === websiteId);
      if (!found) return true;
      return own.some((entry) => found.texts.includes(entry.name.toLowerCase()));
    };
    return {
      ...answer,
      named: answer.named.filter(counts),
      recommended: answer.recommended.filter(counts),
      warnedAgainst: answer.warnedAgainst.filter(counts),
    };
  });
}

/** A hold's profile, for its Profile tab. */
export const getHoldProfile = superAdminQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    host: v.string(),
    owned: v.boolean(),
    brandNames: v.array(holdBrandNameValidator),
    sector: v.union(v.string(), v.null()),
    marketLabel: v.union(v.string(), v.null()),
    businessDescription: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold) return null;
    const website = await ctx.db.get(hold.websiteId);
    const profile = await holdProfileOf(ctx, hold._id);
    return {
      host: website?.displayHost ?? "",
      owned: !isTrackedHold(hold),
      brandNames: profile?.brandNames ?? [],
      sector: profile?.sector ?? null,
      marketLabel: profile?.marketLabel ?? null,
      businessDescription: profile?.businessDescription ?? null,
    };
  },
});

async function writeProfile(
  ctx: MutationCtx,
  hold: Doc<"companyWebsites">,
  fields: Partial<Pick<Doc<"holdProfiles">, "brandNames" | "sector" | "marketLabel" | "businessDescription">>,
) {
  const held = await holdProfileOf(ctx, hold._id);
  const brandNames = fields.brandNames ?? held?.brandNames ?? [];
  // A field passed as undefined is cleared; one left out keeps what it was.
  const sector = "sector" in fields ? fields.sector : held?.sector;
  const marketLabel = "marketLabel" in fields ? fields.marketLabel : held?.marketLabel;
  const businessDescription = "businessDescription" in fields ? fields.businessDescription : held?.businessDescription;
  const next = {
    companyWebsiteId: hold._id,
    companyId: hold.companyId,
    websiteId: hold.websiteId,
    brandNames,
    hasBrandNames: brandNames.length > 0,
    ...(sector ? { sector } : {}),
    ...(marketLabel ? { marketLabel } : {}),
    ...(businessDescription ? { businessDescription } : {}),
    updatedAt: Date.now(),
  };
  if (held) await ctx.db.replace(held._id, next);
  else await ctx.db.insert("holdProfiles", next);
  return held;
}

/**
 * Set the names a company knows one of its websites by — its own, or a
 * competitor's — misspellings kept as misspellings. Audited with the list
 * before and after.
 */
export const setHoldBrandNames = superAdminMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    names: v.array(v.object({
      name: v.string(),
      isPrimary: v.optional(v.boolean()),
      kind: v.optional(v.union(v.literal("NAME"), v.literal("MISSPELLING"))),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold) throw appError("NOT_FOUND", "That website is no longer held by this company.");
    const read = args.names.length === 0 ? { ok: true as const, names: [] } : readBrandNames(args.names);
    if (!read.ok) throw appError("INVALID_INPUT", BRAND_NAME_MESSAGES[read.problem]);
    const before = await writeProfile(ctx, hold, { brandNames: read.names });
    const website = await ctx.db.get(hold.websiteId);
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "SET_HOLD_BRAND_NAMES",
      entityId: hold._id,
      entityType: "companyWebsites",
      companyId: hold.companyId,
      metadata: JSON.stringify({
        host: website?.host ?? "",
        before: (before?.brandNames ?? []).map((entry) => entry.name),
        after: read.names.map((entry) => entry.name),
      }),
      timestamp: Date.now(),
    });
    return null;
  },
});

/**
 * Set what one of the company's own websites' business is and where it
 * sells. Empty clears a field: a wrong sector is worse than none. Audited.
 */
export const setHoldBusinessProfile = superAdminMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    sector: v.union(v.string(), v.null()),
    marketLabel: v.union(v.string(), v.null()),
    description: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold) throw appError("NOT_FOUND", "That website is no longer held by this company.");
    if (isTrackedHold(hold)) throw appError("INVALID_INPUT", "A competitor's business is not this company's to describe.");
    const tidy = (value: string | null, most: number, tooLong: string) => {
      const read = (value ?? "").replace(/\s+/g, " ").trim();
      if (read.length > most) throw appError("INVALID_INPUT", tooLong);
      return read.length > 0 ? read : undefined;
    };
    const sector = tidy(args.sector, MAX_PROFILE_LABEL, "That is too long for a sector.");
    const marketLabel = tidy(args.marketLabel, MAX_PROFILE_LABEL, "That is too long for a market.");
    const businessDescription = tidy(args.description, MAX_BUSINESS_DESCRIPTION, `Keep what the business does to ${MAX_BUSINESS_DESCRIPTION} characters.`);
    await writeProfile(ctx, hold, { sector, marketLabel, businessDescription });
    const website = await ctx.db.get(hold.websiteId);
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "SET_HOLD_BUSINESS_PROFILE",
      entityId: hold._id,
      entityType: "companyWebsites",
      companyId: hold.companyId,
      metadata: JSON.stringify({ host: website?.host ?? "", sector, marketLabel, businessDescription }),
      timestamp: Date.now(),
    });
    return null;
  },
});

/**
 * Add a spelling to the names a company knows its own website by, as taking
 * a *Name* move does. Refused past the most a list holds.
 */
export async function addHoldMisspelling(ctx: MutationCtx, hold: Doc<"companyWebsites">, text: string, userId: Id<"users">): Promise<void> {
  const names = await holdBrandNames(ctx, hold._id);
  if (names.some((entry) => entry.name.trim().toLowerCase() === text.trim().toLowerCase())) return;
  const read = readBrandNames([...names, { name: text, isPrimary: false, kind: "MISSPELLING" }]);
  if (!read.ok) throw appError("INVALID_INPUT", BRAND_NAME_MESSAGES[read.problem]);
  await writeProfile(ctx, hold, { brandNames: read.names });
  const website = await ctx.db.get(hold.websiteId);
  await ctx.db.insert("auditLogs", {
    actorId: userId,
    actionType: "SET_HOLD_BRAND_NAMES",
    entityId: hold._id,
    entityType: "companyWebsites",
    companyId: hold.companyId,
    metadata: JSON.stringify({ host: website?.host ?? "", before: names.map((entry) => entry.name), after: read.names.map((entry) => entry.name) }),
    timestamp: Date.now(),
  });
}

/** Searches named to a judge, the ones a site earns most visits from: enough to show the trade, few enough to stay a hint. */
const SEARCHES_FOR_JUDGING = 10;

const businessValidator = v.object({
  sector: v.optional(v.string()),
  market: v.optional(v.string()),
  does: v.optional(v.string()),
  names: v.array(v.string()),
  searches: v.array(v.string()),
});
type Business = typeof businessValidator.type;

/**
 * What the business of a company's website is, for a judgment made for that
 * company (CL4): its own profile, or for a competitor with none the profile
 * of the company's own site it is compared with — never another company's.
 * The searches are the website's own, from its keyword list: facts every
 * watcher can see, never a company's tracked searches.
 */
export async function describeHoldForJudging(ctx: Reader, companyWebsiteId: Id<"companyWebsites">): Promise<Business | null> {
  const hold = await ctx.db.get(companyWebsiteId);
  if (!hold) return null;
  const own = await holdProfileOf(ctx, hold._id);
  const pair = !own?.sector && !own?.businessDescription && hold.againstWebsiteId
    ? await ctx.db
      .query("companyWebsites")
      .withIndex("by_company_website", (q) => q.eq("companyId", hold.companyId).eq("websiteId", hold.againstWebsiteId!))
      .first()
    : null;
  const described = pair ? await holdProfileOf(ctx, pair._id) : own;
  const searches = (await ctx.db
    .query("siteKeywordRanks")
    .withIndex("by_site_traffic", (q) => q.eq("websiteId", hold.websiteId).eq("locationCode", DEFAULT_LOCATION_CODE))
    .order("desc")
    .take(SEARCHES_FOR_JUDGING * 2))
    .filter((row) => row.position !== undefined)
    .slice(0, SEARCHES_FOR_JUDGING);
  return {
    ...(described?.sector ? { sector: described.sector } : {}),
    ...(described?.marketLabel ? { market: described.marketLabel } : {}),
    ...(described?.businessDescription ? { does: described.businessDescription } : {}),
    names: (own?.brandNames ?? []).map((entry) => entry.name),
    searches: searches.map((row) => row.keyword),
  };
}

/** One company's view of one of its websites, for a judgment an action makes. */
export const describeHoldForJudgingInternal = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.union(v.null(), businessValidator),
  handler: async (ctx, args) => await describeHoldForJudging(ctx, args.companyWebsiteId),
});

/**
 * Every company's view of a website bought once for all of them — a
 * competitor discovery — grouped: companies that describe it alike share one
 * judgment, and a company that describes it differently gets its own. Usually
 * one group, for the one company that owns the site.
 */
export const describeWebsiteHoldsForJudging = internalQuery({
  args: { websiteId: v.id("websites") },
  returns: v.array(v.object({ holdIds: v.array(v.id("companyWebsites")), business: businessValidator })),
  handler: async (ctx, args) => {
    const holds = await ctx.db
      .query("companyWebsites")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(MAX_HOLDERS_JUDGED);
    const groups = new Map<string, { holdIds: Id<"companyWebsites">[]; business: Business }>();
    for (const hold of holds) {
      const business = await describeHoldForJudging(ctx, hold._id);
      if (!business) continue;
      const key = JSON.stringify(business);
      const group = groups.get(key) ?? { holdIds: [], business };
      group.holdIds.push(hold._id);
      groups.set(key, group);
    }
    return [...groups.values()];
  },
});

/** Companies holding one website read for a shared purchase's judgments: more than any website has. */
const MAX_HOLDERS_JUDGED = 200;

/** A hold's profile, removed with the hold. */
export async function purgeHoldProfile(ctx: { db: MutationCtx["db"] }, companyWebsiteId: Id<"companyWebsites">): Promise<void> {
  const row = await ctx.db.query("holdProfiles").withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId)).unique();
  if (row) await ctx.db.delete(row._id);
}
