import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { failureSummary, lastMoved, ROLE_RUN_LIVE_MS } from "./roleRuns";
import { finishRun } from "./searchConsoleAgentRun";
import { askClarity, askRecordings } from "./clarity";
import { decryptConnectorToken } from "./connectorTokenCrypto";
import { getNextWorkflowScheduleRunAt } from "./workflowScheduleService";
import { shiftDay } from "./utils/insightFacts";
import { CLARITY_ROWS_AN_ANSWER, subtractTotalsRows, withUnsplitPages, type ClarityAsk, type ClarityTotalsRow } from "./utils/clarityRows";
import type { ClarityRecording, ClarityRecordingKind } from "./utils/clarityRecordings";
import {
  CLARITY_ASKS_A_DAY,
  CLARITY_ASKS_IN_HAND,
  CLARITY_COLLECTOR,
  CLARITY_COLLECTOR_SCHEDULE,
  CLARITY_DAYS_HELD,
  CLARITY_DAY_ASKS,
  CLARITY_RECORDING_ASKS,
  CLARITY_RECORDINGS_A_KIND,
  CLARITY_SPLIT_ASKS,
} from "./utils/clarityCollectorAgent";

/**
 * The Microsoft Clarity: Collector Agent's job (docs/plans/active/agents-and-clarity-plan.md,
 * Part 2, CC1–CC6): what it does when its schedule — "Microsoft Clarity: each
 * morning", 05:50 London — or Run starts it. Built as the Bing Webmaster and
 * Google Analytics collectors are (`bingWebmasterAgentRun.ts`).
 *
 * **A run of its own for each website** connected to Clarity, a few seconds
 * apart. Each asks Clarity for the days it does not hold yet — yesterday, and
 * any morning missed while Clarity still keeps it — two asks a day missed,
 * counted against the project's ten a day with two always kept in hand. A
 * missed day is worked out from Clarity's two or three days less the days
 * after it. Then, with what is left, yesterday's sources and browsers, two
 * asks each, and a few recordings worth watching, an ask a kind ("Finishing
 * Parts 3 and 4", decisions 1 and 2). A refused token marks the connection
 * Needs connecting again and tells the company's admins in the bell, once.
 * Every step is a line in the run's log; nothing waits on a person to press a
 * button.
 */

/** The gap between websites' runs starting. */
const STAGGER_MS = 3_000;
const CONNECTIONS_READ = 500;
const ADMINS_TOLD = 20;
const DAY_MS = 86_400_000;

type Reader = { db: QueryCtx["db"] };
type Site = { holdId: Id<"companyWebsites">; companyId: Id<"companies">; host: string };

export async function findClarityCollector(ctx: Reader): Promise<Doc<"agents"> | null> {
  return await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", CLARITY_COLLECTOR.systemKey)).first();
}

