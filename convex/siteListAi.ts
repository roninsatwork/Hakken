import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { holdQuestion, holdQuestions } from "./holdLists";
import { answersSeenBy, holdBrandNames } from "./holdProfiles";
import type { BrandName } from "./utils/websiteBrands";
import { AI_ENGINES, aiEngineValidator, answerPlace, type AiEngine } from "./seoAiEngines";
import { MAX_HOLDS } from "./siteAccess";
import { citedPagesOf, QUESTIONS_FOR_CITED_PAGES } from "./siteFigures";
import { claimSchedule } from "./siteRankings";
import { REBUILD_WAIT_MS } from "./siteSummaries";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import {
  answerStance,
  listCitedValidator,
  namedOtherValidator,
  type ListCited,
  type ListEngine,
  type NamedOther,
  type NewestStance,
  type QuestionEngine,
  type QuestionSite,
} from "./utils/siteShapes";
import { isTrackedHold } from "./utils/websitePairing";
import { MAX_LIST } from "./websiteSiteRows";
import { ANSWER_WINDOW } from "./websiteTrackingStats";

/**
 * Each company's AI figures, worked out once per list rather than on every
 * page open (docs/plans/active/sites-ai-list-summaries-plan.md).
 *
 * Mentions, Share of voice, the header, the Sites list, the Overview and Side
 * by side each used to read a row or two per question and engine, and a
 * company's list may hold a thousand questions asked of four engines: past
 * what one request may read. So the answers are counted when they are filed,
 * into a row per question (`siteListQuestions`), and the list is added up a
 * little later into one row (`siteListAiSummary`).
 *
 * The same answers are counted as before — the latest `ANSWER_WINDOW` per
 * question and engine, the ones the question stats count — for the websites of
 * the list's group: the owned site and the competitors watched against it.
 * Everything is keyed by the list's hold, so one company's rows are never read
 * for another (`holdLists.ts`), and everything is worked out again rather than
 * added to, so running any of it twice changes nothing.
 */

type Reader = { db: QueryCtx["db"] };
type Answer = Pick<Doc<"aiAnswers">, "day" | "named" | "recommended" | "warnedAgainst">;
type QuestionKey = { holdId: Id<"companyWebsites">; place: number; prompt: string };

/** How long after a change a list is worked out again: long enough for a run's answers to land together. */
const LIST_REBUILD_DELAY_MS = 20_000;

/**
 * Questions worked out again per write when a whole list is: each reads up to
 * `ANSWER_WINDOW` answers per engine, so ten questions on four engines stay
 * well inside what one transaction may read.
 */
const QUESTIONS_PER_WRITE = 10;

/** A list's rows looked at per pass when clearing the ones it no longer asks. */
const ROWS_PER_SWEEP = 500;

/** Questions whose stats one read adds up for the websites the answers name (one row per engine each). */
const QUESTIONS_PER_READ = 200;

/** Websites outside the group a summary keeps, most-named first: more than any screen offers. */
const OTHERS_KEPT = 50;

/** The place a company's list is asked from: its own website's chosen place, or the default. */
export function listPlace(hold: Pick<Doc<"companyWebsites">, "locationCode">): number {
  return hold.locationCode ?? DEFAULT_LOCATION_CODE;
}

/**
 * The websites of a list's group: the owned site and the competitors the
 * company watches against it — who `myRivals` puts beside it on every page.
 */
export async function listGroup(ctx: Reader, owner: Doc<"companyWebsites">): Promise<Id<"websites">[]> {
  const competitors = (await ctx.db
    .query("companyWebsites")
    .withIndex("by_company_against", (q) => q.eq("companyId", owner.companyId).eq("againstWebsiteId", owner.websiteId))
    .take(MAX_HOLDS))
    .filter(isTrackedHold);
  return [owner.websiteId, ...competitors.map((hold) => hold.websiteId)];
}

