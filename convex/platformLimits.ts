import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  DATA_LIMIT_CHOICES,
  DATA_LIMIT_KEYS,
  DATA_LIMIT_STARTS,
  platformDataLimits,
  readCompanyDataLimits,
  readOwnCompanyDataLimits,
  readOwnSiteDataLimits,
  writeCompanyDataLimits,
  writeSiteDataLimits,
  type DataLimitKey,
} from "./companyDataLimits";
import {
  FAN_OUT_LIMITS,
  FAN_OUT_LIMIT_KEYS,
  platformFanOutLimits,
  readFanOutLimits,
  readOwnCompanyFanOutLimits,
  readOwnSiteFanOutLimits,
  writeCompanyFanOutLimits,
  writeSiteFanOutLimits,
  type FanOutLimitKey,
} from "./fanOutLimits";
import { readPlatformLimitRow } from "./platformLimitRow";
import { SHARED_LIMITS, SHARED_LIMIT_KEYS, sharedLimitsOf, type SharedLimitKey } from "./sharedLimits";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * Every limit on three levels: platform, company, website
 * (docs/plans/active/platform-limits-plan.md). Anthony, 2026-09-28: "We need
 * another level / it should be Platform - company - website", with the
 * platform's numbers "another option on the system settings menu" and a
 * company that can "inherit the platform default but we can override".
 *
 * The numbers stay where they were stored — the Data limits in
 * `companyDataLimits.ts`, the rest in `fanOutLimits.ts`, the platform's in
 * `platformLimits` — and each keeps its own reader, which now ends at the
 * platform's. Six only the platform sets (`sharedLimits.ts`): each is about
 * something every company shares. This module is what the three Limits
 * screens read and write: one list of them all, so the platform's page, a
 * company's and a website's show the same limits the same way.
 */

export type LimitKey = DataLimitKey | FanOutLimitKey | SharedLimitKey;

type LimitDef = {
  choices: readonly number[];
  /** Hakken's starting number, before anyone sets the platform's. */
  start: number;
  /** How far down it can be set: two cover a whole company and stop there; six are the platform's alone. */
  reach: "website" | "company" | "platform";
  /** Whether a competitor has it: only the Data limits, since a competitor asks no prompts of its own. */
  competitor: boolean;
};

export const LIMIT_KEYS: LimitKey[] = [...DATA_LIMIT_KEYS, ...FAN_OUT_LIMIT_KEYS, ...SHARED_LIMIT_KEYS];

export const LIMITS = Object.fromEntries([
  ...DATA_LIMIT_KEYS.map((key) => [key, { choices: DATA_LIMIT_CHOICES, start: DATA_LIMIT_STARTS[key], reach: "website", competitor: true }]),
  ...FAN_OUT_LIMIT_KEYS.map((key) => [key, {
    choices: FAN_OUT_LIMITS[key].choices,
    start: FAN_OUT_LIMITS[key].fallback,
    reach: FAN_OUT_LIMITS[key].scope === "site" ? "website" : "company",
    competitor: false,
  }]),
  ...SHARED_LIMIT_KEYS.map((key) => [key, { choices: SHARED_LIMITS[key].choices, start: SHARED_LIMITS[key].fallback, reach: "platform", competitor: false }]),
]) as Record<LimitKey, LimitDef>;

/** The limits a company can set: all but the platform's own. */
const COMPANY_KEYS = LIMIT_KEYS.filter((key) => LIMITS[key].reach !== "platform");
/** The limits a website can set. */
const WEBSITE_KEYS = LIMIT_KEYS.filter((key) => LIMITS[key].reach === "website");

/** Rows read to name who has a number of their own: far more companies and websites than exist today. */
const OWN_ROWS_READ = 2_000;

type Reader = { db: QueryCtx["db"] };
type Other = { id: string; name: string; value: number };

const isDataKey = (key: string): key is DataLimitKey => (DATA_LIMIT_KEYS as readonly string[]).includes(key);
const isLimitKey = (key: string): key is LimitKey => (LIMIT_KEYS as string[]).includes(key);

function choicesOf(keys: readonly LimitKey[]): Record<string, number[]> {
  return Object.fromEntries(keys.map((key) => [key, [...LIMITS[key].choices]]));
}

function pick<T>(values: Record<string, T>, keys: readonly LimitKey[]): Record<string, T> {
  return Object.fromEntries(keys.map((key) => [key, values[key]]));
}

async function platformValues(ctx: Reader): Promise<Record<LimitKey, number>> {
  const row = await readPlatformLimitRow(ctx);
  return { ...platformDataLimits(row), ...platformFanOutLimits(row), ...sharedLimitsOf(row) };
}

