import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { tenantMutation, tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { appError } from "./utils/appError";
import { INSIGHTS_LEAD_ROLE } from "./utils/agentRoles";
import { SEES_KEPT_MS, SEES_WRITING_MS, seesAskValidator, seesKey } from "./utils/seesAsk";
import { weekOf } from "./insightsTeam";

/**
 * What Hakken sees, asked of the Insights team when the eye is pressed
 * (docs/plans/active/sees-conversion-specialist-plan-2026-10-30.md): the
 * page hands over its figures, the Head of Strategy hands them to the
 * specialist, the Editor checks the words, and the answer is kept three
 * hours for that website, page, dates, country and device. The asking is in
 * `seesAskActions.ts` (Node); this file saves and reads. Only the caller's
 * own website (`requireMySite`).
 */

const answerValidator = v.object({
  status: v.union(v.literal("RESEARCHING"), v.literal("WRITTEN"), v.literal("FAILED")),
  says: v.array(v.string()),
  steps: v.array(v.object({ words: v.string(), link: v.string(), href: v.string() })),
  role: v.union(v.string(), v.null()),
  writtenAt: v.union(v.number(), v.null()),
});

/** Whether a kept answer still stands: written within three hours, or being written within ten minutes. */
export function stillStands(row: Pick<Doc<"seesAnswers">, "status" | "askedAt" | "writtenAt">, now: number): boolean {
  if (row.status === "WRITTEN") return now - (row.writtenAt ?? row.askedAt) < SEES_KEPT_MS;
  if (row.status === "RESEARCHING") return now - row.askedAt < SEES_WRITING_MS;
  return false;
}

/**
 * The eye was pressed: the answer kept for this page as it stands, or a new
 * one started — a run of the Head of Strategy's, which asks the specialist
 * and the Editor (`seesAskActions.writeSeesAnswer`). Says the key the bubble
 * reads the answer by. A failed answer is asked again on the next press.
 */
export const askSees = tenantMutation({
  args: seesAskValidator,
  returns: v.object({ key: v.string(), status: v.union(v.literal("RESEARCHING"), v.literal("WRITTEN"), v.literal("FAILED")) }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const key = seesKey(args);
    const now = Date.now();
    const held = await ctx.db.query("seesAnswers").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", holdId).eq("key", key)).first();
    if (held && stillStands(held, now)) return { key, status: held.status };
    if (!/^\/app\/[^\s]{1,300}$/.test(args.path)) throw appError("INVALID_INPUT", "The screen's address is not one of the app's.");
    if (args.facts.length === 0) throw appError("INVALID_INPUT", "The page handed over no figures.");
    const lead = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", INSIGHTS_LEAD_ROLE)).first();
    if (!lead || lead.isActive === false) {
      // No team to ask: the bubble keeps the rule's words, and nothing is kept.
      return { key, status: "FAILED" as const };
    }
    const companyId = site.hold.companyId;
    const answerId: Id<"seesAnswers"> = held
      ? (await ctx.db.patch(held._id, { status: "RESEARCHING", says: [], steps: [], role: undefined, runId: undefined, askedAt: now, writtenAt: undefined, failedWhy: undefined, week: weekOf(now), path: args.path }), held._id)
      : await ctx.db.insert("seesAnswers", { companyId, companyWebsiteId: holdId, key, screen: args.screen, path: args.path, status: "RESEARCHING", says: [], steps: [], askedAt: now, week: weekOf(now) });
    const runId = await ctx.db.insert("agentRuns", {
      agentId: lead._id,
      triggerType: "EVENT",
      objective: `What Hakken sees on ${args.about} for ${site.website.host}: hand the page's figures to the right specialist, have the Editor check the words, and save the bubble.`,
      title: `What Hakken sees: ${site.website.host}`,
      status: "QUEUED",
      companyId,
      startedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(answerId, { runId });
    await ctx.scheduler.runAfter(0, internal.seesAskActions.writeSeesAnswer, {
      runId,
      answerId,
      holdId,
      companyId,
      host: site.website.host,
      screen: args.screen,
      about: args.about,
      period: args.period,
      from: args.from,
      to: args.to,
      country: args.country,
      facts: args.facts,
      links: args.links,
      shop: args.shop ?? false,
    });
    return { key, status: "RESEARCHING" as const };
  },
});

/** The bubble's answer for a page, as it stands: null until the eye has asked. */
export const seesAnswer = tenantQuery({
  args: { siteId: v.id("companyWebsites"), key: v.string() },
  returns: v.union(v.null(), answerValidator),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const row = await ctx.db.query("seesAnswers").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", site.hold._id).eq("key", args.key)).first();
    if (!row) return null;
    // An answer past its three hours reads as none: the next press writes afresh.
    if (!stillStands(row, Date.now()) && row.status !== "FAILED") return null;
    return { status: row.status, says: row.says, steps: row.steps, role: row.role ?? null, writtenAt: row.writtenAt ?? null };
  },
});

/** The written answer saved, or why it was sent back (`seesAskActions.writeSeesAnswer`). */
export const saveSeesAnswer = internalMutation({
  args: {
    answerId: v.id("seesAnswers"),
    status: v.union(v.literal("WRITTEN"), v.literal("FAILED")),
    says: v.array(v.string()),
    steps: v.array(v.object({ words: v.string(), link: v.string(), href: v.string() })),
    role: v.optional(v.string()),
    failedWhy: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.answerId);
    if (!row) return null;
    await ctx.db.patch(args.answerId, {
      status: args.status,
      says: args.says,
      steps: args.steps,
      ...(args.role ? { role: args.role } : {}),
      ...(args.status === "WRITTEN" ? { writtenAt: Date.now(), failedWhy: undefined } : { failedWhy: args.failedWhy ?? "The team gave no answer." }),
    });
    return null;
  },
});

/** What the bubbles said this week for a website, for the specialist's weekly run to read (S10). */
export const weekSeesAnswers = internalQuery({
  args: { holdId: v.id("companyWebsites"), week: v.string() },
  returns: v.array(v.object({ screen: v.string(), path: v.string(), says: v.array(v.string()), role: v.union(v.string(), v.null()), writtenAt: v.number() })),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("seesAnswers").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", args.holdId).eq("week", args.week)).take(50);
    return rows.filter((row) => row.status === "WRITTEN").map((row) => ({ screen: row.screen, path: row.path, says: row.says, role: row.role ?? null, writtenAt: row.writtenAt ?? row.askedAt }));
  },
});
