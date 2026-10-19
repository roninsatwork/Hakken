import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { holdQuestions, holdSearches } from "./holdLists";
import { holdProfileOf } from "./holdProfiles";
import { closeRoleRun, writeRunLine } from "./roleRuns";
import { spentToday } from "./seoCollectionLimits";
import { companyCollectionSchedule } from "./seoScheduleService";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import {
  AUTO_SETUP,
  AUTO_SETUP_STALL_MS,
  DEFAULT_DAY_CAP_USD,
  DEFAULT_RUN_CAP_USD,
  OWN_PAGES_READ,
  RIVALS_PER_STEP,
  SEARCHES_WRITTEN,
  WEB_SEARCHES_PER_RUN,
  ownPieces,
  rivalPieces,
  webSearchTopics,
} from "./utils/autoSetupAgent";
import { doingValidator } from "./autoSetupSchema";
import { readFanOutLimits } from "./fanOutLimits";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * Starting Auto Setup (docs/plans/active/auto-setup-plan.md, AS1–AS4, AS11):
 * the built-in agent, kept there; a company's run, started only from the Auto
 * Setup button on its Websites tab; what that tab shows of it; and the watch
 * that carries on a run whose step was lost. Nothing starts it by itself — no
 * schedule, and adding a company or a rival never does (AS3).
 *
 * A company's run is one agent run under the agent — its steps, log lines and
 * costs — and one row a company (`autoSetupRuns`) says how far it has got. It
 * works through the company's own websites one a step, then names its rivals,
 * and fills only the boxes still empty (AS4).
 */

type Reader = { db: QueryCtx["db"] };
type HoldId = Id<"companyWebsites">;

/** A company's websites read to find what is empty: more than any company holds today. */
const HOLDS_READ = 300;

/** Why Auto Setup can't start now, or ON. */
export type Readiness = "ON" | "AGENT_OFF" | "DAY_CAP";

/** The boxes of one of the company's own websites that are still empty. */
export type OwnGap = "names" | "profile" | "searches" | "questions" | "countries";

/** The Auto Setup agent, when it has been made. */
export async function findAutoSetup(ctx: Reader): Promise<Doc<"agents"> | null> {
  return await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", AUTO_SETUP.systemKey)).first();
}

/**
 * Idempotent: the agent, made once and kept in step, with no schedule. Made
 * with web search on, a spend cap per run and per day, and never waiting on a
 * person's approval, since it fills the platform's own boxes (AS1, AS2); a
 * person's later changes to those settings are never written over.
 */
export async function ensureAutoSetup(ctx: MutationCtx): Promise<Id<"agents">> {
  const now = Date.now();
  const definition = {
    name: AUTO_SETUP.name,
    description: AUTO_SETUP.description,
    systemPrompt: AUTO_SETUP.systemPrompt,
    standingObjective: AUTO_SETUP.standingObjective,
  };
  const existing = await findAutoSetup(ctx);
  if (existing) {
    if (Object.entries(definition).some(([key, value]) => existing[key as keyof typeof definition] !== value)) {
      await ctx.db.patch(existing._id, { ...definition, updatedAt: now });
    }
    return existing._id;
  }
  return await ctx.db.insert("agents", {
    ...definition,
    systemKey: AUTO_SETUP.systemKey,
    // The platform's model for agents, as its settings choose: it must be one that can search the web.
    modelId: "agent (resolved at run time)",
    modelSelectionMode: "inherit",
    thinkingMode: false,
    allowInternetAccess: true,
    autonomousToolExecution: true,
    maxCostUsd: DEFAULT_RUN_CAP_USD,
    maxDailyCostUsd: DEFAULT_DAY_CAP_USD,
    isActive: true,
    isGlobal: true,
    createdAt: now,
    updatedAt: now,
  });
}

export const ensureAutoSetupInternal = internalMutation({
  args: {},
  returns: v.id("agents"),
  handler: async (ctx) => await ensureAutoSetup(ctx),
});

/** Its ceiling a day: the agent's own, or $10 when its box is empty (AS2). */
export function dayCapOf(agent: Pick<Doc<"agents">, "maxDailyCostUsd"> | null): number {
  const set = agent?.maxDailyCostUsd;
  return typeof set === "number" && set > 0 ? set : DEFAULT_DAY_CAP_USD;
}

