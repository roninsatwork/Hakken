import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { readPlatformLimitRow } from "./platformLimitRow";
import { SEO_COMPETITORS_PER_WEBSITE } from "./seoCollectionPolicy";
import { superAdminMutation } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * How much of the fan-out searches is read, kept and judged
 * (docs/plans/active/fan-out-angles-plan.md, §3), set on screen rather than
 * fixed in code. Anthony, 2026-09-28, of the limits listed when the angles
 * were built: "i think we need configs in the UI for test".
 *
 * Each is a choice from a short list, as the Data limits are, so a typo can
 * never ask one read for more than it can hold: the largest choice of each is
 * the most one database read or one run can safely take. Three levels since
 * 2026-09-28 (docs/plans/active/platform-limits-plan.md): a website may set the
 * ones that are about one website, else it uses its company's; a company may
 * set any, else it uses the platform's (System Settings → Limits,
 * `platformLimits`); the platform's starts at the `fallback` here — the number
 * the code used before these were settings.
 */

type Scope = "site" | "company";
type LimitSpec = { choices: readonly number[]; fallback: number; scope: Scope };

export const FAN_OUT_LIMITS = {
  /**
   * Prompts a website asks, each an answer bought from every assistant it
   * names each collection. Anthony, 2026-09-28, of the caps that were fixed in
   * code: "We need these limits on the company and on the website"; and of
   * this one, "this should be a limit of 10 by default".
   */
  promptsPerSite: { choices: [10, 25, 50, 100, 250, 500, 1_000], fallback: 10, scope: "site" },
  /**
   * Tracked keywords a website holds — the fan-out queries ticked on its
   * prompts and any typed in by hand — each checked on Google every
   * collection. At the limit nothing more can be added; lowered below the
   * list, the oldest that many are checked. Was 1,000, fixed in code.
   */
  trackedPerSite: { choices: [100, 250, 500, 750, 1_000], fallback: 1_000, scope: "site" },
  /**
   * Fan-out queries a website may have ticked, across all its prompts, to be
   * checked on Google every collection (docs/plans/active/fan-out-opt-in-plan.md).
   * Anthony, 2026-09-28: opt-in, and "only for fan outs and we could set this
   * limit to 200". Keywords typed in on Tracked keywords do not count; each
   * new fan-out query is still checked once without a tick. Lowered below what
   * is ticked, the first ticked that many are checked.
   */
  fanOutTrackedPerSite: { choices: [50, 100, 200, 500, 1_000], fallback: 200, scope: "site" },
  /** What one collection may buy for the whole company, every website together. Was 25,000, fixed in code. */
  purchasesPerCollection: { choices: [1_000, 5_000, 10_000, 25_000], fallback: 25_000, scope: "company" },
  /** Searches read per question and assistant, most seen first. */
  searchesPerEngine: { choices: [25, 50, 100, 150, 200], fallback: 100, scope: "site" },
  /** Wordings kept on one angle, most seen first. */
  wordingsPerAngle: { choices: [5, 10, 25, 50], fallback: 25, scope: "site" },
  /** Angles on the Sites Fan-out queries page, most seen first. */
  anglesShown: { choices: [250, 500, 1_000, 2_000, 3_000], fallback: 1_000, scope: "site" },
  /** Days of Search Console averaged for a position. */
  consoleDays: { choices: [7, 14, 28], fallback: 28, scope: "site" },
  /** Angles the page judge asks about in one run. */
  anglesJudgedPerRun: { choices: [10, 20, 40, 80], fallback: 40, scope: "site" },
  /** Angles judged after one collection at most; the rest wait for the next. */
  anglesJudgedPerCollection: { choices: [100, 250, 500, 1_000, 2_000], fallback: 1_000, scope: "site" },
  /** Pages offered to the judge for one angle — no more than it has labels for. */
  pagesOffered: { choices: [4, 8, 12], fallback: 12, scope: "site" },
  /** Pages the site audit read, taken to offer from. */
  auditPagesRead: { choices: [1_000, 2_500, 5_000, 10_000], fallback: 5_000, scope: "site" },
  /** Pages the site ranks with on Google, taken to offer from. */
  rankedPagesRead: { choices: [1_000, 2_500, 5_000, 10_000], fallback: 5_000, scope: "site" },
  /** Missing angles suggested on the website's to-do list per collection, most seen first. */
  missingAnglesSuggested: { choices: [1, 3, 5, 10], fallback: 3, scope: "site" },
  /** Rows the company's AI questions and searches screen reads across its websites. */
  companyRowsRead: { choices: [1_000, 2_500, 5_000, 10_000], fallback: 5_000, scope: "company" },
  /**
   * Google's AI Overviews bought per question every 30 days, each with the
   * searches Google ran for it (FA8, `dataForSeoAiOverviewOperations.ts`):
   * $0.10 a question and $0.001 a row. Nought is off, and off is the default —
   * nothing is bought until a company chooses a number.
   */
  googleSearchesRead: { choices: [0, 25, 50, 100, 250], fallback: 0, scope: "site" },
  /**
   * Competitors watched against one website that each run collects, the first
   * added first; past it the run report names the website (B6). Fixed at 100
   * until 2026-09-28 (Anthony: "why are these not drop downs and
   * configurable"); 100 stays the most a run collects for one website, so the
   * choices stop there.
   */
  competitorsPerSite: { choices: [10, 25, 50, SEO_COMPETITORS_PER_WEBSITE], fallback: SEO_COMPETITORS_PER_WEBSITE, scope: "site" },
} as const satisfies Record<string, LimitSpec>;

