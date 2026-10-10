import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { ACTIVITY_KINDS } from "./localSchema";
import { listingRowOf, listingRowValidator, readListingActivity, readListingWeeks } from "./localListings";
import { MAP_BOX, listingsById, localSetup, officeChecks, officeSearches, openOffice } from "./localReads";
import { unpackColumn } from "./utils/packedColumns";

/**
 * Discovery → Local → Local market and Rival activity
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, §7; drawn as
 * "More · Local market" and "More · Rival activity"): every business of an
 * office's kind round it, and what the rivals watched do on Google — their
 * posts, offers and questions, and the changes to their profiles, the rating
 * and photo ones worked out from their weeks.
 */

const DAY_MS = 86_400_000;
const officeOptionValidator = v.object({ listingId: v.id("listings"), name: v.string(), town: v.union(v.string(), v.null()) });

export const localMarket = tenantQuery({
  args: { siteId: v.id("companyWebsites"), officeId: v.optional(v.id("listings")) },
  returns: v.object({
    offices: v.array(officeOptionValidator),
    km: v.number(),
    day: v.union(v.string(), v.null()),
    total: v.union(v.number(), v.null()),
    rows: v.array(v.object({
      ...listingRowValidator.fields,
      metres: v.union(v.number(), v.null()),
      /** Searches it is in the office's map box for, on their newest checks. */
      mapBox: v.number(),
      you: v.boolean(),
      watched: v.boolean(),
    })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const { offices, rivals, limits } = await localSetup(ctx, site);
    const office = openOffice(offices, args.officeId);
    const options = offices.map((entry) => ({ listingId: entry._id, name: entry.name, town: entry.town ?? null }));
    const km = limits?.localMarketKm ?? 10;
    if (!office?.point || !office.categoryIds?.[0]) return { offices: options, km, day: null, total: null, rows: [] };
    const part = await ctx.db
      .query("localMarketParts")
      .withIndex("by_market", (q) => q.eq("category", office.categoryIds![0]).eq("point", office.point!).eq("km", km))
      .unique();
    if (!part) return { offices: options, km, day: null, total: null, rows: [] };

    const checks = await officeChecks(ctx, office, await officeSearches(ctx, site, office, offices), false);
    const boxes = [...checks.values()].map((check) => check.latest.listingIds.slice(0, MAP_BOX));
    const listings = await listingsById(ctx, part.listingIds);
    const metres = unpackColumn(part.metres);
    const watched = new Set(rivals.map((rival) => rival._id as string));
    const rows = part.listingIds.flatMap((id, at) => {
      const listing = listings.get(id);
      if (!listing) return [];
      return [{
        ...listingRowOf(listing),
        metres: id === office._id ? null : metres[at] ?? null,
        mapBox: boxes.filter((box) => box.includes(id)).length,
        you: id === office._id,
        watched: watched.has(id),
      }];
    });
    if (!rows.some((row) => row.you)) rows.unshift({ ...listingRowOf(office), metres: null, mapBox: boxes.filter((box) => box.includes(office._id)).length, you: true, watched: false });
    return { offices: options, km, day: part.day, total: part.total, rows };
  },
});

/** What a rival's activity line says happened: a post, an offer, a change to its profile. */
export const activityKindValidator = v.union(
  ...ACTIVITY_KINDS.filter((kind) => kind !== "QUESTION").map((kind) => v.literal(kind)),
  v.literal("RATING_CHANGE"),
  v.literal("PHOTOS_ADDED"),
);

/** A listing's weekly readings as the changes between them: a rating moving, reviews or photos added. */
export function weekLines(weeks: Awaited<ReturnType<typeof readListingWeeks>>) {
  const lines: Array<{ kind: "RATING_CHANGE" | "PHOTOS_ADDED"; day: string; from: number; to: number }> = [];
  for (let at = 1; at < weeks.length; at += 1) {
    const [was, now] = [weeks[at - 1], weeks[at]];
    if (was.rating !== undefined && now.rating !== undefined && was.rating !== now.rating) {
      lines.push({ kind: "RATING_CHANGE", day: now.day, from: was.rating, to: now.rating });
    }
    if (was.photos !== undefined && now.photos !== undefined && now.photos > was.photos) {
      lines.push({ kind: "PHOTOS_ADDED", day: now.day, from: was.photos, to: now.photos });
    }
  }
  return lines;
}

export const rivalActivity = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    rivals: v.array(v.object({ listingId: v.id("listings"), name: v.string() })),
    figures: v.object({
      rivalPosts: v.number(),
      yourPosts: v.number(),
      offers: v.number(),
      offerNames: v.array(v.string()),
      openQuestions: v.number(),
      profileChanges: v.number(),
    }),
    lines: v.array(v.object({
      day: v.string(),
      listingId: v.id("listings"),
      name: v.string(),
      kind: activityKindValidator,
      text: v.union(v.string(), v.null()),
      from: v.union(v.number(), v.null()),
      to: v.union(v.number(), v.null()),
    })),
    questions: v.array(v.object({
      text: v.string(),
      listingId: v.id("listings"),
      name: v.string(),
      town: v.union(v.string(), v.null()),
      yours: v.boolean(),
      day: v.string(),
      answeredDay: v.union(v.string(), v.null()),
    })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const { offices, rivals } = await localSetup(ctx, site);
    const since = new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10);
    const lines = [];
    const questions = [];
    const recent = { rivalPosts: 0, yourPosts: 0, offers: 0, profileChanges: 0, openQuestions: 0 };
    const offerNames = new Set<string>();
    for (const [listing, yours] of [...offices.map((office) => [office, true] as const), ...rivals.map((rival) => [rival, false] as const)]) {
      for (const line of await readListingActivity(ctx, listing._id)) {
        if (line.kind === "QUESTION") {
          questions.push({ text: line.text, listingId: listing._id, name: listing.name, town: listing.town ?? null, yours, day: line.day, answeredDay: line.answeredDay ?? null });
          if (yours && !line.answeredDay) recent.openQuestions += 1;
          continue;
        }
        const posted = line.kind === "POST" || line.kind === "OFFER" || line.kind === "EVENT";
        if (line.day >= since && posted) {
          if (yours) recent.yourPosts += 1;
          else recent.rivalPosts += 1;
        }
        if (yours) continue;
        if (line.day >= since && line.kind === "OFFER") {
          recent.offers += 1;
          offerNames.add(listing.name);
        }
        if (line.day >= since && !posted) recent.profileChanges += 1;
        lines.push({ day: line.day, listingId: listing._id, name: listing.name, kind: line.kind, text: line.text, from: null, to: null });
      }
      if (yours) continue;
      for (const line of weekLines(await readListingWeeks(ctx, listing._id))) {
        if (line.day >= since) recent.profileChanges += 1;
        lines.push({ day: line.day, listingId: listing._id, name: listing.name, kind: line.kind, text: null, from: line.from, to: line.to });
      }
    }
    lines.sort((left, right) => right.day.localeCompare(left.day));
    questions.sort((left, right) => Number(right.yours) - Number(left.yours) || right.day.localeCompare(left.day));
    return {
      rivals: rivals.map((rival: Doc<"listings">) => ({ listingId: rival._id, name: rival.name })),
      figures: { ...recent, offerNames: [...offerNames] },
      lines,
      questions,
    };
  },
});
