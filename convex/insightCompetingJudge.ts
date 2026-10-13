import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type ActionCtx } from "./_generated/server";
import { prepareDecisions, runDecisions } from "./decisionActions";
import { PAGE_SLOTS } from "./fanOutPageJudge";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { applyChosen, ownerQuestions } from "./utils/insightCompetingJudge";
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
 */

export const OWNER_DECISION = "seo.angle-page";
/** Searches asked at once. */
const AT_ONCE = 8;
/** Past this, no more searches are asked in the run: the rest keep the rule's page, and the specialist still has its time. */
const JUDGE_FOR_MS = 120_000;

/** The website and place its rankings are read for. */
export const judgeTarget = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({ websiteId: v.id("websites"), locationCode: v.number() })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    return hold ? { websiteId: hold.websiteId, locationCode: hold.locationCode ?? DEFAULT_LOCATION_CODE } : null;
  },
});

export type OwnerTally = { asked: number; chosen: number; changed: number; unsure: number; left: number };

/**
 * The judge for one run's groups, or null while the Decision doesn't act on
 * its own. Each group's searches are asked a handful at once; a search it
 * wasn't sure of, couldn't reach, or wasn't asked before the run's time ran
 * out keeps the rule's page.
 */
export async function ownerJudge(
  ctx: ActionCtx,
  run: { companyId: Id<"companies">; holdId: Id<"companyWebsites">; host: string },
  websiteRate: number | null,
) {
  const prepared = await prepareDecisions(ctx, { keys: [OWNER_DECISION], companyId: run.companyId });
  if (prepared.modes[OWNER_DECISION] !== "ACT") return null;
  const [business, target] = await Promise.all([
    ctx.runQuery(internal.holdProfiles.describeHoldForJudgingInternal, { companyWebsiteId: run.holdId }),
    ctx.runQuery(internal.insightCompetingJudge.judgeTarget, { holdId: run.holdId }),
  ]);
  if (!target) return null;
  const started = Date.now();
  const tally: OwnerTally = { asked: 0, chosen: 0, changed: 0, unsure: 0, left: 0 };
  const slots: readonly string[] = PAGE_SLOTS;

  const judge = async (group: CompetingGroup) => {
    const questions = ownerQuestions(group, PAGE_SLOTS.length);
    const ranks: Record<string, string[]> = await ctx.runQuery(internal.fanOutPageJudge.pageSearches, {
      websiteId: target.websiteId, locationCode: target.locationCode, pages: group.pages.map((page) => page.path),
    }).catch(() => ({}));
    const chosen = new Map<string, string>();
    for (let at = 0; at < questions.length; at += AT_ONCE) {
      if (Date.now() - started > JUDGE_FOR_MS) {
        tally.left += questions.length - at;
        break;
      }
      await Promise.all(questions.slice(at, at + AT_ONCE).map(async (question) => {
        tally.asked += 1;
        try {
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
          }))[OWNER_DECISION];
          const picked = result?.verdict === "ACT" && result.answer.kind === "pick-one" ? question.offered[slots.indexOf(result.answer.choice)] : undefined;
          if (picked) chosen.set(question.search, picked.path);
          else tally.unsure += 1;
        } catch {
          tally.unsure += 1;
        }
      }));
    }
    const applied = applyChosen(group, chosen, websiteRate);
    tally.chosen += applied.chosen;
    tally.changed += applied.changed;
  };
  return { judge, tally };
}

/** The decision model's part of the run's log line. */
export function ownerTallyLine(tally: OwnerTally): string {
  if (tally.asked === 0 && tally.left === 0) return "";
  return ` The decision model ("Which page answers this search?") chose the page for ${tally.chosen} of ${tally.asked} searches, ${tally.changed} of them other than the rule's; where it wasn't sure the rule's page stands${tally.left > 0 ? `, as it does for ${tally.left} not asked before the run's time for it ran out` : ""}.`;
}