/** What Auto Setup's runs have spent today, and its ceiling a day. */
export async function dayBudget(ctx: Reader): Promise<{ spent: number; cap: number }> {
  const agent = await findAutoSetup(ctx);
  return { spent: agent ? await spentToday(ctx, agent._id) : 0, cap: dayCapOf(agent) };
}

async function readiness(ctx: Reader): Promise<Readiness> {
  const agent = await findAutoSetup(ctx);
  if (agent && agent.isActive === false) return "AGENT_OFF";
  const { spent, cap } = await dayBudget(ctx);
  return spent >= cap ? "DAY_CAP" : "ON";
}

/**
 * What is still empty for a company: each of its own websites with the boxes
 * it lacks, its rivals with no names, and whether the company's own
 * description and About are written. A website with nothing empty is left out.
 */
export async function setupWorkOf(ctx: Reader, companyId: Id<"companies">) {
  const company = await ctx.db.get(companyId);
  const holds = await ctx.db.query("companyWebsites").withIndex("by_company", (q) => q.eq("companyId", companyId)).take(HOLDS_READ);
  const hostOf = async (hold: Doc<"companyWebsites">) => {
    const website = await ctx.db.get(hold.websiteId);
    return website?.displayHost ?? website?.host ?? "";
  };
  const own: Array<{ hold: Doc<"companyWebsites">; host: string; gaps: OwnGap[] }> = [];
  const rivals: Array<{ hold: Doc<"companyWebsites">; host: string }> = [];
  for (const hold of holds) {
    const profile = await holdProfileOf(ctx, hold._id);
    if (isTrackedHold(hold)) {
      if ((profile?.brandNames ?? []).length === 0) rivals.push({ hold, host: await hostOf(hold) });
      continue;
    }
    const gaps: OwnGap[] = [];
    if ((profile?.brandNames ?? []).length === 0) gaps.push("names");
    if (!profile?.sector || !profile.marketLabel || !profile.businessDescription) gaps.push("profile");
    if ((await holdSearches(ctx, hold._id, 1)).length === 0) gaps.push("searches");
    if ((await holdQuestions(ctx, hold._id, 1)).length === 0) gaps.push("questions");
    if ((hold.searchConsoleCountries ?? []).length === 0) gaps.push("countries");
    own.push({ hold, host: await hostOf(hold), gaps });
  }
  const companyEmpty = Boolean(company) && (!company?.description || !company?.overview);
  // The company's description is written from its first own website, so that website is read even when its own boxes are full.
  const ownToDo = own.filter((site, index) => site.gaps.length > 0 || (companyEmpty && index === 0));
  return { company, own, ownToDo, rivals, companyEmpty };
}

/** The rivals one of the company's own websites is compared with: those set against it, and every rival when the company has one own website. */
export function comparedWith<T extends Pick<Doc<"companyWebsites">, "againstWebsiteId">>(rivalHolds: readonly T[], own: Pick<Doc<"companyWebsites">, "websiteId">, ownCount: number): T[] {
  return rivalHolds.filter((rival) => rival.againstWebsiteId === own.websiteId || (ownCount === 1 && !rival.againstWebsiteId));
}

/**
 * The pieces of work a run takes, for the page's bar: each own website's, as
 * `ownPieces` counts them — the company's description written with the first,
 * the run's web searches shared out in order — then the rivals' names.
 */
