import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  companyCollectionSchedule,
  isWebsiteDue,
  resolveWebsiteSchedule,
  type ResolvedWebsiteSchedule,
} from "./seoScheduleService";
import { countingReads } from "./utils/countingReads";
import { isTrackedHold, pairedOwnedHold } from "./utils/websitePairing";

/**
 * Whether a website, or a whole company, is due a collection.
 *
 * One set of tests, asked in two places: each website's planning in a
 * collection (`seoCollection.websiteSteps`), and a Live Planner run before it
 * opens a company's collection at all (`seoAgentRuns.openCompanyCycle`). Kept
 * in one file so the two cannot drift apart: a company judged "nothing due"
 * here must be one whose planning would have planned nothing.
 */

/** The newest run's lines for a website read to see whether anything it asked came back. */
const LINES_READ_FOR_DUE = 50;

/**
 * When this company last collected this website: when its newest run to plan
 * it did, if anything that run asked came back or is still coming. Judged
 * from what was planned, a website whose whole collection failed — refused,
 * given up, or never sent — waited a whole period for the next (reliability
 * plan 3.6). A run whose every read request failed collected nothing.
 */
async function lastCollectedAt(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  websiteId: Id<"websites">,
): Promise<number | undefined> {
  const recent = await ctx.db
    .query("seoCycleLines")
    .withIndex("by_company_website", (q) => q.eq("companyId", companyId).eq("websiteId", websiteId))
    .order("desc")
    .take(LINES_READ_FOR_DUE);
  const newest = recent[0];
  if (!newest) return undefined;
  for (const line of recent) {
    if (line.cycleId !== newest.cycleId) break;
    const pull = await ctx.db.get(line.pullId);
    if (pull && pull.status !== "FAILED") return newest.createdAt;
  }
  return undefined;
}

/**
 * Whether this company collects this website on the website's own turn:
 * switched on, and not a tracked site reached through its pair. Its schedule
 * when it does.
 *
 * A tracked site paired with one of the company's own is reached as a target
 * of that site — which is what makes the two land on the same day — so
 * walking it on its own as well would plan it twice.
 *
 * A tracked site with no pair is collected on its own settings, like any
 * hold. It was skipped outright for a while, which meant a company could
 * choose to watch a site and have it never collected at all, with nothing on
 * screen to say so.
 */
export async function collectedOnItsOwn(
  ctx: MutationCtx,
  schedule: Doc<"schedules"> | null,
  companyWebsite: Doc<"companyWebsites">,
  now: Date,
): Promise<ResolvedWebsiteSchedule | null> {
  if (isTrackedHold(companyWebsite) && await pairedOwnedHold(ctx, companyWebsite)) return null;
  const resolved = resolveWebsiteSchedule(schedule, companyWebsite, now);
  return resolved.active ? resolved : null;
}

/** Whether a website's cadence says it is due, judged from when this company last collected it. */
export async function dueByCadence(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  schedule: Doc<"schedules"> | null,
  companyWebsite: Doc<"companyWebsites">,
  now: Date,
): Promise<boolean> {
  const collectedAt = await lastCollectedAt(ctx, companyId, companyWebsite.websiteId);
  return collectedAt === undefined || isWebsiteDue(schedule, companyWebsite, collectedAt, now);
}

/** Websites, and reads, the due check below makes at most before it stops judging and says "due". */
const DUE_CHECK_HOLDS = 100;
const DUE_CHECK_READ_BUDGET = 2_000;

/**
 * Whether a Live Planner run has anything to collect for this company now: a
 * website it collects whose cadence says it is due — the same two tests each
 * website's own planning makes (`websiteSteps`).
 *
 * Asked before a collection is opened, so a company with nothing due gets no
 * collection at all. Without it every Planner run opened one for every
 * company collecting, due or not, and most came back empty.
 *
 * A company too large to judge inside what one check reads counts as due, and
 * its collection's own planning skips what is not: an empty collection at
 * worst, never a missed one.
 */
export async function companyHasWorkDue(
  txn: MutationCtx,
  companyId: Id<"companies">,
  now: Date,
): Promise<boolean> {
  const { ctx, reads } = countingReads(txn);
  const schedule = await companyCollectionSchedule(ctx, companyId);
  const holds = await ctx.db
    .query("companyWebsites")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .take(DUE_CHECK_HOLDS + 1);
  for (const hold of holds.slice(0, DUE_CHECK_HOLDS)) {
    if (reads() >= DUE_CHECK_READ_BUDGET) return true;
    if (!await collectedOnItsOwn(ctx, schedule, hold, now)) continue;
    if (await dueByCadence(ctx, companyId, schedule, hold, now)) return true;
  }
  return holds.length > DUE_CHECK_HOLDS;
}