export type FanOutLimitKey = keyof typeof FAN_OUT_LIMITS;
export type FanOutLimits = Record<FanOutLimitKey, number>;

export const FAN_OUT_LIMIT_KEYS = Object.keys(FAN_OUT_LIMITS) as FanOutLimitKey[];
const SITE_KEYS = FAN_OUT_LIMIT_KEYS.filter((key) => FAN_OUT_LIMITS[key].scope === "site");

type Reader = { db: QueryCtx["db"] };

async function companyRow(ctx: Reader, companyId: Id<"companies">) {
  return await ctx.db
    .query("fanOutLimits")
    .withIndex("by_company_hold", (q) => q.eq("companyId", companyId).eq("companyWebsiteId", undefined))
    .unique();
}

async function holdRow(ctx: Reader, companyWebsiteId: Id<"companyWebsites">) {
  return await ctx.db.query("fanOutLimits").withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId)).unique();
}

/** The platform's numbers: its own where it set them, else the starting `fallback`. */
export function platformFanOutLimits(platform: Doc<"platformLimits"> | null): FanOutLimits {
  return Object.fromEntries(FAN_OUT_LIMIT_KEYS.map((key) => [key, platform?.[key] ?? FAN_OUT_LIMITS[key].fallback])) as FanOutLimits;
}

function resolve(
  company: Doc<"fanOutLimits"> | null,
  site: Doc<"fanOutLimits"> | null,
  platform: Doc<"platformLimits"> | null,
): FanOutLimits {
  const above = platformFanOutLimits(platform);
  return Object.fromEntries(FAN_OUT_LIMIT_KEYS.map((key) => {
    const own = FAN_OUT_LIMITS[key].scope === "site" ? site?.[key] : undefined;
    return [key, own ?? company?.[key] ?? above[key]];
  })) as FanOutLimits;
}

/** A company's limits — a website's, where it names one — as the code reads them. */
export async function readFanOutLimits(
  ctx: Reader,
  companyId: Id<"companies">,
  companyWebsiteId?: Id<"companyWebsites"> | null,
): Promise<FanOutLimits> {
  const [company, site, platform] = await Promise.all([
    companyRow(ctx, companyId),
    companyWebsiteId ? holdRow(ctx, companyWebsiteId) : Promise.resolve(null),
    readPlatformLimitRow(ctx),
  ]);
  return resolve(company, site, platform);
}

