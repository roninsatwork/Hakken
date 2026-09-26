import { appError } from "./appError";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * The company's own site a tracked one is watched against, if the pairing
 * still stands.
 *
 * A tracked site is collected with the site it is compared to — the same day,
 * the same place — because numbers pulled in different weeks are not a
 * comparison. That only holds while the pair is still one of the company's
 * *own* holds. A pairing that points at a site the company no longer holds, or
 * at another tracked one, is no pairing at all, and the tracked site is then
 * collected on its own rather than silently never.
 *
 * Here rather than in `websites.ts` because three modules need the same answer
 * — the list, the attachment writes and the collection cycle — and a second
 * copy of "what counts as paired" is how two of them come to disagree.
 */
export async function pairedOwnedHold(
  ctx: { db: QueryCtx["db"] },
  hold: Doc<"companyWebsites">,
): Promise<Doc<"companyWebsites"> | null> {
  if (hold.relationship !== "TRACKED" || !hold.againstWebsiteId) return null;
  const againstWebsiteId = hold.againstWebsiteId;

  const pair = await ctx.db
    .query("companyWebsites")
    .withIndex("by_company_website", (q) =>
      q.eq("companyId", hold.companyId).eq("websiteId", againstWebsiteId))
    .first();

  if (!pair || pair.relationship === "TRACKED") return null;
  return pair;
}

/** Absent reads as owned: every hold written before the flag existed was one. */
export function isTrackedHold(hold: Pick<Doc<"companyWebsites">, "relationship">): boolean {
  return hold.relationship === "TRACKED";
}

/**
 * The hold whose searches and questions a hold is measured on
 * (docs/plans/active/private-tracking-lists-plan.md): its own, for one of a
 * company's own websites; for a competitor, the owned hold it is watched
 * against (`pair`); none for a competitor watched against nothing (V8). The
 * one place the rule lives — `listHold` in `siteAccess.ts` and the admin row
 * loaders in `websiteSiteRows.ts` both ask it.
 */
export function listOwnerHold(
  hold: Doc<"companyWebsites">,
  pair: Doc<"companyWebsites"> | null,
): Doc<"companyWebsites"> | null {
  return isTrackedHold(hold) ? pair : hold;
}

/**
 * Refuse a setting that a pairing overrides.
 *
 * A paired tracked site has no schedule or place of its own — it is collected
 * on its pair's day, from its pair's place. Writing one anyway would store a
 * value nothing reads, and a screen showing it would be showing a setting that
 * does nothing, which is the fault this whole rebuild started from.
 */
export async function refuseIfPaired(
  ctx: { db: QueryCtx["db"] },
  hold: Doc<"companyWebsites">,
  setting: "schedule" | "place",
): Promise<void> {
  const pair = await pairedOwnedHold(ctx, hold);
  if (!pair) return;
  const pairSite = await ctx.db.get(pair.websiteId);
  const host = pairSite?.displayHost ?? "the site it is watched against";
  throw appError(
    "INVALID_INPUT",
    setting === "schedule"
      ? `This site is collected with ${host}, on its day. Change ${host}'s schedule, or unpair this one to give it its own.`
      : `This site is watched from wherever ${host} is. Change ${host}'s place, or unpair this one to give it its own.`,
  );
}
