import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { tenantMutation, tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { appError } from "./utils/appError";
import { assertInsightsPublisher, insightsPublicationArgs } from "./insightsRunState";
import { loadRivalHolds, loadSite } from "./websiteSiteRows";
import { linkGapOf } from "./siteWebMentions";
import { ACTIVITY_KINDS } from "./localSchema";
import { unpackColumn, unpackDays } from "./utils/packedColumns";
import {
  AREA_OF, MOST_DRAFTS, REDRAFT_AFTER_DAYS, campaignOf, draftAreaValidator, draftKindValidator, draftStatusValidator, draftedValidator, taggedLink,
} from "./utils/insightDrafts";

/**
 * Drafted fixes for what lives off the website (docs/plans/active/
 * insights-analyst-plan.md I23, I39, phases 10 and 11): what the team's
 * Local and reputation and Links and PR specialists draft from, the drafts
 * kept, and the person's answer to each — approve (and copy), or dismiss.
 */

/** A website's own listings and rivals' read at most: a business has few. */
const LISTINGS_READ = 40;
/** Reviews read for the newest still waiting for an answer. */
const REVIEWS_READ = 200;
/** Sites linking to rivals offered for outreach at most. */
const OUTREACH_SITES = 12;
/** A site below this strength (out of 1,000) is left out of outreach. */
const OUTREACH_STRENGTH = 20;

const listingInput = v.object({
  name: v.string(),
  town: v.union(v.string(), v.null()),
  category: v.union(v.string(), v.null()),
  categories: v.array(v.string()),
  description: v.union(v.string(), v.null()),
  rating: v.union(v.number(), v.null()),
  reviews: v.union(v.number(), v.null()),
  photos: v.union(v.number(), v.null()),
  lastPost: v.union(v.string(), v.null()),
});

/** What the drafts are written from: the business's profiles and its rivals', reviews waiting, and sites linking to rivals. */
export const draftInputs = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    origin: v.string(),
    host: v.string(),
    pages: v.array(v.object({ page: v.string(), title: v.union(v.string(), v.null()) })),
    own: v.array(listingInput),
    rivalCategories: v.array(v.object({ category: v.string(), rivals: v.number() })),
    rivalLastPost: v.union(v.string(), v.null()),
    waiting: v.array(v.object({ listing: v.string(), day: v.string(), stars: v.union(v.number(), v.null()), name: v.union(v.string(), v.null()), text: v.string() })),
    waitingCount: v.number(),
    outreach: v.array(v.object({ host: v.string(), rivals: v.array(v.string()), strength: v.number() })),
    recent: v.array(v.object({ kind: draftKindValidator, target: v.string() })),
  })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    const site = hold ? await loadSite(ctx, hold._id) : null;
    if (!hold || !site) return null;
    const host = site.website.displayHost ?? site.website.host;
    const console = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    const origin = console?.property && /^https?:\/\//.test(console.property) ? console.property.replace(/\/$/, "") : `https://${host.replace(/^https?:\/\//, "")}`;
    // The website's own pages a draft can point to: the home page and services, most clicks first.
    const held = await ctx.db.query("holdPages").withIndex("by_hold_clicks", (q) => q.eq("companyWebsiteId", hold._id)).order("desc").take(200);
    const pages = held.filter((page) => page.page === "/" || page.pageType === "SERVICE" || page.pageType === "CASE_STUDY" || page.pageType === "ABOUT").slice(0, 15).map((page) => ({ page: page.page, title: page.title ?? null }));
    // Its Business Profiles and its rivals'.
    const entries = await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).take(LISTINGS_READ);
    const own: Array<typeof listingInput.type> = [];
    const ownListings: Array<Doc<"listings">> = [];
    const rivalCount = new Map<string, number>();
    let rivalLastPost: string | null = null;
    for (const entry of entries) {
      const listing = await ctx.db.get(entry.listingId);
      if (!listing || listing.source !== "GOOGLE") continue;
      const lastPost = await lastPostOf(ctx, listing._id);
      if (entry.role === "OWN") {
        ownListings.push(listing);
        own.push({
          name: listing.name, town: listing.town ?? null, category: listing.category ?? null, categories: listing.profile?.categories ?? [],
          description: listing.profile?.description?.slice(0, 600) ?? null, rating: listing.rating ?? null, reviews: listing.reviews ?? null, photos: listing.photos ?? null, lastPost,
        });
      } else {
        for (const category of [listing.category, ...(listing.profile?.categories ?? [])].filter((value): value is string => Boolean(value))) rivalCount.set(category, (rivalCount.get(category) ?? 0) + 1);
        if (lastPost && (!rivalLastPost || lastPost > rivalLastPost)) rivalLastPost = lastPost;
      }
    }
    // The newest reviews still waiting for an answer, with their words (own listings keep them).
    const waiting: Array<{ listing: string; day: string; stars: number | null; name: string | null; text: string }> = [];
    let waitingCount = 0;
    for (const listing of ownListings) {
      const part = await ctx.db.query("listingReviewParts").withIndex("by_listing_part", (q) => q.eq("listingId", listing._id).eq("part", 0)).first();
      if (!part) continue;
      const days = unpackDays(part.days), stars = unpackColumn(part.stars), replies = unpackDays(part.replyDays);
      for (let at = 0; at < Math.min(part.ids.length, REVIEWS_READ); at += 1) {
        if (replies[at]) continue;
        waitingCount += 1;
        const text = part.texts?.[at];
        if (text && waiting.length < 6) waiting.push({ listing: listing.town ?? listing.name, day: days[at] ?? "", stars: stars[at] ?? null, name: part.names?.[at] ?? null, text: text.slice(0, 500) });
      }
    }
    // Sites that link to two or more rivals and not to the website.
    const rivals = await loadRivalHolds(ctx, site);
    const rivalHosts: string[] = [];
    for (const rival of rivals) {
      const website = await ctx.db.get(rival.websiteId);
      if (website) rivalHosts.push(website.host);
    }
    const gap = await linkGapOf(ctx, site.website._id, rivalHosts);
    const outreach = [...gap.entries()]
      .map(([domain, row]) => ({ host: domain, rivals: [...row.rivals], strength: row.strength }))
      // Two rivals or more, and a site of some standing: the weakest are link farms, not editors.
      .filter((row) => row.rivals.length >= 2 && row.strength >= OUTREACH_STRENGTH)
      .sort((a, b) => b.rivals.length - a.rivals.length || b.strength - a.strength)
      .slice(0, OUTREACH_SITES);
    // What was drafted lately, so the same fix isn't drafted twice.
    const since = Date.now() - REDRAFT_AFTER_DAYS * 86_400_000;
    const recent = [];
    for (const area of ["LOCAL", "REVIEWS", "LINKS"] as const) {
      const rows = await ctx.db.query("insightDrafts").withIndex("by_hold_area_created", (q) => q.eq("companyWebsiteId", hold._id).eq("area", area).gte("createdAt", since)).take(100);
      recent.push(...rows.filter((row) => row.status !== "DISMISSED").map((row) => ({ kind: row.kind, target: row.target })));
    }
    return {
      origin, host, pages, own,
      rivalCategories: [...rivalCount.entries()].map(([category, count]) => ({ category, rivals: count })).sort((a, b) => b.rivals - a.rivals).slice(0, 6),
      rivalLastPost, waiting, waitingCount, outreach, recent,
    };
  },
});