/**
 * The names the company knows each website of a list's group by: its own
 * site's, and each competitor's as the company named it
 * (`holdProfiles.ts`). An answer counts for the company under these only.
 */
export async function listGroupNames(ctx: Reader, owner: Doc<"companyWebsites">): Promise<Map<Id<"websites">, BrandName[]>> {
  const competitors = (await ctx.db
    .query("companyWebsites")
    .withIndex("by_company_against", (q) => q.eq("companyId", owner.companyId).eq("againstWebsiteId", owner.websiteId))
    .take(MAX_HOLDS))
    .filter(isTrackedHold);
  const names = new Map<Id<"websites">, BrandName[]>();
  for (const hold of [owner, ...competitors]) names.set(hold.websiteId, await holdBrandNames(ctx, hold._id));
  return names;
}

/** How an answer treated a website (`answerStance`); nothing when it did not name it. */
function stanceIn(answer: Answer, websiteId: Id<"websites">): NewestStance | undefined {
  const stance = answerStance(answer, websiteId);
  return stance === "NOT_NAMED" ? undefined : stance;
}

/**
 * How one engine's latest answers to a question — newest first, as read —
 * treated each website of a group. Null when the engine has not answered it.
 */
export function questionEngine(
  engine: AiEngine,
  answers: readonly Answer[],
  group: ReadonlySet<Id<"websites">>,
): QuestionEngine | null {
  const newest = answers[0];
  if (!newest) return null;
  const sites = new Map<Id<"websites">, QuestionSite>();
  for (const answer of answers) {
    for (const websiteId of group) {
      const named = answer.named.includes(websiteId);
      const recommended = answer.recommended.includes(websiteId);
      const warnedAgainst = answer.warnedAgainst.includes(websiteId);
      if (!named && !recommended && !warnedAgainst) continue;
      const held = sites.get(websiteId) ?? { websiteId, named: 0, recommended: 0, warnedAgainst: 0 };
      if (named) {
        held.named += 1;
        // Newest first, so the first sighting is the latest.
        if (held.lastNamedDay === undefined) held.lastNamedDay = answer.day;
      }
      if (recommended) held.recommended += 1;
      if (warnedAgainst) held.warnedAgainst += 1;
      sites.set(websiteId, held);
    }
  }
  for (const held of sites.values()) {
    const stance = stanceIn(newest, held.websiteId);
    if (stance) held.newest = stance;
  }
  return {
    engine,
    asked: answers.length,
    lastDay: newest.day,
    sites: [...sites.values()].sort((left, right) => left.websiteId.localeCompare(right.websiteId)),
  };
}

/** A value as text with every object's fields in one order, so two readings of the same row compare equal. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, held: unknown) =>
    held && typeof held === "object" && !Array.isArray(held)
      ? Object.fromEntries(Object.entries(held).sort(([left], [right]) => left.localeCompare(right)))
      : held);
}

const byEngine = (left: { engine: AiEngine }, right: { engine: AiEngine }) =>
  AI_ENGINES.indexOf(left.engine) - AI_ENGINES.indexOf(right.engine);

async function questionRow(ctx: Reader, key: QuestionKey): Promise<Doc<"siteListQuestions"> | null> {
  return await ctx.db
    .query("siteListQuestions")
    .withIndex("by_hold_prompt", (q) => q.eq("companyWebsiteId", key.holdId).eq("locationCode", key.place).eq("prompt", key.prompt))
    .first();
}

/** A question's row made to hold these engines: written when it changed, removed when none has answered. */
async function putQuestionRow(
  ctx: MutationCtx,
  key: QuestionKey,
  row: Doc<"siteListQuestions"> | null,
  engines: QuestionEngine[],
): Promise<void> {
  if (engines.length === 0) {
    if (row) await ctx.db.delete(row._id);
    return;
  }
  const sorted = [...engines].sort(byEngine);
  if (row && canonical(row.engines) === canonical(sorted)) return;
  const fields = { companyWebsiteId: key.holdId, locationCode: key.place, prompt: key.prompt, engines: sorted, updatedAt: Date.now() };
  if (row) await ctx.db.replace(row._id, fields);
  else await ctx.db.insert("siteListQuestions", fields);
}

