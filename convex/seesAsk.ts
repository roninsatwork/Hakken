import { v } from "convex/values";
import { creditSeesPress } from "./creditHooks";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery, tenantMutation, tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { appError } from "./utils/appError";
import { INSIGHTS_LEAD_ROLE } from "./utils/agentRoles";
import { findingValidator } from "./utils/sees/findingValidator";
import { SEES_KEPT_MS, SEES_WRITING_MS, fromSeesKey, sameFigures, seesAskValidator, seesKey } from "./utils/seesAsk";
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
  /** The findings as Jev ordered them when the words were written; absent before code found any. */
  findings: v.optional(v.array(findingValidator)),
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
    // Kept three hours while nothing on the page changed (S3; Anthony: "dont cache if things change"): new figures, new words.
    if (held && stillStands(held, now) && (held.status === "RESEARCHING" || sameFigures(held.facts, args.facts))) return { key, status: held.status };
    if (!/^\/app\/[^\s]{1,300}$/.test(args.path)) throw appError("INVALID_INPUT", "The screen's address is not one of the app's.");
    if (args.facts.length === 0) throw appError("INVALID_INPUT", "The page handed over no figures.");
    const lead = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", INSIGHTS_LEAD_ROLE)).first();
    if (!lead || lead.isActive === false) {
      // No team to ask: the bubble keeps the rule's words, and nothing is kept.
      return { key, status: "FAILED" as const };
    }
    const companyId = site.hold.companyId;
    const answerId: Id<"seesAnswers"> = held
      ? (await ctx.db.patch(held._id, { status: "RESEARCHING", says: [], steps: [], role: undefined, runId: undefined, askedAt: now, writtenAt: undefined, failedWhy: undefined, week: weekOf(now), path: args.path, about: args.about, facts: args.facts, links: args.links, shop: args.shop ?? false, askedBy: ctx.userId }), held._id)
      : await ctx.db.insert("seesAnswers", { companyId, companyWebsiteId: holdId, key, screen: args.screen, path: args.path, status: "RESEARCHING", says: [], steps: [], askedAt: now, week: weekOf(now), about: args.about, facts: args.facts, links: args.links, shop: args.shop ?? false, askedBy: ctx.userId });
    const runId = await ctx.db.insert("agentRuns", {
      agentId: lead._id,
      triggerType: "EVENT",
      objective: `The eye on ${args.about} for ${site.website.host}: hand the page's figures to the right specialist, have the Editor check the words, and save the bubble.`,
      title: `The eye: ${site.website.host}`,
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
      device: args.device,
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
    return { status: row.status, says: row.says, steps: row.steps, role: row.role ?? null, writtenAt: row.writtenAt ?? null, ...(row.findings ? { findings: row.findings } : {}) };
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
    findings: v.optional(v.array(findingValidator)),
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
      ...(args.findings ? { findings: args.findings } : {}),
      ...(args.status === "WRITTEN" ? { writtenAt: Date.now(), failedWhy: undefined } : { failedWhy: args.failedWhy ?? "The team gave no answer." }),
    });
    // New words written: the press is charged, once, with what the run cost us. A failed one, or one answered from the
    // three hours kept, costs nothing (ask-hakken-every-chart-plan-2026-10-31.md, §3).
    if (args.status === "WRITTEN") await creditSeesPress(ctx, row);
    return null;
  },
});

/** What the bubbles said this week for a website, for the specialist's weekly run to read (S10). */
/**
 * The tracking health checks failing on a website's Analytics, as their names: the only time the bubble may speak
 * about tracking (Anthony, 2026-10-30, agreeing the fix to "the advice is still really shit"). Empty with none.
 */
export const trackingFaultsInternal = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    return (connection?.health?.checks ?? []).filter((check) => !check.passing).map((check) => check.check);
  },
});

export const weekSeesAnswers = internalQuery({
  args: { holdId: v.id("companyWebsites"), week: v.string() },
  returns: v.array(v.object({ screen: v.string(), path: v.string(), says: v.array(v.string()), role: v.union(v.string(), v.null()), writtenAt: v.number() })),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("seesAnswers").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", args.holdId).eq("week", args.week)).take(50);
    return rows.filter((row) => row.status === "WRITTEN").map((row) => ({ screen: row.screen, path: row.path, says: row.says, role: row.role ?? null, writtenAt: row.writtenAt ?? row.askedAt }));
  },
});

