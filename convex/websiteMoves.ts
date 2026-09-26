import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { normaliseKeyword } from "./seoJudgments";
import { appError } from "./utils/appError";
import { MAX_BRAND_NAMES } from "./utils/websiteBrands";
import { isTrackedHold } from "./utils/websitePairing";
import { AI_ENGINES, fanOutPlace } from "./seoAiEngines";
import { VERDICT_THRESHOLDS, daysBetween } from "./utils/trackingVerdicts";
import { trackCompetitorCore } from "./websiteAttachments";
import { addWebsiteKeywordCore } from "./websiteCanonical";
import { loadQuestionRows, loadSearchRows, loadSite, untrackedNamed } from "./websiteSiteRows";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { holdQuestions, holdSearch } from "./holdLists";

/**
 * The moves: what is worth doing next for one of a company's sites.
 *
 * Anthony, 2026-09-22: *"setting up keywords, prompts and competitors is not a
 * one time job."* So the Brief is not a checklist to complete; it is a
 * worklist every collection refills. Each move is drawn from something a
 * collection actually brought back, says what it saw, and offers the one
 * action that answers it:
 *
 * - **Rival** — a site the answers keep naming that this company does not hold.
 * - **Name** — an engine called the business something close to, but not, one
 *   of its brand names, so those answers scored as near misses.
 * - **Slipping search** — down more than the threshold since the check before.
 * - **Dead question** — asked long enough to judge and never named once.
 * - **Untracked search** — a buying search the engines ran that nobody tracks.
 *
 * **Derived when a cycle closes, never on read**, from the same rows the
 * Tracking screen shows, so a move and the row it points at cannot disagree.
 * **Dismissed is remembered per kind and subject**, so the same suggestion
 * never returns — the risk the plan names is a Brief that nags until it is
 * ignored. Done means the move was taken; a slip after it is a new event.
 */

/** A site named this many times in answers before it is worth suggesting. */
const RIVAL_MIN_TIMES = 2;

/** Buying searches suggested per cycle. More at once is a list, not a move. */
const UNTRACKED_SEARCHES_SUGGESTED = 3;

/** Moves shown on the Brief at once. */
const MOVES_SHOWN = 8;

/** Moves read per site: every one it has ever had, at a ceiling far above use. */
const MOVES_READ = 500;

/** Citation rows read for near-miss names: eight weeks of one site's mentions. */
const CITATIONS_READ = 500;

/** Questions and fan-out rows read for untracked buying searches. */
const QUESTIONS_READ = 200;
const FAN_OUT_READ = 2_000;
const FAN_OUT_JUDGED = 60;

/** The company's own sites a closing cycle derives moves for. */
const HOLDS_READ = 200;

type MoveKind = Doc<"websiteMoves">["kind"];

const KIND_ORDER: Record<MoveKind, number> = {
  RIVAL: 0,
  NAME: 1,
  SLIPPING_SEARCH: 2,
  DEAD_QUESTION: 3,
  UNTRACKED_SEARCH: 4,
};

type Evidence = {
  RIVAL: { websiteId: Id<"websites">; host: string; times: number; lastDay: string };
  NAME: { text: string; times: number };
  SLIPPING_SEARCH: { keyword: string; from: number; to: number | null; day: string };
  DEAD_QUESTION: { questionId: Id<"websiteQuestions">; prompt: string; asked: number; weeks: number };
  UNTRACKED_SEARCH: { query: string; timesSeen: number; prompt: string };
};

type Candidate = { [K in MoveKind]: { kind: K; subject: string; evidence: Evidence[K] } }[MoveKind];

function daysAgo(today: string, days: number): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Drawing them
// ---------------------------------------------------------------------------

