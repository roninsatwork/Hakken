import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  SEO_KEYWORD_CHECK_OPERATION,
  findSeoOperation,
  seoAiCitationParams,
  seoBulkOperationParams,
  seoBulkOperations,
  seoKeywordCheckParams,
  seoSiteOperationParams,
  seoSiteOperations,
  type SeoOperation,
} from "./dataForSeoRegistry";
import { aiCitationOperationId } from "./seoAiEngines";
import { findSeoLocation } from "./utils/seoLocations";
import { MAX_PROMPTS_PER_WEBSITE } from "./utils/promptLimits";
import { buildSeoIdempotencyKey } from "./seoIdempotency";
import { isWebsiteDue, resolveWebsiteSchedule } from "./seoScheduleService";
import { isTrackedHold, pairedOwnedHold } from "./utils/websitePairing";
import {
  SEO_DUE_SPACING_MS,
  SEO_EXPANSION_PAGE,
  SEO_COMPETITORS_PER_WEBSITE,
  SEO_KEYWORD_CHECKS_PER_WEBSITE,
  SEO_MAX_SENDS_PER_CYCLE,
  SEO_PAGE_LINE_BUDGET,
} from "./seoCollectionPolicy";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Writing the work list.
 *
 * A schedule fires, the collecting agent opens a cycle and stops, and this is
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
 * optimisation; the single-transaction version simply fails at scale.
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
    const outcome = await expandPage(ctx, cycle, schedule, args.cursor, after);

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
      await startSending(ctx, args.cycleId, plannedCount);
      return null;
    }

    if (!outcome.exhausted && outcome.lastCursor) {
      await ctx.db.patch(args.cycleId, {
        plannedCount,
        reusedCount,
        cursor: outcome.lastCursor,
      });
      await ctx.scheduler.runAfter(0, internal.seoCollection.expandSeoCycle, {
        cycleId: args.cycleId,
        cursor: outcome.lastCursor,
        ...(outcome.lastCreatedAt !== null ? { cursorCreatedAt: outcome.lastCreatedAt } : {}),
      });
      return null;
    }

    await ctx.db.patch(args.cycleId, {
      status: plannedCount > 0 ? "SENDING" : "DONE",
      plannedCount,
      reusedCount,
      cursor: outcome.lastCursor ?? cycle.cursor,
      finishedAt: plannedCount > 0 ? undefined : Date.now(),
    });
    await startSending(ctx, args.cycleId, plannedCount);
    return null;
  },
});

async function startSending(
  ctx: MutationCtx,
  cycleId: Id<"seoCollectionCycles">,
  plannedCount: number,
) {
  // Nothing planned means nothing to drain. An empty queue must start no
  // chains at all — that is the whole reason this pipeline needs no
  // per-minute cron.
  if (plannedCount <= 0) return;
  await ctx.scheduler.runAfter(0, internal.seoCollectionActions.startSeoWorkers, { cycleId });
}

