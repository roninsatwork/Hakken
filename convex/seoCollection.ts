import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  SEO_KEYWORD_CHECK_OPERATION,
  findSeoOperation,
  seoAiCitationParams,
  seoKeywordCheckParams,
  seoSiteOperationParams,
  seoSiteOperations,
  type SeoOperation,
} from "./dataForSeoRegistry";
import { aiCitationOperationId } from "./seoAiEngines";
import { DEFAULT_LOCATION_CODE, findSeoLocation } from "./utils/seoLocations";
import { MAX_PROMPTS_PER_WEBSITE } from "./utils/promptLimits";
import { buildSeoIdempotencyKey } from "./seoIdempotency";
import { finishSeoCycle } from "./seoCollectionQueue";
import { collectsEveryRun, everyDaysOf } from "./seoRunReports";
import { readSiteDataLimits } from "./companyDataLimits";
import { LIST_COUNT_DAYS, listPages, pagedListOf, pagedListParams } from "./sitePagedLists";
import { isWebsiteDue } from "./seoScheduleService";
import { collectedOnItsOwn, dueByCadence } from "./seoCollectionDue";
import { countingReads } from "./utils/countingReads";
import { isTrackedHold } from "./utils/websitePairing";
import { holdQuestions, holdSearches } from "./holdLists";
import {
  SEO_DUE_SPACING_MS,
  SEO_EXPANSION_PAGE,
  SEO_COMPETITORS_PER_WEBSITE,
  SEO_KEYWORD_CHECKS_PER_WEBSITE,
  SEO_MANUAL_FRESH_MS,
  SEO_MAX_SENDS_PER_CYCLE,
} from "./seoCollectionPolicy";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Writing the work list.
 *
 * The Planner opens a cycle for a company that is due and stops, and this is
 * what happens next: the company's websites are walked a page at a time and
 * every question worth asking becomes a row in the queue. Nothing here sends
 * anything. Sending is the workers' job in `seoCollectionActions.ts`, and the
 * split is deliberate — an agent run that fanned out its own sends could post
 * thousands of *paid* tasks and then die holding the only record of them.
 *
 * Two rules do most of the work.
 *
 * **Chunk, because a mutation is a transaction.** A company with thousands of
 * websites cannot be expanded in one mutation, so each page writes what it can,
 * remembers where it stopped, and reschedules itself. This is not an
 * optimisation; the single-transaction version simply fails at scale. A page
 * counts its reads and stops well inside what one transaction may make
 * (`PAGE_READ_BUDGET`), between two steps of a website if need be: one website
 * with a hundred rivals is more than one transaction can plan.
 *
 * **Reuse before buying.** One host is stored once and fetched once, so before
 * planning a send we ask whether somebody already holds a fresh enough answer.
 * If Acme pulled `rival.com` on Monday and Acme's rival comes round on
 * Wednesday, Wednesday gets a line pointing at Monday's pull and pays nothing.
 * "Fresh enough" is the asker's own schedule, judged by the same helper that
 * decides whether a website is due at all — a weekly watcher is perfectly
 * served by six-day-old data.
 */

/** What one page of expansion did, so the caller can decide what happens next. */
type ExpansionOutcome = {
  planned: number;
  reused: number;
  lastCursor: Id<"companyWebsites"> | null;
  /** The last website's creation time, which is where the next page starts. */
  lastCreatedAt: number | null;
  /** Steps of the website after the cursor already written: where the next page picks it up. */
  step: number;
  exhausted: boolean;
  cappedPlan: boolean;
};