export function assertFanOutChoices(limits: Partial<Record<FanOutLimitKey, number | null>>, keys: readonly FanOutLimitKey[]) {
  for (const [key, value] of Object.entries(limits) as Array<[FanOutLimitKey, number | null | undefined]>) {
    if (!keys.includes(key)) throw appError("INVALID_INPUT", `"${key}" is not a limit that can be set here.`);
    if (value === null || value === undefined) continue;
    const choices: readonly number[] = FAN_OUT_LIMITS[key].choices;
    if (!choices.includes(value)) {
      throw appError("INVALID_INPUT", `That limit must be one of ${choices.join(", ")}.`);
    }
  }
}

const limitValue = v.optional(v.union(v.number(), v.null()));
const limitsArg = v.object({
  promptsPerSite: limitValue,
  trackedPerSite: limitValue,
  fanOutTrackedPerSite: limitValue,
  purchasesPerCollection: limitValue,
  searchesPerEngine: limitValue,
  wordingsPerAngle: limitValue,
  anglesShown: limitValue,
  consoleDays: limitValue,
  anglesJudgedPerRun: limitValue,
  anglesJudgedPerCollection: limitValue,
  pagesOffered: limitValue,
  auditPagesRead: limitValue,
  rankedPagesRead: limitValue,
  missingAnglesSuggested: limitValue,
  companyRowsRead: limitValue,
  googleSearchesRead: limitValue,
  competitorsPerSite: limitValue,
});

/** Each limit's own value where set, null where it uses the level above. */
function ownOf(row: Doc<"fanOutLimits"> | null, keys: readonly FanOutLimitKey[]): Record<string, number | null> {
  return Object.fromEntries(keys.map((key) => [key, row?.[key] ?? null]));
}

/** A company's own fan-out numbers, null where it uses the platform's. */
export async function readOwnCompanyFanOutLimits(ctx: Reader, companyId: Id<"companies">): Promise<Record<FanOutLimitKey, number | null>> {
  return ownOf(await companyRow(ctx, companyId), FAN_OUT_LIMIT_KEYS) as Record<FanOutLimitKey, number | null>;
}

/** A website's own fan-out numbers, null where it uses its company's. */
export async function readOwnSiteFanOutLimits(
  ctx: Reader,
  companyWebsiteId: Id<"companyWebsites">,
): Promise<Record<FanOutLimitKey, number | null>> {
  return ownOf(await holdRow(ctx, companyWebsiteId), FAN_OUT_LIMIT_KEYS) as Record<FanOutLimitKey, number | null>;
}

async function writeLimits(
  ctx: MutationCtx,
  row: Doc<"fanOutLimits"> | null,
  base: { companyId: Id<"companies">; companyWebsiteId?: Id<"companyWebsites"> },
  limits: Partial<Record<FanOutLimitKey, number | null>>,
  keys: readonly FanOutLimitKey[],
  above: "platform" | "company",
) {
  const before = ownOf(row, keys);
  const after = { ...before };
  for (const key of keys) {
    const value = limits[key];
    if (value !== undefined) after[key] = value;
  }
  const kept = Object.fromEntries(keys.flatMap((key) => (after[key] === null ? [] : [[key, after[key]]])));
  if (Object.keys(kept).length === 0) {
    if (row) await ctx.db.delete(row._id);
  } else if (row) {
    await ctx.db.replace(row._id, { ...base, ...kept, updatedAt: Date.now() });
  } else {
    await ctx.db.insert("fanOutLimits", { ...base, ...kept, updatedAt: Date.now() });
  }
  return keys
    .filter((key) => before[key] !== after[key])
    .map((key) => ({ field: key, from: before[key] ?? above, to: after[key] ?? above }));
}