/** Every engine a question asks, worked out again from its latest answers from this place. */
async function countQuestion(
  ctx: MutationCtx,
  key: QuestionKey,
  engines: readonly AiEngine[],
  group: ReadonlySet<Id<"websites">>,
): Promise<void> {
  const hold = await ctx.db.get(key.holdId);
  const names = hold ? await listGroupNames(ctx, hold) : new Map<Id<"websites">, BrandName[]>();
  const counted: QuestionEngine[] = [];
  for (const engine of engines) {
    const answers = await ctx.db
      .query("aiAnswers")
      .withIndex("by_question", (q) =>
        q.eq("prompt", key.prompt).eq("engine", engine).eq("locationCode", answerPlace(engine, key.place)))
      .order("desc")
      .take(ANSWER_WINDOW);
    const entry = questionEngine(engine, answersSeenBy(answers, names), group);
    if (entry) counted.push(entry);
  }
  await putQuestionRow(ctx, key, await questionRow(ctx, key), counted);
}

/** The key a list's summary is requested under. */
function summaryKey(holdId: Id<"companyWebsites">): string {
  return `listAi:${holdId}`;
}

/** The key a list's whole recount is requested under. */
function recountKey(holdId: Id<"companyWebsites">): string {
  return `listAiAll:${holdId}`;
}

/** Ask for a list's summary to be added up again from its question rows, once, shortly. */
export async function requestListSummary(ctx: MutationCtx, holdId: Id<"companyWebsites">): Promise<void> {
  if (!(await claimSchedule(ctx, summaryKey(holdId)))) return;
  await ctx.scheduler.runAfter(LIST_REBUILD_DELAY_MS, internal.siteListAi.summariseList, { holdId });
}

/**
 * Ask for every question of a list to be counted again from its answers, and
 * then its summary: when its competitors or its place change, and once for
 * every list when the summaries arrived. A list that is not one — a
 * competitor's hold — has nothing to count, and is left alone.
 */
export async function requestListRecount(ctx: MutationCtx, holdId: Id<"companyWebsites">): Promise<void> {
  if (!(await claimSchedule(ctx, recountKey(holdId)))) return;
  await ctx.scheduler.runAfter(LIST_REBUILD_DELAY_MS, internal.siteListAi.recountList, { holdId });
}

/**
 * An answer filed: each company list asking the question of this engine, from
 * where the answer was asked, has the question's row worked out again from the
 * answers the question stats were just counted from — nothing read twice —
 * and its summary asked for. Called by `recordAnswer`, which alone finds who
 * asked (`websiteTenancyGuard.test.ts`).
 */
export async function recordListAnswer(
  ctx: MutationCtx,
  holdIds: ReadonlyArray<Id<"companyWebsites">>,
  answer: { prompt: string; engine: AiEngine; locationCode: number },
  answers: readonly Answer[],
): Promise<void> {
  for (const holdId of new Set(holdIds)) {
    const hold = await ctx.db.get(holdId);
    if (!hold || isTrackedHold(hold)) continue;
    const place = listPlace(hold);
    // Another place's answer is another answer; that place's list counts it.
    if (answerPlace(answer.engine, place) !== answer.locationCode) continue;
    const key = { holdId, place, prompt: answer.prompt };
    const row = await questionRow(ctx, key);
    // As this company reads them: its own names for each website of its group.
    const seen = answersSeenBy(answers, await listGroupNames(ctx, hold));
    const entry = questionEngine(answer.engine, seen, new Set(await listGroup(ctx, hold)));
    const others = (row?.engines ?? []).filter((held) => held.engine !== answer.engine);
    await putQuestionRow(ctx, key, row, entry ? [...others, entry] : others);
    await requestListSummary(ctx, holdId);
  }
}

