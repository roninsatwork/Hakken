import { v, type ObjectType } from "convex/values";
import { creditSeesPress } from "./creditHooks";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery, tenantMutation, tenantQuery, type TenantMutationCtx } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { appError } from "./utils/appError";
import { INSIGHTS_LEAD_ROLE } from "./utils/agentRoles";
import { findingValidator } from "./utils/sees/findingValidator";
import { MOST_SEES_FACTS, SEES_KEPT_MS, SEES_WRITING_MS, fromSeesKey, sameFigures, seesAskValidator, seesKey } from "./utils/seesAsk";
import { weekOf } from "./insightsTeam";
import { creditBalance, ensurePlanBatch, readCreditPrice } from "./creditLedger";
import { creditsForUnits } from "./creditKinds";
import { pageDataFor, pageFacts } from "./utils/sees/pageData";
import { seesScreenFor } from "./utils/sees/screens";
import { seesStageRowValidator, seesStageValidator, withStage } from "./utils/sees/stages";

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
  /** What the press has done so far, the last line being what it is doing now: only while it is writing. */
  stages: v.optional(v.array(seesStageRowValidator)),
});

/** What a press says back: the key its answer is read by, and how that answer stands. */
const pressedValidator = v.object({ key: v.string(), status: v.union(v.literal("RESEARCHING"), v.literal("WRITTEN"), v.literal("FAILED"), v.literal("NO_CREDITS")) });

/** Whether a kept answer still stands: written within a day (`SEES_KEPT_MS`), or being written within ten minutes. */
export function stillStands(row: Pick<Doc<"seesAnswers">, "status" | "askedAt" | "writtenAt">, now: number): boolean {
  if (row.status === "WRITTEN") return now - (row.writtenAt ?? row.askedAt) < SEES_KEPT_MS;
  if (row.status === "RESEARCHING") return now - row.askedAt < SEES_WRITING_MS;
  return false;
}

/** Whether the company has the credits a press costs (Anthony, 2026-10-31: at zero credits the eye "stop[s]"). */
export async function seesCreditsLeft(ctx: MutationCtx, companyId: Id<"companies">): Promise<boolean> {
  const now = Date.now();
  // The month's plan credits are granted the first time anything is charged in it: granted here first, so a new month never reads as empty.
  await ensurePlanBatch(ctx, companyId, now);
  const price = creditsForUnits(await readCreditPrice(ctx, "sees"), 1);
  return price <= 0 || (await creditBalance(ctx, companyId)) >= price;
}

/**
 * The eye was pressed: the answer kept for this page as it stands, or a new
 * one started — a run of the Head of Strategy's, which asks the specialist
 * and the Editor (`seesAskActions.writeSeesAnswer`). Says the key the bubble
 * reads the answer by. A failed answer is asked again on the next press.
 *
 * Any page of the six sections may ask (sees-every-page-plan-2026-10-31.md): one with no facts of its own hands over
 * its figures as it shows them (`data`), keyed here. A page whose words are already the team's writes nothing; a
 * company with fewer credits than a press costs is told so, and nothing is written.
 */
export const askSees = tenantMutation({
  args: seesAskValidator,
  returns: pressedValidator,
  handler: async (ctx, args) => await startPress(ctx, args, false),
});

/**
 * A super admin's refresh (Anthony, 2026-11-04: "force refresh the data and don't have to wait the 3 hours … this is for
 * super admin only"): the words written again now, kept answer or not, on the page's figures as they stand. It is the
 * platform checking its own work, so it spends none of the company's credits and needs none: what it cost stays on the
 * run. An answer still being written is left to finish, never written twice at once.
 */
export const refreshSees = superAdminMutation({
  args: seesAskValidator,
  returns: pressedValidator,
  handler: async (ctx, args) => await startPress(ctx, args, true),
});