/** Idempotent: the agent, made once and kept in step, and its morning schedule made with it. Never overwrites its switch or a changed schedule. */
export async function ensureClarityCollector(ctx: MutationCtx): Promise<Id<"agents">> {
  const now = Date.now();
  const definition = {
    name: CLARITY_COLLECTOR.name,
    description: CLARITY_COLLECTOR.description,
    systemPrompt: CLARITY_COLLECTOR.systemPrompt,
    standingObjective: CLARITY_COLLECTOR.standingObjective,
  };
  const existing = await findClarityCollector(ctx);
  if (existing) {
    if (Object.entries(definition).some(([key, value]) => existing[key as keyof typeof definition] !== value)) {
      await ctx.db.patch(existing._id, { ...definition, updatedAt: now });
    }
    return existing._id;
  }
  const agentId = await ctx.db.insert("agents", {
    ...definition,
    systemKey: CLARITY_COLLECTOR.systemKey,
    // Plain code: no model is called. The field is required of every agent.
    modelId: "none (plain code)",
    thinkingMode: false,
    isActive: true,
    isGlobal: true,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("schedules", {
    name: CLARITY_COLLECTOR_SCHEDULE.name,
    agentId,
    intervalStr: CLARITY_COLLECTOR_SCHEDULE.intervalStr,
    isActive: true,
    nextRunAt: getNextWorkflowScheduleRunAt({ intervalStr: CLARITY_COLLECTOR_SCHEDULE.intervalStr, now: new Date(now) }),
    createdAt: now,
  });
  return agentId;
}

export const ensureClarityCollectorInternal = internalMutation({
  args: {},
  returns: v.id("agents"),
  handler: async (ctx) => await ensureClarityCollector(ctx),
});

const today = () => new Date().toISOString().slice(0, 10);

/** A website's asks today, as counted: Clarity's day is the UTC day. */
function asksUsed(connection: Doc<"clarityConnections">): number {
  return connection.asks?.day === today() ? connection.asks.used : 0;
}

function collectingNow(run: Doc<"agentRuns"> | null, now: number): boolean {
  return run !== null && (run.status === "QUEUED" || run.status === "RUNNING") && now - lastMoved(run) < ROLE_RUN_LIVE_MS;
}

/** Every website connected to Clarity and switched on, the one longest since it was collected first; not one being collected now. */
export const agentCollections = internalQuery({
  args: {},
  returns: v.array(v.object({ holdId: v.id("companyWebsites"), companyId: v.id("companies"), host: v.string() })),
  handler: async (ctx) => {
    const connected = await ctx.db.query("clarityConnections").withIndex("by_status", (q) => q.eq("status", "CONNECTED")).take(CONNECTIONS_READ);
    const now = Date.now();
    const out: Site[] = [];
    for (const connection of connected.sort((a, b) => (a.lastCollectedAt ?? 0) - (b.lastCollectedAt ?? 0))) {
      // Switched off on the website's Schedules page: kept, not collected (website-schedules-plan.md, WS4).
      if (connection.switchedOff || !connection.tokenCiphertext) continue;
      if (connection.collecting && collectingNow(await ctx.db.get(connection.collecting.runId), now)) continue;
      out.push({ holdId: connection.companyWebsiteId, companyId: connection.companyId, host: await hostOf(ctx, connection.companyWebsiteId) });
    }
    return out;
  },
});

async function hostOf(ctx: Reader, holdId: Id<"companyWebsites">): Promise<string> {
  const hold = await ctx.db.get(holdId);
  const website = hold ? await ctx.db.get(hold.websiteId) : null;
  return website?.displayHost ?? website?.host ?? "your website";
}

/** The run the schedule or Run starts: one run of its own for each connected website. */
export const runClarityCollectorNow = internalAction({
  args: { runId: v.id("agentRuns"), workflowExecutionId: v.optional(v.id("workflowExecutions")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    try {
      const turn = await ctx.runMutation(internal.roleRuns.takeRoleTurn, { runId: args.runId });
      if (!turn.ok) {
        await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", turn.message);
        return null;
      }
      const sites: Site[] = await ctx.runQuery(internal.clarityAgentRun.agentCollections, {});
      if (sites.length === 0) {
        await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", "No website is connected to Microsoft Clarity and switched on, so there was nothing to collect.");
        return null;
      }
      const hosts = sites.map((site) => site.host).join(", ");
      await ctx.runMutation(internal.roleRuns.recordObservation, {
        runId: args.runId,
        text: `${sites.length === 1 ? "1 website is" : `${sites.length} websites are`} connected to Microsoft Clarity: ${hosts}. Each gets a run of its own.`,
      });
      for (const [index, site] of sites.entries()) {
        const started: Id<"agentRuns"> | null = await ctx.runMutation(internal.clarityAgentRun.startSiteRun, { parentRunId: args.runId, ...site, delayMs: index * STAGGER_MS });
        await ctx.runMutation(internal.roleRuns.logRunLine, {
          runId: args.runId,
          companyId: site.companyId,
          heading: site.host,
          detail: started ? "Its own run started." : "Not started: it was disconnected or switched off meanwhile.",
          failed: false,
        });
      }
      await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", `Started a run of its own for ${sites.length === 1 ? "the 1 website" : `each of the ${sites.length} websites`} connected to Microsoft Clarity: ${hosts}.`);
    } catch (error: unknown) {
      await finishRun(ctx, args.runId, args.workflowExecutionId, "FAILED", failureSummary(error));
    }
    return null;
  },
});

/** One website's run, under the agent, and its step; null when it is no longer connected or is switched off. */
async function beginSiteRun(ctx: MutationCtx, agentId: Id<"agents">, site: Site, delayMs: number): Promise<Id<"agentRuns"> | null> {
  const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", site.holdId)).first();
  if (!connection || connection.status !== "CONNECTED" || connection.switchedOff || !connection.tokenCiphertext) return null;
  const now = Date.now();
  const runId = await ctx.db.insert("agentRuns", {
    agentId,
    triggerType: "EVENT",
    objective: `Collect ${site.host}'s Microsoft Clarity figures: each day Clarity still holds that is not kept yet, by page and device and by device; yesterday's sources and browsers; and a few recordings worth watching.`,
    title: `Microsoft Clarity: ${site.host}`,
    status: "QUEUED",
    companyId: site.companyId,
    startedAt: now,
    updatedAt: now,
  });
  const workflowExecutionId = await ctx.db.insert("workflowExecutions", { agentId, agentRunId: runId, triggerType: "EVENT", status: "RUNNING", startedAt: now });
  await ctx.db.patch(connection._id, { collecting: { runId, at: now } });
  await ctx.scheduler.runAfter(delayMs, internal.clarityAgentRun.collectClaritySite, { runId, workflowExecutionId, ...site });
  return runId;
}

export const startSiteRun = internalMutation({
  args: { parentRunId: v.id("agentRuns"), holdId: v.id("companyWebsites"), companyId: v.id("companies"), host: v.string(), delayMs: v.number() },
  returns: v.union(v.id("agentRuns"), v.null()),
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parentRunId);
    if (!parent) return null;
    const { parentRunId: _parent, delayMs, ...site } = args;
    return await beginSiteRun(ctx, parent.agentId, site, delayMs);
  },
});

/**
 * A newly connected website's first collection (CC6), started at once as a run
 * of the Collector for that website alone — the agent and its schedule made
 * first if this is the first website to connect Clarity. Switched off,
 * nothing starts, and the run's absence is the switch's doing.
 */
export const startFirstCollection = internalMutation({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.literal("STARTED"), v.literal("AGENT_OFF"), v.literal("NOT_READY")),
  handler: async (ctx, args) => {
    const agentId = await ensureClarityCollector(ctx);
    const agent = await ctx.db.get(agentId);
    if (agent?.isActive === false) return "AGENT_OFF";
    const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    if (!connection) return "NOT_READY";
    const started = await beginSiteRun(ctx, agentId, { holdId: args.holdId, companyId: connection.companyId, host: await hostOf(ctx, args.holdId) }, 0);
    return started ? "STARTED" : "NOT_READY";
  },
});