/** Every move one site's results support right now. */
async function candidatesFor(ctx: MutationCtx, companyWebsiteId: Id<"companyWebsites">) {
  const site = await loadSite(ctx, companyWebsiteId);
  if (!site || isTrackedHold(site.hold)) return null;

  const noCosts = new Map<string, number>();
  const searches = (await loadSearchRows(ctx, site, noCosts)).filter((row) => row.isActive);
  const questions = (await loadQuestionRows(ctx, site, noCosts)).filter((row) => row.isActive);
  const candidates: Candidate[] = [];

  for (const named of await untrackedNamed(ctx, site, questions)) {
    if (named.times < RIVAL_MIN_TIMES) continue;
    candidates.push({
      kind: "RIVAL",
      subject: named.websiteId,
      evidence: { websiteId: named.websiteId, host: named.displayHost, times: named.times, lastDay: named.lastDay },
    });
  }

  // Near misses: a spelling the matcher accepted as close but that is not one
  // of the site's names. Adding it counts those answers properly from the next
  // collection.
  const known = new Set((site.website.brandNames ?? []).map((entry) => entry.name.trim().toLowerCase()));
  const since = daysAgo(site.today, VERDICT_THRESHOLDS.neverLandedDays);
  const mentions = await ctx.db
    .query("aiCitations")
    .withIndex("by_website_day", (q) => q.eq("mentionedWebsiteId", site.website._id).gte("day", since))
    .take(CITATIONS_READ);
  const misspellings = new Map<string, { text: string; times: number }>();
  for (const mention of mentions) {
    if (mention.kind !== "BRAND" || mention.variantKind !== "MISSPELLING") continue;
    const key = mention.mentionedText.trim().toLowerCase();
    if (!key || known.has(key)) continue;
    const held = misspellings.get(key);
    misspellings.set(key, { text: held?.text ?? mention.mentionedText.trim(), times: (held?.times ?? 0) + 1 });
  }
  for (const [key, seen] of misspellings) {
    candidates.push({ kind: "NAME", subject: key, evidence: seen });
  }

  for (const row of searches) {
    if (row.verdict !== "SLIPPING" || row.previousPosition === null || !row.lastCheckedDay) continue;
    candidates.push({
      kind: "SLIPPING_SEARCH",
      subject: row.keyword,
      evidence: { keyword: row.keyword, from: row.previousPosition, to: row.lastPosition, day: row.lastCheckedDay },
    });
  }

  for (const row of questions) {
    if (row.verdict !== "NEVER_LANDED" || !row.firstAskedDay) continue;
    candidates.push({
      kind: "DEAD_QUESTION",
      subject: row._id,
      evidence: {
        questionId: row._id,
        prompt: row.prompt,
        asked: row.asked,
        weeks: Math.floor(daysBetween(row.firstAskedDay, site.today) / 7),
      },
    });
  }

  const watcherPlace = (site.pair ?? site.hold).locationCode;
  for (const search of await untrackedBuyingSearches(ctx, site.hold._id, watcherPlace, new Set(searches.map((row) => row.keyword)))) {
    candidates.push({ kind: "UNTRACKED_SEARCH", subject: search.query, evidence: search });
  }

  return { site, candidates };
}

/**
 * The buying searches the engines ran for this site's questions that its list
 * does not hold, most persistent first.
 *
 * Bounded twice: rows read across every question, and phrases judged. Only the
 * most persistent are worth a move, and the intent judgment is a point lookup
 * per phrase.
 */
async function untrackedBuyingSearches(
  ctx: QueryCtx | MutationCtx,
  /** The hold whose questions — this company's own — the engines were asked. */
  holdId: Id<"companyWebsites">,
  watcherPlace: number | undefined,
  tracked: ReadonlySet<string>,
) {
  const questions = await holdQuestions(ctx, holdId, QUESTIONS_READ, { activeOnly: true });

  const merged = new Map<string, { query: string; timesSeen: number; prompt: string }>();
  let read = 0;
  // Every engine: another site asking the same question of another engine
  // has already paid for its searches.
  for (const question of questions) for (const engine of AI_ENGINES) {
    if (read >= FAN_OUT_READ) break;
    // This watcher's place only, through the index: another town's searches
    // are another client's moves.
    const rows = await ctx.db
      .query("promptFanOutQueries")
      .withIndex("by_prompt_engine_place_query", (q) =>
        q.eq("prompt", question.prompt).eq("engine", engine).eq("place", fanOutPlace(engine, watcherPlace)))
      .take(FAN_OUT_READ - read);
    read += rows.length;
    for (const row of rows) {
      const held = merged.get(row.query);
      merged.set(row.query, {
        query: row.query,
        timesSeen: (held?.timesSeen ?? 0) + row.timesSeen,
        prompt: held?.prompt ?? question.prompt,
      });
    }
  }

  const ranked = [...merged.values()]
    .filter((row) => !tracked.has(normaliseKeyword(row.query)))
    .sort((left, right) => right.timesSeen - left.timesSeen)
    .slice(0, FAN_OUT_JUDGED);

  const found: Array<{ query: string; timesSeen: number; prompt: string }> = [];
  for (const row of ranked) {
    if (found.length >= UNTRACKED_SEARCHES_SUGGESTED) break;
    const intent = await ctx.db
      .query("seoKeywordIntents")
      .withIndex("by_keyword", (q) => q.eq("keyword", row.query))
      .unique();
    if (intent?.intent === "BUYING") found.push(row);
  }
  return found;
}

