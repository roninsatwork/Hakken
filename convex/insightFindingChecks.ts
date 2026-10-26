import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { readPage } from "./moneyPageChecks";
import { pageMoved, pageOfKey, trackOpen, type PageSeen, type Update } from "./utils/insightClock";
import type { Fact } from "./utils/insightFacts";
import type { openFindingValidator } from "./insightsTrackParts";

/** A finding's pages read at once. */
const AT_ONCE = 5;

/**
 * Keeping score each week (§2.7; utils/insightClock.ts): each open
 * finding's page read again, a change to it — or one the change log saw —
 * starting its days again; its figure so far kept; and each one due judged.
 * Returns how many were judged and how many started again.
 */
export async function checkOpenFindings(
  ctx: ActionCtx,
  run: { holdId: Id<"companyWebsites">; companyId: Id<"companies">; runId?: Id<"agentRuns">; chainBooking?: number },
  facts: ReadonlyMap<string, Fact>,
  today: string,
): Promise<{ judged: number; restarted: number }> {
  const changedOn = new Map<string, string>();
  for (let cursor: string | null = null; ;) {
    const part: { page: Array<{ page: string; day: string }>; continueCursor: string; isDone: boolean } = await ctx.runQuery(internal.insightsTrackParts.changePart, { holdId: run.holdId, paginationOpts: { cursor, numItems: 100 } });
    for (const change of part.page) if ((changedOn.get(change.page) ?? "") < change.day) changedOn.set(change.page, change.day);
    if (part.isDone) break;
    cursor = part.continueCursor;
  }
  const totals = { judged: 0, restarted: 0 };
  const read = new Map<string, Awaited<ReturnType<typeof readPage>>>();
  for (let cursor: string | null = null; ;) {
    const part: { page: Array<typeof openFindingValidator.type>; origin: string | null; continueCursor: string; isDone: boolean } = await ctx.runQuery(internal.insightsTrackParts.openFindingPart, { holdId: run.holdId, paginationOpts: { cursor, numItems: 25 } });
    const checked = await checkPart(ctx, run, facts, today, { findings: part.page, origin: part.origin }, changedOn, read);
    totals.judged += checked.judged;
    totals.restarted += checked.restarted;
    if (part.isDone) break;
    cursor = part.continueCursor;
  }
  return totals;
}

/** Each saved batch is a recovery checkpoint; scored outcomes and today's page readings are reused on continuation. */
async function checkPart(
  ctx: ActionCtx,
  run: { holdId: Id<"companyWebsites">; companyId: Id<"companies">; runId?: Id<"agentRuns">; chainBooking?: number },
  facts: ReadonlyMap<string, Fact>, today: string,
  open: { findings: Array<typeof openFindingValidator.type>; origin: string | null },
  changedOn: Map<string, string>,
  read: Map<string, Awaited<ReturnType<typeof readPage>>>,
): Promise<{ judged: number; restarted: number }> {
  if (open.findings.length === 0) return { judged: 0, restarted: 0 };
  const changed = (page: string, day: string) => {
    if ((changedOn.get(page) ?? "") < day) changedOn.set(page, day);
  };
  // Each finding's page as it reads now, against what it said when last read.
  const pageOf = (finding: (typeof open.findings)[number]) => finding.clock?.page ?? pageOfKey(finding.watch.key);
  for (const finding of open.findings) {
    const page = pageOf(finding);
    if (page && finding.pageSeen?.day === today && !read.has(page)) read.set(page, finding.pageSeen);
  }
  const pages = [...new Set(open.findings.flatMap((finding) => pageOf(finding) ?? []))].filter((page) => !read.has(page));
  for (let at = 0; at < pages.length && open.origin; at += AT_ONCE) {
    await Promise.all(pages.slice(at, at + AT_ONCE).map(async (page) => read.set(page, await readPage(ctx, `${open.origin}${page}`).catch(() => null))));
  }
  const seen = new Map<Id<"insightFindings">, PageSeen>();
  for (const finding of open.findings) {
    const page = pageOf(finding);
    const now = page ? read.get(page) : null;
    if (!page || !now) continue;
    if (finding.pageSeen && pageMoved(finding.pageSeen, now)) changed(page, today);
    seen.set(finding.findingId, { day: today, facts: now.facts, structured: now.structured });
  }

  const tracked = trackOpen(open.findings, facts, changedOn, today);
  const updates = new Map<Id<"insightFindings">, Update>(tracked.updates.map((update) => [update.findingId, update]));
  for (const [findingId, pageSeen] of seen) updates.set(findingId, { ...(updates.get(findingId) ?? { findingId }), pageSeen });
  if (tracked.outcomes.length > 0 || updates.size > 0) {
    await ctx.runMutation(internal.insightsTeam.scoreFindings, { companyId: run.companyId, holdId: run.holdId, runId: run.runId, chainBooking: run.chainBooking, outcomes: tracked.outcomes, updates: [...updates.values()] });
  }
  return { judged: tracked.outcomes.length, restarted: tracked.updates.filter((update) => update.clock?.why === "PAGE_CHANGED" && update.clock.from === changedOn.get(update.clock.page ?? "")).length };
}