/** Adds each number a row sets itself to the list of those who have their own. */
function collectOwn(others: Record<string, Other[]>, row: Partial<Record<LimitKey, number>>, who: { id: string; name: string }) {
  for (const key of LIMIT_KEYS) {
    const value = row[key];
    if (value === undefined) continue;
    (others[key] ??= []).push({ ...who, value });
  }
}

function sortOthers(others: Record<string, Other[]>) {
  for (const list of Object.values(others)) list.sort((a, b) => a.name.localeCompare(b.name));
  return others;
}

function assertLimits(limits: Record<string, number | null>, keys: readonly LimitKey[]) {
  for (const [key, value] of Object.entries(limits)) {
    if (!isLimitKey(key) || !keys.includes(key)) throw appError("INVALID_INPUT", `"${key}" is not a limit that can be set here.`);
    if (value !== null && !LIMITS[key].choices.includes(value)) {
      throw appError("INVALID_INPUT", `That limit must be one of ${LIMITS[key].choices.join(", ")}.`);
    }
  }
}

/** Splits changes into the two places they are stored. */
function split(limits: Record<string, number | null>) {
  const data: Partial<Record<DataLimitKey, number | null>> = {};
  const fanOut: Partial<Record<FanOutLimitKey, number | null>> = {};
  for (const [key, value] of Object.entries(limits)) {
    if (isDataKey(key)) data[key] = value;
    else fanOut[key as FanOutLimitKey] = value;
  }
  return { data, fanOut };
}

const numbers = v.record(v.string(), v.number());
const ownNumbers = v.record(v.string(), v.union(v.number(), v.null()));
const choicesShape = v.record(v.string(), v.array(v.number()));
const othersShape = v.record(v.string(), v.array(v.object({ id: v.string(), name: v.string(), value: v.number() })));

/**
 * System Settings → Limits: the platform's number for every limit, its
 * choices, and the companies that have their own.
 */
export const getPlatformLimits = superAdminQuery({
  args: {},
  returns: v.object({ values: numbers, choices: choicesShape, others: othersShape }),
  handler: async (ctx) => {
    const [values, dataRows, fanOutRows] = await Promise.all([
      platformValues(ctx),
      ctx.db.query("companyDataLimits").take(OWN_ROWS_READ),
      ctx.db.query("fanOutLimits").take(OWN_ROWS_READ),
    ]);
    const companyRows = fanOutRows.filter((row) => row.companyWebsiteId === undefined);
    const companyIds = [...new Set([...dataRows, ...companyRows].map((row) => row.companyId))];
    const companies = new Map((await Promise.all(companyIds.map((id) => ctx.db.get(id))))
      .filter((company): company is Doc<"companies"> => company !== null)
      .map((company) => [company._id, company.name]));

    const others: Record<string, Other[]> = {};
    for (const row of [...dataRows, ...companyRows]) {
      const name = companies.get(row.companyId);
      if (name) collectOwn(others, row, { id: row.companyId, name });
    }
    return { values, choices: choicesOf(LIMIT_KEYS), others: sortOthers(others) };
  },
});

/**
 * A company's Limits: its own numbers (null where it uses the platform's),
 * the platform's, the choices, which of its websites have their own, and the
 * platform's own limits, which the company sees but does not set.
 */
export const getCompanyLimits = superAdminQuery({
  args: { companyId: v.id("companies") },
  returns: v.union(v.null(), v.object({
    companyName: v.string(),
    own: ownNumbers,
    platform: numbers,
    choices: choicesShape,
    others: othersShape,
    shared: numbers,
  })),
  handler: async (ctx, { companyId }) => {
    const company = await ctx.db.get(companyId);
    if (!company) return null;
    const [platform, ownData, ownFanOut, siteData, siteFanOut] = await Promise.all([
      platformValues(ctx),
      readOwnCompanyDataLimits(ctx, companyId),
      readOwnCompanyFanOutLimits(ctx, companyId),
      ctx.db.query("websiteDataLimits").withIndex("by_company", (q) => q.eq("companyId", companyId)).take(OWN_ROWS_READ),
      ctx.db.query("fanOutLimits").withIndex("by_company_hold", (q) => q.eq("companyId", companyId)).take(OWN_ROWS_READ),
    ]);

    const siteRows: Array<{ holdId: Id<"companyWebsites">; row: Partial<Record<LimitKey, number>> }> = [
      ...siteData.map((row) => ({ holdId: row.companyWebsiteId, row })),
      ...siteFanOut.flatMap((row) => (row.companyWebsiteId ? [{ holdId: row.companyWebsiteId, row }] : [])),
    ];
    const hosts = await hostsOf(ctx, [...new Set(siteRows.map((entry) => entry.holdId))]);
    const others: Record<string, Other[]> = {};
    for (const { holdId, row } of siteRows) {
      const host = hosts.get(holdId);
      if (host) collectOwn(others, row, { id: holdId, name: host });
    }

    return {
      companyName: company.name,
      own: { ...ownData, ...ownFanOut },
      platform: pick<number>(platform, COMPANY_KEYS),
      choices: choicesOf(COMPANY_KEYS),
      others: sortOthers(others),
      shared: pick<number>(platform, SHARED_LIMIT_KEYS),
    };
  },
});