/**
 * One question of a list counted again, or its row taken away when the list
 * no longer asks it: after a question is added or removed.
 */
export const recountQuestion = internalMutation({
  args: { holdId: v.id("companyWebsites"), prompt: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold || isTrackedHold(hold)) return null;
    const key = { holdId: args.holdId, place: listPlace(hold), prompt: args.prompt };
    const question = await holdQuestion(ctx, args.holdId, args.prompt);
    if (question) await countQuestion(ctx, key, question.engines, new Set(await listGroup(ctx, hold)));
    else await putQuestionRow(ctx, key, await questionRow(ctx, key), []);
    await requestListSummary(ctx, args.holdId);
    return null;
  },
});

const listFactsValidator = v.object({
  place: v.number(),
  group: v.array(v.id("websites")),
  questions: v.array(v.object({ prompt: v.string(), engines: v.array(aiEngineValidator) })),
});

/** What working a list out needs: its place, its group and its questions. Null for a hold that is gone or is no list. */
export const listFacts = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), listFactsValidator),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold || isTrackedHold(hold)) return null;
    const questions = await holdQuestions(ctx, args.holdId, MAX_LIST);
    return {
      place: listPlace(hold),
      group: await listGroup(ctx, hold),
      questions: questions.map((question) => ({ prompt: question.prompt, engines: question.engines })),
    };
  },
});

/** A few of a list's questions counted again from their answers. */
export const countQuestions = internalMutation({
  args: {
    holdId: v.id("companyWebsites"),
    place: v.number(),
    group: v.array(v.id("websites")),
    questions: v.array(v.object({ prompt: v.string(), engines: v.array(aiEngineValidator) })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const group = new Set(args.group);
    for (const question of args.questions) {
      await countQuestion(ctx, { holdId: args.holdId, place: args.place, prompt: question.prompt }, question.engines, group);
    }
    return null;
  },
});

/**
 * A page of a list's rows, clearing those it no longer supports: a question
 * removed, a place it is no longer asked from, or every row of a hold that is
 * gone. Returns where to carry on.
 */
export const sweepList = internalMutation({
  args: { holdId: v.id("companyWebsites"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ cursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    const place = hold && !isTrackedHold(hold) ? listPlace(hold) : null;
    const asked = new Set(place === null ? [] : (await holdQuestions(ctx, args.holdId, MAX_LIST)).map((question) => question.prompt));
    const page = await ctx.db
      .query("siteListQuestions")
      .withIndex("by_hold_prompt", (q) => q.eq("companyWebsiteId", args.holdId))
      .paginate({ numItems: ROWS_PER_SWEEP, cursor: args.cursor });
    for (const row of page.page) {
      if (row.locationCode !== place || !asked.has(row.prompt)) await ctx.db.delete(row._id);
    }
    if (page.isDone) {
      const summaries = await ctx.db
        .query("siteListAiSummary")
        .withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId))
        .take(ROWS_PER_SWEEP);
      for (const row of summaries) if (row.locationCode !== place) await ctx.db.delete(row._id);
    }
    return { cursor: page.continueCursor, isDone: page.isDone };
  },
});

/** How many of a website's pages the answers to a list's questions cite: the Sources cited list's own count. */
export const citedCount = internalQuery({
  args: { holdId: v.id("companyWebsites"), websiteId: v.id("websites"), place: v.number() },
  returns: listCitedValidator,
  handler: async (ctx, args) => {
    const pages = await citedPagesOf(ctx, args.websiteId, args.holdId, args.place, QUESTIONS_FOR_CITED_PAGES);
    return {
      websiteId: args.websiteId,
      pages: pages.length,
      engines: AI_ENGINES.flatMap((engine) => {
        const cited = pages.filter((page) => page.engines.includes(engine)).length;
        return cited > 0 ? [{ engine, pages: cited }] : [];
      }),
    };
  },
});