export const expandSeoCycle = internalMutation({
  args: {
    cycleId: v.id("seoCollectionCycles"),
    cursor: v.optional(v.id("companyWebsites")),
    /**
     * When the cursor's row was created, so the next page starts after it in
     * the index even if that hold was removed in between. Absent, the cursor's
     * own row is read for it.
     */
    cursorCreatedAt: v.optional(v.number()),
    /** Steps of the website after the cursor that an earlier page already wrote. */
    step: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle || cycle.status !== "EXPANDING") return null;

    const schedule = await ctx.db
      .query("schedules")
      .withIndex("by_company_agent", (q) => q.eq("companyId", cycle.companyId))
      .first();

    const after = args.cursorCreatedAt
      ?? (args.cursor ? (await ctx.db.get(args.cursor))?._creationTime : undefined);
    const outcome = await expandPage(ctx, cycle, schedule, args.cursor, after, args.step ?? 0);

    const plannedCount = cycle.plannedCount + outcome.planned;
    const reusedCount = cycle.reusedCount + outcome.reused;

    if (outcome.cappedPlan) {
      // Stop where we are and keep every row already written. A capped cycle
      // that threw away its own work would collect nothing at all, which is a
      // worse answer to "you asked for more than your plan allows".
      await ctx.db.patch(args.cycleId, {
        status: "CAPPED_PLAN",
        plannedCount,
        reusedCount,
        cursor: outcome.lastCursor ?? cycle.cursor,
        cappedReason: `Planned ${plannedCount} pulls, which is this cycle's ceiling of ${SEO_MAX_SENDS_PER_CYCLE}.`,
      });
      return null;
    }

    if (!outcome.exhausted) {
      await ctx.db.patch(args.cycleId, {
        plannedCount,
        reusedCount,
        ...(outcome.lastCursor ? { cursor: outcome.lastCursor } : {}),
        // Where to pick up, and when it last moved: an expansion whose next
        // page never runs is restarted from here by the hourly check.
        ...(outcome.lastCreatedAt !== null ? { cursorCreatedAt: outcome.lastCreatedAt } : {}),
        cursorStep: outcome.step,
        expandedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.seoCollection.expandSeoCycle, {
        cycleId: args.cycleId,
        ...(outcome.lastCursor ? { cursor: outcome.lastCursor } : {}),
        ...(outcome.lastCreatedAt !== null ? { cursorCreatedAt: outcome.lastCreatedAt } : {}),
        ...(outcome.step > 0 ? { step: outcome.step } : {}),
      });
      return null;
    }

    await ctx.db.patch(args.cycleId, {
      ...(plannedCount > 0 ? { status: "SENDING" as const } : {}),
      plannedCount,
      reusedCount,
      cursor: outcome.lastCursor ?? cycle.cursor,
    });
    // A cycle served entirely by reuse closes here, finished the one way a
    // collection is: its report built — it had none, sending nothing
    // (reliability plan 2.5) — and its moves drawn from what it was served.
    if (plannedCount === 0) await finishSeoCycle(ctx, args.cycleId);
    return null;
  },
});


async function expandPage(
  txn: MutationCtx,
  cycle: Doc<"seoCollectionCycles">,
  schedule: Doc<"schedules"> | null,
  cursor: Id<"companyWebsites"> | undefined,
  cursorCreatedAt: number | undefined,
  startStep: number,
): Promise<ExpansionOutcome> {
  const { ctx, reads } = countingReads(txn);
  const now = new Date(cycle.startedAt);

  /*
    Read from where the last page stopped, in the index itself.

    Every index ends in `_creationTime`, so "after the cursor" is a range, not
    a filter. It read the company's first rows every time and sliced after the
    cursor in memory, which only worked while the cursor was among them: past
    the first page of a large company the cursor fell outside what was read,
    the slice came back short, and every website after roughly the hundred and
    second was never collected at all.
  */
  const page = await ctx.db
    .query("companyWebsites")
    .withIndex("by_company", (q) => cursorCreatedAt !== undefined
      ? q.eq("companyId", cycle.companyId).gt("_creationTime", cursorCreatedAt)
      : q.eq("companyId", cycle.companyId))
    .take(SEO_EXPANSION_PAGE + PAGE_SLACK);
  const websites = page.slice(0, SEO_EXPANSION_PAGE);

  let planned = 0;
  let reused = 0;
  // The last website finished: the next page starts after it.
  let lastCursor: Id<"companyWebsites"> | null = cursor ?? null;
  let lastCreatedAt: number | null = cursorCreatedAt ?? null;
  let sendIndex = cycle.plannedCount;
  const stopped = (step: number, cappedPlan = false): ExpansionOutcome =>
    ({ planned, reused, lastCursor, lastCreatedAt, step, exhausted: false, cappedPlan });

  for (const [index, companyWebsite] of websites.entries()) {
    // An earlier page stopped inside this website: carry on from the step it reached.
    const resumeAt = index === 0 ? startStep : 0;
    if (resumeAt === 0 && reads() >= PAGE_READ_BUDGET) return stopped(0);

    const steps = await websiteSteps(ctx, cycle, schedule, companyWebsite, now, resumeAt > 0);
    for (let at = resumeAt; at < steps.length; at += 1) {
      // Stop between two steps rather than past what a transaction may read;
      // the next page begins this website again at this step.
      if (reads() >= PAGE_READ_BUDGET) return stopped(at);
      const room = SEO_MAX_SENDS_PER_CYCLE - cycle.plannedCount - planned;
      if (room <= 0) return stopped(at, true);
      const done = await steps[at](sendIndex, room);
      planned += done.planned;
      reused += done.reused;
      sendIndex += done.planned;
      if (done.capped) return stopped(at, true);
    }
    lastCursor = companyWebsite._id;
    lastCreatedAt = companyWebsite._creationTime;
  }

  // The bulk calls (`bulk_ranks`, `bulk_backlinks`, `bulk_referring_domains`)
  // are no longer bought: nothing had filed them since 2026-09-22, and the
  // screens take the same figures from `backlinks_summary`. Stopped at
  // Anthony's word, 2026-09-25 (collection reliability plan, 1.10).
  return {
    planned,
    reused,
    lastCursor,
    lastCreatedAt,
    step: 0,
    exhausted: page.length <= SEO_EXPANSION_PAGE,
    cappedPlan: false,
  };
}