function runPieces(work: Awaited<ReturnType<typeof setupWorkOf>>, rivalHolds: readonly Doc<"companyWebsites">[], webSearches: number): number {
  let searchesLeft = webSearches;
  let companyEmpty = work.companyEmpty;
  let pieces = rivalPieces(work.rivals.length);
  for (const site of work.ownToDo) {
    pieces += ownPieces({ gaps: site.gaps, companyEmpty, rivals: comparedWith(rivalHolds, site.hold, work.own.length).length, webSearchesLeft: searchesLeft });
    searchesLeft -= Math.min(webSearchTopics(site.gaps), searchesLeft);
    companyEmpty = false;
  }
  return pieces;
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

const GAP_WORDS: Record<OwnGap, string> = {
  names: "names",
  profile: "profile",
  searches: "Google searches",
  questions: "AI questions",
  countries: "where it trades",
};

const list = (all: string[]) => (all.length <= 1 ? all.join("") : `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}`);

export type StartOutcome = "STARTED" | "GOING" | "NOTHING" | Exclude<Readiness, "ON">;

/**
 * A company's run, under the agent: its first step, and its row for the
 * Websites tab. A run still going is left to go; one whose last step was lost
 * is closed and a new one starts from what is still empty.
 */
export async function beginCompanyRun(ctx: MutationCtx, companyId: Id<"companies">, pressedBy: Id<"users"> | undefined): Promise<StartOutcome> {
  const ready = await readiness(ctx);
  if (ready !== "ON") return ready;
  const now = Date.now();
  const state = await ctx.db.query("autoSetupRuns").withIndex("by_company", (q) => q.eq("companyId", companyId)).first();
  if (state?.status === "WORKING" && now - state.lastStepAt < AUTO_SETUP_STALL_MS) return "GOING";
  const work = await setupWorkOf(ctx, companyId);
  if (!work.company || (work.ownToDo.length === 0 && work.rivals.length === 0)) return "NOTHING";
  if (state?.status === "WORKING" && state.agentRunId) {
    await closeRoleRun(ctx, { runId: state.agentRunId, status: "FAILED", summary: "Its last step was lost. A new run carries on from what is still empty." });
  }

  const agentId = await ensureAutoSetup(ctx);
  const name = work.company.name;
  const runId = await ctx.db.insert("agentRuns", {
    agentId,
    triggerType: "EVENT",
    objective: `Fill ${name}'s empty setup boxes: its own websites' names, profile, Google searches and AI questions, its description, and its rivals' names.`,
    title: `Auto Setup: ${name}`,
    status: "QUEUED",
    companyId,
    startedAt: now,
    updatedAt: now,
  });
  const workflowExecutionId = await ctx.db.insert("workflowExecutions", { agentId, agentRunId: runId, triggerType: "EVENT", status: "RUNNING", startedAt: now });
  const rivalHolds = (await ctx.db.query("companyWebsites").withIndex("by_company", (q) => q.eq("companyId", companyId)).take(HOLDS_READ)).filter(isTrackedHold);
  const sites = work.own.length + rivalHolds.length;
  const searchesAllowed = (await ctx.db.get(agentId))?.allowInternetAccess === false ? 0 : WEB_SEARCHES_PER_RUN;
  await writeRunLine(ctx, {
    runId,
    companyId,
    heading: "What there is to do",
    detail: [
      "Started from the Auto Setup button.",
      `${name} has ${count(sites, "website", "websites")}.`,
      ...work.ownToDo.filter((site) => site.gaps.length > 0).map((site) => `Empty on ${site.host}: ${list(site.gaps.map((gap) => GAP_WORDS[gap]))}.`),
      work.rivals.length > 0 ? `${count(work.rivals.length, "rival has", "rivals have")} no names.` : "",
      work.companyEmpty ? "The company's description or About is empty." : "",
      "Nothing a person wrote is changed, and collection is not switched on.",
    ].filter(Boolean).join(" "),
    failed: false,
  });
  const row = {
    companyId,
    status: "WORKING" as const,
    agentRunId: runId,
    workflowExecutionId,
    ...(pressedBy ? { pressedBy } : {}),
    total: work.ownToDo.length + work.rivals.length,
    done: 0,
    ownLeft: work.ownToDo.map((site) => site.hold._id),
    rivalsLeft: work.rivals.map((site) => site.hold._id),
    pieces: runPieces(work, rivalHolds, searchesAllowed),
    piecesDone: 0,
    doing: undefined,
    webSearches: 0,
    wrote: { ownNames: 0, profiles: 0, rivalNames: 0, rivalsKept: 0, searches: 0, questions: 0, company: false, countries: [] },
    startedAt: now,
    lastStepAt: now,
    finishedAt: undefined,
    report: undefined,
    stopped: undefined,
  };
  if (state) await ctx.db.replace(state._id, row);
  else await ctx.db.insert("autoSetupRuns", row);
  await ctx.scheduler.runAfter(0, internal.autoSetupRun.setupStep, { companyId, runId, workflowExecutionId });
  return "STARTED";
}

const startOutcome = v.union(v.literal("STARTED"), v.literal("GOING"), v.literal("NOTHING"), v.literal("AGENT_OFF"), v.literal("DAY_CAP"));

/** The Auto Setup button on the company's Websites tab: fill what is empty now. */
export const startAutoSetup = superAdminMutation({
  args: { companyId: v.id("companies") },
  returns: startOutcome,
  handler: async (ctx, args) => {
    if (!(await ctx.db.get(args.companyId))) throw appError("NOT_FOUND", "That company no longer exists.");
    const outcome = await beginCompanyRun(ctx, args.companyId, ctx.userId);
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "START_AUTO_SETUP",
      entityId: args.companyId,
      entityType: "companies",
      companyId: args.companyId,
      metadata: JSON.stringify({ outcome }),
      timestamp: Date.now(),
    });
    return outcome;
  },
});