/**
 * A list's question rows added up, per engine: the answers counted, the
 * newest day, how often each website was named, and which the newest answer
 * to any question named. Only the questions on the list and the engines each
 * asks, as every screen has always read them.
 */
export function addUpList(
  questions: ReadonlyArray<Pick<Doc<"websiteQuestions">, "prompt" | "engines">>,
  rows: ReadonlyArray<Pick<Doc<"siteListQuestions">, "prompt" | "engines">>,
): ListEngine[] {
  const byPrompt = new Map(rows.map((row) => [row.prompt, row]));
  const perEngine = new Map<AiEngine, { asked: number; lastDay: string; named: Map<Id<"websites">, number>; newestNamed: Set<Id<"websites">> }>();
  for (const question of questions) {
    for (const entry of byPrompt.get(question.prompt)?.engines ?? []) {
      if (!question.engines.includes(entry.engine)) continue;
      const held = perEngine.get(entry.engine) ?? { asked: 0, lastDay: entry.lastDay, named: new Map(), newestNamed: new Set() };
      held.asked += entry.asked;
      if (entry.lastDay > held.lastDay) held.lastDay = entry.lastDay;
      for (const site of entry.sites) {
        if (site.named > 0) held.named.set(site.websiteId, (held.named.get(site.websiteId) ?? 0) + site.named);
        if (site.newest) held.newestNamed.add(site.websiteId);
      }
      perEngine.set(entry.engine, held);
    }
  }
  return AI_ENGINES.flatMap((engine) => {
    const held = perEngine.get(engine);
    if (!held) return [];
    return [{
      engine,
      asked: held.asked,
      lastDay: held.lastDay,
      named: [...held.named.entries()]
        .map(([websiteId, times]) => ({ websiteId, times }))
        .sort((left, right) => left.websiteId.localeCompare(right.websiteId)),
      newestNamed: [...held.newestNamed].sort(),
    }];
  });
}

/**
 * How often the answers to some of a list's questions named each website
 * other than the list's own, and when last — the question stats' "others
 * named", added up as Suggested competitors always has (`untrackedNamed`).
 */
export const namedOthers = internalQuery({
  args: {
    askerId: v.id("websites"),
    place: v.number(),
    questions: v.array(v.object({ prompt: v.string(), engines: v.array(aiEngineValidator) })),
  },
  returns: v.array(v.object({ websiteId: v.id("websites"), times: v.number(), lastDay: v.string() })),
  handler: async (ctx, args) => {
    const tally = new Map<Id<"websites">, { times: number; lastDay: string }>();
    for (const question of args.questions) {
      for (const engine of question.engines) {
        const stats = await ctx.db
          .query("websiteQuestionStats")
          .withIndex("by_key", (q) =>
            q.eq("websiteId", args.askerId).eq("prompt", question.prompt).eq("engine", engine).eq("locationCode", answerPlace(engine, args.place)))
          .unique();
        for (const other of stats?.othersNamed ?? []) {
          const held = tally.get(other.websiteId);
          tally.set(other.websiteId, {
            times: (held?.times ?? 0) + other.times,
            lastDay: held && held.lastDay > other.lastDay ? held.lastDay : other.lastDay,
          });
        }
      }
    }
    return [...tally.entries()].map(([websiteId, seen]) => ({ websiteId, ...seen }));
  },
});

/** Websites as a person reads them, for the ones a summary keeps. */
export const hostsOf = internalQuery({
  args: { websiteIds: v.array(v.id("websites")) },
  returns: v.array(v.object({ websiteId: v.id("websites"), host: v.string() })),
  handler: async (ctx, args) => {
    const websites = await Promise.all(args.websiteIds.map((websiteId) => ctx.db.get(websiteId)));
    // The host as discovery and the company's holds spell it, so the three can be matched.
    return websites.flatMap((website) => (website ? [{ websiteId: website._id, host: website.host }] : []));
  },
});

