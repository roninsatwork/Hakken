import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { failureSummary, lastMoved, ROLE_RUN_LIVE_MS } from "./roleRuns";
import { count, finishRun } from "./searchConsoleAgentRun";
import { accessTokenFor } from "./bingWebmasterConnect";
import { crawlDays, pageInfo, pageStats, queryStats, trafficDays, type BingFailure, type BingStatRow } from "./bingWebmasterApi";
import { bingKeywordPlaces } from "./bingWebmasterBook";
import { buildPeriods, DAYS_PER_WRITE, type CollectTarget } from "./bingWebmasterCollect";
import { encodePagesFromAction } from "./holdPageRefs";
import { addUpRows, byWeek, fingerprintRows, oldestWeekKept, packBingRows, pageNumberOf, type BingRow } from "./utils/bingWebmasterWeeks";

/**
 * The Bing Webmaster: Collector Agent's job (docs/plans/active/bing-webmaster-plan.md
 * §4.1, BW8): what an agent holding the role "Bing Webmaster Collector" does
 * when its schedule — "Bing Webmaster: Data Collection Scheduler", daily at
 * 04:00 local, Search Console's time — or Run starts it. Built as the Google
 * Analytics: Collector Agent is (`googleAnalyticsAgentRun.ts`).
 *
 * **A run of its own for each website** connected to Bing, a few seconds
 * apart. Each asks Bing for the website's days and how Bing read it, then its
 * keywords and pages, writing only the weeks that changed; when a new week
 * landed it builds the ready-made lists, with Google's figures beside them;
 * once a week it asks Bing about each money page. Free — Bing charges nothing
 * and no model is called — so every connected website every day.
 *
 * **A newly connected website starts at once** (§4.1): connecting starts a run
 * for that website alone (`startFirstCollection`).
 */

export const BING_WEBMASTER_ROLE = "BING_WEBMASTER_COLLECTOR";

/** The gap between websites' runs starting. */
const STAGGER_MS = 5_000;

/** A step's working time: what is left goes to a step of its own. */
const STEP_BUDGET_MS = 4 * 60_000;

/** The money pages are asked of Bing about once a week. */
const PAGES_EVERY_MS = 7 * 86_400_000 - 2 * 3_600_000;

/** The ready-made lists are rebuilt at least once a week, and whenever a new week of Bing's lands. */
const PERIODS_EVERY_MS = PAGES_EVERY_MS;

const CONNECTIONS_PER_READ = 500;

/** The stages of a website's run, in order. */
const STAGES = ["days", "keywords", "pages", "periods", "moneyPages", "finish"] as const;
type Stage = (typeof STAGES)[number];

type Site = { connectionId: Id<"bingConnections">; companyId: Id<"companies">; host: string; site: string };

function collectingNow(run: Doc<"agentRuns"> | null, now: number): boolean {
  return run !== null && (run.status === "QUEUED" || run.status === "RUNNING") && now - lastMoved(run) < ROLE_RUN_LIVE_MS;
}

/** Every website connected to Bing, the one longest since it was collected first. */
export const agentCollections = internalQuery({
  args: {},
  returns: v.array(v.object({ connectionId: v.id("bingConnections"), companyId: v.id("companies"), host: v.string(), site: v.string() })),
  handler: async (ctx) => {
    const connected: Doc<"bingConnections">[] = [];
    for (let after = 0; ;) {
      const page = await ctx.db
        .query("bingConnections")
        .withIndex("by_status", (q) => q.eq("status", "CONNECTED").gt("_creationTime", after))
        .take(CONNECTIONS_PER_READ);
      connected.push(...page);
      if (page.length < CONNECTIONS_PER_READ) break;
      after = page[page.length - 1]._creationTime;
    }
    const now = Date.now();
    const out: Site[] = [];
    for (const connection of connected.sort((left, right) => (left.lastCollectedAt ?? 0) - (right.lastCollectedAt ?? 0))) {
      // Switched off on the website's Schedules page: kept, not collected (website-schedules-plan.md, WS4).
      if (!connection.site || connection.clearing || connection.switchedOff) continue;
      if (connection.collecting && collectingNow(await ctx.db.get(connection.collecting.runId), now)) continue;
      const website = await ctx.db.get(connection.websiteId);
      out.push({ connectionId: connection._id, companyId: connection.companyId, host: website?.displayHost ?? website?.host ?? connection.site, site: connection.site });
    }
    return out;
  },
});

