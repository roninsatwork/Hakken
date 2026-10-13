import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { prepareDecisions, runDecisions, type DecisionResult } from "./decisionActions";
import { PAGE_SLOTS } from "./fanOutPageJudge";
import { insightsStepArgs } from "./insightsAsk";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { applyChosen, offeredReading, ownerQuestions, pickedPages, picksDue } from "./utils/insightCompetingJudge";
import type { CompetingGroup } from "./utils/insightCompeting";

/**
 * Jev picks each search's page for Keyword cannibalisation (utils/
 * insightCompetingJudge.ts says what is asked and how it's put on a group):
 * the `seo.angle-page` Decision, the one the Fan-out screen asks, so the two
 * never disagree. Asked only while the Decision acts on its own — like every
 * Decision it ships switched off, and then the run is as before: the rule
 * picks and the specialist may change its picks. On, the decision model's
 * sure answers are each search's page, the rule's stands where it isn't
 * sure, and the specialist explains them and decides the pages' actions,
 * never picking a page itself.
 *
 * The picks are a step of the weekly run of their own, before the deciding
 * (Anthony, 13 October 2026, "go", after 164 searches went unasked at a
 * two-minute limit inside the deciding step): every search is asked, a step
 * that runs short of time hands on to itself, and each answer is kept per
 * search, asked again only when the pages Google shows for it change.
 */

export const OWNER_DECISION = "seo.angle-page";
/** Searches asked at once. */
const AT_ONCE = 16;
/** A picking step asks for this long, then hands on to itself: well inside the ten minutes an action lives. */
const PICK_FOR_MS = 7 * 60 * 1000;
/** Picking steps a week, at most: a website's searches never need more. */
export const MOST_PICK_ROUNDS = 6;

/** The website and place its rankings are read for. */
export const judgeTarget = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({ websiteId: v.id("websites"), locationCode: v.number() })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    return hold ? { websiteId: hold.websiteId, locationCode: hold.locationCode ?? DEFAULT_LOCATION_CODE } : null;
  },
});

const pickValidator = v.object({ search: v.string(), offered: v.string(), page: v.union(v.string(), v.null()), certainty: v.optional(v.string()), pickedAt: v.number() });

/** A website's picks as kept, for the searches of this week's groups, each looked up by itself. */
export const picksFor = internalQuery({
  args: { holdId: v.id("companyWebsites"), searches: v.array(v.string()) },
  returns: v.array(pickValidator),
  handler: async (ctx, args) => {
    const out = [];
    for (const search of new Set(args.searches)) {
      const row = await ctx.db.query("insightSearchPicks").withIndex("by_hold_search", (q) => q.eq("companyWebsiteId", args.holdId).eq("search", search)).first();
      if (row) out.push({ search: row.search, offered: row.offered, page: row.page, ...(row.certainty ? { certainty: row.certainty } : {}), pickedAt: row.pickedAt });
    }
    return out;
  },
});

/** Picks kept, each search's last replaced. */
export const savePicks = internalMutation({
  args: { holdId: v.id("companyWebsites"), picks: v.array(pickValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold) return null;
    for (const pick of args.picks) {
      const held = await ctx.db.query("insightSearchPicks").withIndex("by_hold_search", (q) => q.eq("companyWebsiteId", args.holdId).eq("search", pick.search)).first();
      if (held) await ctx.db.patch(held._id, { offered: pick.offered, page: pick.page, certainty: pick.certainty, pickedAt: pick.pickedAt });
      else await ctx.db.insert("insightSearchPicks", { companyId: hold.companyId, companyWebsiteId: args.holdId, ...pick });
    }
    return null;
  },
});

/**
 * The weekly run's picking step: each search of this week's groups whose
 * pick isn't held for the pages Google shows for it now asked, a handful at
 * once, and kept as it goes; then on to deciding, or to itself again when
 * its time ran out first.
 */
export const pickWebsite = internalAction({
  args: { ...insightsStepArgs, watchId: v.id("_scheduled_functions"), pagesChanged: v.array(v.object({ kind: v.string(), page: v.string() })), round: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { watchId, pagesChanged, round = 1, ...run } = args;
    let done = true;
    try {
      done = await pickOwners(ctx, run, round);
    } catch (error) {
      await ctx.runMutation(internal.roleRuns.logRunLine, { runId: run.runId, companyId: run.companyId, heading: "Pages for each search", detail: error instanceof Error ? error.message.slice(0, 500) : "Could not pick.", failed: true });
    }
    const again = !done && round < MOST_PICK_ROUNDS;
    await ctx.runMutation(internal.insightsRunSteps.handOnInsights, { ...run, step: again ? "PICK" : "DECIDE", cancelWatchId: watchId, pagesChanged, round: round + 1 });
    return null;
  },
});