/** A list's summary written from its question rows and its group's cited pages, when it changed. */
export const writeSummary = internalMutation({
  args: {
    holdId: v.id("companyWebsites"),
    place: v.number(),
    cited: v.array(listCitedValidator),
    othersNamed: v.array(namedOtherValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    // Moved to another place while it was being counted: that place's count follows.
    if (!hold || isTrackedHold(hold) || listPlace(hold) !== args.place) return null;
    const [questions, rows, row] = await Promise.all([
      holdQuestions(ctx, args.holdId, MAX_LIST),
      ctx.db
        .query("siteListQuestions")
        .withIndex("by_hold_prompt", (q) => q.eq("companyWebsiteId", args.holdId).eq("locationCode", args.place))
        .take(MAX_LIST),
      ctx.db
        .query("siteListAiSummary")
        .withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId).eq("locationCode", args.place))
        .first(),
    ]);
    const engines = addUpList(questions, rows);
    const cited: ListCited[] = [...args.cited].filter((entry) => entry.pages > 0);
    const othersNamed: NamedOther[] = args.othersNamed;
    if (engines.length === 0 && cited.length === 0 && othersNamed.length === 0) {
      if (row) await ctx.db.delete(row._id);
      return null;
    }
    if (row && canonical({ engines: row.engines, cited: row.cited, othersNamed: row.othersNamed ?? [] }) === canonical({ engines, cited, othersNamed })) {
      return null;
    }
    const fields = { companyWebsiteId: args.holdId, locationCode: args.place, engines, cited, othersNamed, updatedAt: Date.now() };
    if (row) await ctx.db.replace(row._id, fields);
    else await ctx.db.insert("siteListAiSummary", fields);
    return null;
  },
});

/**
 * Add a list up: its group's cited pages, a website at a time; the websites
 * outside the group its answers name most, a few hundred questions at a time;
 * then its summary.
 */
async function summarise(ctx: ActionCtx, holdId: Id<"companyWebsites">): Promise<void> {
  const list: Infer<typeof listFactsValidator> | null = await ctx.runQuery(internal.siteListAi.listFacts, { holdId });
  if (!list) return;
  const cited: ListCited[] = [];
  for (const websiteId of list.group) {
    cited.push(await ctx.runQuery(internal.siteListAi.citedCount, { holdId, websiteId, place: list.place }));
  }
  const tally = new Map<Id<"websites">, { times: number; lastDay: string }>();
  for (let start = 0; start < list.questions.length; start += QUESTIONS_PER_READ) {
    const read: Array<{ websiteId: Id<"websites">; times: number; lastDay: string }> = await ctx.runQuery(internal.siteListAi.namedOthers, {
      // The list's own website is the group's first (`listGroup`).
      askerId: list.group[0],
      place: list.place,
      questions: list.questions.slice(start, start + QUESTIONS_PER_READ),
    });
    for (const seen of read) {
      const held = tally.get(seen.websiteId);
      tally.set(seen.websiteId, {
        times: (held?.times ?? 0) + seen.times,
        lastDay: held && held.lastDay > seen.lastDay ? held.lastDay : seen.lastDay,
      });
    }
  }
  const group = new Set(list.group);
  const kept = [...tally.entries()]
    .filter(([websiteId]) => !group.has(websiteId))
    .sort((left, right) => right[1].times - left[1].times || right[1].lastDay.localeCompare(left[1].lastDay) || left[0].localeCompare(right[0]))
    .slice(0, OTHERS_KEPT);
  const hosts: Array<{ websiteId: Id<"websites">; host: string }> = await ctx.runQuery(internal.siteListAi.hostsOf, { websiteIds: kept.map(([websiteId]) => websiteId) });
  const hostOf = new Map(hosts.map((entry) => [entry.websiteId, entry.host]));
  const othersNamed = kept.flatMap(([websiteId, seen]) => {
    const host = hostOf.get(websiteId);
    return host ? [{ websiteId, host, ...seen }] : [];
  });
  await ctx.runMutation(internal.siteListAi.writeSummary, { holdId, place: list.place, cited, othersNamed });
}