/**
 * Reads one page of expansion makes at most, counted as they happen — each
 * get and each query run. Convex allows 4,096 a transaction; a page budgeted
 * on lines written instead made one read or four for each, and a company with
 * a few large websites passed the limit, failed every page and never finished
 * its work list (reliability plan 3.2). A step is checked for before it runs,
 * so the page ends a step past this at most — a paged list of a hundred pages
 * is the largest, well inside the room left.
 */
const PAGE_READ_BUDGET = 2_500;

/** One step of planning a website: what it planned and reused, and whether the cycle's ceiling stopped it. */
type PlanStep = (sendIndex: number, room: number) => Promise<{ planned: number; reused: number; capped?: boolean }>;

/**
 * A website's planning as steps, in the order they are always taken — its
 * questions, one step a question; its searches, one a search; then each of
 * its targets' calls, one a call — so a page can stop between any two and the
 * next pick up where it stopped. None when the website is not collected today.
 * `resuming` is a website an earlier page began: it was due then, and its own
 * lines from that page must not now make it look collected.
 */
async function websiteSteps(
  ctx: MutationCtx,
  cycle: Doc<"seoCollectionCycles">,
  schedule: Doc<"schedules"> | null,
  companyWebsite: Doc<"companyWebsites">,
  now: Date,
  resuming: boolean,
): Promise<PlanStep[]> {
  const resolved = await collectedOnItsOwn(ctx, schedule, companyWebsite, now);
  if (!resolved) return [];
  // How far apart this website's runs come: a call with its own cadence is
  // bought on the run nearest it (`heldByOwnCadence`).
  const runDays = everyDaysOf(resolved.intervalStr ?? undefined);

  // A website with its own slower schedule is not collected just because its
  // company's turn came round. Absence of an override is what makes a site
  // follow the company; presence is what makes it stop.
  //
  // Unless the Planner opened it as a manual collection: that is a request for today's
  // numbers, and a manual run that quietly skipped every site not yet due
  // planned nothing at all — the first live run on 2026-09-23 did exactly that.
  if (cycle.trigger !== "MANUAL" && !resuming
    && !await dueByCadence(ctx, cycle.companyId, schedule, companyWebsite, now)) return [];

  /*
    What this company has chosen to watch against this site, and nothing else.

    It read the host's competition graph for one commit on 2026-09-22, which
    meant a rivalry another company asserted decided what this one bought.
    That was wrong: who competes with whom is a fact about a market, and it is
    on the host for everyone to read; *what I watch* is my own list and it is
    the only thing that may spend my money. Anthony: *"If someone else adds
    ronins as competitor I don't care about that, that's up to them in their
    own company."*

    Bounded rather than collected: a website with more rivals than this is a
    plan question, not something one transaction should discover the hard way
    at the moment it runs out of room.
  */
  const tracked = isTrackedHold(companyWebsite)
    ? []
    : (await ctx.db
      .query("companyWebsites")
      .withIndex("by_company_against", (q) =>
        q.eq("companyId", cycle.companyId).eq("againstWebsiteId", companyWebsite.websiteId))
      .take(SEO_COMPETITORS_PER_WEBSITE))
      .filter(isTrackedHold);

  // A tracked site is collected at the rate of the one it is measured
  // against. Numbers from different weeks are not a comparison.
  const targets = [companyWebsite.websiteId, ...tracked.map((row) => row.websiteId)];
  // Each target's own hold, for the limits it may set for itself.
  const holdOf = new Map<Id<"websites">, Doc<"companyWebsites">>([
    [companyWebsite.websiteId, companyWebsite],
    ...tracked.map((row) => [row.websiteId, row] as [Id<"websites">, Doc<"companyWebsites">]),
  ]);

  // A company's own lists, for its own website only: a competitor has none
  // of its own (docs/plans/active/private-tracking-lists-plan.md, V8) — it is
  // named in the answers to the owned site's questions and found on the pages
  // of its searches.
  const steps: PlanStep[] = isTrackedHold(companyWebsite) ? [] : [
    // The questions this company asks the AI engines about its website.
    // Planned once per website, not per target: a competitor is named *in*
    // the answer, it is not asked its own question.
    ...await questionSteps(ctx, cycle, companyWebsite),
    // The searches on this company's list, checked from this watcher's place.
    // One page per search per place, shared by everyone who tracks it, and it
    // files a position for every known site on it — which is how a rival's
    // position for the same search arrives without a pull of its own.
    ...await searchSteps(ctx, cycle, companyWebsite),
  ];
  for (const websiteId of targets) {
    for (const operation of seoSiteOperations()) {
      // Every keyword and every link are as many requests as the
      // website's limit allows, not one (`sitePagedLists.ts`).
      if (pagedListOf(operation.id)) {
        steps.push(async (sendIndex) => await planPagedList(ctx, {
          cycle, schedule, companyWebsite, hold: holdOf.get(websiteId) ?? companyWebsite, websiteId, operation, sendIndex, now, runDays,
        }));
        continue;
      }
      steps.push(async (sendIndex) => {
        const result = await planPull(ctx, { cycle, schedule, companyWebsite, websiteId, operationId: operation.id, sendIndex, now, runDays });
        return { planned: result === "PLANNED" ? 1 : 0, reused: result === "REUSED" ? 1 : 0 };
      });
    }
  }
  return steps;
}