/** What a website's run needs before it asks: its token, the newest day held, and today's asks. */
export const sitePlan = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.object({ ciphertext: v.union(v.string(), v.null()), newestDay: v.union(v.string(), v.null()), asksUsed: v.number() }),
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    const usable = connection?.status === "CONNECTED" && !connection.switchedOff && connection.tokenCiphertext;
    return { ciphertext: usable ? connection.tokenCiphertext : null, newestDay: connection?.newestDay ?? null, asksUsed: connection ? asksUsed(connection) : 0 };
  },
});

/**
 * Asks taken for today before they are made (CC3): as many of `want` as leave
 * two in hand, in whole steps — a day is two asks, sources two, a recording
 * kind one — and counted at once, so two runs can never spend the same asks.
 */
export const takeAsks = internalMutation({
  args: { holdId: v.id("companyWebsites"), want: v.number(), step: v.optional(v.number()) },
  returns: v.object({ granted: v.number(), used: v.number() }),
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    if (!connection) return { granted: 0, used: 0 };
    const used = asksUsed(connection);
    const step = Math.max(1, args.step ?? CLARITY_DAY_ASKS);
    const free = Math.max(0, CLARITY_ASKS_A_DAY - CLARITY_ASKS_IN_HAND - used);
    const granted = Math.min(args.want - (args.want % step), free - (free % step));
    if (granted > 0) await ctx.db.patch(connection._id, { asks: { day: today(), used: used + granted } });
    return { granted, used: used + granted };
  },
});