const forPersonValidator = v.union(v.literal("COLLECTION"), v.literal("SEARCH_CONSOLE"), v.literal("ANALYTICS"), v.literal("COUNTRIES"));

/** One setup box on the Auto Setup page: empty, filled by a person, written by Hakken, being written now, or not one this row has. */
export type BoxState = "EMPTY" | "PERSON" | "HAKKEN" | "WRITING" | "NONE";
const boxValidator = v.union(v.literal("EMPTY"), v.literal("PERSON"), v.literal("HAKKEN"), v.literal("WRITING"), v.literal("NONE"));

const rowValidator = v.object({
  id: v.string(),
  kind: v.union(v.literal("COMPANY"), v.literal("OWN"), v.literal("RIVAL")),
  name: v.string(),
  /** A rival's: the company's own website it is compared with. */
  against: v.union(v.string(), v.null()),
  names: boxValidator,
  namesCount: v.number(),
  profile: boxValidator,
  searches: boxValidator,
  searchesCount: v.number(),
  questions: boxValidator,
  questionsCount: v.number(),
  countries: boxValidator,
});
type BoxRow = typeof rowValidator.type;

/** A website's searches and questions read to count those Auto Setup wrote: more than any website's limit allows. */
const LIST_ROWS_READ = 1_000;

/** Who filled a box: none yet, Hakken while its note stands, else a person; being written now when this run is on it. */
function boxOf(filled: boolean, byHakken: boolean, writing: boolean): BoxState {
  if (!filled) return writing ? "WRITING" : "EMPTY";
  return byHakken ? "HAKKEN" : "PERSON";
}

/**
 * Every setup box, a row for the company and one for each of its websites
 * (boards 1–3): who filled each, with how many names, searches and questions
 * Hakken wrote. The websites a working run is on now show their empty boxes as
 * being written.
 */
async function boxRowsOf(ctx: Reader, company: Doc<"companies">, writing: ReadonlySet<string>): Promise<BoxRow[]> {
  const holds = await ctx.db.query("companyWebsites").withIndex("by_company", (q) => q.eq("companyId", company._id)).take(HOLDS_READ);
  const hosts = new Map<string, string>();
  const hostOfWebsite = async (websiteId: Id<"websites">) => {
    if (!hosts.has(websiteId)) {
      const website = await ctx.db.get(websiteId);
      hosts.set(websiteId, website?.displayHost ?? website?.host ?? "");
    }
    return hosts.get(websiteId) ?? "";
  };
  const own = holds.filter((hold) => !isTrackedHold(hold));
  const rivals = holds.filter(isTrackedHold);
  const notes = company.hakkenWrote ?? {};
  const rows: BoxRow[] = [{
    id: company._id,
    kind: "COMPANY",
    name: company.name,
    against: null,
    names: "NONE",
    namesCount: 0,
    // The company's description is written with its first own website.
    profile: boxOf(Boolean(company.description && company.overview), Boolean(notes.description || notes.overview), own[0] !== undefined && writing.has(own[0]._id)),
    searches: "NONE",
    searchesCount: 0,
    questions: "NONE",
    questionsCount: 0,
    countries: "NONE",
  }];
  for (const hold of own) {
    const profile = await holdProfileOf(ctx, hold._id);
    const wrote = profile?.hakkenWrote ?? {};
    const now = writing.has(hold._id);
    const searches = await holdSearches(ctx, hold._id, LIST_ROWS_READ);
    const questions = await holdQuestions(ctx, hold._id, LIST_ROWS_READ);
    const searchesByHakken = searches.filter((row) => row.addedFrom === "AUTO_SETUP").length;
    const questionsByHakken = questions.filter((row) => row.addedFrom === "AUTO_SETUP").length;
    const names = profile?.brandNames ?? [];
    rows.push({
      id: hold._id,
      kind: "OWN",
      name: await hostOfWebsite(hold.websiteId),
      against: null,
      names: boxOf(names.length > 0, Boolean(wrote.brandNames), now),
      namesCount: wrote.brandNames ? names.length : 0,
      profile: boxOf(Boolean(profile?.sector && profile.marketLabel && profile.businessDescription), Boolean(wrote.sector || wrote.marketLabel || wrote.businessDescription), now),
      searches: boxOf(searches.length > 0, searchesByHakken > 0, now),
      searchesCount: searchesByHakken,
      questions: boxOf(questions.length > 0, questionsByHakken > 0, now),
      questionsCount: questionsByHakken,
      countries: boxOf((hold.searchConsoleCountries ?? []).length > 0, Boolean(hold.searchConsoleCountriesBy), now),
    });
  }
  for (const hold of rivals) {
    const profile = await holdProfileOf(ctx, hold._id);
    const names = profile?.brandNames ?? [];
    rows.push({
      id: hold._id,
      kind: "RIVAL",
      name: await hostOfWebsite(hold.websiteId),
      against: hold.againstWebsiteId ? await hostOfWebsite(hold.againstWebsiteId) : null,
      names: boxOf(names.length > 0, Boolean(profile?.hakkenWrote?.brandNames), writing.has(hold._id)),
      namesCount: profile?.hakkenWrote?.brandNames ? names.length : 0,
      profile: "NONE",
      searches: "NONE",
      searchesCount: 0,
      questions: "NONE",
      questionsCount: 0,
      countries: "NONE",
    });
  }
  return rows;
}