/** The run the schedule or Run starts: one run of its own for each connected website. */
export const runBingCollectorNow = internalAction({
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
      const sites: Site[] = await ctx.runQuery(internal.bingWebmasterAgentRun.agentCollections, {});
      if (sites.length === 0) {
        await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", "No website is connected to Bing Webmaster, so there was nothing to collect.");
        return null;
      }
      const hosts = sites.map((site) => site.host).join(", ");
      await ctx.runMutation(internal.roleRuns.recordObservation, {
        runId: args.runId,
        text: `${sites.length === 1 ? "1 website is" : `${sites.length} websites are`} connected to Bing Webmaster: ${hosts}. Each gets a run of its own.`,
      });
      for (const [index, site] of sites.entries()) {
        const started: Id<"agentRuns"> | null = await ctx.runMutation(internal.bingWebmasterAgentRun.startSiteRun, { parentRunId: args.runId, ...site, delayMs: index * STAGGER_MS });
        await ctx.runMutation(internal.roleRuns.logRunLine, {
          runId: args.runId,
          companyId: site.companyId,
          heading: site.host,
          detail: started ? "Its own run started." : "Not started: it was disconnected, or its figures are being cleared, meanwhile.",
          failed: false,
        });
      }
      await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", `Started a run of its own for ${sites.length === 1 ? "the 1 website" : `each of the ${sites.length} websites`} connected to Bing Webmaster: ${hosts}.`);
    } catch (error: unknown) {
      await finishRun(ctx, args.runId, args.workflowExecutionId, "FAILED", failureSummary(error));
    }
    return null;
  },
});

/** One website's run, under the agent, and its first step; null when it is no longer connected. */
async function beginSiteRun(ctx: MutationCtx, agentId: Id<"agents">, site: Site, delayMs: number): Promise<Id<"agentRuns"> | null> {
  const connection = await ctx.db.get(site.connectionId);
  if (!connection || connection.status !== "CONNECTED" || connection.site !== site.site || connection.clearing || connection.switchedOff) return null;
  const now = Date.now();
  const runId = await ctx.db.insert("agentRuns", {
    agentId,
    triggerType: "EVENT",
    objective: `Collect ${site.host}'s Bing Webmaster figures (${site.site}): its days and how Bing read it, then its keywords and pages, the ready-made lists when a new week has landed, and its money pages once a week.`,
    title: `Bing Webmaster: ${site.host}`,
    status: "QUEUED",
    companyId: site.companyId,
    startedAt: now,
    updatedAt: now,
  });
  const workflowExecutionId = await ctx.db.insert("workflowExecutions", { agentId, agentRunId: runId, triggerType: "EVENT", status: "RUNNING", startedAt: now });
  await ctx.db.patch(connection._id, { collecting: { runId, at: now } });
  await ctx.scheduler.runAfter(delayMs, internal.bingWebmasterAgentRun.collectSiteStep, {
    runId,
    workflowExecutionId,
    ...site,
    stage: 0,
    changedWeeks: 0,
    rows: 0,
    requests: 0,
    found: { newestDay: connection.newestDay ?? null, oldestDay: connection.oldestDay ?? null, newestWeek: connection.newestWeek ?? null, oldestWeek: connection.oldestWeek ?? null, periodsBuilt: false, pagesChecked: false },
  });
  return runId;
}

export const startSiteRun = internalMutation({
  args: {
    parentRunId: v.id("agentRuns"),
    connectionId: v.id("bingConnections"),
    companyId: v.id("companies"),
    host: v.string(),
    site: v.string(),
    delayMs: v.number(),
  },
  returns: v.union(v.id("agentRuns"), v.null()),
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parentRunId);
    if (!parent) return null;
    const { parentRunId: _parent, delayMs, ...site } = args;
    return await beginSiteRun(ctx, parent.agentId, site, delayMs);
  },
});

/**
 * A newly connected website's first collection, started at once as a run of
 * the Bing Webmaster: Collector Agent for that website alone. Without the
 * agent — not created yet, or switched off — nothing starts, and the website
 * waits for the agent's first run.
 */
