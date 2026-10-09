import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type ActionCtx, type MutationCtx } from "./_generated/server";
import {
  BUSINESS_POSTS_OPERATION,
  BUSINESS_PROFILE_OPERATION,
  BUSINESS_QUESTIONS_OPERATION,
  LISTING_FIND_OPERATION,
  LOCAL_MARKET_OPERATION,
  MAP_CHECK_OPERATION,
  TRIPADVISOR_FIND_OPERATION,
  TRUSTPILOT_FIND_OPERATION,
  kmAskedFor,
  placeNumberAskedFor,
  pointAskedFrom,
} from "./dataForSeoLocalOperations";
import {
  metresBetween,
  parseBusinessList,
  parseBusinessProfile,
  parseMapCheck,
  parsePosts,
  parseQuestions,
  parseTripadvisorSearch,
  parseTrustpilotSearch,
  totalOf,
} from "./localParse";
import {
  addListingActivity,
  findListing,
  parsedListingValidator,
  postLines,
  profileChanges,
  upsertListing,
  writeListingWeek,
} from "./localListings";
import { matchRivals, noteLocalChange } from "./localSummaries";
import { packColumn, packDays, unpackColumn, unpackDays } from "./utils/packedColumns";
import type { PullForParse } from "./seoCollectionParse";
import { appError } from "./utils/appError";
import { getErrorMessage } from "./utils/lang";

/**
 * Filing what the Local purchases bought (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, step 1): the answer is read here, in the action —
 * only an action reads an answer's file — and each kind is written by one
 * mutation below. Failures are recorded on the pull, as every filer's are.
 */

type Sent = Record<string, unknown>;

function sentOf(pull: Pick<PullForParse, "taskArgsJson">): Sent {
  try {
    const parsed: unknown = JSON.parse(pull.taskArgsJson ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Sent) : {};
  } catch {
    return {};
  }
}

/** File one Local answer, from the parse step (`seoCollectionParse.ts`). */
export async function fileLocalPull(ctx: ActionCtx, pullId: Id<"seoDataPulls">, pull: PullForParse): Promise<null> {
  try {
    const result: unknown = JSON.parse(pull.resultJson ?? "null");
    const sent = sentOf(pull);
    switch (pull.operationId) {
      case LISTING_FIND_OPERATION:
        await ctx.runMutation(internal.localFiling.fileFound, { pullId, businesses: parseMapCheck(result).businesses });
        break;
      case TRUSTPILOT_FIND_OPERATION:
        await ctx.runMutation(internal.localFiling.fileFound, { pullId, businesses: parseTrustpilotSearch(result) });
        break;
      case TRIPADVISOR_FIND_OPERATION:
        await ctx.runMutation(internal.localFiling.fileFound, { pullId, businesses: parseTripadvisorSearch(result) });
        break;
      case LOCAL_MARKET_OPERATION: {
        const point = pointAskedFrom(sent);
        const km = kmAskedFor(sent);
        const category = Array.isArray(sent.categories) && typeof sent.categories[0] === "string" ? sent.categories[0] : null;
        if (!point || km === null || !category) throw appError("INVALID_INPUT", "This purchase does not say which market it was for.");
        await ctx.runMutation(internal.localFiling.fileMarket, {
          pullId, category, point, km, day: pull.runDay, businesses: parseBusinessList(result), total: totalOf(result) ?? 0,
        });
        break;
      }
      case BUSINESS_PROFILE_OPERATION: {
        const business = parseBusinessProfile(result);
        if (business) await ctx.runMutation(internal.localFiling.fileProfile, { business, day: pull.runDay });
        break;
      }
      case MAP_CHECK_OPERATION: {
        const point = pointAskedFrom(sent);
        const keyword = typeof sent.keyword === "string" ? sent.keyword : null;
        if (!point || !keyword) throw appError("INVALID_INPUT", "This purchase does not say which search or map point it was for.");
        const check = parseMapCheck(result);
        await ctx.runMutation(internal.localFiling.fileMapCheck, {
          pullId, keyword, point, day: pull.runDay, businesses: check.businesses, reasons: check.reasons.map((reason) => reason ?? null),
        });
        break;
      }
      case BUSINESS_POSTS_OPERATION: {
        const placeNumber = placeNumberAskedFor(sent);
        if (!placeNumber) throw appError("INVALID_INPUT", "This purchase does not say which profile it was for.");
        await ctx.runMutation(internal.localFiling.filePosts, { placeNumber, posts: parsePosts(result) });
        break;
      }
      case BUSINESS_QUESTIONS_OPERATION: {
        const placeNumber = placeNumberAskedFor(sent);
        if (!placeNumber) throw appError("INVALID_INPUT", "This purchase does not say which profile it was for.");
        await ctx.runMutation(internal.localFiling.fileQuestions, { placeNumber, questions: parseQuestions(result) });
        break;
      }
      default:
        throw appError("INVALID_INPUT", `${pull.operationId} is not a Local purchase.`);
    }
  } catch (error) {
    await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, { pullId, error: getErrorMessage(error) });
  }
  return null;
}