/** A listing's newest post, from its activity. */
async function lastPostOf(ctx: { db: import("./_generated/server").QueryCtx["db"] }, listingId: Id<"listings">): Promise<string | null> {
  const activity = await ctx.db.query("listingActivityParts").withIndex("by_listing", (q) => q.eq("listingId", listingId)).first();
  if (!activity) return null;
  const kinds = unpackColumn(activity.kinds), days = unpackDays(activity.days);
  const post = ACTIVITY_KINDS.indexOf("POST");
  return days.filter((day, at): day is string => Boolean(day) && kinds[at] === post).sort().at(-1) ?? null;
}

/** The week's drafts, each with its tagged link (I39); one already drafted lately for the same target is skipped. */
export const saveDrafts = internalMutation({
  args: { ...insightsPublicationArgs, holdId: v.id("companyWebsites"), companyId: v.id("companies"), week: v.string(), origin: v.string(), drafts: v.array(draftedValidator) },
  returns: v.number(),
  handler: async (ctx, args) => {
    await assertInsightsPublisher(ctx, args);
    const now = Date.now();
    const since = now - REDRAFT_AFTER_DAYS * 86_400_000;
    let saved = 0;
    const counted = { LOCAL: 0, REVIEWS: 0, LINKS: 0 };
    for (const draft of args.drafts) {
      const area = AREA_OF[draft.kind];
      if (counted[area] >= MOST_DRAFTS[area]) continue;
      const earlier = await ctx.db.query("insightDrafts").withIndex("by_hold_kind_target", (q) => q.eq("companyWebsiteId", args.holdId).eq("kind", draft.kind).eq("target", draft.target)).order("desc").first();
      if (earlier && earlier.createdAt >= since && earlier.status !== "DISMISSED") continue;
      const link = draft.page ? taggedLink(args.origin, draft.page, draft.kind, draft.target, args.week) : null;
      await ctx.db.insert("insightDrafts", {
        companyId: args.companyId, companyWebsiteId: args.holdId, week: args.week, area, kind: draft.kind, target: draft.target, why: draft.why, title: draft.title,
        body: link && !draft.body.includes(link) ? `${draft.body}\n\n${link}` : draft.body, link, campaign: campaignOf(draft.kind, args.week), status: "DRAFTED", createdAt: now,
      });
      counted[area] += 1;
      saved += 1;
    }
    // Two years kept (I7): the oldest go as new ones come.
    const cutoff = now - 2 * 365 * 86_400_000;
    for (const old of await ctx.db.query("insightDrafts").withIndex("by_created", (q) => q.lt("createdAt", cutoff)).take(50)) await ctx.db.delete(old._id);
    return saved;
  },
});