/** A press: the kept answer where one stands (never for a refresh), or a new one started. */
async function startPress(ctx: TenantMutationCtx, args: ObjectType<typeof seesAskValidator>, refresh: boolean) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const key = seesKey(args);
  const now = Date.now();
  const screen = seesScreenFor(args.screen);
  if (!screen) throw appError("INVALID_INPUT", "That page has no eye.");
  if (!screen.writes) throw appError("INVALID_INPUT", "That page's words are the team's own: pressing writes nothing new.");
  const data = args.data !== undefined ? pageDataFor(args.data, args.screen) : undefined;
  // The page's own facts, or its figures keyed as the writer will name them.
  const facts = (args.facts.length > 0 ? args.facts : pageFacts(args.screen, data, { ...(args.from ? { from: args.from } : {}), ...(args.to ? { to: args.to } : {}) }).facts.map(({ key: factKey, value, unit, label }) => ({ key: factKey, value, unit, label })))
    .slice(0, MOST_SEES_FACTS);
  const held = await ctx.db.query("seesAnswers").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", holdId).eq("key", key)).first();
  // Kept a day while nothing on the page changed (S3; Anthony: "dont cache if things change"): new figures, new words.
  if (held && stillStands(held, now) && (held.status === "RESEARCHING" || (!refresh && sameFigures(held.facts, facts)))) return { key, status: held.status };
  if (!/^\/app\/[^\s]{1,300}$/.test(args.path)) throw appError("INVALID_INPUT", "The screen's address is not one of the app's.");
  if (facts.length === 0) throw appError("INVALID_INPUT", "The page handed over no figures.");
  const lead = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", INSIGHTS_LEAD_ROLE)).first();
  if (!lead || lead.isActive === false) {
    // No team to ask: the bubble keeps the rule's words, and nothing is kept.
    return { key, status: "FAILED" as const };
  }
  const companyId = site.hold.companyId;
  if (!refresh && !(await seesCreditsLeft(ctx, companyId))) return { key, status: "NO_CREDITS" as const };
  // The page's own words for what it is where it gave them (the Conversions screens'); the list's otherwise.
  const about = args.facts.length > 0 && args.about.trim() ? args.about : screen.about;
  const kept = { path: args.path, about, facts, links: args.links, shop: args.shop ?? false, askedBy: ctx.userId, stages: [{ stage: "reading" as const }], ...(data !== undefined && data !== null ? { pageData: data } : {}) };
  const uncharged = refresh ? { notCharged: true } : {};
  const answerId: Id<"seesAnswers"> = held
    // A new press clears the last one's findings too: its answer shows its own, never the press before's.
    ? (await ctx.db.patch(held._id, { status: "RESEARCHING", says: [], steps: [], role: undefined, runId: undefined, askedAt: now, writtenAt: undefined, failedWhy: undefined, findings: undefined, week: weekOf(now), pageData: undefined, notCharged: undefined, ...kept, ...uncharged }), held._id)
    : await ctx.db.insert("seesAnswers", { companyId, companyWebsiteId: holdId, key, screen: args.screen, status: "RESEARCHING", says: [], steps: [], askedAt: now, week: weekOf(now), ...kept, ...uncharged });
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
    about,
    period: args.period,
    from: args.from,
    to: args.to,
    country: args.country,
    device: args.device,
    facts,
    links: args.links,
    shop: args.shop ?? false,
    ...(data !== undefined && data !== null ? { data } : {}),
  });
  return { key, status: "RESEARCHING" as const };
}

/** The bubble's answer for a page, as it stands: null until the eye has asked. */
export const seesAnswer = tenantQuery({
  args: { siteId: v.id("companyWebsites"), key: v.string() },
  returns: v.union(v.null(), answerValidator),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const row = await ctx.db.query("seesAnswers").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", site.hold._id).eq("key", args.key)).first();
    if (!row) return null;
    // An answer past its day reads as none: the next press writes afresh.
    if (!stillStands(row, Date.now()) && row.status !== "FAILED") return null;
    return { status: row.status, says: row.says, steps: row.steps, role: row.role ?? null, writtenAt: row.writtenAt ?? null, ...(row.findings ? { findings: row.findings } : {}), ...(row.status === "RESEARCHING" && row.stages ? { stages: row.stages } : {}) };
  },
});

/**
 * A press has moved on to its next stage (`utils/sees/stages.ts`): the panel, reading the answer, shows it as it happens.
 * Only for the press still writing this answer: a run overtaken by a newer press adds nothing to that press's list.
 */