/**
 * Run one list's job in its turn: one at a time per key, as the site rebuild
 * does, so two never write the same rows together.
 */
async function inTurn(
  ctx: ActionCtx,
  key: string,
  retry: () => Promise<unknown>,
  work: () => Promise<void>,
): Promise<null> {
  if (!(await ctx.runMutation(internal.siteSummaries.beginRebuild, { key }))) {
    await retry();
    return null;
  }
  try {
    await work();
  } finally {
    await ctx.runMutation(internal.siteSummaries.endRebuild, { key });
  }
  return null;
}

/** A list's summary added up again from its question rows: after answers land, a question is added or removed. */
export const summariseList = internalAction({
  args: { holdId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    await inTurn(
      ctx,
      summaryKey(args.holdId),
      () => ctx.scheduler.runAfter(REBUILD_WAIT_MS, internal.siteListAi.summariseList, args),
      () => summarise(ctx, args.holdId),
    ),
});

/** Every question of a list counted again from its answers, the rows it no longer asks cleared, then its summary. */
export const recountList = internalAction({
  args: { holdId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    await inTurn(
      ctx,
      recountKey(args.holdId),
      () => ctx.scheduler.runAfter(REBUILD_WAIT_MS, internal.siteListAi.recountList, args),
      async () => {
        const list = await ctx.runQuery(internal.siteListAi.listFacts, { holdId: args.holdId });
        for (let start = 0; list && start < list.questions.length; start += QUESTIONS_PER_WRITE) {
          await ctx.runMutation(internal.siteListAi.countQuestions, {
            holdId: args.holdId,
            place: list.place,
            group: list.group,
            questions: list.questions.slice(start, start + QUESTIONS_PER_WRITE),
          });
        }
        for (let cursor: string | null = null; ;) {
          const swept: { cursor: string; isDone: boolean } = await ctx.runMutation(internal.siteListAi.sweepList, { holdId: args.holdId, cursor });
          if (swept.isDone) break;
          cursor = swept.cursor;
        }
        if (list) await summarise(ctx, args.holdId);
      },
    ),
});

/**
 * A hold's list rows removed, a batch of each at a time, with the hold or its
 * list; true once none is left.
 */
export async function purgeHoldListAi(ctx: MutationCtx, holdId: Id<"companyWebsites">, batch: number): Promise<boolean> {
  const questions = await ctx.db
    .query("siteListQuestions")
    .withIndex("by_hold_prompt", (q) => q.eq("companyWebsiteId", holdId))
    .take(batch);
  for (const row of questions) await ctx.db.delete(row._id);
  const summaries = await ctx.db
    .query("siteListAiSummary")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId))
    .take(batch);
  for (const row of summaries) await ctx.db.delete(row._id);
  return questions.length < batch && summaries.length < batch;
}

/** Every company's list counted from the answers already held, once, when the summaries arrived. */
export async function recountEveryList(
  ctx: MutationCtx,
  cursor: string | null,
  batchSize: number,
): Promise<{ cursor: string | null; isDone: boolean; processed: number; updated: number }> {
  const page = await ctx.db.query("companyWebsites").paginate({ numItems: batchSize, cursor });
  let updated = 0;
  for (const hold of page.page) {
    if (isTrackedHold(hold)) continue;
    await requestListRecount(ctx, hold._id);
    updated += 1;
  }
  return { cursor: page.isDone ? null : page.continueCursor, isDone: page.isDone, processed: page.page.length, updated };
}