const draftRow = v.object({
  draftId: v.id("insightDrafts"),
  kind: draftKindValidator,
  area: draftAreaValidator,
  target: v.string(),
  why: v.string(),
  title: v.string(),
  status: draftStatusValidator,
  week: v.string(),
  createdAt: v.number(),
  decidedAt: v.union(v.number(), v.null()),
});

/** The drafts written lately for one of the website's areas, newest first: waiting ones and those answered in the last 60 days. */
export const siteDrafts = tenantQuery({
  args: { siteId: v.id("companyWebsites"), area: draftAreaValidator },
  returns: v.union(v.null(), v.array(draftRow)),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    if (site.hold.relationship !== "OWNED") return null;
    const since = Date.now() - REDRAFT_AFTER_DAYS * 86_400_000;
    const rows = await ctx.db.query("insightDrafts").withIndex("by_hold_area_created", (q) => q.eq("companyWebsiteId", site.hold._id).eq("area", args.area).gte("createdAt", since)).order("desc").take(60);
    return rows.map((row) => ({ draftId: row._id, kind: row.kind, area: row.area, target: row.target, why: row.why, title: row.title, status: row.status, week: row.week, createdAt: row.createdAt, decidedAt: row.decidedAt ?? null }));
  },
});

/** One draft, whole, for its own page. */
export const siteDraft = tenantQuery({
  args: { draftId: v.id("insightDrafts") },
  returns: v.union(v.null(), v.object({
    draftId: v.id("insightDrafts"),
    siteId: v.id("companyWebsites"),
    kind: draftKindValidator,
    area: draftAreaValidator,
    target: v.string(),
    why: v.string(),
    title: v.string(),
    body: v.string(),
    link: v.union(v.string(), v.null()),
    campaign: v.string(),
    status: draftStatusValidator,
    createdAt: v.number(),
    decidedAt: v.union(v.number(), v.null()),
  })),
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) return null;
    await requireMySite(ctx, draft.companyWebsiteId);
    const { _id, companyWebsiteId, kind, area, target, why, title, body, link, campaign, status, createdAt, decidedAt } = draft;
    return { draftId: _id, siteId: companyWebsiteId, kind, area, target, why, title, body, link, campaign, status, createdAt, decidedAt: decidedAt ?? null };
  },
});

/** The person's answer to a draft: approved (they copy and use it) or dismissed. */
export const decideDraft = tenantMutation({
  args: { draftId: v.id("insightDrafts"), decision: v.union(v.literal("APPROVED"), v.literal("DISMISSED"), v.literal("DRAFTED")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) throw appError("NOT_FOUND", "That draft is gone.");
    await requireMySite(ctx, draft.companyWebsiteId);
    await ctx.db.patch(draft._id, args.decision === "DRAFTED"
      ? { status: "DRAFTED", decidedAt: undefined, decidedBy: undefined }
      : { status: args.decision, decidedAt: Date.now(), ...(ctx.userId ? { decidedBy: ctx.userId as Id<"users"> } : {}) });
    return null;
  },
});