/** A found list: each business filed, and the find (or finds) waiting on this purchase told what it found. */
export const fileFound = internalMutation({
  args: { pullId: v.id("seoDataPulls"), businesses: v.array(parsedListingValidator), total: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const found: Array<Id<"listings">> = [];
    for (const business of args.businesses) found.push((await upsertListing(ctx, business, "whole")).listingId);
    const finds = await ctx.db.query("listingFinds").withIndex("by_pull", (q) => q.eq("pullId", args.pullId)).take(50);
    const now = Date.now();
    for (const find of finds) {
      await ctx.db.patch(find._id, { found, filedAt: now, ...(args.total !== undefined ? { total: args.total } : {}) });
    }
    return null;
  },
});

/** Most businesses a market keeps: the largest choice of the limit. */
const MARKET_KEPT = 250;

/**
 * An office's local market: each business filed, the market as one record,
 * nearest first, and any business there whose website the company watches as
 * a competitor linked as its rival (plan D7) — once a month, here, rather than
 * on every map check.
 */
export const fileMarket = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    category: v.string(),
    point: v.string(),
    km: v.number(),
    day: v.string(),
    businesses: v.array(parsedListingValidator),
    total: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [latitude, longitude] = args.point.split(",").map(Number);
    const rows: Array<{ listingId: Id<"listings">; metres?: number }> = [];
    const seen: Array<{ listingId: Id<"listings">; websiteHost?: string }> = [];
    for (const business of args.businesses.slice(0, MARKET_KEPT)) {
      const { listingId } = await upsertListing(ctx, business, "light");
      seen.push({ listingId, websiteHost: business.websiteHost });
      const metres = business.latitude !== undefined && business.longitude !== undefined
        ? metresBetween({ latitude, longitude }, { latitude: business.latitude, longitude: business.longitude })
        : undefined;
      rows.push({ listingId, metres });
    }
    rows.sort((left, right) => (left.metres ?? Infinity) - (right.metres ?? Infinity));
    const fields = {
      category: args.category, point: args.point, km: args.km,
      listingIds: rows.map((row) => row.listingId),
      metres: packColumn(rows.map((row) => row.metres)),
      total: Math.max(args.total, rows.length),
      day: args.day,
      pullId: args.pullId,
    };
    const held = await ctx.db
      .query("localMarketParts")
      .withIndex("by_market", (q) => q.eq("category", args.category).eq("point", args.point).eq("km", args.km))
      .unique();
    if (held) await ctx.db.replace(held._id, fields);
    else await ctx.db.insert("localMarketParts", fields);
    await matchRivals(ctx, args.point, seen);
    const offices = await ctx.db.query("listings").withIndex("by_point", (q) => q.eq("point", args.point)).take(10);
    await noteLocalChange(ctx, offices.map((office) => office._id));
    return null;
  },
});