// ---------------------------------------------------------------------------
// The eval set (stronger-agents-plan-2026-10-30.md A6)
// ---------------------------------------------------------------------------

const evalPageValidator = v.object({
  _id: v.id("seesEvalPages"),
  companyId: v.id("companies"),
  companyWebsiteId: v.id("companyWebsites"),
  host: v.string(),
  screen: v.string(),
  about: v.string(),
  facts: seesAskValidator.facts,
  links: seesAskValidator.links,
  expected: v.array(v.string()),
  period: v.optional(v.string()),
  from: v.optional(v.string()),
  to: v.optional(v.string()),
  country: v.optional(v.string()),
  device: v.optional(v.string()),
  shop: v.optional(v.boolean()),
});

/** A bubble kept as an eval page: its figures, links and where it was looked at, with Anthony's sentences. */
async function keepEvalPage(ctx: MutationCtx, args: { answerId: Id<"seesAnswers">; expected: string[]; userId: Id<"users"> }): Promise<Id<"seesEvalPages">> {
  const answer = await ctx.db.get(args.answerId);
  if (!answer || !answer.facts || !answer.about) throw appError("NOT_FOUND", "That bubble kept no figures to grade against.");
  const expected = args.expected.map((line) => line.trim()).filter(Boolean);
  if (expected.length === 0 || expected.length > 5) throw appError("INVALID_INPUT", "Give one to five things the bubble should have found.");
  const hold = await ctx.db.get(answer.companyWebsiteId);
  const website = hold ? await ctx.db.get(hold.websiteId) : null;
  const at = fromSeesKey(answer.key);
  return await ctx.db.insert("seesEvalPages", {
    companyId: answer.companyId,
    companyWebsiteId: answer.companyWebsiteId,
    host: website?.host ?? "",
    screen: answer.screen,
    about: answer.about,
    facts: answer.facts,
    links: answer.links ?? [],
    expected,
    period: at.period,
    ...(at.from ? { from: at.from } : {}),
    ...(at.to ? { to: at.to } : {}),
    country: at.country,
    device: at.device,
    shop: answer.shop ?? false,
    gradings: [],
    createdBy: args.userId,
    createdAt: Date.now(),
  });
}