/**
 * A pull with this key that can still be used, re-opening one that was refused.
 *
 * Reuse must never hand back a failure as if it were an answer: a cycle that
 * found yesterday-style FAILED rows by key and pointed its lines at them would
 * be blocked from retrying for the rest of the day. So a failed pull is
 * re-opened in place — status back to pending, attempts and error cleared —
 * **but only when it never received a task id.** A refused request was never
 * charged and asking again is free; a submitted task was paid for, and
 * re-posting it is buying the same data twice, so that one is left alone and
 * the sweep fetches its result instead.
 */
async function reusableByKey(
  ctx: MutationCtx,
  idempotencyKey: string,
): Promise<Doc<"seoDataPulls"> | null> {
  // A sandbox answer is made up, so it is never served to a live run — the
  // switch can be flipped mid-day, and the key carries only the date.
  const existing = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
    .filter((q) => q.neq(q.field("sandbox"), true))
    .first();
  if (!existing) return null;
  if (existing.status !== "FAILED") return existing;
  if (existing.taskId) return existing;

  await ctx.db.patch(existing._id, {
    status: "PENDING",
    attempts: 0,
    error: undefined,
    dueAt: Date.now(),
    sentAt: undefined,
    // The refusal's completion time would otherwise outlive the refusal and
    // show as "when" on the screen for the retry.
    completedAt: undefined,
    claimedBy: undefined,
    claimedAt: undefined,
  });
  return { ...existing, status: "PENDING", error: undefined, completedAt: undefined };
}

/**
 * One paid call per question per engine, for one website — one step a question.
 *
 * The fourth cost shape, and the one the plan allowance meters. What makes it
 * affordable is the same trick as one row per host: the key is the question,
 * the engine and the place, so two companies asking the same thing in the same
 * place today buy one answer between them, and each reads its own citations
 * out of it through its own cycle line.
 *
 * Reuse here is by exact key only, never by freshness. A ranking is a fact
 * about a site that changes slowly; an AI answer is a fact about a day, and
 * yesterday's answer to "who is the best plumber" is not today's.
 *
 * Held to the cycle's ceiling like every other call: questions were the one
 * kind planned past it (reliability plan 3.2).
 */