/** An ask made outside a run — connecting's test — counted too; or, when Clarity says the day's asks are spent, the day marked spent. */
export const countAsks = internalMutation({
  args: { holdId: v.id("companyWebsites"), asks: v.optional(v.number()), spent: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    if (!connection) return null;
    const used = args.spent ? CLARITY_ASKS_A_DAY : Math.min(CLARITY_ASKS_A_DAY, asksUsed(connection) + (args.asks ?? 0));
    await ctx.db.patch(connection._id, { asks: { day: today(), used } });
    return null;
  },
});

/**
 * Clarity refused the token (CC5): the connection marked Needs connecting
 * again, with Clarity's words, and the company's admins told in the bell —
 * once, as it changes, never each morning after.
 */
export const noteRefused = internalMutation({
  args: { holdId: v.id("companyWebsites"), problem: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    if (!connection) return 0;
    const already = connection.status === "NEEDS_RECONNECT";
    await ctx.db.patch(connection._id, { status: "NEEDS_RECONNECT", problem: args.problem, updatedAt: Date.now() });
    if (already) return 0;
    const host = await hostOf(ctx, args.holdId);
    const admins = (await ctx.db.query("users").withIndex("by_company", (q) => q.eq("companyId", connection.companyId)).take(ADMINS_TOLD * 5))
      .filter((user) => user.role === "ADMIN")
      .slice(0, ADMINS_TOLD);
    for (const admin of admins) {
      await ctx.scheduler.runAfter(0, internal.notifications.notifyUserInternal, {
        userId: admin._id,
        companyId: connection.companyId,
        kind: "CLARITY_NEEDS_RECONNECT",
        title: `Microsoft Clarity stopped collecting for ${host}`,
        body: `${args.problem} Paste a new Data Export token on the Connection page and collecting starts again.`,
        href: `/app/clarity/${args.holdId}/connection`,
      });
    }
    return admins.length;
  },
});

