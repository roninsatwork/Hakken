import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { adminAction, tenantMutation, tenantQuery } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import { companyHolds, requireMySite } from "./siteAccess";
import { appError } from "./utils/appError";
import { decryptConnectorToken, encryptConnectorToken } from "./connectorTokenCrypto";
import { addUpClarity, clarityRowValidator, clarityRowsFrom, type ClarityRow } from "./utils/clarityRows";
import { shiftDay } from "./utils/insightFacts";

/**
 * Microsoft Clarity, connected and read (docs/plans/active/insights-analyst-plan.md
 * §7b, I24, I27, phase 15). A company admin pastes the project's Data Export
 * token; it is tested with one ask, kept as ciphertext, and each morning the
 * last day is asked three times — by page, by device, and by both — three of
 * the project's ten asks a day, each day kept, since Clarity keeps three.
 */

const EXPORT_URL = "https://www.clarity.ms/export-data/api/v1/project-live-insights";
/** Days of a website's figures kept: two years, as the other day lists. */
const KEPT_DAYS = 730;
/** A day's pages kept at most: the most visited. */
const PAGES_KEPT = 300;
/** Days read for a screen at most. */
const DAYS_READ = 400;

type Reader = { db: QueryCtx["db"] };

/** One ask of Clarity's export: the last day, by one dimension. */
async function askClarity(token: string, dimension: "URL" | "Device" | "URL,Device"): Promise<{ ok: true; rows: ClarityRow[] } | { ok: false; status: number; problem: string }> {
  let response: Response;
  try {
    const dimensions = dimension.split(",").map((name, at) => `&dimension${at + 1}=${name}`).join("");
    response = await fetch(`${EXPORT_URL}?numOfDays=1${dimensions}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30_000) });
  } catch {
    return { ok: false, status: 0, problem: "Clarity could not be reached." };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { ok: false, status: response.status, problem: response.status === 401 || response.status === 403 ? "Clarity refused the token: generate a new one in Clarity's Settings → Data Export." : response.status === 429 ? "Clarity's ten asks a day are used up for today." : `Clarity answered ${response.status}. ${text.slice(0, 200)}` };
  }
  return { ok: true, rows: clarityRowsFrom(await response.json(), dimension) };
}

/** The website's Clarity connection, as its screens show it: never the token. */
export const clarityStatus = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    host: v.string(),
    owned: v.boolean(),
    ownSites: v.array(v.object({ siteId: v.id("companyWebsites"), host: v.string() })),
    connection: v.union(v.null(), v.object({ status: v.string(), projectName: v.union(v.string(), v.null()), problem: v.union(v.string(), v.null()), newestDay: v.union(v.string(), v.null()), oldestDay: v.union(v.string(), v.null()), lastCollectedAt: v.union(v.number(), v.null()) })),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId).catch(() => null);
    if (!site) return null;
    const holds = ctx.companyId ? await companyHolds(ctx, ctx.companyId) : [];
    const own = holds.filter((entry) => entry.summary.relationship === "OWNED").map((entry) => ({ siteId: entry.hold._id, host: entry.summary.host }));
    const row = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", site.hold._id)).first();
    return {
      host: site.website.displayHost ?? site.website.host,
      owned: site.hold.relationship === "OWNED",
      ownSites: own,
      connection: row ? { status: row.status, projectName: row.projectName ?? null, problem: row.problem ?? null, newestDay: row.newestDay ?? null, oldestDay: row.oldestDay ?? null, lastCollectedAt: row.lastCollectedAt ?? null } : null,
    };
  },
});

/** The company's own websites, each with its Clarity connection and its last 30 days. */
export const claritySites = tenantQuery({
  args: {},
  returns: v.array(v.object({ siteId: v.id("companyWebsites"), host: v.string(), status: v.string(), sessions: v.union(v.number(), v.null()), scroll: v.union(v.number(), v.null()), lastCollectedAt: v.union(v.number(), v.null()) })),
  handler: async (ctx) => {
    if (!ctx.companyId) return [];
    const holds = (await companyHolds(ctx, ctx.companyId)).filter((entry) => entry.summary.relationship === "OWNED");
    const out = [];
    for (const entry of holds) {
      const row = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", entry.hold._id)).first();
      const totals = row?.newestDay ? addUpClarity((await daysOf(ctx, entry.hold._id, "DEVICE", shiftDay(row.newestDay, -29), row.newestDay)).map((day) => day.rows)) : [];
      const all = totals.reduce((sum, device) => sum + device.sessions, 0);
      const scroll = all > 0 ? Math.round(totals.reduce((sum, device) => sum + (device.scroll ?? 0) * device.sessions, 0) / all) : null;
      out.push({ siteId: entry.hold._id, host: entry.summary.host, status: row?.status ?? "NOT_CONNECTED", sessions: row ? all : null, scroll, lastCollectedAt: row?.lastCollectedAt ?? null });
    }
    return out;
  },
});

async function daysOf(ctx: Reader, holdId: Id<"companyWebsites">, by: "PAGE" | "DEVICE" | "PAGE_DEVICE", from: string, to: string) {
  return await ctx.db.query("clarityDays").withIndex("by_hold_by_day", (q) => q.eq("companyWebsiteId", holdId).eq("by", by).gte("day", from).lte("day", to)).take(DAYS_READ);
}

/**
 * A website's figures over the days chosen, for its screens: each page (or
 * device) added up, and each day's totals for the charts. Read through the
 * caller's own hold.
 */
export const clarityFigures = tenantQuery({
  args: { siteId: v.id("companyWebsites"), by: v.union(v.literal("PAGE"), v.literal("DEVICE"), v.literal("PAGE_DEVICE")), days: v.number() },
  returns: v.object({
    from: v.union(v.string(), v.null()),
    to: v.union(v.string(), v.null()),
    rows: v.array(clarityRowValidator),
    byDay: v.array(v.object({ day: v.string(), sessions: v.number(), dead: v.union(v.number(), v.null()), rage: v.union(v.number(), v.null()), scroll: v.union(v.number(), v.null()) })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const row = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", site.hold._id)).first();
    if (!row?.newestDay) return { from: null, to: null, rows: [], byDay: [] };
    const from = shiftDay(row.newestDay, -(Math.max(1, Math.min(args.days, 365)) - 1));
    const days = await daysOf(ctx, site.hold._id, args.by, from, row.newestDay);
    // Each day's totals from the devices, which add up to the whole website.
    const deviceDays = args.by === "DEVICE" ? days : await daysOf(ctx, site.hold._id, "DEVICE", from, row.newestDay);
    const byDay = deviceDays.map((day) => {
      const [whole] = addUpClarity([day.rows.map((device) => ({ ...device, key: "all" }))]);
      return { day: day.day, sessions: whole?.sessions ?? 0, dead: whole?.dead ?? null, rage: whole?.rage ?? null, scroll: whole?.scroll ?? null };
    });
    return { from, to: row.newestDay, rows: addUpClarity(days.map((day) => day.rows)).slice(0, PAGES_KEPT), byDay };
  },
});

/** Paste a project's Data Export token: tested with one ask, kept as ciphertext, read each morning from then. */
export const connectClarity = adminAction({
  args: { siteId: v.id("companyWebsites"), token: v.string() },
  returns: v.object({ ok: v.boolean(), problem: v.union(v.string(), v.null()) }),
  handler: async (ctx, args): Promise<{ ok: boolean; problem: string | null }> => {
    const token = args.token.trim();
    if (token.length < 20) return { ok: false, problem: "That doesn't look like a Clarity Data Export token." };
    const allowed: { ok: boolean; problem: string | null; companyId: Id<"companies"> | null } = await ctx.runQuery(internal.clarity.canConnect, { siteId: args.siteId, companyId: getActiveCompanyId(ctx.user) ?? undefined, userId: ctx.userId });
    if (!allowed.ok) return { ok: false, problem: allowed.problem };
    const tested = await askClarity(token, "Device");
    if (!tested.ok) return { ok: false, problem: tested.problem };
    const tokenCiphertext = await encryptConnectorToken(token);
    await ctx.runMutation(internal.clarity.saveConnection, { siteId: args.siteId, companyId: allowed.companyId!, tokenCiphertext, connectedBy: ctx.userId });
    await ctx.scheduler.runAfter(0, internal.clarity.collectWebsite, { holdId: args.siteId });
    return { ok: true, problem: null };
  },
});

/** Only a company admin connects, and only one of its own websites. */
export const canConnect = internalQuery({
  args: { siteId: v.id("companyWebsites"), companyId: v.optional(v.id("companies")), userId: v.optional(v.id("users")) },
  returns: v.object({ ok: v.boolean(), problem: v.union(v.string(), v.null()), companyId: v.union(v.id("companies"), v.null()) }),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.siteId);
    const user = args.userId ? await ctx.db.get(args.userId) : null;
    if (!hold || !args.companyId || hold.companyId !== args.companyId || hold.relationship !== "OWNED") return { ok: false, problem: "Only your company's own website can be connected.", companyId: null };
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) return { ok: false, problem: "Only a company admin can connect Clarity.", companyId: null };
    return { ok: true, problem: null, companyId: hold.companyId };
  },
});

export const saveConnection = internalMutation({
  args: { siteId: v.id("companyWebsites"), companyId: v.id("companies"), tokenCiphertext: v.string(), connectedBy: v.optional(v.id("users")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const held = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.siteId)).first();
    const fields = { companyId: args.companyId, companyWebsiteId: args.siteId, status: "CONNECTED" as const, tokenCiphertext: args.tokenCiphertext, problem: undefined, connectedBy: args.connectedBy, updatedAt: now };
    if (held) await ctx.db.patch(held._id, fields);
    else await ctx.db.insert("clarityConnections", { ...fields, createdAt: now });
    return null;
  },
});

/** Disconnect: the token goes; the figures kept stay, as a disconnected Analytics' do. */
export const disconnectClarity = tenantMutation({
  args: { siteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const user = ctx.userId ? await ctx.db.get(ctx.userId) : null;
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) throw appError("UNAUTHORIZED", "Only a company admin can disconnect Clarity.");
    const held = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", site.hold._id)).first();
    if (held) await ctx.db.patch(held._id, { status: "DISCONNECTED", tokenCiphertext: "", updatedAt: Date.now() });
    return null;
  },
});

/** Each connected website, for the morning's asks. */
export const connectedWebsites = internalQuery({
  args: {},
  returns: v.array(v.id("companyWebsites")),
  handler: async (ctx) => (await ctx.db.query("clarityConnections").withIndex("by_status", (q) => q.eq("status", "CONNECTED")).take(500)).map((row) => row.companyWebsiteId),
});

export const tokenOf = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    return row?.status === "CONNECTED" && row.tokenCiphertext ? row.tokenCiphertext : null;
  },
});

export const saveDay = internalMutation({
  args: { holdId: v.id("companyWebsites"), day: v.string(), pages: v.union(v.array(clarityRowValidator), v.null()), devices: v.union(v.array(clarityRowValidator), v.null()), pageDevices: v.optional(v.union(v.array(clarityRowValidator), v.null())), problem: v.union(v.string(), v.null()), refused: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    if (!connection) return null;
    for (const [by, rows] of [["PAGE", args.pages], ["DEVICE", args.devices], ["PAGE_DEVICE", args.pageDevices ?? null]] as const) {
      if (!rows) continue;
      const held = await ctx.db.query("clarityDays").withIndex("by_hold_by_day", (q) => q.eq("companyWebsiteId", args.holdId).eq("by", by).eq("day", args.day)).first();
      const record = { companyWebsiteId: args.holdId, day: args.day, by, rows: rows.slice(0, PAGES_KEPT), createdAt: now };
      if (held) await ctx.db.replace(held._id, record);
      else await ctx.db.insert("clarityDays", record);
    }
    const saved = Boolean(args.pages || args.devices);
    await ctx.db.patch(connection._id, {
      ...(args.refused ? { status: "NEEDS_RECONNECT" as const } : {}),
      problem: args.problem ?? undefined,
      ...(saved ? { newestDay: args.day, oldestDay: connection.oldestDay && connection.oldestDay < args.day ? connection.oldestDay : args.day, lastCollectedAt: now } : {}),
      updatedAt: now,
    });
    // Two years kept: the oldest go as each day comes.
    for (const by of ["PAGE", "DEVICE", "PAGE_DEVICE"] as const) {
      const old = await ctx.db.query("clarityDays").withIndex("by_hold_by_day", (q) => q.eq("companyWebsiteId", args.holdId).eq("by", by).lt("day", shiftDay(args.day, -KEPT_DAYS))).take(10);
      for (const row of old) await ctx.db.delete(row._id);
    }
    return null;
  },
});

/** One website's morning: yesterday by page and by device, two of its ten asks a day. */
export const collectWebsite = internalAction({
  args: { holdId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const ciphertext: string | null = await ctx.runQuery(internal.clarity.tokenOf, { holdId: args.holdId });
    if (!ciphertext) return null;
    const token = await decryptConnectorToken(ciphertext);
    // Clarity's "last day" is the 24 hours to now: filed as yesterday, the day it mostly covers.
    const day = shiftDay(new Date().toISOString().slice(0, 10), -1);
    const pages = await askClarity(token, "URL");
    const devices = pages.ok ? await askClarity(token, "Device") : pages;
    // Each page by device, for Pages' device filter: the third of the project's ten asks a day.
    const pageDevices = devices.ok ? await askClarity(token, "URL,Device") : null;
    const failed = !pages.ok ? pages : !devices.ok ? devices : null;
    await ctx.runMutation(internal.clarity.saveDay, {
      holdId: args.holdId,
      day,
      pages: pages.ok ? pages.rows : null,
      devices: devices.ok ? devices.rows : null,
      pageDevices: pageDevices?.ok ? pageDevices.rows : null,
      problem: failed ? failed.problem : null,
      refused: Boolean(failed && (failed.status === 401 || failed.status === 403)),
    });
    return null;
  },
});

/** Every connected website's morning, a few seconds apart. */
export const collectAll = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const holds: Array<Id<"companyWebsites">> = await ctx.runQuery(internal.clarity.connectedWebsites, {});
    for (const [index, holdId] of holds.entries()) await ctx.scheduler.runAfter(index * 3_000, internal.clarity.collectWebsite, { holdId });
    return null;
  },
});

export type ClarityConnection = Doc<"clarityConnections">;