async function questionSteps(
  ctx: MutationCtx,
  cycle: Doc<"seoCollectionCycles">,
  companyWebsite: Doc<"companyWebsites">,
): Promise<PlanStep[]> {
  /*
    This company's own questions (docs/plans/active/private-tracking-lists-plan.md):
    the list is the company's, and only its own list may spend its money. Two
    companies asking the same question still buy one answer — the key below
    carries the question and the place, never the list.

    It plans per company website rather than per host, because the *place* is
    the watcher's: the same question asked for Leeds and for London is two
    different purchases, and that is what the key carries.
  */
  const prompts = await holdQuestions(ctx, companyWebsite._id, MAX_PROMPTS_PER_WEBSITE, { activeOnly: true });

  const place = companyWebsite.locationCode !== undefined
    ? findSeoLocation(companyWebsite.locationCode)
    : null;
  const location = place ? { countryIso: place.countryIso, city: place.city } : null;

  return prompts.map((prompt) => async (startIndex: number, room: number) => {
    let planned = 0;
    let reused = 0;
    for (const engine of prompt.engines) {
      const operation = findSeoOperation(aiCitationOperationId(engine));
      if (!operation) continue;
      if (planned >= room) return { planned, reused, capped: true };

      const outcome = await planSharedPull(ctx, cycle, {
        operation,
        params: seoAiCitationParams(engine, prompt.prompt, location),
        // A question has no website of its own — the same question from two
        // companies is one purchase. The params carry the text and the place.
        sentinel: "prompt",
        websiteId: companyWebsite.websiteId,
        sendIndex: startIndex + planned,
      });
      if (outcome === "REUSED") reused += 1;
      else planned += 1;
    }
    return { planned, reused };
  });
}

/**
 * Check where every site ranks for the searches on this company's list for
 * the website — one step a search.
 *
 * The company's own list (docs/plans/active/private-tracking-lists-plan.md),
 * asked once between everyone tracking the same phrase from the same place:
 * the key carries the search and the place and no website or list, so two
 * companies — or two hosts — tracking one phrase in one town share the page,
 * and the parse files a position for every known site on it.
 *
 * Paused searches are not asked. Running out of the cycle's ceiling stops
 * here and says so, like every other planner.
 */
async function searchSteps(
  ctx: MutationCtx,
  cycle: Doc<"seoCollectionCycles">,
  companyWebsite: Doc<"companyWebsites">,
): Promise<PlanStep[]> {
  const operation = findSeoOperation(SEO_KEYWORD_CHECK_OPERATION);
  if (!operation) return [];

  const searches = await holdSearches(ctx, companyWebsite._id, SEO_KEYWORD_CHECKS_PER_WEBSITE, { activeOnly: true });

  return searches.map((search) => async (sendIndex: number) => {
    const outcome = await planSharedPull(ctx, cycle, {
      operation,
      params: seoKeywordCheckParams(search.keyword, { locationCode: companyWebsite.locationCode }),
      sentinel: "keyword",
      websiteId: companyWebsite.websiteId,
      sendIndex,
    });
    return outcome === "REUSED" ? { planned: 0, reused: 1 } : { planned: 1, reused: 0 };
  });
}

/**
 * One pull that belongs to no single website, and the line that files it.
 *
 * A question and a search are both asked once for everyone: the key carries
 * the text and the place and a sentinel instead of a website, so the same one
 * from two companies — or two hosts — is one purchase. The line records it
 * against the website whose cycle asked, so that site's history is complete.
 */
async function planSharedPull(
  ctx: MutationCtx,
  cycle: Doc<"seoCollectionCycles">,
  args: {
    operation: SeoOperation;
    params: Record<string, unknown>;
    sentinel: "prompt" | "keyword";
    websiteId: Id<"websites">;
    sendIndex: number;
  },
): Promise<"PLANNED" | "REUSED"> {
  const idempotencyKey = buildSeoIdempotencyKey({
    operationId: args.operation.id,
    websiteId: args.sentinel,
    params: args.params,
    cycleStartedAt: cycle.startedAt,
  });

  const existing = await reusableByKey(ctx, idempotencyKey);

  const pullId = existing?._id ?? await ctx.db.insert("seoDataPulls", {
    operationId: args.operation.id,
    family: args.operation.family,
    mode: args.operation.mode,
    companyId: cycle.companyId,
    taskArgsJson: JSON.stringify(args.params),
    status: "PENDING",
    tag: idempotencyKey,
    idempotencyKey,
    cycleId: cycle._id,
    dueAt: cycle.startedAt + args.sendIndex * SEO_DUE_SPACING_MS,
    attempts: 0,
    costUsd: 0,
    sandbox: false,
    ...(cycle.agentRunId ? { agentRunId: cycle.agentRunId } : {}),
    submittedAt: Date.now(),
  });

  await ctx.db.insert("seoCycleLines", {
    cycleId: cycle._id,
    companyId: cycle.companyId,
    websiteId: args.websiteId,
    operationId: args.operation.id,
    pullId,
    reused: Boolean(existing),
    createdAt: Date.now(),
  });

  return existing ? "REUSED" : "PLANNED";
}