/**
 * What the Auto Setup page shows (boards 1–3): whether it can start, every
 * setup box and who filled it, what a run does and its limits, and its last
 * run — how far it has got, what it cost, and what is left for a person.
 */
export const autoSetupStatus = superAdminQuery({
  args: { companyId: v.id("companies") },
  returns: v.union(v.null(), v.object({
    readiness: v.union(v.literal("ON"), v.literal("AGENT_OFF"), v.literal("DAY_CAP")),
    /** The Auto Setup agent, for the way to a run's page in Agents. */
    agentId: v.union(v.id("agents"), v.null()),
    rows: v.array(rowValidator),
    /** What a run does at most, said before it is pressed (no hidden limits). */
    limits: v.object({ pages: v.number(), webSearches: v.number(), searches: v.number(), questions: v.number(), runCapUsd: v.number(), dayCapUsd: v.number() }),
    run: v.union(v.null(), v.object({
      status: v.union(v.literal("WORKING"), v.literal("DONE"), v.literal("STOPPED")),
      total: v.number(),
      done: v.number(),
      /** Pieces of work, for the bar: it moves with each, not only with each website. */
      pieces: v.number(),
      piecesDone: v.number(),
      /** What it is doing now, while it works. */
      doing: v.union(v.null(), v.object({ what: doingValidator, host: v.union(v.string(), v.null()), at: v.union(v.number(), v.null()), of: v.union(v.number(), v.null()) })),
      finishedAt: v.union(v.number(), v.null()),
      stopped: v.union(v.string(), v.null()),
      agentRunId: v.union(v.id("agentRuns"), v.null()),
      costUsd: v.number(),
      forPerson: v.array(forPersonValidator),
    })),
  })),
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) return null;
    const [ready, state, agent] = await Promise.all([
      readiness(ctx),
      ctx.db.query("autoSetupRuns").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).first(),
      findAutoSetup(ctx),
    ]);
    const writing = new Set<string>(state?.status === "WORKING" ? (state.ownLeft.length > 0 ? [state.ownLeft[0]] : state.rivalsLeft.slice(0, RIVALS_PER_STEP)) : []);
    const rows = await boxRowsOf(ctx, company, writing);
    const firstOwn = rows.find((row) => row.kind === "OWN");
    const { promptsPerSite } = await readFanOutLimits(ctx, args.companyId, firstOwn ? (firstOwn.id as Id<"companyWebsites">) : undefined);
    const run = state?.agentRunId ? await ctx.db.get(state.agentRunId) : null;
    const ownHolds = (await ctx.db.query("companyWebsites").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).take(HOLDS_READ)).filter((hold) => !isTrackedHold(hold));
    return {
      readiness: ready,
      agentId: agent?._id ?? null,
      rows,
      limits: {
        pages: OWN_PAGES_READ,
        webSearches: WEB_SEARCHES_PER_RUN,
        searches: SEARCHES_WRITTEN,
        questions: promptsPerSite,
        runCapUsd: typeof agent?.maxCostUsd === "number" && agent.maxCostUsd > 0 ? agent.maxCostUsd : DEFAULT_RUN_CAP_USD,
        dayCapUsd: dayCapOf(agent),
      },
      run: state
        ? {
          status: state.status,
          total: state.total,
          done: state.done,
          // A run started before pieces were counted moves its bar a website at a time.
          pieces: state.pieces ?? state.total,
          piecesDone: state.piecesDone ?? state.done,
          doing: state.status === "WORKING" && state.doing
            ? { what: state.doing.what, host: state.doing.host ?? null, at: state.doing.at ?? null, of: state.doing.of ?? null }
            : null,
          finishedAt: state.finishedAt ?? null,
          stopped: state.stopped ?? null,
          agentRunId: state.agentRunId ?? null,
          costUsd: run?.costUsd ?? 0,
          forPerson: state.status === "DONE" ? await forPersonOf(ctx, args.companyId, ownHolds, state.wrote.countries.length > 0) : [],
        }
        : null,
    };
  },
});