/** One grading run of the Head's per company, writing every kept page's bubble again. */
async function startEval(ctx: MutationCtx): Promise<Id<"agentRuns">[]> {
  const lead = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", INSIGHTS_LEAD_ROLE)).first();
  if (!lead) return [];
  const pages = await ctx.db.query("seesEvalPages").take(200);
  const byCompany = new Map<Id<"companies">, Id<"seesEvalPages">[]>();
  for (const page of pages) byCompany.set(page.companyId, [...(byCompany.get(page.companyId) ?? []), page._id]);
  const now = Date.now();
  const runIds: Id<"agentRuns">[] = [];
  for (const [companyId, pageIds] of byCompany) {
    const runId = await ctx.db.insert("agentRuns", {
      agentId: lead._id,
      triggerType: "MANUAL",
      objective: "Grade the eval set: write every kept page's bubble again and judge whether it found what Anthony would want found.",
      title: "The eye: the eval set graded",
      status: "QUEUED",
      companyId,
      startedAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.seesAskActions.runSeesEval, { runId, pageIds });
    runIds.push(runId);
  }
  return runIds;
}

/** The same, kept and started from the command line while the eval set has no Admin screen (A6). */
export const keepSeesEvalPageInternal = internalMutation({
  args: { answerId: v.id("seesAnswers"), expected: v.array(v.string()), userId: v.id("users") },
  returns: v.id("seesEvalPages"),
  handler: async (ctx, args) => await keepEvalPage(ctx, args),
});
/**
 * A kept page's sentences changed, from the command line: a point the figures turn out not to hold is taken out
 * rather than marking every bubble down for not saying it (Anthony, 2026-10-31, on AI assistants in September).
 */
export const setSeesEvalPointsInternal = internalMutation({
  args: { pageId: v.id("seesEvalPages"), expected: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const expected = args.expected.map((line) => line.trim()).filter(Boolean);
    if (expected.length === 0 || expected.length > 5) throw appError("INVALID_INPUT", "Give one to five things the bubble should have found.");
    if (!(await ctx.db.get(args.pageId))) throw appError("NOT_FOUND", "There is no such eval page.");
    await ctx.db.patch(args.pageId, { expected });
    return null;
  },
});
export const gradeSeesEvalInternal = internalMutation({
  args: {},
  returns: v.array(v.id("agentRuns")),
  handler: async (ctx) => await startEval(ctx),
});

/**
 * A bubble the eye asked for kept as an eval page, with the sentences Anthony
 * would write for it: the page's figures as they were, graded against on
 * every change to an agent (`seesAskActions.runSeesEval`). Super admins only.
 */
export const keepSeesEvalPage = superAdminMutation({
  args: { answerId: v.id("seesAnswers"), expected: v.array(v.string()) },
  returns: v.id("seesEvalPages"),
  handler: async (ctx, args) => await keepEvalPage(ctx, { ...args, userId: ctx.userId }),
});

/**
 * Grade the eval set now: a run of the Head of Strategy's for each company
 * with pages in the set — a model answer and its cost belong to one
 * company's run — every page written again and graded. Says the runs.
 */
export const gradeSeesEvalNow = superAdminMutation({
  args: {},
  returns: v.array(v.id("agentRuns")),
  handler: async (ctx) => await startEval(ctx),
});

/** The eval pages to grade: all, or the ones named. */
export const evalPagesInternal = internalQuery({
  args: { pageIds: v.optional(v.array(v.id("seesEvalPages"))) },
  returns: v.array(evalPageValidator),
  handler: async (ctx, args) => {
    const rows: Doc<"seesEvalPages">[] = [];
    if (args.pageIds) {
      for (const id of args.pageIds) {
        const row = await ctx.db.get(id);
        if (row) rows.push(row);
      }
    } else {
      rows.push(...(await ctx.db.query("seesEvalPages").take(200)));
    }
    return rows.map((row) => ({
      _id: row._id, companyId: row.companyId, companyWebsiteId: row.companyWebsiteId, host: row.host, screen: row.screen, about: row.about, facts: row.facts, links: row.links, expected: row.expected,
      ...(row.period ? { period: row.period } : {}), ...(row.from ? { from: row.from } : {}), ...(row.to ? { to: row.to } : {}),
      ...(row.country !== undefined ? { country: row.country } : {}), ...(row.device !== undefined ? { device: row.device } : {}), ...(row.shop !== undefined ? { shop: row.shop } : {}),
    }));
  },
});

export const saveSeesEvalRun = internalMutation({
  args: {
    pageId: v.id("seesEvalPages"),
    runId: v.id("agentRuns"),
    role: v.optional(v.string()),
    says: v.array(v.string()),
    steps: v.array(v.object({ words: v.string(), link: v.string(), href: v.string() })),
    passed: v.boolean(),
    score: v.number(),
    notes: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId);
    if (!page) return null;
    const { pageId: _pageId, ...grading } = args;
    await ctx.db.patch(args.pageId, { gradings: [...page.gradings, { ...grading, at: Date.now() }].slice(-20) });
    return null;
  },
});

/** Every eval page with its newest grading, for the Admin screen to come. */
export const seesEvalResults = superAdminQuery({
  args: {},
  returns: v.array(v.object({
    pageId: v.id("seesEvalPages"),
    host: v.string(),
    about: v.string(),
    expected: v.array(v.string()),
    latest: v.union(v.null(), v.object({ at: v.number(), role: v.union(v.string(), v.null()), says: v.array(v.string()), passed: v.boolean(), score: v.number(), notes: v.array(v.string()) })),
  })),
  handler: async (ctx) => {
    const pages = await ctx.db.query("seesEvalPages").take(200);
    const out = [];
    for (const page of pages) {
      const latest = page.gradings[page.gradings.length - 1] ?? null;
      out.push({
        pageId: page._id,
        host: page.host,
        about: page.about,
        expected: page.expected,
        latest: latest ? { at: latest.at, role: latest.role ?? null, says: latest.says, passed: latest.passed, score: latest.score, notes: latest.notes } : null,
      });
    }
    return out;
  },
});
