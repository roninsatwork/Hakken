import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { SeoOperation } from "./dataForSeoRegistry";
import { DAY_MS, collectsEveryRun, heldForDays, isCrawl, type Asker } from "./seoBuyingRules";
import { isWebsiteDue } from "./seoScheduleService";
import { sentOffset } from "./sitePagedLists";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { readSentLocationCode } from "./utils/seoSentPlace";
import { SEO_MANUAL_FRESH_MS } from "./seoCollectionPolicy";

/**
 * Whether a website already has an answer to a request, so the request is
 * served rather than bought again — the rungs of the reuse ladder that look
 * across days (`seoCollection.ts`). Moved out of `seoCollection.ts` on
 * 2026-10-05, when the rules of what is held for how long grew a module of
 * their own (`seoBuyingRules.ts`).
 */

/** A site's newest pulls of one operation read for the hold; failures in a row past this many are not a week. */
const PULLS_READ_FOR_HOLD = 50;

/**
 * The answer an operation with its own cadence is still held on: the newest
 * one bought for this website within its hold (`heldForDays`) — or one
 * already on its way, planned within that time and not yet sent or answered.
 * Without the second, a weekly list left unsent while the Collector was at its
 * spending cap would be planned again by the next day's cycle, and both would
 * be bought. Null for everything else, which the cycle's cadence decides.
 *
 * Read by website, not by company: one crawl, one list, serves every company
 * holding the website, as one host is stored once.
 *
 * Also the ad hoc door's check (`requestSeoPull` in `seoTools.ts`), so an
 * agent cannot buy a weekly list daily.
 *
 * `taskArgsJson`, when given, is what would be sent: only the same call asked
 * the same way holds — from the same place, for the same page of a list.
 *
 * `asker`, when given, is how the asking run collects. A company that collects
 * about as seldom as the call, or more seldom, buys it every run
 * (`collectsEveryRun`) — but one still on its way is shared rather than bought
 * twice. Otherwise the answer holds only until it is within half a run of due,
 * so the call is bought on the run nearest its own cadence (`repeatDays` in
 * `seoRunEstimate.ts`). Held for its whole cadence, a weekly list was bought
 * every other week on a weekly schedule — the last one a few minutes short of
 * seven days old — and a monthly company's run skipped the crawl after every
 * month of thirty days or fewer (2026-09-25). The crawl is held a month
 * whatever starts the run (`CRAWL_HELD_DAYS`).
 */
export async function heldByOwnCadence(
  ctx: MutationCtx,
  operation: SeoOperation,
  websiteId: Id<"websites">,
  now: Date,
  taskArgsJson?: string,
  asker?: Asker,
): Promise<Id<"seoDataPulls"> | null> {
  if (!operation.refresh) return null;
  const ownDays = operation.refresh.everyDays;
  // Bought every run: no answer holds, but one still on its way is shared.
  const everyRun = asker !== undefined && !isCrawl(operation.id) && collectsEveryRun(ownDays, asker.runDays);
  const window = heldForDays(operation.id, ownDays, asker) * DAY_MS;
  const recent = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_website_operation_submitted", (q) => q.eq("websiteId", websiteId).eq("operationId", operation.id))
    .order("desc")
    .take(PULLS_READ_FOR_HOLD);
  for (const pull of recent) {
    if (pull.sandbox === true || pull.status === "FAILED") continue;
    if (taskArgsJson !== undefined && pull.taskArgsJson !== taskArgsJson) continue;
    if (pull.status === "READY") {
      if (pull.completedAt !== undefined && now.getTime() - pull.completedAt < window) return pull._id;
      continue;
    }
    // Planned, claimed or sent, and not answered yet: on its way.
    if (everyRun || now.getTime() - pull.submittedAt < window) return pull._id;
  }
  return null;
}

/**
 * Whether a site's whole list is due this run: unless a whole list at this
 * company's limit or more — a first page bought to reach it — was answered,
 * or is on its way, for this website from this place inside the list's
 * cadence. A first page bought for an everyday check, or for a company that
 * keeps fewer, is not this company's whole list (docs/plans/active/
 * sites-data-completeness-plan.md, B4). A company collecting as seldom as the
 * list is bought buys it every run.
 */
export async function wholeListDue(
  ctx: MutationCtx,
  operation: SeoOperation,
  websiteId: Id<"websites">,
  place: number,
  limit: number,
  now: Date,
  runDays: number,
): Promise<boolean> {
  if (!operation.refresh || collectsEveryRun(operation.refresh.everyDays, runDays)) return true;
  const window = (operation.refresh.everyDays - runDays / 2) * DAY_MS;
  const recent = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_website_operation_submitted", (q) => q.eq("websiteId", websiteId).eq("operationId", operation.id))
    .order("desc")
    .take(PULLS_READ_FOR_HOLD);
  for (const pull of recent) {
    if (pull.sandbox === true || pull.status === "FAILED") continue;
    if (sentOffset(pull.taskArgsJson) !== 0) continue;
    if ((readSentLocationCode(pull.taskArgsJson) ?? DEFAULT_LOCATION_CODE) !== place) continue;
    // Pages planned before a page carried its reach were each the whole list.
    if (pull.listReach !== undefined && pull.listReach < limit) continue;
    if (pull.status === "READY") {
      if (pull.completedAt !== undefined && now.getTime() - pull.completedAt < window) return false;
      continue;
    }
    if (now.getTime() - pull.submittedAt < window) return false;
  }
  return true;
}

/**
 * The newest answer to exactly this request for this website that the asker
 * would still call fresh — the first rung of the reuse ladder, for a request
 * with no cadence of its own.
 */
export async function findFreshPull(
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