export const startFirstCollection = internalMutation({
  args: { connectionId: v.id("bingConnections") },
  returns: v.union(v.literal("STARTED"), v.literal("NO_AGENT"), v.literal("AGENT_OFF"), v.literal("NOT_READY")),
  handler: async (ctx, args) => {
    const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", BING_WEBMASTER_ROLE)).first();
    if (!agent) return "NO_AGENT";
    if (agent.isActive === false) return "AGENT_OFF";
    const connection = await ctx.db.get(args.connectionId);
    if (!connection?.site) return "NOT_READY";
    const website = await ctx.db.get(connection.websiteId);
    const started = await beginSiteRun(ctx, agent._id, {
      connectionId: connection._id,
      companyId: connection.companyId,
      host: website?.displayHost ?? website?.host ?? connection.site,
      site: connection.site,
    }, 0);
    return started ? "STARTED" : "NOT_READY";
  },
});

/** Why a website's run stopped, in plain words. */
function stoppedBecause(problem: string, host: string): string {
  switch (problem) {
    case "REVOKED":
      return `Bing stopped letting the connected account read ${host}. Connect it again from its Bing Webmaster page.`;
    case "UNREADABLE":
      return `The stored Bing sign-in for ${host} can't be read any more. Connect it again from its Bing Webmaster page.`;
    case "NOT_CONFIGURED":
      return "Bing Webmaster isn't set up on this platform any more, so nothing can be collected.";
    case "NO_ACCESS":
      return `The account connected for ${host} can no longer read it in Bing Webmaster Tools. Connect it again from its Bing Webmaster page.`;
    case "BING_BUSY":
      return `Bing was too busy to answer for ${host}. Nothing is lost: the next run asks again.`;
    default:
      return `Bing answered ${host}'s asks with an error, so its run stopped: ${problem}. Nothing is lost: the next run asks again.`;
  }
}

/** Waits before asking again when Bing is busy or out of reach. */
const BUSY_WAITS_MS = [2_000, 8_000];

type Session = { ctx: ActionCtx; connectionId: Id<"bingConnections">; accessToken: string; requests: number };

/** One ask of Bing, renewing the key once when Bing refuses it and waiting when Bing is busy. */
async function ask<T>(session: Session, call: (accessToken: string) => Promise<({ ok: true } & T) | BingFailure>): Promise<({ ok: true } & T) | BingFailure> {
  let renewed = false;
  for (let attempt = 0; ; attempt += 1) {
    session.requests += 1;
    const answer = await call(session.accessToken);
    if (answer.ok) return answer;
    if (answer.reason === "EXPIRED" && !renewed) {
      const token = await accessTokenFor(session.ctx, session.connectionId, true);
      if (!token.ok) return answer;
      session.accessToken = token.accessToken;
      renewed = true;
      continue;
    }
    if ((answer.reason === "BUSY" || answer.reason === "UNREACHABLE") && attempt < BUSY_WAITS_MS.length) {
      await new Promise((done) => setTimeout(done, BUSY_WAITS_MS[attempt]));
      continue;
    }
    return answer;
  }
}

/** A week's rows by number: keywords by their place in the website's book, pages by their number. */
async function numberedWeeks(ctx: ActionCtx, holdId: Id<"companyWebsites">, list: "query" | "page", rows: readonly BingStatRow[]): Promise<Map<string, BingRow[]>> {
  const keys = [...new Set(rows.map((row) => row.key))];
  const numberOf = new Map<string, number>();
  if (list === "query") {
    for (const [keyword, place] of await bingKeywordPlaces(ctx, holdId, keys)) numberOf.set(keyword, place);
  } else {
    const refs = await encodePagesFromAction(ctx, holdId, keys);
    for (const [index, page] of keys.entries()) numberOf.set(page, pageNumberOf(refs[index]));
  }
  const weeks = new Map<string, BingRow[]>();
  for (const [week, weekRows] of byWeek(rows)) {
    weeks.set(week, addUpRows([weekRows.map((row) => ({
      key: numberOf.get(row.key)!,
      clicks: row.clicks,
      impressions: row.impressions,
      positionSum: (row.position ?? 0) * row.impressions,
    }))]));
  }
  return weeks;
}

/**
 * One step of a website's run, working through its stages until the step's
 * few minutes are up; what is left goes to the next step, an action of its own.
 */