/** The run's hold on its website let go. */
export const doneCollecting = internalMutation({
  args: { holdId: v.id("companyWebsites"), runId: v.id("agentRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    if (connection?.collecting?.runId === args.runId) await ctx.db.patch(connection._id, { collecting: undefined });
    return null;
  },
});

const dayName = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
const sum = (rows: readonly ClarityTotalsRow[], figure: "visits" | "bots") => rows.reduce((total, row) => total + row[figure], 0);

type SplitAnswer = { site: ClarityTotalsRow[]; pages: ClarityTotalsRow[]; cut?: boolean };

/** A recording kind's words in the run's log. */
const RECORDING_WORDS: Record<ClarityRecordingKind, string> = {
  ERRORS: "visits that hit a JavaScript error",
  ERROR_CLICKS: "clicks that set off an error",
  RAGE: "rage clicks",
  DEAD: "dead clicks",
  QUICK_BACK: "visits that went straight back",
  LONGEST: "the longest visits",
};

/**
 * The kinds of recording worth asking for, in order: what yesterday's figures
 * say happened — an error, a failed click, a rage or dead click, a quick
 * return — then the longest visits. A kind nothing happened in is never asked.
 */
export function recordingKinds(site: readonly ClarityTotalsRow[]): ClarityRecordingKind[] {
  const total = (figure: "errors" | "errorClicks" | "rage" | "dead" | "quickBack") => site.reduce((sum, row) => sum + row[figure], 0);
  const happened: Array<[ClarityRecordingKind, number]> = [["ERRORS", total("errors")], ["ERROR_CLICKS", total("errorClicks")], ["RAGE", total("rage")], ["DEAD", total("dead")], ["QUICK_BACK", total("quickBack")]];
  return [...happened.filter(([, count]) => count > 0).map(([kind]) => kind), "LONGEST"];
}

/** Yesterday's sources and browsers, as kept: a line for the run's log. */
function splitLine(splits: { sources?: SplitAnswer; browsers?: SplitAnswer }): string {
  const named = (rows: readonly ClarityTotalsRow[]) => new Set(rows.map((row) => row.split)).size;
  const parts = [
    ...(splits.sources ? [`${named(splits.sources.site)} sources`] : []),
    ...(splits.browsers ? [`${named(splits.browsers.site)} browsers`] : []),
  ];
  return `Yesterday's visits by ${parts.join(" and ")}, across the website and by page.`;
}

/** What one website's days were, as kept: a line for its run's log. */
function dayLine(day: string, pages: readonly ClarityTotalsRow[], site: readonly ClarityTotalsRow[], workedOut: boolean): string {
  const pageCount = new Set(pages.map((row) => row.page)).size;
  return `${dayName(day)}: ${sum(site, "visits")} visits by people (${sum(site, "bots")} by bots, left out), ${pageCount} ${pageCount === 1 ? "page" : "pages"}${workedOut ? ", worked out from Clarity's days together less the days after it" : ""}.`;
}

/**
 * One website's collection: the days Clarity still holds that Hakken does not
 * — yesterday, and up to two mornings missed — asked as one, two or three days
 * together, each by page and device and by device, then each day kept as the
 * days together less the days after it.
 */
export const collectClaritySite = internalAction({
  args: { runId: v.id("agentRuns"), workflowExecutionId: v.id("workflowExecutions"), holdId: v.id("companyWebsites"), companyId: v.id("companies"), host: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const line = async (heading: string, detail: string, failed = false) =>
      await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading, detail, failed });
    const finish = async (status: "SUCCESS" | "FAILED", summary: string) => {
      await ctx.runMutation(internal.clarityAgentRun.doneCollecting, { holdId: args.holdId, runId: args.runId });
      await finishRun(ctx, args.runId, args.workflowExecutionId, status, summary);
    };
    await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    try {
      const plan = await ctx.runQuery(internal.clarityAgentRun.sitePlan, { holdId: args.holdId });
      if (!plan.ciphertext) {
        await finish("SUCCESS", `Not collected: ${args.host}'s Clarity is disconnected, needs connecting again, or is switched off on its Schedules page.`);
        return null;
      }
      // Clarity's "last day" is the 24 hours to now: filed as yesterday, the day it mostly covers.
      const yesterday = shiftDay(today(), -1);
      const oldestAskable = shiftDay(yesterday, -(CLARITY_DAYS_HELD - 1));
      const firstMissing = plan.newestDay ? shiftDay(plan.newestDay, 1) : yesterday;
      if (firstMissing > yesterday) {
        await finish("SUCCESS", `Already up to date: ${args.host}'s Clarity figures are kept to ${dayName(plan.newestDay!)}. Nothing was asked of Clarity.`);
        return null;
      }
      if (firstMissing < oldestAskable) {
        await line("Days past asking", `${dayName(firstMissing)} to ${dayName(shiftDay(oldestAskable, -1))} can't be asked for: Clarity keeps only its last three days. They stay as missing days, never as nought.`);
      }
      const missing = daysBetween(firstMissing < oldestAskable ? oldestAskable : firstMissing, yesterday) + 1;
      const taken = await ctx.runMutation(internal.clarityAgentRun.takeAsks, { holdId: args.holdId, want: missing * 2 });
      const windows = taken.granted / 2;
      if (windows === 0) {
        await finish("SUCCESS", `Not collected now: ${taken.used} of Clarity's ${CLARITY_ASKS_A_DAY} asks for today are used, and ${CLARITY_ASKS_IN_HAND} are kept in hand. The next morning collects.`);
        return null;
      }
      if (windows < missing) await line("Asks for today", `Only ${windows} of the ${missing} days missing can be asked today, keeping ${CLARITY_ASKS_IN_HAND} of Clarity's ${CLARITY_ASKS_A_DAY} asks in hand: the newest first.`);
      const token = await decryptConnectorToken(plan.ciphertext);
      const failedWith = async (failed: { status: number; problem: string }) => {
        if (failed.status === 401 || failed.status === 403) {
          const told = await ctx.runMutation(internal.clarityAgentRun.noteRefused, { holdId: args.holdId, problem: failed.problem });
          await line("Clarity refused the token", `${failed.problem}${told > 0 ? ` ${told === 1 ? "The company's admin was" : `The company's ${told} admins were`} told in the bell.` : ""}`, true);
        } else if (failed.status === 429) {
          await ctx.runMutation(internal.clarityAgentRun.countAsks, { holdId: args.holdId, spent: true });
          await line("Clarity's asks for today are spent", failed.problem, true);
        } else {
          await line("Clarity didn't answer", failed.problem, true);
        }
      };
      const answers: Array<{ pages: ClarityTotalsRow[]; site: ClarityTotalsRow[]; cut: boolean }> = [];
      let origin: string | null = null;
      for (let days = 1; days <= windows; days += 1) {
        const pages = await askClarity(token, "URL,Device", days);
        const site = pages.ok ? await askClarity(token, "Device", days) : pages;
        if (!pages.ok || !site.ok) {
          const failed = !pages.ok ? pages : site.ok ? null : site;
          await failedWith(failed ?? { status: 0, problem: "Clarity did not answer." });
          await finish("FAILED", `${args.host}: ${failed?.problem ?? "Clarity did not answer."}`);
          return null;
        }
        origin ??= pages.origin;
        answers.push({ pages: pages.rows, site: site.rows, cut: pages.cut });
      }
      // A large website (agents-and-clarity-plan.md, "Large websites"): its pages by device came back cut at Clarity's
      // 1,000 rows — its busiest few hundred pages — so yesterday's are asked again by page alone, for its busiest 1,000.
      if (answers[0].cut) {
        const shown = new Set(answers[0].pages.map((row) => row.page)).size;
        const extra = await ctx.runMutation(internal.clarityAgentRun.takeAsks, { holdId: args.holdId, want: 1, step: 1 });
        const alone = extra.granted === 1 ? await askClarity(token, "URL", 1) : null;
        if (alone?.ok) {
          answers[0] = { ...answers[0], pages: withUnsplitPages(answers[0].pages, alone.rows), cut: alone.cut };
          const kept = new Set(answers[0].pages.map((row) => row.page)).size;
          await line("Pages", `Clarity sent its busiest ${CLARITY_ROWS_AN_ANSWER} rows by page and device, ${shown} pages, so yesterday's pages were asked again without their devices: ${kept} pages kept${alone.cut ? `. That list was cut at ${CLARITY_ROWS_AN_ANSWER} too, so quieter pages are missing` : ""}.`);
        } else if (alone) {
          await failedWith(alone);
        } else {
          await line("Pages", `Clarity sent its busiest ${CLARITY_ROWS_AN_ANSWER} rows by page and device, ${shown} pages; no ask was left to ask again without their devices, so quieter pages are missing.`);
        }
      }
      // Yesterday's sources and browsers, with the asks left: the website's and by page, two asks each.
      const splitsTaken = await ctx.runMutation(internal.clarityAgentRun.takeAsks, { holdId: args.holdId, want: 2 * CLARITY_SPLIT_ASKS, step: CLARITY_SPLIT_ASKS });
      const splits: { sources?: SplitAnswer; browsers?: SplitAnswer } = {};
      const splitAsks: Array<["sources" | "browsers", ClarityAsk, ClarityAsk]> = [["sources", "Device,Source", "URL,Device,Source"], ["browsers", "Browser,Device", "URL,Browser,Device"]];
      let splitFailed = false;
      for (const [name, wholeAsk, pageAsk] of splitAsks.slice(0, splitsTaken.granted / CLARITY_SPLIT_ASKS)) {
        const site = await askClarity(token, wholeAsk, 1);
        const pages = site.ok ? await askClarity(token, pageAsk, 1) : site;
        if (!site.ok || !pages.ok) {
          const failed = !site.ok ? site : !pages.ok ? pages : null;
          if (failed) await failedWith(failed);
          splitFailed = true;
          if (failed && (failed.status === 401 || failed.status === 403 || failed.status === 429)) break;
          continue;
        }
        splits[name] = { site: site.rows, pages: pages.rows, ...(pages.cut ? { cut: true } : {}) };
      }
      if (splitsTaken.granted < 2 * CLARITY_SPLIT_ASKS) {
        await line("Sources and browsers", splitsTaken.granted === 0
          ? `Not asked today: the days missing took the asks, keeping ${CLARITY_ASKS_IN_HAND} of Clarity's ${CLARITY_ASKS_A_DAY} in hand. Yesterday has its own figures; where visitors came from and their browsers start again tomorrow.`
          : `Only the sources asked today, keeping ${CLARITY_ASKS_IN_HAND} of Clarity's ${CLARITY_ASKS_A_DAY} asks in hand: yesterday's browsers are left out.`);
      }
      // The oldest first, so each day is kept before the days after it.
      const kept: string[] = [];
      for (let days = windows; days >= 1; days -= 1) {
        const day = shiftDay(yesterday, -(days - 1));
        const longer = answers[days - 1];
        const shorter = days > 1 ? answers[days - 2] : null;
        const pages = shorter ? subtractTotalsRows(longer.pages, shorter.pages) : longer.pages;
        const site = shorter ? subtractTotalsRows(longer.site, shorter.site) : longer.site;
        await ctx.runMutation(internal.clarity.saveDay, {
          holdId: args.holdId,
          day,
          pages,
          site,
          // A day worked out from two cut answers is as cut as they were.
          ...(answers[days - 1].cut || (shorter?.cut ?? false) ? { pagesCut: true } : {}),
          ...(days === 1 ? splits : {}),
          ...(days === 1 && origin ? { origin } : {}),
          problem: null,
          refused: false,
        });
        await line(dayName(day), dayLine(day, pages, site, shorter !== null));
        kept.push(dayName(day));
      }
      if (splits.sources || splits.browsers) await line("Sources and browsers", splitLine(splits));
      // A few recordings worth watching, of what yesterday's figures say happened, with what is left of the asks.
      const kinds = recordingKinds(answers[0].site);
      const recordingsTaken = await ctx.runMutation(internal.clarityAgentRun.takeAsks, { holdId: args.holdId, want: Math.min(CLARITY_RECORDING_ASKS, kinds.length), step: 1 });
      const picked: ClarityRecording[] = [];
      const pickedKinds: ClarityRecordingKind[] = [];
      const end = Date.now();
      for (const kind of kinds.slice(0, recordingsTaken.granted)) {
        const answer = await askRecordings(token, kind, { start: end - DAY_MS, end }, CLARITY_RECORDINGS_A_KIND);
        if (!answer.ok) {
          await line("Recordings", `Clarity didn't list the recordings: ${answer.problem}`, true);
          break;
        }
        picked.push(...answer.recordings);
        pickedKinds.push(kind);
      }
      if (pickedKinds.length > 0) {
        await ctx.runMutation(internal.clarity.saveRecordings, { holdId: args.holdId, day: yesterday, kinds: pickedKinds, recordings: picked });
        await line("Recordings", `${picked.length} ${picked.length === 1 ? "recording" : "recordings"} picked: ${pickedKinds.map((kind) => RECORDING_WORDS[kind]).join(", ")}.`);
      } else if (recordingsTaken.granted === 0) {
        await line("Recordings", `None picked today: the asks left are the ${CLARITY_ASKS_IN_HAND} kept in hand.`);
      }
      // Yesterday's own figures are kept whatever became of the sources, browsers and recordings: the run succeeded, and its log says what didn't.
      await finish(
        "SUCCESS",
        `Kept ${args.host}'s Clarity figures for ${kept.join(", ")}${splits.sources || splits.browsers ? ", with yesterday's sources and browsers" : ""}${picked.length > 0 ? ` and ${picked.length} recordings worth watching` : ""}.${splitFailed ? " Some of the sources or browsers couldn't be asked: the log says why." : ""} ${recordingsTaken.used} of Clarity's ${CLARITY_ASKS_A_DAY} asks used today, ${CLARITY_ASKS_IN_HAND} kept in hand.`,
      );
    } catch (error: unknown) {
      await finish("FAILED", failureSummary(error));
    }
    return null;
  },
});