/**
 * Set a company's own fan-out limits; null uses the platform's, a limit left
 * out keeps what it was. Audited. Shared by its mutation here and the
 * company's Limits screen (`platformLimits.ts`).
 */
export async function writeCompanyFanOutLimits(
  ctx: MutationCtx,
  actorId: Id<"users">,
  companyId: Id<"companies">,
  limits: Partial<Record<FanOutLimitKey, number | null>>,
): Promise<void> {
  assertFanOutChoices(limits, FAN_OUT_LIMIT_KEYS);
  const company = await ctx.db.get(companyId);
  if (!company) throw appError("NOT_FOUND", "There is no such company.");
  const changes = await writeLimits(ctx, await companyRow(ctx, companyId), { companyId }, limits, FAN_OUT_LIMIT_KEYS, "platform");
  if (changes.length > 0) {
    await ctx.db.insert("auditLogs", {
      actorId,
      actionType: "FAN_OUT_LIMITS_CHANGED",
      entityType: "companies",
      entityId: companyId,
      companyId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ company: company.name, changes }),
    });
  }
}

/**
 * Set one of a company's own websites' fan-out limits; null follows the
 * company. A competitor has none: it asks no prompts of its own. Audited.
 */
export async function writeSiteFanOutLimits(
  ctx: MutationCtx,
  actorId: Id<"users">,
  companyWebsiteId: Id<"companyWebsites">,
  limits: Partial<Record<FanOutLimitKey, number | null>>,
): Promise<void> {
  assertFanOutChoices(limits, SITE_KEYS);
  const hold = await ctx.db.get(companyWebsiteId);
  if (!hold || isTrackedHold(hold)) throw appError("NOT_FOUND", "That is not one of this company's own websites.");
  const website = await ctx.db.get(hold.websiteId);
  const changes = await writeLimits(
    ctx,
    await holdRow(ctx, hold._id),
    { companyId: hold.companyId, companyWebsiteId: hold._id },
    limits,
    SITE_KEYS,
    "company",
  );
  if (changes.length > 0) {
    await ctx.db.insert("auditLogs", {
      actorId,
      actionType: "FAN_OUT_LIMITS_CHANGED",
      entityType: "companyWebsites",
      entityId: hold._id,
      companyId: hold.companyId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ website: website?.host ?? "", changes }),
    });
  }
}

/** Set the company's fan-out limits; null uses the platform's, a limit left out keeps what it was. Audited. */
export const setCompanyFanOutLimits = superAdminMutation({
  args: { companyId: v.id("companies"), limits: limitsArg },
  returns: v.null(),
  handler: async (ctx, args) => {
    await writeCompanyFanOutLimits(ctx, ctx.userId, args.companyId, args.limits);
    return null;
  },
});

/** Set one of the company's own websites' fan-out limits; null follows the company. Audited. */
export const setSiteFanOutLimits = superAdminMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), limits: limitsArg },
  returns: v.null(),
  handler: async (ctx, args) => {
    await writeSiteFanOutLimits(ctx, ctx.userId, args.companyWebsiteId, args.limits);
    return null;
  },
});

/** A website's own limits, removed with it. */
export async function purgeHoldFanOutLimits(ctx: { db: MutationCtx["db"] }, companyWebsiteId: Id<"companyWebsites">): Promise<void> {
  const row = await holdRow(ctx, companyWebsiteId);
  if (row) await ctx.db.delete(row._id);
}

/** Every fan-out limit a company set, removed with the company. */
export async function purgeCompanyFanOutLimits(ctx: { db: MutationCtx["db"] }, companyId: Id<"companies">): Promise<void> {
  for (const row of await ctx.db.query("fanOutLimits").withIndex("by_company_hold", (q) => q.eq("companyId", companyId)).take(250)) {
    await ctx.db.delete(row._id);
  }
}