/**
 * Read one more row than the page needs, so "is there another page" is known
 * without a second query.
 */
const PAGE_SLACK = 1;


/**
 * The reuse ladder, in the order money is saved.
 *
 * 1. A finished pull this asker would still call fresh. Costs nothing.
 * 2. A pull already on its way for the same question today. Costs nothing, and
 *    catches two companies whose cycles land in the same hour.
 * 3. Otherwise, plan one.
 *
 * Rungs one and two are matched differently on purpose. Freshness has to look
 * across days — Monday's answer serves Wednesday's asker — so it is found by
 * website and operation and then judged by the asker's own schedule. An
 * in-flight duplicate is only ever *today's*, so it is found by the exact
 * idempotency key, which carries the date.
 */
async function planPull(
  ctx: MutationCtx,
  args: {
    cycle: Doc<"seoCollectionCycles">;
    schedule: Doc<"schedules"> | null;
    companyWebsite: Doc<"companyWebsites">;
    websiteId: Id<"websites">;
    operationId: string;
    sendIndex: number;
    now: Date;
    /** How far apart this website's runs come, in days. */
    runDays: number;
  },
): Promise<"REUSED" | "PLANNED" | "SKIPPED"> {
  const operation = findSeoOperation(args.operationId);
  if (!operation) return "SKIPPED";

  const website = await ctx.db.get(args.websiteId);
  if (!website) return "SKIPPED";

  // Asked from the watcher's place. For a rival that is the place of the site
  // it is compared with, which is the hold being walked — the same place on
  // the same day, or the two are not a comparison.
  const params = seoSiteOperationParams(operation, website.host, {
    locationCode: args.companyWebsite.locationCode,
  });
  // A call with its own cadence — a weekly or monthly link list — is held for
  // that long whatever this cycle's own cadence, a manual one included: a
  // week-old list is this week's list. The same call, asked the same way.
  const held = await heldByOwnCadence(ctx, operation, args.websiteId, args.now, JSON.stringify(params), args.runDays);
  if (held) {
    await writeLine(ctx, args, held, true);
    return "REUSED";
  }

  const idempotencyKey = buildSeoIdempotencyKey({
    operationId: operation.id,
    websiteId: args.websiteId,
    params,
    cycleStartedAt: args.cycle.startedAt,
  });

  const fresh = await findFreshPull(ctx, { ...args, taskArgsJson: JSON.stringify(params) });
  if (fresh) {
    await writeLine(ctx, args, fresh._id, true);
    return "REUSED";
  }

  const inFlight = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
    .filter((q) =>
      q.or(
        q.eq(q.field("status"), "PENDING"),
        q.eq(q.field("status"), "CLAIMED"),
        q.eq(q.field("status"), "SUBMITTED"),
      ))
    .first();
  if (inFlight) {
    await writeLine(ctx, args, inFlight._id, true);
    return "REUSED";
  }

  const pullId = await ctx.db.insert("seoDataPulls", {
    operationId: operation.id,
    family: operation.family,
    mode: operation.mode,
    target: website.host,
    websiteId: args.websiteId,
    companyId: args.cycle.companyId,
    taskArgsJson: JSON.stringify(params),
    status: "PENDING",
    tag: idempotencyKey,
    idempotencyKey,
    cycleId: args.cycle._id,
    // Spread across the cycle rather than fired together. One line, and it is
    // the whole of this pipeline's rate limiting and tenant fairness.
    dueAt: args.cycle.startedAt + args.sendIndex * SEO_DUE_SPACING_MS,
    attempts: 0,
    costUsd: 0,
    sandbox: false,
    agentRunId: args.cycle.agentRunId,
    submittedAt: Date.now(),
  });

  await writeLine(ctx, args, pullId, false);
  return "PLANNED";
}

