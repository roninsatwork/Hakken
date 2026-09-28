import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { holdFirstCheck, holdQuestion, holdSearch, holdSearches } from "./holdLists";
import { addWebsiteKeywordCore, readSearchPhrase, requireFanOutRoom } from "./websiteCanonical";
import { readFanOutLimits } from "./fanOutLimits";
import { listedChecker } from "./fanOutListed";
import { aiCitationOperationId, aiEngineValidator } from "./seoAiEngines";
import { SEO_KEYWORD_CHECK_OPERATION, findSeoOperation, seoAiCitationParams } from "./dataForSeoRegistry";
import { buildSeoIdempotencyKey } from "./seoIdempotency";
import { reusableByKey } from "./seoCollection";
import { startCollector } from "./seoAgentRuns";
import { companyCollectionSchedule } from "./seoScheduleService";
import { MAX_LIST, unitCosts } from "./websiteSiteRows";
import { appError, type AppErrorData } from "./utils/appError";
import { DEFAULT_LOCATION_CODE, findSeoLocation } from "./utils/seoLocations";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * One prompt's fan-out queries: the searches the AIs ran before answering it
 * (docs/plans/active/prompt-fan-out-queries-plan.md) — an admin data-entry
 * list, and nothing else. Anthony, 2026-09-28: "its intent is to add, edit and
 * delete fan out queries".
 *
 * Opt-in since the same day (docs/plans/active/fan-out-opt-in-plan.md;
 * Anthony: "and i like the opt in", then "yes anything beyond the first
 * check"): every one is listed and checked on Google once, and only the
 * ticked ones are checked every run. Ticked is not a flag of its own: it is
 * the query running on the website's tracked searches, so Tracked keywords
 * and this list can never disagree — pausing or removing it there unticks it
 * here. A website may have so many ticked (`fanOutTrackedPerSite`); keywords
 * typed in on Tracked keywords do not count.
 *
 * The company adds its own, edits the words, ticks and unticks, deletes one —
 * off the list and never back, whatever the AI runs ("remove it from
 * searching that fan out phrase again") — or asks the AIs now with Generate.
 * Where the site ranks for them is What came back's, never this list's.
 *
 * The AI's come from the prompt's angles (`fanOutAngles.ts`), so this list,
 * the count on Your prompts and AI searches agree. What the company chose sits
 * beside them (`fanOutQueryChoices`): one it added, one it deleted. Everything
 * is read and written through the prompt's own hold, never by phrase or by
 * website (docs/plans/active/private-tracking-lists-plan.md).
 */

type Reader = { db: QueryCtx["db"] };

/** Choices kept for one prompt, read at most: a prompt with more lists the first. */
const MAX_CHOICES = 1_000;

/** How long a "Generate fan-out queries now" is reported on the screen after it was pressed. */
const GENERATED_SHOWN_MS = 60 * 60 * 1000;

/** An answer bought for Generate that has not come back yet. */
const WAITING = new Set<Doc<"seoDataPulls">["status"]>(["PENDING", "CLAIMED", "SUBMITTED"]);

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** The company's prompt and the owned website it is asked for, or refused. */
async function requireQuestion(ctx: Reader, companyId: Id<"companies">, questionId: Id<"websiteQuestions">) {
  const question = await ctx.db.get(questionId);
  if (!question) throw appError("NOT_FOUND", "That prompt is no longer asked.");
  const hold = await ctx.db.get(question.companyWebsiteId);
  if (!hold || hold.companyId !== companyId || isTrackedHold(hold)) {
    throw appError("NOT_FOUND", "That prompt is not one of this company's.");
  }
  return { question, hold };
}

async function choicesOf(ctx: Reader, holdId: Id<"companyWebsites">, prompt: string): Promise<Doc<"fanOutQueryChoices">[]> {
  return await ctx.db
    .query("fanOutQueryChoices")
    .withIndex("by_hold_prompt", (q) => q.eq("holdId", holdId).eq("prompt", prompt))
    .take(MAX_CHOICES);
}

async function settingsOf(ctx: Reader, holdId: Id<"companyWebsites">, prompt: string) {
  return await ctx.db
    .query("fanOutQuestionSettings")
    .withIndex("by_hold_prompt", (q) => q.eq("holdId", holdId).eq("prompt", prompt))
    .unique();
}

/** The fan-out queries the company deleted from a prompt: the angles' rebuild leaves them out. */
export async function removedQueries(ctx: Reader, holdId: Id<"companyWebsites">, prompt: string): Promise<Set<string>> {
  return new Set((await choicesOf(ctx, holdId, prompt)).filter((choice) => choice.removed).map((choice) => choice.query));
}

type AiWording = Doc<"fanOutAngles">["wordings"][number];

/**
 * A prompt's list: the AI's fan-out queries bar the deleted, most seen first,
 * and the company's own that no AI has run. Shared by the prompt's screen and
 * the count on Your prompts.
 */
export async function questionQueries(ctx: Reader, holdId: Id<"companyWebsites">, prompt: string, anglesRead: number) {
  const [angles, choices] = await Promise.all([
    ctx.db
      .query("fanOutAngles")
      .withIndex("by_hold_prompt_angle", (q) => q.eq("holdId", holdId).eq("prompt", prompt))
      .take(anglesRead + 1),
    choicesOf(ctx, holdId, prompt),
  ]);
  const chosen = new Map(choices.map((choice) => [choice.query, choice]));
  const ai: AiWording[] = angles.slice(0, anglesRead).flatMap((angle) => angle.wordings);
  const ran = new Set(ai.map((wording) => wording.query));
  return {
    listed: ai
      .filter((wording) => !chosen.get(wording.query)?.removed)
      .sort((left, right) =>
        right.timesSeen - left.timesSeen || right.lastSeenDay.localeCompare(left.lastSeenDay) || left.query.localeCompare(right.query)),
    own: choices.filter((choice) => choice.own && !choice.removed && !ran.has(choice.query)),
    chosen,
    cut: angles.length > anglesRead,
  };
}

/** A website's fan-out queries ticked, across all its prompts: running on its tracked searches, from a prompt's list. */
function tickedCount(searches: ReadonlyArray<Doc<"websiteKeywords">>): number {
  return searches.filter((search) => search.isActive && search.addedFrom === "AI_SEARCH").length;
}

/** One prompt's list of fan-out queries, which are ticked, and what checking them and generating more cost. */
export const getPromptFanOut = superAdminQuery({
  args: { companyId: v.id("companies"), questionId: v.id("websiteQuestions") },
  returns: v.object({
    question: v.object({
      _id: v.id("websiteQuestions"),
      prompt: v.string(),
      companyWebsiteId: v.id("companyWebsites"),
      host: v.string(),
      engines: v.array(aiEngineValidator),
      isActive: v.boolean(),
    }),
    rows: v.array(v.object({
      query: v.string(),
      queryText: v.string(),
      /** Added by hand: no AI has run it. */
      own: v.boolean(),
      /** Running on the website's tracked searches: checked on Google every run. */
      ticked: v.boolean(),
      /** How often the AIs ran it; null for the company's own. */
      timesSeen: v.union(v.number(), v.null()),
    })),
    /** The website's fan-out queries ticked, across all its prompts, and the most it may have (`fanOutTrackedPerSite`). */
    ticked: v.object({ count: v.number(), limit: v.number() }),
    /** One Google check, as charged on average; null until one has been. */
    checkUsd: v.union(v.number(), v.null()),
    /** One press of Generate: an answer from each assistant asked; null until each has been bought. */
    generateUsd: v.union(v.number(), v.null()),
    generating: v.union(v.null(), v.object({ at: v.number(), waiting: v.number(), failed: v.number(), asked: v.number() })),
    /** The company's collection is switched on: Generate buys nothing while it is off. */
    collecting: v.boolean(),
    /** The prompt had more angles than are read. */
    cut: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { question, hold } = await requireQuestion(ctx, args.companyId, args.questionId);
    const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
    const [found, searches, settings, website, schedule] = await Promise.all([
      questionQueries(ctx, hold._id, question.prompt, limits.anglesShown),
      holdSearches(ctx, hold._id, MAX_LIST),
      settingsOf(ctx, hold._id, question.prompt),
      ctx.db.get(hold.websiteId),
      companyCollectionSchedule(ctx, args.companyId),
    ]);
    const running = new Set(searches.filter((search) => search.isActive).map((search) => search.keyword));

    // The company's own first, newest first, then the AI's, most seen first.
    const own = [...found.own].sort((left, right) => right.updatedAt - left.updatedAt);
    const rows = [
      ...own.map((choice) => ({ query: choice.query, queryText: choice.queryText, own: true, ticked: running.has(choice.query), timesSeen: null })),
      ...found.listed.map((wording) => ({
        query: wording.query,
        queryText: wording.queryText,
        own: found.chosen.get(wording.query)?.own ?? false,
        ticked: running.has(wording.query),
        timesSeen: wording.timesSeen,
      })),
    ];

    const costs = await unitCosts(ctx, [SEO_KEYWORD_CHECK_OPERATION, ...question.engines.map(aiCitationOperationId)]);
    const engineCosts = question.engines.map((engine) => costs.get(aiCitationOperationId(engine)));

    let generating = null;
    if (settings?.generatedAt && Date.now() - settings.generatedAt < GENERATED_SHOWN_MS && settings.generatedPulls?.length) {
      const pulls = await Promise.all(settings.generatedPulls.map((pullId) => ctx.db.get(pullId)));
      generating = {
        at: settings.generatedAt,
        waiting: pulls.filter((pull) => pull && WAITING.has(pull.status)).length,
        failed: pulls.filter((pull) => pull?.status === "FAILED").length,
        asked: pulls.length,
      };
    }

    return {
      question: {
        _id: question._id,
        prompt: question.prompt,
        companyWebsiteId: hold._id,
        host: website?.displayHost ?? "",
        engines: question.engines,
        isActive: question.isActive,
      },
      rows,
      ticked: { count: tickedCount(searches), limit: limits.fanOutTrackedPerSite },
      checkUsd: costs.get(SEO_KEYWORD_CHECK_OPERATION) ?? null,
      generateUsd: engineCosts.every((cost) => cost !== undefined) ? engineCosts.reduce<number>((sum, cost) => sum + (cost ?? 0), 0) : null,
      generating,
      collecting: schedule?.isActive === true,
      cut: found.cut,
    };
  },
});

// ---------------------------------------------------------------------------
// Ticked: checked on Google every run
// ---------------------------------------------------------------------------

/**
 * Tick a fan-out query: on the website's tracked searches and running, so
 * every run checks it. Refused at the website's limit for fan-out queries
 * (`requireFanOutRoom`), or when its tracked keywords are full. A keyword
 * typed in on Tracked keywords and paused there is resumed outside the
 * fan-out limit: it was never one of the fan-out queries'.
 */
async function tick(ctx: MutationCtx, hold: Doc<"companyWebsites">, text: string, userId?: Id<"users">) {
  const { keyword } = readSearchPhrase(text);
  const search = await holdSearch(ctx, hold._id, keyword);
  if (search?.isActive) return;
  if (!search) {
    await addWebsiteKeywordCore(ctx, { companyWebsiteId: hold._id, keyword: text, userId, addedFrom: "AI_SEARCH" });
  } else {
    if (search.addedFrom === "AI_SEARCH") await requireFanOutRoom(ctx, hold);
    await ctx.db.patch(search._id, { isActive: true });
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "RESUME_WEBSITE_KEYWORD",
      entityId: search._id,
      entityType: "websiteKeywords",
      metadata: JSON.stringify({ keyword, companyId: hold.companyId }),
      timestamp: Date.now(),
    });
  }
  // Every run checks it now: a first check not yet bought has nothing left to do.
  await dropFirstCheck(ctx, hold, keyword);
}

/** Tick it when the website has room; whether it was ticked. Full, it is left as it is, for the caller to say so. */
async function tickIfRoom(ctx: MutationCtx, hold: Doc<"companyWebsites">, text: string, userId: Id<"users">): Promise<boolean> {
  try {
    await tick(ctx, hold, text, userId);
    return true;
  } catch (error) {
    // Both limits refuse before writing anything, so nothing is left half-done.
    if (error instanceof ConvexError && (error.data as AppErrorData).code === "INVALID_INPUT") return false;
    throw error;
  }
}

/**
 * Untick a fan-out query: it stops being checked every run. Off the tracked
 * searches when a prompt's list put it there; a keyword typed in on Tracked
 * keywords is only paused, so the company's own typing is not lost. What its
 * checks found stays.
 */
async function untick(ctx: MutationCtx, hold: Doc<"companyWebsites">, keyword: string, userId?: Id<"users">, why?: string) {
  const search = await holdSearch(ctx, hold._id, keyword);
  if (!search) return;
  const entry = {
    actorId: userId,
    entityId: search._id,
    entityType: "websiteKeywords",
    metadata: JSON.stringify({ keyword, companyId: hold.companyId, ...(why ? { why } : {}) }),
    timestamp: Date.now(),
  };
  if (search.addedFrom === "AI_SEARCH") {
    await ctx.db.delete(search._id);
    await ctx.db.insert("auditLogs", { ...entry, actionType: "REMOVE_WEBSITE_KEYWORD" });
    return;
  }
  if (!search.isActive) return;
  await ctx.db.patch(search._id, { isActive: false });
  await ctx.db.insert("auditLogs", { ...entry, actionType: "PAUSE_WEBSITE_KEYWORD" });
}

// ---------------------------------------------------------------------------
// The first check
// ---------------------------------------------------------------------------

/**
 * Give fan-out queries their one first check (docs/plans/active/
 * fan-out-opt-in-plan.md): a record each, which the next collection plans
 * (`seoCollection.ts`) and the filing of its check completes
 * (`seoKeywordChecks.ts`). Not for one ticked — every run checks it — nor one
 * that has had it. One the website already has a check of on file — tracked
 * before, or checked for another company's list — is recorded as done at
 * once, so nothing is bought twice. Returns how many it recorded.
 */
export async function queueFirstChecks(ctx: MutationCtx, hold: Doc<"companyWebsites">, queries: readonly string[]): Promise<number> {
  if (queries.length === 0) return 0;
  const running = new Set((await holdSearches(ctx, hold._id, MAX_LIST, { activeOnly: true })).map((search) => search.keyword));
  const locationCode = hold.locationCode ?? DEFAULT_LOCATION_CODE;
  let queued = 0;
  for (const query of new Set(queries)) {
    if (running.has(query) || await holdFirstCheck(ctx, hold._id, query)) continue;
    const onFile = await ctx.db
      .query("websiteSearchStats")
      .withIndex("by_key", (q) => q.eq("websiteId", hold.websiteId).eq("keyword", query).eq("locationCode", locationCode))
      .unique();
    await ctx.db.insert("fanOutFirstChecks", {
      holdId: hold._id,
      websiteId: hold.websiteId,
      query,
      locationCode,
      ...(onFile ? { checkedDay: onFile.lastCheckedDay } : {}),
      createdAt: Date.now(),
    });
    queued += 1;
  }
  return queued;
}

/** A first check not yet bought goes: the query was ticked, or is off every list of the website. One bought or done stays. */
async function dropFirstCheck(ctx: MutationCtx, hold: Doc<"companyWebsites">, query: string) {
  const first = await holdFirstCheck(ctx, hold._id, query);
  if (first && !first.pullId && !first.checkedDay) await ctx.db.delete(first._id);
}

/**
 * A query leaves one prompt's list — deleted, or edited into other words.
 * When no other prompt of the website still lists it, it is unticked and
 * loses a first check not yet bought; while another does, it stays as that
 * prompt has it.
 */
async function leaveList(ctx: MutationCtx, hold: Doc<"companyWebsites">, keyword: string, userId: Id<"users">) {
  if (await listedChecker(ctx, hold._id)(keyword)) return;
  await untick(ctx, hold, keyword, userId);
  await dropFirstCheck(ctx, hold, keyword);
}

// ---------------------------------------------------------------------------
// Changing the list
// ---------------------------------------------------------------------------

const questionArgs = { companyId: v.id("companies"), questionId: v.id("websiteQuestions") };

async function writeChoice(
  ctx: MutationCtx,
  hold: Doc<"companyWebsites">,
  prompt: string,
  query: string,
  fields: { queryText: string; own?: boolean; removed?: boolean },
) {
  const held = await ctx.db
    .query("fanOutQueryChoices")
    .withIndex("by_hold_prompt_query", (q) => q.eq("holdId", hold._id).eq("prompt", prompt).eq("query", query))
    .unique();
  if (held) {
    await ctx.db.patch(held._id, { ...fields, updatedAt: Date.now() });
    return held;
  }
  await ctx.db.insert("fanOutQueryChoices", {
    holdId: hold._id,
    prompt,
    query,
    queryText: fields.queryText,
    own: fields.own ?? false,
    removed: fields.removed ?? false,
    updatedAt: Date.now(),
  });
  return null;
}

async function audit(ctx: MutationCtx & { userId: Id<"users"> }, hold: Doc<"companyWebsites">, actionType: string, details: Record<string, unknown>) {
  await ctx.db.insert("auditLogs", {
    actorId: ctx.userId,
    actionType,
    entityId: hold._id,
    entityType: "companyWebsites",
    metadata: JSON.stringify({ ...details, companyId: hold.companyId }),
    timestamp: Date.now(),
  });
}

/** Whether a phrase is already on the prompt's list — the AI's, or the company's own. */
async function listedAlready(ctx: Reader, hold: Doc<"companyWebsites">, prompt: string, query: string): Promise<boolean> {
  const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
  const found = await questionQueries(ctx, hold._id, prompt, limits.anglesShown);
  return found.listed.some((wording) => wording.query === query) || found.own.some((choice) => choice.query === query);
}

/**
 * Add a fan-out query of the company's own: on the list, and ticked — it was
 * added to be checked — unless the website is at its limit, when it waits
 * unticked for its first check. Says whether it was ticked, so the screen can
 * say why not.
 */
export const addPromptFanOutQuery = superAdminMutation({
  args: { ...questionArgs, queryText: v.string() },
  returns: v.object({ ticked: v.boolean() }),
  handler: async (ctx, args) => {
    const { question, hold } = await requireQuestion(ctx, args.companyId, args.questionId);
    const { keyword, text } = readSearchPhrase(args.queryText);
    if (await listedAlready(ctx, hold, question.prompt, keyword)) {
      throw appError("INVALID_INPUT", "That fan-out query is already on this prompt's list.");
    }
    await writeChoice(ctx, hold, question.prompt, keyword, { queryText: text, own: true, removed: false });
    const ticked = await tickIfRoom(ctx, hold, text, ctx.userId);
    if (!ticked) await queueFirstChecks(ctx, hold, [keyword]);
    await audit(ctx, hold, "ADD_FAN_OUT_QUERY", { prompt: question.prompt, query: keyword, ticked });
    return { ticked };
  },
});

/**
 * Tick or untick one of the prompt's fan-out queries: checked on Google every
 * run, or not. Ticking is refused at the website's limit, in the limit's own
 * words. Unticked, it keeps what its checks found, and has its one first
 * check if it never had one.
 */
export const setPromptFanOutQueryTicked = superAdminMutation({
  args: { ...questionArgs, queryText: v.string(), ticked: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { question, hold } = await requireQuestion(ctx, args.companyId, args.questionId);
    const { keyword, text } = readSearchPhrase(args.queryText);
    if (!(await listedAlready(ctx, hold, question.prompt, keyword))) {
      throw appError("NOT_FOUND", "That fan-out query is not on this prompt's list.");
    }
    if (args.ticked) {
      await tick(ctx, hold, text, ctx.userId);
    } else {
      await untick(ctx, hold, keyword, ctx.userId);
      await queueFirstChecks(ctx, hold, [keyword]);
    }
    await audit(ctx, hold, args.ticked ? "TICK_FAN_OUT_QUERY" : "UNTICK_FAN_OUT_QUERY", { prompt: question.prompt, query: keyword });
    return null;
  },
});

/**
 * Change a fan-out query's words: the new words are the company's own —
 * ticked if the old were, room allowing, else given their first check. The
 * old stop being checked, and an AI's original is kept off the list, so
 * running it again does not bring it back.
 */
export const editPromptFanOutQuery = superAdminMutation({
  args: { ...questionArgs, from: v.string(), queryText: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { question, hold } = await requireQuestion(ctx, args.companyId, args.questionId);
    const before = readSearchPhrase(args.from);
    const after = readSearchPhrase(args.queryText);
    const held = await ctx.db
      .query("fanOutQueryChoices")
      .withIndex("by_hold_prompt_query", (q) => q.eq("holdId", hold._id).eq("prompt", question.prompt).eq("query", before.keyword))
      .unique();
    if (after.keyword === before.keyword) {
      // The same search in other words: only the company's own words can be kept.
      if (held?.own) await writeChoice(ctx, hold, question.prompt, before.keyword, { queryText: after.text });
      return null;
    }
    if (await listedAlready(ctx, hold, question.prompt, after.keyword)) {
      throw appError("INVALID_INPUT", "That fan-out query is already on this prompt's list.");
    }
    const wasTicked = (await holdSearch(ctx, hold._id, before.keyword))?.isActive === true;
    if (held?.own) await ctx.db.delete(held._id);
    else await writeChoice(ctx, hold, question.prompt, before.keyword, { queryText: held?.queryText ?? before.text, removed: true });
    await writeChoice(ctx, hold, question.prompt, after.keyword, { queryText: after.text, own: true, removed: false });
    // The old words first, so their place under the limit is free for the new.
    await leaveList(ctx, hold, before.keyword, ctx.userId);
    const ticked = wasTicked && await tickIfRoom(ctx, hold, after.text, ctx.userId);
    if (!ticked) await queueFirstChecks(ctx, hold, [after.keyword]);
    await audit(ctx, hold, "EDIT_FAN_OUT_QUERY", { prompt: question.prompt, from: before.keyword, to: after.keyword, ticked });
    return null;
  },
});

/**
 * Delete a fan-out query: off the list and no longer checked — not even its
 * first check, if it has not had it — and never back however often an AI runs
 * it. Says whether it was ticked, so an undo can tick it again.
 */
export const removePromptFanOutQuery = superAdminMutation({
  args: { ...questionArgs, queryText: v.string() },
  returns: v.object({ wasTicked: v.boolean() }),
  handler: async (ctx, args) => {
    const { question, hold } = await requireQuestion(ctx, args.companyId, args.questionId);
    const { keyword, text } = readSearchPhrase(args.queryText);
    const wasTicked = (await holdSearch(ctx, hold._id, keyword))?.isActive === true;
    await writeChoice(ctx, hold, question.prompt, keyword, { queryText: text, removed: true });
    await leaveList(ctx, hold, keyword, ctx.userId);
    await audit(ctx, hold, "REMOVE_FAN_OUT_QUERY", { prompt: question.prompt, query: keyword, wasTicked });
    return { wasTicked };
  },
});

/**
 * Undo a delete: back on the list, ticked again if it was — room allowing —
 * else given its first check. The AI's own is regrouped at once, in case a
 * rebuild ran since and left it out.
 */
export const restorePromptFanOutQuery = superAdminMutation({
  args: { ...questionArgs, queryText: v.string(), ticked: v.optional(v.boolean()) },
  returns: v.object({ ticked: v.boolean() }),
  handler: async (ctx, args): Promise<{ ticked: boolean }> => {
    const { question, hold } = await requireQuestion(ctx, args.companyId, args.questionId);
    const { keyword, text } = readSearchPhrase(args.queryText);
    await writeChoice(ctx, hold, question.prompt, keyword, { queryText: text, removed: false });
    const ticked = args.ticked === true && await tickIfRoom(ctx, hold, text, ctx.userId);
    if (!ticked) await queueFirstChecks(ctx, hold, [keyword]);
    await ctx.scheduler.runAfter(0, internal.fanOutAngles.rebuildHoldAngles, { holdId: hold._id });
    await audit(ctx, hold, "RESTORE_FAN_OUT_QUERY", { prompt: question.prompt, query: keyword, ticked });
    return { ticked };
  },
});

// ---------------------------------------------------------------------------
// Generate now
// ---------------------------------------------------------------------------

/**
 * Generate fan-out queries now: ask each assistant the prompt straight away
 * (Anthony, 2026-09-28, "ask the four real AIs now"), rather than waiting for
 * the next collection. The same answers a collection buys, keyed the same
 * way, so an answer already bought today is reused rather than bought twice;
 * the Collector sends them at once, within its own spend limit. Refused while
 * the company's collection is switched off, as Collect now is: off means fetch
 * nothing. The new queries join the list unticked, each with its first check
 * at the next collection.
 */
export const generatePromptFanOut = superAdminMutation({
  args: questionArgs,
  returns: v.object({ asked: v.number(), reused: v.number(), sending: v.boolean() }),
  handler: async (ctx, args) => {
    const { question, hold } = await requireQuestion(ctx, args.companyId, args.questionId);
    const company = await ctx.db.get(args.companyId);
    if (!company) throw appError("NOT_FOUND", "Company not found.");
    if ((await companyCollectionSchedule(ctx, args.companyId))?.isActive !== true) {
      throw appError("CONFLICT", `Collection is switched off for ${company.name}. Switch it on in Schedules first.`);
    }

    const place = hold.locationCode !== undefined ? findSeoLocation(hold.locationCode) : null;
    const location = place ? { countryIso: place.countryIso, city: place.city } : null;
    const now = Date.now();
    const pulls: Id<"seoDataPulls">[] = [];
    let reused = 0;
    for (const engine of question.engines) {
      const operation = findSeoOperation(aiCitationOperationId(engine));
      if (!operation) continue;
      const params = seoAiCitationParams(engine, question.prompt, location);
      // A prompt has no website of its own: the same prompt from two
      // companies, or from a collection today, is one purchase.
      const idempotencyKey = buildSeoIdempotencyKey({ operationId: operation.id, websiteId: "prompt", params, cycleStartedAt: now });
      const existing = await reusableByKey(ctx, idempotencyKey);
      if (existing) {
        pulls.push(existing._id);
        if (existing.status !== "PENDING") reused += 1;
        continue;
      }
      pulls.push(await ctx.db.insert("seoDataPulls", {
        operationId: operation.id,
        family: operation.family,
        mode: operation.mode,
        companyId: args.companyId,
        taskArgsJson: JSON.stringify(params),
        status: "PENDING",
        tag: idempotencyKey,
        idempotencyKey,
        dueAt: now,
        attempts: 0,
        costUsd: 0,
        sandbox: false,
        submittedAt: now,
      }));
    }
    if (pulls.length === 0) throw appError("CONFLICT", "None of this prompt's assistants can be asked.");

    const settings = await settingsOf(ctx, hold._id, question.prompt);
    const fields = { generatedAt: now, generatedPulls: pulls, updatedAt: now };
    if (settings) await ctx.db.patch(settings._id, fields);
    else await ctx.db.insert("fanOutQuestionSettings", { holdId: hold._id, prompt: question.prompt, ...fields });

    const asked = pulls.length - reused;
    const sending = asked > 0
      ? await startCollector(ctx, { companyId: args.companyId, companyName: company.name, userId: ctx.userId, purpose: "Generate fan-out queries" })
      : false;
    await audit(ctx, hold, "GENERATE_FAN_OUT_QUERIES", { prompt: question.prompt, asked, reused });
    return { asked, reused, sending };
  },
});

/**
 * An answer filed outside a collection — one Generate bought — has its
 * fan-out queries grouped and put on the list at once for each of the
 * company's websites that asks the prompt, rather than at the next
 * collection's end.
 */
export const afterFanOutFiled = internalMutation({
  args: { pullId: v.id("seoDataPulls"), prompt: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const pull = await ctx.db.get(args.pullId);
    if (!pull || pull.cycleId || !pull.companyId) return null;
    const companyId = pull.companyId;
    const holds = await ctx.db
      .query("companyWebsites")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .take(MAX_LIST);
    for (const hold of holds) {
      if (isTrackedHold(hold) || !(await holdQuestion(ctx, hold._id, args.prompt))) continue;
      await ctx.scheduler.runAfter(0, internal.fanOutAngles.rebuildHoldAngles, { holdId: hold._id });
    }
    return null;
  },
});

/**
 * A keyword removed from Tracked keywords by hand: one of the website's
 * fan-out queries is unticked by it and stays on its prompts' lists
 * (fan-out-opt-in-plan.md). It is given its record of a check, so the company
 * can still read where it came — or, never checked, its first check.
 */
export const afterSearchRemoved = internalMutation({
  args: { holdId: v.id("companyWebsites"), keyword: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const hold = await ctx.db.get(args.holdId);
    // Gone with its website, or tracked again since.
    if (!hold || isTrackedHold(hold) || await holdSearch(ctx, args.holdId, args.keyword)) return null;
    if (await listedChecker(ctx, args.holdId)(args.keyword)) await queueFirstChecks(ctx, hold, [args.keyword]);
    return null;
  },
});

/** Rows cleared per pass when a prompt goes. */
const CHOICES_CLEARED = 500;

/**
 * A prompt removed: what the company chose for its fan-out queries goes with
 * it, and so do their first checks not yet bought — unless another of the
 * website's prompts still lists them (fan-out-opt-in-plan.md).
 */
export const forgetQuestion = internalMutation({
  args: { holdId: v.id("companyWebsites"), prompt: v.string(), firstChecksDropped: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    // Asked again under the same words since: its choices are its own again.
    if (await holdQuestion(ctx, args.holdId, args.prompt)) return null;
    const hold = await ctx.db.get(args.holdId);
    if (hold && !args.firstChecksDropped) {
      const [angles, own] = await Promise.all([
        ctx.db
          .query("fanOutAngles")
          .withIndex("by_hold_prompt_angle", (q) => q.eq("holdId", args.holdId).eq("prompt", args.prompt))
          .take(MAX_CHOICES),
        choicesOf(ctx, args.holdId, args.prompt),
      ]);
      const listed = listedChecker(ctx, args.holdId);
      const queries = new Set([...angles.flatMap((angle) => angle.wordings.map((wording) => wording.query)), ...own.filter((choice) => choice.own).map((choice) => choice.query)]);
      for (const query of queries) {
        if (!(await listed(query))) await dropFirstCheck(ctx, hold, query);
      }
    }
    const choices = await ctx.db
      .query("fanOutQueryChoices")
      .withIndex("by_hold_prompt", (q) => q.eq("holdId", args.holdId).eq("prompt", args.prompt))
      .take(CHOICES_CLEARED + 1);
    for (const row of choices.slice(0, CHOICES_CLEARED)) await ctx.db.delete(row._id);
    if (choices.length > CHOICES_CLEARED) {
      await ctx.scheduler.runAfter(0, internal.promptFanOut.forgetQuestion, { ...args, firstChecksDropped: true });
      return null;
    }
    const settings = await settingsOf(ctx, args.holdId, args.prompt);
    if (settings) await ctx.db.delete(settings._id);
    return null;
  },
});

/**
 * Undoes the lists' automatic tracking of 2026-09-28, once they became opt-in
 * the same day (fan-out-opt-in-plan.md; Anthony, of unticking them: "yes
 * please"). Every fan-out query put on a website's tracked searches by no
 * person — its audit entry names no one — is taken off, and given its first
 * check instead. Anything a person added, or with no record of how it came,
 * stays. Buys nothing.
 */
export async function untickAutomaticQueries(ctx: MutationCtx, cursor: string | null, batchSize: number) {
  const page = await ctx.db.query("companyWebsites").paginate({ numItems: batchSize, cursor });
  let updated = 0;
  for (const hold of page.page) {
    if (isTrackedHold(hold)) continue;
    const unticked: string[] = [];
    for (const search of await holdSearches(ctx, hold._id, MAX_LIST)) {
      if (search.addedFrom !== "AI_SEARCH") continue;
      const added = await ctx.db
        .query("auditLogs")
        .withIndex("by_action_entity_timestamp", (q) => q.eq("actionType", "ADD_WEBSITE_KEYWORD").eq("entityId", search._id))
        .first();
      if (!added || added.actorId) continue;
      await untick(ctx, hold, search.keyword, undefined, "fan-out queries are opt-in (2026-09-28)");
      unticked.push(search.keyword);
    }
    await queueFirstChecks(ctx, hold, unticked);
    updated += unticked.length;
  }
  return { cursor: page.isDone ? null : page.continueCursor, isDone: page.isDone, processed: page.page.length, updated };
}