/**
 * What only a person can do, said at the end of a run (AS10): collection
 * switched on, Search Console and Google Analytics connected to its own
 * websites, and where it trades checked when Auto Setup chose it.
 */
export async function forPersonOf(
  ctx: Reader,
  companyId: Id<"companies">,
  own: Doc<"companyWebsites">[],
  wroteCountries: boolean,
): Promise<Array<"COLLECTION" | "SEARCH_CONSOLE" | "ANALYTICS" | "COUNTRIES">> {
  const schedule = await companyCollectionSchedule(ctx, companyId);
  const left: Array<"COLLECTION" | "SEARCH_CONSOLE" | "ANALYTICS" | "COUNTRIES"> = [];
  if (!schedule?.isActive) left.push("COLLECTION");
  const connected = async (table: "searchConsoleConnections" | "googleAnalyticsConnections", holdId: HoldId) =>
    (await ctx.db.query(table).withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).first())?.status === "CONNECTED";
  if (own.length > 0 && !(await Promise.all(own.map((hold) => connected("searchConsoleConnections", hold._id)))).every(Boolean)) left.push("SEARCH_CONSOLE");
  if (own.length > 0 && !(await Promise.all(own.map((hold) => connected("googleAnalyticsConnections", hold._id)))).every(Boolean)) left.push("ANALYTICS");
  if (wroteCountries) left.push("COUNTRIES");
  return left;
}

/**
 * Agents' Run Agent for Auto Setup (decision 1): it does nothing there, and
 * says where it starts — the Run button would otherwise set up every company
 * at once, spending on all of them.
 */
export const answerAgentsRun = internalMutation({
  args: { runId: v.id("agentRuns"), workflowExecutionId: v.id("workflowExecutions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await closeRoleRun(ctx, {
      runId: args.runId,
      workflowExecutionId: args.workflowExecutionId,
      status: "SUCCESS",
      summary: "Auto Setup starts from a company's Websites tab: one press there sets up that company's websites and rivals. Nothing was done here.",
    });
    return null;
  },
});

// ── The watch ──────────────────────────────────────────────────────────────

/** Runs looked at in one watch. */
const STALLED_READ = 20;

/** A company's run whose last step was lost carries on from where it was, saying so on its run. */
export const carryOnStalled = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const stalled = await ctx.db
      .query("autoSetupRuns")
      .withIndex("by_status_step", (q) => q.eq("status", "WORKING").lt("lastStepAt", now - AUTO_SETUP_STALL_MS))
      .take(STALLED_READ);
    for (const state of stalled) {
      if (!state.agentRunId) continue;
      await ctx.db.patch(state._id, { lastStepAt: now });
      await writeRunLine(ctx, { runId: state.agentRunId, companyId: state.companyId, heading: "Carried on", detail: "Its last step was lost, so it carries on from where it was.", failed: false });
      await ctx.scheduler.runAfter(0, internal.autoSetupRun.setupStep, {
        companyId: state.companyId,
        runId: state.agentRunId,
        ...(state.workflowExecutionId ? { workflowExecutionId: state.workflowExecutionId } : {}),
      });
    }
    return stalled.length;
  },
});

/** Every ten minutes: the agent kept there, and a run a person started whose step was lost carried on. It never starts a run. */
export const watchAutoSetup = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.runMutation(internal.autoSetupStart.ensureAutoSetupInternal, {});
    await ctx.runMutation(internal.autoSetupStart.carryOnStalled, {});
    return null;
  },
});

/** What Auto Setup's runs have spent today against its ceiling a day, read by each step before it spends (AS2). */
export const dayBudgetNow = internalQuery({
  args: {},
  returns: v.object({ spent: v.number(), cap: v.number() }),
  handler: async (ctx) => await dayBudget(ctx),
});