export const collectSiteStep: ReturnType<typeof internalAction> = internalAction({
  args: {
    runId: v.id("agentRuns"),
    workflowExecutionId: v.id("workflowExecutions"),
    connectionId: v.id("bingConnections"),
    companyId: v.id("companies"),
    host: v.string(),
    site: v.string(),
    /** The next stage, as its place in `STAGES`. */
    stage: v.number(),
    /** Weeks written so far this run: a new week means the ready-made lists are built again. */
    changedWeeks: v.number(),
    rows: v.number(),
    requests: v.number(),
    /** How far the figures go, as found so far this run: written to the connection as the run finishes. */
    found: v.object({
      newestDay: v.union(v.string(), v.null()),
      oldestDay: v.union(v.string(), v.null()),
      newestWeek: v.union(v.string(), v.null()),
      oldestWeek: v.union(v.string(), v.null()),
      periodsBuilt: v.boolean(),
      pagesChecked: v.boolean(),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const finish = async (status: "SUCCESS" | "FAILED", summary: string) => {
      await ctx.runMutation(internal.bingWebmasterCollect.releaseRun, { connectionId: args.connectionId });
      await finishRun(ctx, args.runId, args.workflowExecutionId, status, summary);
    };
    const started = Date.now();
    if (args.stage === 0) await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    try {
      const target: CollectTarget | null = await ctx.runQuery(internal.bingWebmasterCollect.collectTarget, { connectionId: args.connectionId });
      if (!target || target.status !== "CONNECTED" || target.site !== args.site || target.clearing) {
        await finish("SUCCESS", `Nothing collected for ${args.host}: it was disconnected, or another site chosen, before its run finished.`);
        return null;
      }
      if (!target.owned) {
        await ctx.runMutation(internal.bingWebmasterConnect.noteProblem, { connectionId: args.connectionId, problem: "NOT_OWNED" });
        await finish("SUCCESS", `${args.host} is no longer one of the company's own websites, so it isn't collected.`);
        return null;
      }
      const token = await accessTokenFor(ctx, args.connectionId);
      if (!token.ok) {
        await finish("FAILED", stoppedBecause(token.problem, args.host));
        return null;
      }
      const session: Session = { ctx, connectionId: args.connectionId, accessToken: token.accessToken, requests: 0 };
      const holdId: Id<"companyWebsites"> = target.holdId;
      let stage = args.stage;
      let changedWeeks = args.changedWeeks;
      let rows = args.rows;
      const failed = async (answer: BingFailure, what: string) => {
        const problem = answer.reason === "ACCESS" ? "NO_ACCESS" : answer.reason === "BUSY" || answer.reason === "UNREACHABLE" ? "BING_BUSY" : null;
        if (problem) await ctx.runMutation(internal.bingWebmasterConnect.noteProblem, { connectionId: args.connectionId, problem });
        await finish("FAILED", problem ? stoppedBecause(problem, args.host) : `Bing refused ${what} for ${args.host}: ${answer.status} ${answer.detail}`.slice(0, 400));
        return null;
      };
      const log = (heading: string, detail: string) =>
        ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading, detail, failed: false });

      let { newestDay, oldestDay, newestWeek, oldestWeek, periodsBuilt, pagesChecked } = args.found;

      while (stage < STAGES.length && Date.now() - started < STEP_BUDGET_MS) {
        const name: Stage = STAGES[stage];
        if (name === "days") {
          const traffic = await ask(session, (accessToken) => trafficDays(accessToken, args.site));
          if (!traffic.ok) return await failed(traffic, "its daily clicks");
          const crawl = await ask(session, (accessToken) => crawlDays(accessToken, args.site));
          if (!crawl.ok) return await failed(crawl, "how it read the website");
          const byDay = new Map<string, { day: string; clicks?: number; impressions?: number; crawl?: Omit<(typeof crawl.days)[number], "day"> }>();
          for (const day of traffic.days) byDay.set(day.day, { day: day.day, clicks: day.clicks, impressions: day.impressions });
          for (const { day, ...figures } of crawl.days) byDay.set(day, { ...(byDay.get(day) ?? { day }), crawl: figures });
          const days = [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day));
          let written = 0;
          for (let start = 0; start < days.length; start += DAYS_PER_WRITE) {
            const wrote: number = await ctx.runMutation(internal.bingWebmasterCollect.writeDays, { holdId, days: days.slice(start, start + DAYS_PER_WRITE) });
            written += wrote;
          }
          const trafficDaysHeld = traffic.days.map((day) => day.day);
          if (trafficDaysHeld.length > 0) {
            newestDay = trafficDaysHeld[trafficDaysHeld.length - 1];
            oldestDay = oldestDay && oldestDay < trafficDaysHeld[0] ? oldestDay : trafficDaysHeld[0];
          }
          rows += days.length;
          await log("Days", `${count(traffic.days.length)} days of clicks and impressions and ${count(crawl.days.length)} of how Bing read the website; ${count(written)} new or changed.`);
        } else if (name === "keywords" || name === "pages") {
          const list = name === "keywords" ? "query" : "page";
          const answer = await ask(session, (accessToken) => (list === "query" ? queryStats(accessToken, args.site) : pageStats(accessToken, args.site)));
          if (!answer.ok) return await failed(answer, list === "query" ? "its keywords" : "its pages");
          const weeks = await numberedWeeks(ctx, holdId, list, answer.rows);
          const hashes: { week: string; hash: string }[] = await ctx.runQuery(internal.bingWebmasterCollect.weekHashes, { holdId, list });
          const held = new Map(hashes.map((entry) => [entry.week, entry.hash]));
          let written = 0;
          for (const [week, weekRows] of weeks) {
            const hash = await fingerprintRows(weekRows);
            if (held.get(week) === hash) continue;
            await ctx.runMutation(internal.bingWebmasterCollect.writeWeek, { holdId, list, week, hash, parts: packBingRows(weekRows) });
            written += 1;
          }
          const weekDays = [...weeks.keys()].sort();
          if (weekDays.length > 0) {
            const newest = weekDays[weekDays.length - 1];
            newestWeek = newestWeek && newestWeek > newest ? newestWeek : newest;
            oldestWeek = oldestWeek && oldestWeek < weekDays[0] ? oldestWeek : weekDays[0];
          }
          changedWeeks += written;
          rows += answer.rows.length;
          await log(list === "query" ? "Keywords" : "Pages", `${count(answer.rows.length)} rows over ${count(weeks.size)} of Bing's weeks; ${count(written)} weeks new or changed.`);
        } else if (name === "periods") {
          const due = changedWeeks > 0 || target.periodsAt === null || Date.now() - target.periodsAt > PERIODS_EVERY_MS;
          if (due && newestWeek) {
            const parts = await buildPeriods(ctx, holdId);
            periodsBuilt = true;
            await log("Ready-made lists", `The last week, 30 and 90 days, six months and a year, built from Bing's weeks with Google's figures beside them: ${count(parts)} parts.`);
          }
        } else if (name === "moneyPages") {
          const due = target.pagesCheckedAt === null || Date.now() - target.pagesCheckedAt > PAGES_EVERY_MS;
          if (due) {
            const pages: string[] = await ctx.runQuery(internal.bingWebmasterCollect.moneyPages, { holdId });
            const checks: { page: string; inIndex: boolean; lastRead: string | null; status: number | null }[] = [];
            for (const page of pages) {
              const address = page.startsWith("http") ? page : new URL(page, args.site).toString();
              const info: Awaited<ReturnType<typeof pageInfo>> = await ask(session, (accessToken) => pageInfo(accessToken, args.site, address));
              if (!info.ok) return await failed(info, `its page ${page}`);
              checks.push({ page, ...info.info });
            }
            await ctx.runMutation(internal.bingWebmasterCollect.savePageChecks, { holdId, checks });
            pagesChecked = true;
            await log("Money pages", `${count(checks.length)} money pages asked of Bing: ${count(checks.filter((check) => check.inIndex).length)} in its index.`);
          }
        } else {
          if (newestWeek) {
            for (let more = true; more;) {
              more = await ctx.runMutation(internal.bingWebmasterCollect.dropOldWeeks, { holdId, before: oldestWeekKept(newestWeek) });
            }
          }
          await ctx.runMutation(internal.bingWebmasterCollect.dropLive, { holdId });
          await ctx.runMutation(internal.bingWebmasterCollect.finishCollection, {
            connectionId: args.connectionId,
            site: args.site,
            newestDay,
            oldestDay,
            newestWeek,
            oldestWeek,
            periodsBuilt,
            pagesChecked,
          });
          await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS",
            `Collected ${args.host} from Bing: ${count(rows)} rows from ${count(args.requests + session.requests)} asks, ${count(changedWeeks)} weeks new or changed${periodsBuilt ? ", and the ready-made lists built again" : ""}.`);
          return null;
        }
        stage += 1;
      }
      // The step's few minutes are up: the rest in a step of its own, with what this one found.
      await ctx.scheduler.runAfter(0, internal.bingWebmasterAgentRun.collectSiteStep, {
        ...args,
        stage,
        changedWeeks,
        rows,
        requests: args.requests + session.requests,
        found: { newestDay, oldestDay, newestWeek, oldestWeek, periodsBuilt, pagesChecked },
      });
    } catch (error: unknown) {
      await finish("FAILED", failureSummary(error));
    }
    return null;
  },
});