/**
 * A website's long list for this cycle — every keyword, or every link: nothing
 * when its limit (its own, else its company's) is no more than an everyday
 * call already brings, the week's list when one is held or on its way, and
 * otherwise a request per thousand rows up to the limit — as many as the
 * site's last count says it has, or the first alone when that is not known
 * yet (`listPages` and `queueListPages` in `sitePagedLists.ts`).
 */
async function planPagedList(
  ctx: MutationCtx,
  args: {
    cycle: Doc<"seoCollectionCycles">;
    schedule: Doc<"schedules"> | null;
    /** The hold being walked, whose place a rival is asked from. */
    companyWebsite: Doc<"companyWebsites">;
    /** The target's own hold, whose limit it keeps — the walked hold, or a rival's. */
    hold: Doc<"companyWebsites">;
    websiteId: Id<"websites">;
    operation: SeoOperation;
    sendIndex: number;
    now: Date;
    /** How far apart this website's runs come, in days. */
    runDays: number;
  },
): Promise<{ planned: number; reused: number }> {
  const { operation } = args;
  const list = pagedListOf(operation.id);
  const website = await ctx.db.get(args.websiteId);
  if (!list || !website) return { planned: 0, reused: 0 };
  const limit = (await readSiteDataLimits(ctx, args.cycle.companyId, args.hold._id))[list.limit];
  if (limit <= list.coveredUpTo) return { planned: 0, reused: 0 };

  const lineArgs = { cycle: args.cycle, websiteId: args.websiteId, operationId: operation.id };
  const place = args.companyWebsite.locationCode ?? DEFAULT_LOCATION_CODE;
  const counted = (await ctx.db
    .query("siteDaySummaries")
    .withIndex("by_site_day", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", place))
    .order("desc")
    .take(LIST_COUNT_DAYS))
    .map((row) => row[list.count])
    .find((count): count is number => typeof count === "number") ?? null;

  let planned = 0;
  let reused = 0;
  for (const page of listPages(limit, counted)) {
    const params = pagedListParams(operation.id, website.host, args.companyWebsite.locationCode, page);
    if (!params) break;
    const idempotencyKey = buildSeoIdempotencyKey({
      operationId: operation.id,
      websiteId: args.websiteId,
      params,
      cycleStartedAt: args.cycle.startedAt,
    });
    // Each page is held on its own: this page, from this place, answered or on
    // its way inside the list's cadence. Held for the whole list, any page
    // bought by anyone stood for every page — another place's, or a company
    // with a smaller limit's — for a week (reliability plan 3.6). A sandbox
    // answer or a failure is never served.
    const held = await heldByOwnCadence(ctx, operation, args.websiteId, args.now, JSON.stringify(params), args.runDays)
      // Bought every run by this company, a page still fresh by its cadence —
      // today's, for another company; the last hour's, for a second press — is
      // shared as a single call's answer is (`findFreshPull`).
      ?? (await findFreshPull(ctx, { ...args, operationId: operation.id, taskArgsJson: JSON.stringify(params) }))?._id;
    if (held) {
      await writeLine(ctx, lineArgs, held, true);
      reused += 1;
      continue;
    }
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: operation.id,
      family: operation.family,
      mode: operation.mode,
      target: website.host,
      websiteId: args.websiteId,
      companyId: args.cycle.companyId,
      taskArgsJson: JSON.stringify(params),
      status: "PENDING",
      tag: idempotencyKey,
      idempotencyKey,
      cycleId: args.cycle._id,
      dueAt: args.cycle.startedAt + (args.sendIndex + planned) * SEO_DUE_SPACING_MS,
      attempts: 0,
      costUsd: 0,
      sandbox: false,
      agentRunId: args.cycle.agentRunId,
      submittedAt: Date.now(),
    });
    await writeLine(ctx, lineArgs, pullId, false);
    planned += 1;
  }
  return { planned, reused };
}

/**
 * The answer an operation with its own cadence is still held on: the newest
 * one bought for this website within `everyDays` — or one already on its way,
 * planned within that time and not yet sent or answered. Without the second,
 * a weekly list left unsent while the Collector was at its spending cap would
 * be planned again by the next day's cycle, and both would be bought. Null
 * for everything else, which the cycle's cadence decides.
 *
 * Also the ad hoc door's check (`requestSeoPull` in `seoTools.ts`), so an
 * agent cannot buy a weekly list daily.
 *
 * `taskArgsJson`, when given, is what would be sent: only the same call asked
 * the same way holds — from the same place, for the same page of a list.
 *
 * `runDays`, when given, is how far apart the asker's runs come. A company
 * that collects about as seldom as the call, or more seldom, buys it every run
 * (`collectsEveryRun`) — a monthly company's run is the full scan, however
 * soon after another it comes. Otherwise the answer holds only until it is
 * within half a run of due, so the call is bought on the run nearest its own
 * cadence (`repeatDays` in `seoRunReports.ts`). Held for its whole cadence, a weekly list was bought
 * every other week on a weekly schedule — the last one a few minutes short of
 * seven days old — and a monthly company's run skipped the crawl after every
 * month of thirty days or fewer (2026-09-25).
 */