/** One picking step's asking; true when every search due was asked. */
async function pickOwners(ctx: ActionCtx, run: { runId: Id<"agentRuns">; companyId: Id<"companies">; holdId: Id<"companyWebsites">; host: string }, round: number): Promise<boolean> {
  const prepared = await prepareDecisions(ctx, { keys: [OWNER_DECISION], companyId: run.companyId });
  if (prepared.modes[OWNER_DECISION] !== "ACT") return true;
  const [competing, business, target] = await Promise.all([
    ctx.runQuery(internal.insightCompeting.groupsForRun, { holdId: run.holdId }),
    ctx.runQuery(internal.holdProfiles.describeHoldForJudgingInternal, { companyWebsiteId: run.holdId }),
    ctx.runQuery(internal.insightCompetingJudge.judgeTarget, { holdId: run.holdId }),
  ]);
  if (!competing || !target) return true;
  const started = Date.now();
  const questions = [...new Map(competing.groups.flatMap((group) => ownerQuestions(group, PAGE_SLOTS.length)).map((question) => [question.search, question])).values()];
  const held = await ctx.runQuery(internal.insightCompetingJudge.picksFor, { holdId: run.holdId, searches: questions.map((question) => question.search) });
  const picks = new Map(held.map((pick) => [pick.search, pick]));
  const due = picksDue(questions, picks, started);
  const pages = [...new Set(competing.groups.flatMap((group) => group.pages.map((page) => page.path)))];
  const ranks: Record<string, string[]> = await ctx.runQuery(internal.fanOutPageJudge.pageSearches, { websiteId: target.websiteId, locationCode: target.locationCode, pages }).catch(() => ({}));
  const slots: readonly string[] = PAGE_SLOTS;
  let asked = 0, sure = 0;
  for (let at = 0; at < due.length; at += AT_ONCE) {
    if (Date.now() - started > PICK_FOR_MS) break;
    const answered = await Promise.all(due.slice(at, at + AT_ONCE).map(async (question) => {
      const result = (await runDecisions(ctx, {
        companyId: run.companyId,
        prepared,
        subject: { kind: "insights-cannibalisation", id: run.holdId },
        state: {
          business: { address: run.host, ...(business?.sector ? { sells: business.sector } : {}), ...(business?.does ? { does: business.does } : {}) },
          search: { text: question.search, ...(question.volume !== null ? { searchedAMonth: question.volume } : {}) },
          pages: Object.fromEntries(question.offered.map((page, index) => [slots[index], {
            address: page.path,
            ...(ranks[page.path]?.length ? { ranksFor: ranks[page.path] } : {}),
            showedItFor: page.shown,
          }])),
        },
        // Before the decision model is reached, the rule's page.
        requests: [{ key: OWNER_DECISION, fallback: () => ({ kind: "pick-one" as const, choice: question.rule >= 0 ? slots[question.rule] : "other" }) }],
      }).catch((): Record<string, DecisionResult> => ({})))[OWNER_DECISION];
      // A provider that failed answers nothing to keep: the search is asked again next step.
      if (!result || result.source === "RULES") return null;
      const picked = result.verdict === "ACT" && result.answer.kind === "pick-one" ? question.offered[slots.indexOf(result.answer.choice)] : undefined;
      return { search: question.search, offered: offeredReading(question), page: picked?.path ?? null, ...(result.certainty ? { certainty: result.certainty } : {}), pickedAt: Date.now() };
    }));
    const kept = answered.filter((pick): pick is NonNullable<typeof pick> => pick !== null);
    asked += kept.length;
    sure += kept.filter((pick) => pick.page !== null).length;
    if (kept.length > 0) await ctx.runMutation(internal.insightCompetingJudge.savePicks, { holdId: run.holdId, picks: kept });
  }
  const left = due.length - asked;
  await ctx.runMutation(internal.roleRuns.logRunLine, {
    runId: run.runId, companyId: run.companyId, heading: "Pages for each search",
    detail: `The decision model ("Which page answers this search?")${round > 1 ? `, step ${round},` : ""} was asked ${asked} of ${due.length} searches whose page it hadn't picked for the pages Google shows now, and was sure of ${sure}; ${questions.length - due.length} were kept from before.${left > 0 ? ` ${left} are asked in the next step.` : ""}`,
    failed: false,
  });
  return left === 0;
}

export type OwnerTally = { chosen: number; changed: number; unsure: number };

/**
 * For the deciding step: each group's searches given the decision model's
 * kept picks — those made for the pages Google shows for the search now —
 * or null while the Decision doesn't act on its own. A search it wasn't sure
 * of, or wasn't asked about, keeps the rule's page.
 */
export async function ownerJudge(ctx: ActionCtx, run: { companyId: Id<"companies">; holdId: Id<"companyWebsites"> }, groups: readonly CompetingGroup[], websiteRate: number | null) {
  const prepared = await prepareDecisions(ctx, { keys: [OWNER_DECISION], companyId: run.companyId });
  if (prepared.modes[OWNER_DECISION] !== "ACT") return null;
  const searches = groups.flatMap((group) => group.searches.map((search) => search.search));
  const picks = new Map((await ctx.runQuery(internal.insightCompetingJudge.picksFor, { holdId: run.holdId, searches })).map((pick) => [pick.search, pick]));
  const tally: OwnerTally = { chosen: 0, changed: 0, unsure: 0 };
  const judge = (group: CompetingGroup) => {
    const { chosen, unsure } = pickedPages(ownerQuestions(group, PAGE_SLOTS.length), picks);
    tally.unsure += unsure;
    const applied = applyChosen(group, chosen, websiteRate);
    tally.chosen += applied.chosen;
    tally.changed += applied.changed;
  };
  return { judge, tally };
}

/** The decision model's part of the run's log line. */
export function ownerTallyLine(tally: OwnerTally): string {
  if (tally.chosen === 0 && tally.unsure === 0) return "";
  return ` The decision model ("Which page answers this search?") chose the page for ${tally.chosen} searches, ${tally.changed} of them other than the rule's; for the ${tally.unsure} it wasn't sure of, the rule's page stands.`;
}
