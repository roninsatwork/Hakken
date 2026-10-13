import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { readPage } from "./moneyPageChecks";
import { pageMoved, pageOfKey, trackOpen, type PageSeen, type Update } from "./utils/insightClock";
import type { Fact } from "./utils/insightFacts";

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
  run: { holdId: Id<"companyWebsites">; companyId: Id<"companies"> },
  facts: ReadonlyMap<string, Fact>,
  today: string,
): Promise<{ judged: number; restarted: number }> {
  const open = await ctx.runQuery(internal.insightsTeam.openFindings, { holdId: run.holdId });
  if (open.findings.length === 0) return { judged: 0, restarted: 0 };
  const changedOn = new Map<string, string>();
  const changed = (page: string, day: string) => {
    if ((changedOn.get(page) ?? "") < day) changedOn.set(page, day);
  };
  for (const change of open.changes) changed(change.page, change.day);

  // Each finding's page as it reads now, against what it said when last read.
  const pageOf = (finding: (typeof open.findings)[number]) => finding.clock?.page ?? pageOfKey(finding.watch.key);
  const pages = [...new Set(open.findings.flatMap((finding) => pageOf(finding) ?? []))];
  const read = new Map<string, Awaited<ReturnType<typeof readPage>>>();
  for (let at = 0; at < pages.length && open.origin; at += AT_ONCE) {
    await Promise.all(pages.slice(at, at + AT_ONCE).map(async (page) => read.set(page, await readPage(`${open.origin}${page}`).catch(() => null))));
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
    await ctx.runMutation(internal.insightsTeam.scoreFindings, { companyId: run.companyId, outcomes: tracked.outcomes, updates: [...updates.values()] });
  }
  return { judged: tracked.outcomes.length, restarted: tracked.updates.filter((update) => update.clock?.why === "PAGE_CHANGED" && update.clock.from === changedOn.get(update.clock.page ?? "")).length };
}
