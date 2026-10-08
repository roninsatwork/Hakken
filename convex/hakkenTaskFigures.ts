import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalQuery } from "./_generated/server";
import { holdFor } from "./assistantReads";
import { hakkenTaskTargetValidator } from "./hakkenTaskSchema";
import { shiftDay } from "./searchConsoleDays";
import { readList } from "./searchConsoleLists";
import { askLive, daysOf } from "./searchConsoleReads";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * The figures a Hakken alert reads (docs/plans/active/hakken-tasks-plan.md,
 * items 1.2 and 1.3): a website's visitors and impressions each day from the
 * days Search Console collection keeps, or one page's from Google itself —
 * the Search Console API is free, and a page's day is not kept on its own.
 * Read only for a website the company owns: Google gives these to its owner.
 */

const dayFiguresValidator = v.object({ day: v.string(), clicks: v.number(), impressions: v.number() });

// Said outright: a function that reads another in its own file through `internal` cannot have its type inferred.
type DayFigures = { day: string; clicks: number; impressions: number };
type Target = { companyWebsiteId: Id<"companyWebsites">; website: string; page?: string };
type Resolved = { ok: true; target: Target; newestDay: string; oldestDay?: string } | { ok: false; problem: string };
type TargetDays = { ok: true; days: DayFigures[] } | { ok: false; problem: string };

/** What an alert is about, found from the words a person used: one of the company's own websites, and a page on it by part of its address. */
export const resolveTargetInternal = internalQuery({
  args: { companyId: v.id("companies"), website: v.string(), page: v.optional(v.string()) },
  returns: v.union(
    // `oldestDay`: where Search Console's history starts, for a chart's days before.
    v.object({ ok: v.literal(true), target: hakkenTaskTargetValidator, newestDay: v.string(), oldestDay: v.optional(v.string()) }),
    v.object({ ok: v.literal(false), problem: v.string() }),
  ),
  handler: async (ctx, args): Promise<Resolved> => {
    const found = await holdFor(ctx, args.companyId, args.website);
    if ("problem" in found) return { ok: false as const, problem: found.problem ?? `${args.website} isn't one of this company's websites.` };
    const hold = found.held.hold;
    const website = found.held.summary.host;
    if (isTrackedHold(hold)) {
      return { ok: false as const, problem: `Alerts read Search Console, which Google gives a website's owner only, and ${website} is a competitor. Its rankings and AI answers can still be read.` };
    }
    const connection = await ctx.db
      .query("searchConsoleConnections")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id))
      .first();
    if (connection?.status !== "CONNECTED") {
      return { ok: false as const, problem: `${website} isn't connected to Search Console yet, so there are no visitors to keep an eye on. It can be connected on its Search Console page.` };
    }
    // Connected, and Google has not sent a day yet: the first download is still to come or under way.
    if (!connection.newestDay) {
      return { ok: false as const, problem: `${website} is connected to Search Console, but its first days haven't arrived from Google yet. Once they have, usually within a day, ask again and the alert can start.` };
    }
    const held = { newestDay: connection.newestDay, ...(connection.oldestDay ? { oldestDay: connection.oldestDay } : {}) };
    if (!args.page?.trim()) return { ok: true as const, target: { companyWebsiteId: hold._id, website }, ...held };
    const to = connection.newestDay;
    const list = await readList(ctx, hold._id, { searchType: "web", dimension: "page", from: shiftDay(to, -29), to, q: args.page.trim() });
    const page = list.rows.slice(0, 1)[0]?.key;
    if (!page) {
      return { ok: false as const, problem: `There's no page on ${website} with "${args.page.trim()}" in its address among those Google showed in the last 30 days.` };
    }
    return { ok: true as const, target: { companyWebsiteId: hold._id, website, page }, ...held };
  },
});

/** A website's days, as Search Console collection keeps them. */
export const websiteDaysInternal = internalQuery({
  args: { companyId: v.id("companies"), companyWebsiteId: v.id("companyWebsites"), from: v.string(), to: v.string() },
  returns: v.array(dayFiguresValidator),
  handler: async (ctx, args): Promise<DayFigures[]> => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold || hold.companyId !== args.companyId || isTrackedHold(hold)) return [];
    const rows = await daysOf(ctx, hold._id, "web", args.from, args.to);
    return rows.map((row) => ({ day: row.day, clicks: row.clicks, impressions: row.impressions }));
  },
});

/**
 * A website's or one page's visitors and impressions each day from `from` to
 * `to`. A page's are asked of Google: a day it was not shown in is a day of
 * none, so every day in the range is answered.
 */
export const targetDaysInternal = internalAction({
  args: { companyId: v.id("companies"), target: hakkenTaskTargetValidator, from: v.string(), to: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), days: v.array(dayFiguresValidator) }),
    v.object({ ok: v.literal(false), problem: v.string() }),
  ),
  handler: async (ctx, args): Promise<TargetDays> => {
    if (!args.target.page) {
      const days: DayFigures[] = await ctx.runQuery(internal.hakkenTaskFigures.websiteDaysInternal, {
        companyId: args.companyId, companyWebsiteId: args.target.companyWebsiteId, from: args.from, to: args.to,
      });
      return { ok: true as const, days };
    }
    const target = await ctx.runQuery(internal.searchConsoleReads.liveDaysTarget, { companyId: args.companyId, siteId: args.target.companyWebsiteId });
    if (!target) return { ok: false as const, problem: `${args.target.website} isn't connected to Search Console any more.` };
    const answer = await askLive(ctx, target, {
      startDate: args.from,
      endDate: args.to,
      type: "web",
      dimensions: ["date"],
      dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "equals", expression: args.target.page }] }],
    });
    if (!answer.ok) {
      return {
        ok: false as const,
        problem: answer.problem === "GOOGLE_BUSY" ? "Google's Search Console was busy, so this page's figures couldn't be read just now." : `${args.target.website}'s Search Console connection needs attention.`,
      };
    }
    const byDay = new Map(answer.rows.map((row) => [row.keys[0], row]));
    const days: DayFigures[] = [];
    for (let day = args.from; day <= args.to; day = shiftDay(day, 1)) {
      const row = byDay.get(day);
      days.push({ day, clicks: row?.clicks ?? 0, impressions: row?.impressions ?? 0 });
    }
    return { ok: true as const, days };
  },
});