async function expandPage(
  ctx: MutationCtx,
  cycle: Doc<"seoCollectionCycles">,
  schedule: Doc<"schedules"> | null,
  cursor: Id<"companyWebsites"> | undefined,
  cursorCreatedAt: number | undefined,
): Promise<ExpansionOutcome> {
  const now = new Date(cycle.startedAt);
  const operations = seoSiteOperations();

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
  let lastCursor: Id<"companyWebsites"> | null = cursor ?? null;
  let lastCreatedAt: number | null = cursorCreatedAt ?? null;
  let stoppedEarly = false;
  let sendIndex = cycle.plannedCount;

  // Every website this page touched, for the bulk operations below. Collected
  // as it goes rather than re-read afterwards, because the same walk already
  // resolves each site's schedule and its competitors.
  const batch: Array<{ websiteId: Id<"websites">; host: string }> = [];

  for (const companyWebsite of websites) {
    // Stop between websites, never inside one, so a site's lines are always
    // written by the same page.
    if (planned + reused >= SEO_PAGE_LINE_BUDGET) {
      stoppedEarly = true;
      break;
    }
    lastCursor = companyWebsite._id;
    lastCreatedAt = companyWebsite._creationTime;

    /*
      A tracked site paired with one of the company's own is reached below, as
      a target of that site — which is what makes the two land on the same day
      — so walking it here as well would plan it twice.

      A tracked site with no pair is collected here, on its own settings, like
      any hold. It was skipped outright for a while, which meant a company could
      choose to watch a site and have it never collected at all, with nothing on
      screen to say so.
    */
    if (isTrackedHold(companyWebsite) && await pairedOwnedHold(ctx, companyWebsite)) continue;

    const resolved = resolveWebsiteSchedule(schedule, companyWebsite, now);
    if (!resolved.active) continue;

    // A website with its own slower schedule is not collected just because its
    // company's turn came round. Absence of an override is what makes a site
    // follow the company; presence is what makes it stop.
    const lastLine = await ctx.db
      .query("seoCycleLines")
      .withIndex("by_company_website", (q) =>
        q.eq("companyId", cycle.companyId).eq("websiteId", companyWebsite.websiteId))
      .order("desc")
      .first();
    if (lastLine && !isWebsiteDue(schedule, companyWebsite, lastLine.createdAt, now)) continue;

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

    // The questions this website asks the AI engines. Planned once per
    // website, not per target: a competitor is named *in* the answer, it is
    // not asked its own question.
    const citations = await planCitationPulls(ctx, cycle, companyWebsite, sendIndex);
    planned += citations.planned;
    reused += citations.reused;
    sendIndex += citations.planned;

    // The searches on this website's record, checked from this watcher's
    // place. One page per search per place, shared by everyone who tracks it,
    // and it files a position for every known site on it — which is how a
    // rival's ranking for the same search arrives without a pull of its own.
    const checks = await planKeywordChecks(
      ctx,
      cycle,
      companyWebsite,
      sendIndex,
      SEO_MAX_SENDS_PER_CYCLE - cycle.plannedCount - planned,
    );
    planned += checks.planned;
    reused += checks.reused;
    sendIndex += checks.planned;
    if (checks.capped) {
      return { planned, reused, lastCursor, lastCreatedAt, exhausted: false, cappedPlan: true };
    }

    for (const websiteId of targets) {
      const target = await ctx.db.get(websiteId);
      if (target) batch.push({ websiteId, host: target.host });

      for (const operation of operations) {
        if (planned + cycle.plannedCount >= SEO_MAX_SENDS_PER_CYCLE) {
          return { planned, reused, lastCursor, lastCreatedAt, exhausted: false, cappedPlan: true };
        }

        const result = await planPull(ctx, {
          cycle,
          schedule,
          companyWebsite,
          websiteId,
          operationId: operation.id,
          sendIndex,
          now,
        });
        if (result === "REUSED") reused += 1;
        if (result === "PLANNED") {
          planned += 1;
          sendIndex += 1;
        }
      }
    }
  }

  const bulkPlanned = await planBulkPulls(ctx, cycle, batch, sendIndex);

  return {
    planned: planned + bulkPlanned.planned,
    reused: reused + bulkPlanned.reused,
    lastCursor,
    lastCreatedAt,
    exhausted: !stoppedEarly && page.length <= SEO_EXPANSION_PAGE,
    cappedPlan: false,
  };
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
  const existing = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
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
 * One paid call per question per engine, for one website.
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
 */
async function planCitationPulls(
  ctx: MutationCtx,
  cycle: Doc<"seoCollectionCycles">,
  companyWebsite: Doc<"companyWebsites">,
  startIndex: number,
): Promise<{ planned: number; reused: number }> {
  /*
    Read from the host, not from this company's copy of the list.

    `trackedPrompts` held one row per client per question, so three clients
    watching one host planned three identical purchases and the idempotency key
    was the only thing collapsing them. The question belongs to the site — which
    that table's own docstring said while storing the opposite — so the list is
    the host's and every watcher reads it.

    It still plans per company website rather than per host, because the *place*
    is the watcher's: the same question asked for Leeds and for London is two
    different purchases, and that is what the key below carries.
  */
  const prompts = await ctx.db
    .query("websiteQuestions")
    .withIndex("by_website_active", (q) =>
      q.eq("websiteId", companyWebsite.websiteId).eq("isActive", true))
    .take(MAX_PROMPTS_PER_WEBSITE);
  if (prompts.length === 0) return { planned: 0, reused: 0 };

  const place = companyWebsite.locationCode !== undefined
    ? findSeoLocation(companyWebsite.locationCode)
    : null;
  const location = place ? { countryIso: place.countryIso, city: place.city } : null;

  let planned = 0;
  let reused = 0;
  let sendIndex = startIndex;

  for (const prompt of prompts) {
    for (const engine of prompt.engines) {
      const operation = findSeoOperation(aiCitationOperationId(engine));
      if (!operation) continue;

      const params = seoAiCitationParams(engine, prompt.prompt, location);
      const outcome = await planSharedPull(ctx, cycle, {
        operation,
        params,
        // A question has no website of its own — the same question from two
        // companies is one purchase. The params carry the text and the place.
        sentinel: "prompt",
        websiteId: companyWebsite.websiteId,
        sendIndex,
      });

      if (outcome === "REUSED") reused += 1;
      else {
        planned += 1;
        sendIndex += 1;
      }
    }
  }

  return { planned, reused };
}

/**
 * Check where every site ranks for the searches on this website's record.
 *
 * The host's list, not the client's: a search added once to `ourshop.com` is
 * checked for every company holding it, and asked once between them when they
 * watch from the same place. It is keyed on the search and the place and on no
 * website, so two hosts tracking the same phrase in the same town share the
 * page too — and the parse files a position for every known site on it.
 *
 * Paused searches are not asked. `room` is what is left of the cycle's
 * ceiling; running out of it stops here and says so, like every other planner.
 */
async function planKeywordChecks(
  ctx: MutationCtx,
  cycle: Doc<"seoCollectionCycles">,
  companyWebsite: Doc<"companyWebsites">,
  startIndex: number,
  room: number,
): Promise<{ planned: number; reused: number; capped: boolean }> {
  const operation = findSeoOperation(SEO_KEYWORD_CHECK_OPERATION);
  if (!operation) return { planned: 0, reused: 0, capped: false };

  const searches = await ctx.db
    .query("websiteKeywords")
    .withIndex("by_website_active", (q) =>
      q.eq("websiteId", companyWebsite.websiteId).eq("isActive", true))
    .take(SEO_KEYWORD_CHECKS_PER_WEBSITE);

  let planned = 0;
  let reused = 0;
  let sendIndex = startIndex;

  for (const search of searches) {
    if (planned >= room) return { planned, reused, capped: true };

    const outcome = await planSharedPull(ctx, cycle, {
      operation,
      params: seoKeywordCheckParams(search.keyword, { locationCode: companyWebsite.locationCode }),
      sentinel: "keyword",
      websiteId: companyWebsite.websiteId,
      sendIndex,
    });
    if (outcome === "REUSED") reused += 1;
    else {
      planned += 1;
      sendIndex += 1;
    }
  }

  return { planned, reused, capped: false };
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
 * One paid call about every website on this page.
 *
 * DataForSEO's bulk endpoints take up to a thousand targets for a single
 * charge, so a thousand tracked sites costs one call rather than a thousand.
 * This is the cheapest thing the pipeline does by a wide margin.
 *
 * **Batched per page rather than per cycle**, which is a deliberate trade. A
 * cycle-wide batch would be one call for a thousand sites instead of ten, but
 * expansion is chunked and accumulating hosts across pages would mean holding
 * them somewhere between mutations. Ten calls instead of a thousand is already
 * ninety-nine per cent of the saving, for none of the complexity. The page size
 * is well inside every endpoint's cap, so a batch is never refused for length.
 *
 * One pull, many lines. Each website gets its own line so its history is
 * complete, and all but the first are marked as not having paid — because they
 * did not. One charge happened, and the counts have to say so.
 */
async function planBulkPulls(
  ctx: MutationCtx,
  cycle: Doc<"seoCollectionCycles">,
  batch: Array<{ websiteId: Id<"websites">; host: string }>,
  startIndex: number,
): Promise<{ planned: number; reused: number }> {
  if (batch.length === 0) return { planned: 0, reused: 0 };

  // The same host can arrive twice on one page — a competitor of two sites, or
  // a site somebody also tracks as a rival. It is one target either way.
  const unique = new Map<string, { websiteId: Id<"websites">; host: string }>();
  for (const entry of batch) unique.set(entry.host, entry);
  const hosts = [...unique.values()];

  let planned = 0;
  let reused = 0;
  let sendIndex = startIndex;

  for (const operation of seoBulkOperations()) {
    let params: Record<string, unknown>;
    try {
      params = seoBulkOperationParams(operation, hosts.map((entry) => entry.host));
    } catch {
      // A batch the registry refuses is a bug in the page size, not in the
      // data. Skipping is better than failing a cycle over it.
      continue;
    }

    const idempotencyKey = buildSeoIdempotencyKey({
      operationId: operation.id,
      // A batch has no single website, so the key is keyed on the batch itself.
      // The params hash covers every host in it, so two pages with the same
      // sites in the same order are one question and two different pages are
      // two.
      websiteId: `batch:${hosts.length}`,
      params,
      cycleStartedAt: cycle.startedAt,
    });

    const existing = await reusableByKey(ctx, idempotencyKey);

    const pullId = existing?._id ?? await ctx.db.insert("seoDataPulls", {
      operationId: operation.id,
      family: operation.family,
      mode: operation.mode,
      companyId: cycle.companyId,
      taskArgsJson: JSON.stringify(params),
      status: "PENDING",
      tag: idempotencyKey,
      idempotencyKey,
      cycleId: cycle._id,
      dueAt: cycle.startedAt + sendIndex * SEO_DUE_SPACING_MS,
      attempts: 0,
      costUsd: 0,
      sandbox: false,
      ...(cycle.agentRunId ? { agentRunId: cycle.agentRunId } : {}),
      submittedAt: Date.now(),
    });

    if (!existing) {
      planned += 1;
      sendIndex += 1;
    }

    for (const [index, entry] of hosts.entries()) {
      await ctx.db.insert("seoCycleLines", {
        cycleId: cycle._id,
        companyId: cycle.companyId,
        websiteId: entry.websiteId,
        operationId: operation.id,
        pullId,
        // One charge covered all of them, so only one line can claim to have
        // paid for it. The rest are true reuse.
        reused: Boolean(existing) || index > 0,
        createdAt: Date.now(),
      });
      if (existing || index > 0) reused += 1;
    }
  }

  return { planned, reused };
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

async function findFreshPull(
  ctx: MutationCtx,
  args: {
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
  // fresh they are.
  const recent = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_website_submitted", (q) => q.eq("websiteId", args.websiteId))
    .order("desc")
    .filter((q) =>
      q.and(
        q.eq(q.field("status"), "READY"),
        q.eq(q.field("operationId"), args.operationId),
        q.eq(q.field("taskArgsJson"), args.taskArgsJson),
      ))
    .first();

  if (!recent?.completedAt) return null;

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