export async function heldByOwnCadence(
  ctx: MutationCtx,
  operation: SeoOperation,
  websiteId: Id<"websites">,
  now: Date,
  taskArgsJson?: string,
  runDays?: number,
): Promise<Id<"seoDataPulls"> | null> {
  if (!operation.refresh) return null;
  // Bought every run: no answer holds, but one still on its way is shared.
  const everyRun = runDays !== undefined && collectsEveryRun(operation.refresh.everyDays, runDays);
  const window = (operation.refresh.everyDays - (runDays ?? 0) / 2) * DAY_MS;
  const recent = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_website_operation_submitted", (q) => q.eq("websiteId", websiteId).eq("operationId", operation.id))
    .order("desc")
    .take(PULLS_READ_FOR_HOLD);
  for (const pull of recent) {
    if (pull.sandbox === true || pull.status === "FAILED") continue;
    if (taskArgsJson !== undefined && pull.taskArgsJson !== taskArgsJson) continue;
    if (pull.status === "READY") {
      if (!everyRun && pull.completedAt !== undefined && now.getTime() - pull.completedAt < window) return pull._id;
      continue;
    }
    // Planned, claimed or sent, and not answered yet: on its way.
    if (everyRun || now.getTime() - pull.submittedAt < window) return pull._id;
  }
  return null;
}

const DAY_MS = 86_400_000;

/** A site's newest pulls of one operation read for the hold; failures in a row past this many are not a week. */
const PULLS_READ_FOR_HOLD = 50;

async function findFreshPull(
  ctx: MutationCtx,
  args: {
    cycle: Doc<"seoCollectionCycles">;
    schedule: Doc<"schedules"> | null;
    companyWebsite: Doc<"companyWebsites">;
    websiteId: Id<"websites">;
    operationId: string;
    /** What would be sent. A fresh answer to a different question is no answer. */
    taskArgsJson: string;
    now: Date;
  },
) {
  // Matched on the arguments as well as the operation, because the place is
  // in them: Leeds's rankings on Monday are not London's on Wednesday, however
  // fresh they are. Read by site *and* operation through the index, so the
  // scan never wades through a busy site's other operations to find this one.
  const recent = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_website_operation_submitted", (q) =>
      q.eq("websiteId", args.websiteId).eq("operationId", args.operationId))
    .order("desc")
    .filter((q) =>
      q.and(
        q.eq(q.field("status"), "READY"),
        q.eq(q.field("taskArgsJson"), args.taskArgsJson),
        // Made-up sandbox numbers are never somebody's fresh answer.
        q.neq(q.field("sandbox"), true),
      ))
    .first();

  if (!recent?.completedAt) return null;

  // A manual collection asks for today's numbers, so only an answer from the last
  // hour serves it — enough to stop a double press paying twice, and no more.
  if (args.cycle.trigger === "MANUAL") {
    return args.now.getTime() - recent.completedAt <= SEO_MANUAL_FRESH_MS ? recent : null;
  }

  // "Fresh enough" is the asker's own cadence, asked of the same helper that
  // decides whether a website is due at all. A weekly watcher handed six-day-old
  // numbers is being served correctly, not short-changed.
  const stale = isWebsiteDue(args.schedule, args.companyWebsite, recent.completedAt, args.now);
  return stale ? null : recent;
}

async function writeLine(
  ctx: MutationCtx,
  args: {
    cycle: Doc<"seoCollectionCycles">;
    websiteId: Id<"websites">;
    operationId: string;
  },
  pullId: Id<"seoDataPulls">,
  reused: boolean,
) {
  await ctx.db.insert("seoCycleLines", {
    cycleId: args.cycle._id,
    companyId: args.cycle.companyId,
    websiteId: args.websiteId,
    operationId: args.operationId,
    pullId,
    reused,
    createdAt: Date.now(),
  });
}