async function hostsOf(ctx: Reader, holdIds: Id<"companyWebsites">[]): Promise<Map<string, string>> {
  const hosts = new Map<string, string>();
  await Promise.all(holdIds.map(async (holdId) => {
    const hold = await ctx.db.get(holdId);
    const website = hold ? await ctx.db.get(hold.websiteId) : null;
    if (website) hosts.set(holdId, website.displayHost ?? website.host);
  }));
  return hosts;
}

/**
 * A website's Limits: the limits it can set — the Data limits alone for a
 * competitor — its own numbers (null where it uses its company's) and the
 * company's.
 */
export const getSiteLimits = superAdminQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    host: v.string(),
    competitor: v.boolean(),
    keys: v.array(v.string()),
    own: ownNumbers,
    company: numbers,
    choices: choicesShape,
  })),
  handler: async (ctx, { companyWebsiteId }) => {
    const hold = await ctx.db.get(companyWebsiteId);
    if (!hold) return null;
    const website = await ctx.db.get(hold.websiteId);
    const competitor = isTrackedHold(hold);
    const keys = WEBSITE_KEYS.filter((key) => !competitor || LIMITS[key].competitor);
    const [ownData, ownFanOut, companyData, companyFanOut] = await Promise.all([
      readOwnSiteDataLimits(ctx, hold._id),
      readOwnSiteFanOutLimits(ctx, hold._id),
      readCompanyDataLimits(ctx, hold.companyId),
      readFanOutLimits(ctx, hold.companyId),
    ]);
    return {
      host: website?.displayHost ?? website?.host ?? "",
      competitor,
      keys,
      own: pick<number | null>({ ...ownData, ...ownFanOut }, keys),
      company: pick<number>({ ...companyData, ...companyFanOut }, keys),
      choices: choicesOf(keys),
    };
  },
});

/** Set the platform's numbers — where every company starts. A limit left out keeps what it was. Audited. */
export const setPlatformLimits = superAdminMutation({
  args: { limits: v.record(v.string(), v.number()) },
  returns: v.null(),
  handler: async (ctx, { limits }) => {
    assertLimits(limits, LIMIT_KEYS);
    const [row, before] = await Promise.all([readPlatformLimitRow(ctx), platformValues(ctx)]);
    const changes = Object.entries(limits)
      .filter(([key, value]) => before[key as LimitKey] !== value)
      .map(([key, value]) => ({ field: key, from: before[key as LimitKey], to: value }));
    if (changes.length === 0) return null;

    const rowId = row
      ? (await ctx.db.patch(row._id, { ...limits, updatedAt: Date.now() }), row._id)
      : await ctx.db.insert("platformLimits", { ...limits, updatedAt: Date.now() });
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "PLATFORM_LIMITS_CHANGED",
      entityType: "platformLimits",
      entityId: rowId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ changes }),
    });
    return null;
  },
});

/** Set a company's own numbers; null uses the platform's, a limit left out keeps what it was. Audited. */
export const setCompanyLimits = superAdminMutation({
  args: { companyId: v.id("companies"), limits: v.record(v.string(), v.union(v.number(), v.null())) },
  returns: v.null(),
  handler: async (ctx, { companyId, limits }) => {
    assertLimits(limits, COMPANY_KEYS);
    const { data, fanOut } = split(limits);
    if (Object.keys(data).length > 0) await writeCompanyDataLimits(ctx, ctx.userId, companyId, data);
    if (Object.keys(fanOut).length > 0) await writeCompanyFanOutLimits(ctx, ctx.userId, companyId, fanOut);
    return null;
  },
});

/** Set a website's own numbers; null uses its company's, a limit left out keeps what it was. Audited. */
export const setSiteLimits = superAdminMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), limits: v.record(v.string(), v.union(v.number(), v.null())) },
  returns: v.null(),
  handler: async (ctx, { companyWebsiteId, limits }) => {
    assertLimits(limits, WEBSITE_KEYS);
    const { data, fanOut } = split(limits);
    if (Object.keys(data).length > 0) await writeSiteDataLimits(ctx, ctx.userId, companyWebsiteId, data);
    if (Object.keys(fanOut).length > 0) await writeSiteFanOutLimits(ctx, ctx.userId, companyWebsiteId, fanOut);
    return null;
  },
});