/**
 * Bring one site's moves in line with what its results now support.
 *
 * New ones open; open ones are refreshed with the latest evidence; open ones
 * the results no longer support are removed, because the situation changed
 * before anyone acted. A dismissed move is never raised again. A done one
 * stays done — except a slip, which reopens when the search slips again after
 * it was handled, because that is a new event and not the old one returning.
 */
async function reconcileMoves(
  ctx: MutationCtx,
  companyWebsiteId: Id<"companyWebsites">,
  cycleId: Id<"seoCollectionCycles"> | undefined,
): Promise<number> {
  const drawn = await candidatesFor(ctx, companyWebsiteId);
  if (!drawn) return 0;
  const { site, candidates } = drawn;

  // Only open moves are read as a set: dismissed and done ones pile up
  // forever, so reading them all would push open ones past any ceiling. A
  // candidate's history is looked up by its own key instead.
  const open = await ctx.db
    .query("websiteMoves")
    .withIndex("by_company_website_state", (q) => q.eq("companyWebsiteId", companyWebsiteId).eq("state", "OPEN"))
    .take(MOVES_READ);
  const live = new Set<string>();
  const now = Date.now();
  let opened = 0;

  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.subject}`;
    live.add(key);
    const held = await ctx.db
      .query("websiteMoves")
      .withIndex("by_key", (q) =>
        q.eq("companyWebsiteId", companyWebsiteId).eq("kind", candidate.kind).eq("subject", candidate.subject))
      .first();
    const evidenceJson = JSON.stringify(candidate.evidence);

    if (!held) {
      await ctx.db.insert("websiteMoves", {
        companyWebsiteId,
        companyId: site.hold.companyId,
        kind: candidate.kind,
        subject: candidate.subject,
        evidenceJson,
        state: "OPEN",
        ...(cycleId ? { cycleId } : {}),
        raisedAt: now,
        updatedAt: now,
      });
      opened += 1;
      continue;
    }

    if (held.state === "OPEN") {
      if (held.evidenceJson !== evidenceJson || (cycleId && held.cycleId !== cycleId)) {
        await ctx.db.patch(held._id, { evidenceJson, ...(cycleId ? { cycleId } : {}), updatedAt: now });
      }
      continue;
    }

    const sliddenAgain = held.state === "DONE"
      && candidate.kind === "SLIPPING_SEARCH"
      && held.decidedAt !== undefined
      && candidate.evidence.day > new Date(held.decidedAt).toISOString().slice(0, 10);
    if (sliddenAgain) {
      await ctx.db.patch(held._id, {
        state: "OPEN",
        evidenceJson,
        ...(cycleId ? { cycleId } : {}),
        raisedAt: now,
        updatedAt: now,
        decidedAt: undefined,
        decidedBy: undefined,
      });
      opened += 1;
    }
  }

  for (const move of open) {
    if (!live.has(`${move.kind}:${move.subject}`)) {
      await ctx.db.delete(move._id);
    }
  }
  return opened;
}

/**
 * A closed cycle's moves, one site at a time.
 *
 * Scheduled a few minutes after the cycle closes, so the last answers have
 * been parsed. Each site is its own transaction: a company with many sites
 * does not become one mutation reading all of them.
 */
export const deriveCycleMoves = internalMutation({
  args: { cycleId: v.id("seoCollectionCycles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) return null;
    const holds = await ctx.db
      .query("companyWebsites")
      .withIndex("by_company", (q) => q.eq("companyId", cycle.companyId))
      .take(HOLDS_READ);
    for (const hold of holds) {
      if (isTrackedHold(hold)) continue;
      await ctx.scheduler.runAfter(0, internal.websiteMoves.deriveSiteMoves, {
        companyWebsiteId: hold._id,
        cycleId: args.cycleId,
      });
    }
    return null;
  },
});

export const deriveSiteMoves = internalMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    cycleId: v.optional(v.id("seoCollectionCycles")),
  },
  returns: v.number(),
  handler: async (ctx, args) => await reconcileMoves(ctx, args.companyWebsiteId, args.cycleId),
});

// ---------------------------------------------------------------------------
// Reading and answering them
// ---------------------------------------------------------------------------

const moveShape = v.union(
  v.object({
    _id: v.id("websiteMoves"),
    kind: v.literal("RIVAL"),
    raisedAt: v.number(),
    evidence: v.object({ websiteId: v.id("websites"), host: v.string(), times: v.number(), lastDay: v.string() }),
  }),
  v.object({
    _id: v.id("websiteMoves"),
    kind: v.literal("NAME"),
    raisedAt: v.number(),
    evidence: v.object({ text: v.string(), times: v.number() }),
  }),
  v.object({
    _id: v.id("websiteMoves"),
    kind: v.literal("SLIPPING_SEARCH"),
    raisedAt: v.number(),
    evidence: v.object({ keyword: v.string(), from: v.number(), to: v.union(v.number(), v.null()), day: v.string() }),
  }),
  v.object({
    _id: v.id("websiteMoves"),
    kind: v.literal("DEAD_QUESTION"),
    raisedAt: v.number(),
    evidence: v.object({ questionId: v.id("websiteQuestions"), prompt: v.string(), asked: v.number(), weeks: v.number() }),
  }),
  v.object({
    _id: v.id("websiteMoves"),
    kind: v.literal("UNTRACKED_SEARCH"),
    raisedAt: v.number(),
    evidence: v.object({ query: v.string(), timesSeen: v.number(), prompt: v.string() }),
  }),
);

type MoveRow = {
  [K in MoveKind]: { _id: Id<"websiteMoves">; kind: K; raisedAt: number; evidence: Evidence[K] };
}[MoveKind];

/**
 * One stored move as the screen reads it: its evidence typed by its kind.
 *
 * The evidence was written by this module for this kind, so reading it back
 * as that kind's shape is a promise this file keeps; the return validator
 * checks it on the way out regardless.
 */
function toMoveRow(move: Doc<"websiteMoves">): MoveRow {
  return {
    _id: move._id,
    kind: move.kind,
    raisedAt: move.raisedAt,
    evidence: JSON.parse(move.evidenceJson),
  } as MoveRow;
}

/** The open moves for one site, in the order somebody should take them. */
export const listSiteMoves = superAdminQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.object({ moves: v.array(moveShape), openCount: v.number() }),
  handler: async (ctx, args) => {
    const open = await ctx.db
      .query("websiteMoves")
      .withIndex("by_company_website_state", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("state", "OPEN"))
      .take(MOVES_READ);
    const sorted = open.sort((left, right) =>
      KIND_ORDER[left.kind] - KIND_ORDER[right.kind] || right.updatedAt - left.updatedAt);
    return { openCount: open.length, moves: sorted.slice(0, MOVES_SHOWN).map(toMoveRow) };
  },
});

/** Open moves on one hold, for the company list. Bounded: past this, "20+" says enough. */
export async function countOpenMoves(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
): Promise<number> {
  return (await ctx.db
    .query("websiteMoves")
    .withIndex("by_company_website_state", (q) => q.eq("companyWebsiteId", companyWebsiteId).eq("state", "OPEN"))
    .take(21)).length;
}

/**
 * Take a move, or dismiss it.
 *
 * Taking it does the thing the move offered, here on the server, so the
 * screen never has to know how: a rival is tracked against this site, a
 * spelling is added to the brand names, a dead question is paused, a search is
 * added to the list. A slip has nothing to do but look, so taking it marks it
 * handled. Dismissing is remembered, and the same move never returns.
 */
export const actOnMove = superAdminMutation({
  args: {
    moveId: v.id("websiteMoves"),
    action: v.union(v.literal("TAKE"), v.literal("DISMISS")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const move = await ctx.db.get(args.moveId);
    if (!move) throw appError("NOT_FOUND", "That move has already been cleared.");
    if (move.state !== "OPEN") throw appError("CONFLICT", "That move has already been answered.");
    const hold = await ctx.db.get(move.companyWebsiteId);
    if (!hold) throw appError("NOT_FOUND", "That website is no longer held by this company.");

    if (args.action === "TAKE") await takeMove(ctx, move, hold, ctx.userId);

    const now = Date.now();
    await ctx.db.patch(move._id, {
      state: args.action === "TAKE" ? "DONE" : "DISMISSED",
      decidedAt: now,
      decidedBy: ctx.userId,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: args.action === "TAKE" ? "TAKE_WEBSITE_MOVE" : "DISMISS_WEBSITE_MOVE",
      entityId: move._id,
      entityType: "websiteMoves",
      companyId: move.companyId,
      metadata: JSON.stringify({ kind: move.kind, subject: move.subject }),
      timestamp: now,
    });
    return null;
  },
});

async function takeMove(
  ctx: MutationCtx,
  move: Doc<"websiteMoves">,
  hold: Doc<"companyWebsites">,
  userId: Id<"users">,
) {
  const evidence = JSON.parse(move.evidenceJson) as Record<string, unknown>;

  if (move.kind === "RIVAL") {
    const websiteId = evidence.websiteId as Id<"websites">;
    const already = await ctx.db
      .query("companyWebsites")
      .withIndex("by_company_website", (q) => q.eq("companyId", hold.companyId).eq("websiteId", websiteId))
      .first();
    if (already) return;
    await trackCompetitorCore(ctx, {
      companyWebsiteId: hold._id,
      url: String(evidence.host),
      userId,
      via: "discovered",
    });
    return;
  }

  if (move.kind === "NAME") {
    const website = await ctx.db.get(hold.websiteId);
    if (!website) return;
    const names = website.brandNames ?? [];
    const text = String(evidence.text).trim();
    if (names.some((entry) => entry.name.trim().toLowerCase() === text.toLowerCase())) return;
    if (names.length >= MAX_BRAND_NAMES) {
      throw appError("INVALID_INPUT", `A website can have at most ${MAX_BRAND_NAMES} brand names. Remove one on the website record first.`);
    }
    const after = [...names, { name: text, isPrimary: names.length === 0, kind: "MISSPELLING" as const }];
    await ctx.db.patch(website._id, { brandNames: after, hasBrandNames: true });
    // The same entry the brand names screen writes: the list is shared across
    // every client watching this host, so each change has to be readable.
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "SET_WEBSITE_BRAND_NAMES",
      entityId: website._id,
      entityType: "websites",
      metadata: JSON.stringify({
        host: website.host,
        before: names.map((entry) => entry.name),
        after: after.map((entry) => entry.name),
      }),
      timestamp: Date.now(),
    });
    return;
  }

  if (move.kind === "DEAD_QUESTION") {
    // Stops this company asking it: the question is on its own list alone
    // (docs/plans/active/private-tracking-lists-plan.md).
    const question = await ctx.db.get(evidence.questionId as Id<"websiteQuestions">);
    if (question && question.companyWebsiteId === hold._id && question.isActive) {
      await ctx.db.patch(question._id, { isActive: false });
      await ctx.db.insert("auditLogs", {
        actorId: userId,
        actionType: "PAUSE_WEBSITE_QUESTION",
        entityId: question._id,
        entityType: "websiteQuestions",
        metadata: JSON.stringify({ prompt: question.prompt, companyId: hold.companyId }),
        timestamp: Date.now(),
      });
    }
    return;
  }

  if (move.kind === "UNTRACKED_SEARCH") {
    // Onto this company's own list; a search it paused comes back, with the
    // same audit entry the screen's Resume writes.
    const keyword = normaliseKeyword(String(evidence.query));
    const existing = await holdSearch(ctx, hold._id, keyword);
    if (existing) {
      if (!existing.isActive) {
        await ctx.db.patch(existing._id, { isActive: true });
        await ctx.db.insert("auditLogs", {
          actorId: userId,
          actionType: "RESUME_WEBSITE_KEYWORD",
          entityId: existing._id,
          entityType: "websiteKeywords",
          metadata: JSON.stringify({ keyword, companyId: hold.companyId }),
          timestamp: Date.now(),
        });
      }
      return;
    }
    await addWebsiteKeywordCore(ctx, { companyWebsiteId: hold._id, keyword, userId });
  }
  // A slipping search has nothing to take but a look; handling it is the act.
}

/**
 * Every move on a hold, for when the hold itself goes.
 *
 * Streamed rather than taken, because dismissed moves are kept forever and a
 * ceiling here would leave rows behind for a hold that no longer exists.
 */
export async function purgeHoldMoves(ctx: MutationCtx, companyWebsiteId: Id<"companyWebsites">): Promise<void> {
  const moves = ctx.db
    .query("websiteMoves")
    .withIndex("by_company_website_state", (q) => q.eq("companyWebsiteId", companyWebsiteId));
  for await (const move of moves) await ctx.db.delete(move._id);
}