/** A profile read whole: the listing, its week, and anything that changed since it was last read. */
export const fileProfile = internalMutation({
  args: { business: parsedListingValidator, day: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { listingId, before } = await upsertListing(ctx, args.business, "whole", { readNow: true });
    await writeListingWeek(ctx, listingId, args.day, args.business);
    await addListingActivity(ctx, listingId, profileChanges(before, args.business, args.day));
    await noteLocalChange(ctx, [listingId]);
    return null;
  },
});

/** A profile's posts, each kept once as a line of its activity. */
export const filePosts = internalMutation({
  args: {
    placeNumber: v.string(),
    posts: v.array(v.object({ kind: v.union(v.literal("POST"), v.literal("OFFER"), v.literal("EVENT")), day: v.string(), text: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listing = await findListing(ctx, "GOOGLE", args.placeNumber);
    if (!listing) return null;
    await addListingActivity(ctx, listing._id, postLines(args.posts));
    await noteLocalChange(ctx, [listing._id]);
    return null;
  },
});

/** A profile's questions, read whole: the questions held give way to these, answered since or not. */
export const fileQuestions = internalMutation({
  args: {
    placeNumber: v.string(),
    questions: v.array(v.object({ day: v.string(), text: v.string(), answeredDay: v.optional(v.string()) })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listing = await findListing(ctx, "GOOGLE", args.placeNumber);
    if (!listing) return null;
    await addListingActivity(ctx, listing._id, args.questions.map((question) => ({ kind: "QUESTION" as const, ...question })), ["QUESTION"]);
    await noteLocalChange(ctx, [listing._id]);
    return null;
  },
});

/**
 * One search on Google Maps from one point: each business filed, the check
 * as one record, and the place of every office standing at that point added
 * to its series (`mapPositionWeeks`) — 0 where it was not among those read.
 */
export const fileMapCheck = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    keyword: v.string(),
    point: v.string(),
    day: v.string(),
    businesses: v.array(parsedListingValidator),
    reasons: v.array(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listingIds: Array<Id<"listings">> = [];
    for (const business of args.businesses) listingIds.push((await upsertListing(ctx, business, "none")).listingId);
    const reasons = [...new Set(args.reasons.filter((reason): reason is string => Boolean(reason)))];
    const placeOf = new Map(reasons.map((reason, at) => [reason, at]));
    const fields = {
      keyword: args.keyword, point: args.point, day: args.day, listingIds,
      reasons,
      reasonOf: packColumn(args.reasons.map((reason) => (reason ? placeOf.get(reason) : undefined))),
      pullId: args.pullId,
    };
    const held = await ctx.db
      .query("mapChecks")
      .withIndex("by_point_keyword_day", (q) => q.eq("point", args.point).eq("keyword", args.keyword).eq("day", args.day))
      .unique();
    if (held) await ctx.db.replace(held._id, fields);
    else await ctx.db.insert("mapChecks", fields);

    const offices = await ctx.db.query("listings").withIndex("by_point", (q) => q.eq("point", args.point)).take(10);
    for (const office of offices) {
      const place = listingIds.indexOf(office._id) + 1;
      await writeMapPlace(ctx, office._id, args.keyword, args.day, place);
    }
    await noteLocalChange(ctx, offices.map((office) => office._id));
    return null;
  },
});

/** An office's place for one search on one day, a later check that day replacing the earlier. */
async function writeMapPlace(ctx: MutationCtx, listingId: Id<"listings">, keyword: string, day: string, place: number): Promise<void> {
  const record = await ctx.db
    .query("mapPositionWeeks")
    .withIndex("by_listing_keyword", (q) => q.eq("listingId", listingId).eq("keyword", keyword))
    .unique();
  const byDay = new Map<string, number>();
  if (record) {
    const days = unpackDays(record.days);
    const places = unpackColumn(record.places);
    days.forEach((held, at) => byDay.set(held!, places[at] ?? 0));
  }
  byDay.set(day, place);
  const rows = [...byDay.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  const fields = {
    listingId, keyword,
    days: packDays(rows.map(([held]) => held)),
    places: packColumn(rows.map(([, held]) => held)),
    updatedAt: Date.now(),
  };
  if (record) await ctx.db.replace(record._id, fields);
  else await ctx.db.insert("mapPositionWeeks", fields);
}