export const noteSeesStage = internalMutation({
  args: { answerId: v.id("seesAnswers"), runId: v.id("agentRuns"), stage: seesStageValidator, count: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.answerId);
    if (!row || row.status !== "RESEARCHING" || row.runId !== args.runId) return null;
    await ctx.db.patch(args.answerId, { stages: withStage(row.stages ?? [], args.stage, args.count) });
    return null;
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
      // Written words keep the findings they were written from, none included: never an earlier press's.
      ...(args.status === "WRITTEN" ? { findings: args.findings } : args.findings ? { findings: args.findings } : {}),
      ...(args.status === "WRITTEN" ? { writtenAt: Date.now(), failedWhy: undefined } : { failedWhy: args.failedWhy ?? "The team gave no answer." }),
    });
    // New words written: the press is charged, once, with what the run cost us. A failed one, or one answered from the
    // day kept, costs nothing (ask-hakken-every-chart-plan-2026-10-31.md, §3).
    if (args.status === "WRITTEN" && !row.notCharged) await creditSeesPress(ctx, row);
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
  pageData: v.optional(v.any()),
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
    ...(answer.pageData !== undefined ? { pageData: answer.pageData } : {}),
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
      ...(row.pageData !== undefined ? { pageData: row.pageData } : {}),
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

// ---------------------------------------------------------------------------
// Replaying a saved answer (eye-code-first-brief-plan-2026-11-07.md: the rollout, measured, and the drift checks)
// ---------------------------------------------------------------------------

const replayInputValidator = v.object({
  companyId: v.id("companies"),
  holdId: v.id("companyWebsites"),
  host: v.string(),
  screen: v.string(),
  about: v.string(),
  period: v.string(),
  from: v.optional(v.string()),
  to: v.optional(v.string()),
  country: v.string(),
  device: v.string(),
  facts: seesAskValidator.facts,
  links: seesAskValidator.links,
  shop: v.boolean(),
  data: v.optional(v.any()),
  /** The words as the press wrote them, and what that press cost. */
  says: v.array(v.string()),
  steps: v.array(v.string()),
  costUsd: v.union(v.number(), v.null()),
  inputTokens: v.union(v.number(), v.null()),
});

/**
 * A written answer as its press was handed it, to write again on the very same figures: the same page, dates, country,
 * device and page figures, with the words it wrote and what it cost. Null for one not written, or kept before pages handed
 * their figures over.
 */
export const replayInputInternal = internalQuery({
  args: { answerId: v.id("seesAnswers") },
  returns: v.union(v.null(), replayInputValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.answerId);
    if (!row || row.status !== "WRITTEN" || row.pageData === undefined || row.pageData === null) return null;
    const hold = await ctx.db.get(row.companyWebsiteId);
    const website = hold ? await ctx.db.get(hold.websiteId) : null;
    if (!website) return null;
    const run = row.runId ? await ctx.db.get(row.runId) : null;
    const key = fromSeesKey(row.key);
    return {
      companyId: row.companyId, holdId: row.companyWebsiteId, host: website.host, screen: row.screen, about: row.about ?? row.screen,
      period: key.period, ...(key.from ? { from: key.from } : {}), ...(key.to ? { to: key.to } : {}), country: key.country, device: key.device,
      facts: (row.facts ?? []).map(({ key: factKey, value, unit, label }) => ({ key: factKey, value, unit, label })), links: row.links ?? [], shop: row.shop ?? false, data: row.pageData,
      says: row.says, steps: row.steps.map((step) => step.words), costUsd: run?.costUsd ?? null, inputTokens: run?.inputTokens ?? null,
    };
  },
});

/** A run of the Head's for one replay, so what it cost is recorded on its own. Never shown to a client. */
export const startReplayRunInternal = internalMutation({
  args: { companyId: v.id("companies"), host: v.string(), screen: v.string() },
  returns: v.union(v.null(), v.id("agentRuns")),
  handler: async (ctx, args) => {
    const lead = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", INSIGHTS_LEAD_ROLE)).first();
    if (!lead) return null;
    const now = Date.now();
    return await ctx.db.insert("agentRuns", {
      agentId: lead._id, triggerType: "EVENT", objective: `The eye replayed on ${args.screen} for ${args.host}: written again on a saved page's figures, to measure.`,
      title: `The eye replayed: ${args.host}`, status: "QUEUED", companyId: args.companyId, startedAt: now, updatedAt: now,
    });
  },
});

/** What one run cost and how many calls it made to the writer. */
export const runCostInternal = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.object({ costUsd: v.number(), inputTokens: v.number(), calls: v.number() }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    const steps = await ctx.db.query("agentRunSteps").withIndex("by_run_step", (q) => q.eq("runId", args.runId)).take(200);
    return { costUsd: run?.costUsd ?? 0, inputTokens: run?.inputTokens ?? 0, calls: steps.filter((step) => step.kind === "MODEL").length };
  },
});
