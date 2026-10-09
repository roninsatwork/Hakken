import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { tenantMutation, tenantQuery, type TenantIdentity } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { isOversightRole } from "./authz";
import { appError } from "./utils/appError";
import { isTrackedHold } from "./utils/websitePairing";
import { partIsOn } from "./collectionParts";
import { readFanOutLimits } from "./fanOutLimits";
import { listingSourceValidator, type ListingSource } from "./localSchema";
import { listingRowOf, listingRowValidator } from "./localListings";
import { metresBetween } from "./localParse";
import { writeLocalSummary } from "./localSummaries";
import { findSeoOperation } from "./dataForSeoRegistry";
import {
  BUSINESS_PROFILE_OPERATION,
  LISTING_FIND_OPERATION,
  PROFILE_REFRESH_DAYS,
  TRIPADVISOR_FIND_OPERATION,
  TRUSTPILOT_FIND_OPERATION,
  businessProfileParams,
  listingFindParams,
  localPeriodStart,
  tripadvisorFindParams,
  trustpilotFindParams,
} from "./dataForSeoLocalOperations";
import { buildSeoIdempotencyKey } from "./seoIdempotency";
import { reusableByKey } from "./seoPullReuse";
import { startCollector } from "./seoAgentRuns";

/**
 * Discovery → Your listings (docs/plans/active/discovery-local-reputation-ai-plan.md,
 * D3, D19): the profiles that are the company's own, one per office, and the
 * rivals' it watches — found by name and linked by a person, the client or a
 * super admin in the company's Discovery. Each listing is the platform's
 * (`listings`); the link is the company's (`holdListings`), on its own website.
 *
 * Find buys one search when it is pressed, through the Collector, as
 * Generate fan-out queries does — refused while the company's Local part is
 * off (D16): off means buy nothing.
 */

/** A website's links read at once: far past its offices and rivals at their largest limits. */
const LINKS_READ = 200;


const FIND_OPERATION: Record<ListingSource, string> = {
  GOOGLE: LISTING_FIND_OPERATION,
  TRUSTPILOT: TRUSTPILOT_FIND_OPERATION,
  TRIPADVISOR: TRIPADVISOR_FIND_OPERATION,
};

function findParams(source: ListingSource, text: string): Record<string, unknown> {
  if (source === "TRUSTPILOT") return trustpilotFindParams(text);
  if (source === "TRIPADVISOR") return tripadvisorFindParams(text);
  return listingFindParams(text);
}

/**
 * Queue one purchase now, outside a run, and have the Collector send it — as
 * Generate fan-out queries does — or reuse the same one already bought in its
 * period. True when the Collector was started.
 */
async function buyNow(
  ctx: MutationCtx & TenantIdentity,
  site: { hold: Doc<"companyWebsites">; company: Doc<"companies"> | null },
  operationId: string,
  params: Record<string, unknown>,
  purpose: string,
  keyStartedAt: number = Date.now(),
): Promise<{ pullId: Id<"seoDataPulls">; existing: Doc<"seoDataPulls"> | null; sending: boolean }> {
  const operation = findSeoOperation(operationId);
  if (!operation) throw appError("NOT_CONFIGURED", "This purchase is not set up.");
  const now = Date.now();
  const idempotencyKey = buildSeoIdempotencyKey({ operationId: operation.id, websiteId: "listing", params, cycleStartedAt: keyStartedAt });
  const existing = await reusableByKey(ctx, idempotencyKey);
  const pullId = existing?._id ?? await ctx.db.insert("seoDataPulls", {
    operationId: operation.id,
    family: operation.family,
    mode: operation.mode,
    companyId: site.hold.companyId,
    taskArgsJson: JSON.stringify(params),
    status: "PENDING",
    tag: idempotencyKey,
    idempotencyKey,
    dueAt: now,
    attempts: 0,
    costUsd: 0,
    sandbox: false,
    submittedAt: now,
  });
  const sending = existing && existing.status !== "PENDING" ? false : await startCollector(ctx, {
    companyId: site.hold.companyId,
    companyName: site.company?.name ?? "",
    userId: ctx.userId,
    purpose,
  });
  return { pullId, existing, sending };
}

/**
 * Buying anything for Local needs it switched on for the company (D16): that
 * switch is the hold on Local's spending. The company's collection schedule
 * governs its runs, not a person's Find — so Find works while the runs are
 * off, as on Korda, where they are switched on run by run.
 */
async function requireBuying(ctx: MutationCtx, companyId: Id<"companies">): Promise<void> {
  if (!(await partIsOn(ctx, companyId, "local"))) throw appError("CONFLICT", "Local is not switched on for your company yet.");
}

/** A person who may change the company's listings: anyone in it but the oversight roles, on its own website. */
async function requireOwnSite(ctx: MutationCtx & TenantIdentity, siteId: Id<"companyWebsites">) {
  if (isOversightRole(ctx.user.role)) throw appError("UNAUTHORIZED", "Your account can read Your listings, not change them.");
  const site = await requireMySite(ctx, siteId);
  if (isTrackedHold(site.hold)) throw appError("INVALID_INPUT", "Listings are linked on the company's own websites.");
  return site;
}

const findRowValidator = v.object({
  ...listingRowValidator.fields,
  /** Already linked to this website, as an office or a rival. */
  linkedAs: v.union(v.literal("OWN"), v.literal("RIVAL"), v.null()),
});

export const localListings = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    /** Local is switched on for the company (D16). */
    on: v.boolean(),
    /** The company's own website: only its own are linked. */
    ownSite: v.boolean(),
    offices: v.array(v.object({ ...listingRowValidator.fields, linkedAt: v.number() })),
    rivals: v.array(v.object({
      ...listingRowValidator.fields,
      againstTown: v.union(v.string(), v.null()),
      againstName: v.union(v.string(), v.null()),
      matched: v.boolean(),
      linkedAt: v.number(),
    })),
    finds: v.array(v.object({
      source: listingSourceValidator,
      name: v.string(),
      looking: v.boolean(),
      failed: v.boolean(),
      total: v.union(v.number(), v.null()),
      rows: v.array(findRowValidator),
    })),
    limits: v.object({ offices: v.number(), rivalsPerOffice: v.number() }),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const hold = site.hold;
    const [on, limits] = await Promise.all([partIsOn(ctx, hold.companyId, "local"), readFanOutLimits(ctx, hold.companyId, hold._id)]);
    const links = isTrackedHold(hold) ? [] : await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).take(LINKS_READ);
    const listings = new Map<Id<"listings">, Doc<"listings">>();
    for (const link of links) {
      const listing = await ctx.db.get(link.listingId);
      if (listing) listings.set(listing._id, listing);
    }
    const linkedAs = new Map(links.map((link) => [link.listingId, link.role]));
    const offices = links.filter((link) => link.role === "OWN" && listings.has(link.listingId));
    const rivals = links.filter((link) => link.role === "RIVAL" && listings.has(link.listingId));

    const finds = isTrackedHold(hold) ? [] : await ctx.db.query("listingFinds").withIndex("by_hold_source", (q) => q.eq("companyWebsiteId", hold._id)).take(3);
    const findRows = [];
    for (const find of finds) {
      const pull = find.filedAt === undefined ? await ctx.db.get(find.pullId) : null;
      const failed = pull?.status === "FAILED";
      const rows = [];
      for (const listingId of find.found) {
        const listing = listings.get(listingId) ?? await ctx.db.get(listingId);
        if (listing) rows.push({ ...listingRowOf(listing), linkedAs: linkedAs.get(listingId) ?? null });
      }
      findRows.push({
        source: find.source,
        name: find.name,
        looking: find.filedAt === undefined && !failed,
        failed,
        total: find.total ?? null,
        rows,
      });
    }
    return {
      on,
      ownSite: !isTrackedHold(hold),
      offices: offices.map((link) => ({ ...listingRowOf(listings.get(link.listingId)!), linkedAt: link.createdAt })),
      rivals: rivals.map((link) => {
        const against = link.againstListingId ? listings.get(link.againstListingId) : undefined;
        return {
          ...listingRowOf(listings.get(link.listingId)!),
          againstTown: against?.town ?? null,
          againstName: against?.name ?? null,
          matched: link.addedFrom === "MATCHED",
          linkedAt: link.createdAt,
        };
      }),
      finds: findRows,
      limits: { offices: limits.localOffices, rivalsPerOffice: limits.localRivalsPerOffice },
    };
  },
});

/** Find: one search of Google Maps, Trustpilot or Tripadvisor by name and town, bought now through the Collector. */
export const findListing = tenantMutation({
  args: { siteId: v.id("companyWebsites"), source: listingSourceValidator, text: v.string() },
  returns: v.object({ sending: v.boolean() }),
  handler: async (ctx, args) => {
    const site = await requireOwnSite(ctx, args.siteId);
    const hold = site.hold;
    const text = args.text.trim().replace(/\s+/g, " ");
    if (text.length < 2) throw appError("INVALID_INPUT", "Type the business's name as it shows on Google, and its town.");
    if (text.length > 120) throw appError("INVALID_INPUT", "That is too long to search for.");
    await requireBuying(ctx, hold.companyId);

    const { pullId, existing, sending } = await buyNow(ctx, site, FIND_OPERATION[args.source], findParams(args.source, text), "Find a listing");
    const held = await ctx.db
      .query("listingFinds")
      .withIndex("by_hold_source", (q) => q.eq("companyWebsiteId", hold._id).eq("source", args.source))
      .take(10);
    for (const find of held) await ctx.db.delete(find._id);
    // The same search found today: what it found, at once.
    const earlier = existing?.filedAt !== undefined
      ? await ctx.db.query("listingFinds").withIndex("by_pull", (q) => q.eq("pullId", pullId)).first()
      : null;
    await ctx.db.insert("listingFinds", {
      companyWebsiteId: hold._id,
      companyId: hold.companyId,
      source: args.source,
      name: text,
      pullId,
      found: earlier?.found ?? [],
      ...(earlier?.filedAt !== undefined ? { filedAt: earlier.filedAt } : {}),
      createdAt: Date.now(),
      createdBy: ctx.userId,
    });
    if (existing?.filedAt !== undefined && !earlier) {
      // Bought and filed today for a find since replaced: filed again from the answer kept.
      await ctx.scheduler.runAfter(0, internal.seoCollectionParse.parseSeoResult, { pullId });
    }
    return { sending };
  },
});

/**
 * Link a listing to the website: "This is us" (an office, or its own page on
 * Trustpilot or Tripadvisor) or "Watch as a rival" — against the office
 * nearest it, when it has a map point. Within the website's limits (D9).
 */
export const linkListing = tenantMutation({
  args: {
    siteId: v.id("companyWebsites"),
    listingId: v.id("listings"),
    role: v.union(v.literal("OWN"), v.literal("RIVAL")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const site = await requireOwnSite(ctx, args.siteId);
    const hold = site.hold;
    const listing = await ctx.db.get(args.listingId);
    if (!listing) throw appError("NOT_FOUND", "That listing is no longer held. Find it again.");
    const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
    const links = await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).take(LINKS_READ);
    const officeLinks = links.filter((link) => link.role === "OWN");
    const offices = (await Promise.all(officeLinks.map((link) => ctx.db.get(link.listingId)))).filter((office): office is Doc<"listings"> => office !== null);

    if (args.role === "OWN" && listing.source === "GOOGLE" && offices.filter((office) => office.source === "GOOGLE" && office._id !== listing._id).length >= limits.localOffices) {
      throw appError("CONFLICT", `This website can have ${limits.localOffices} offices: the limit in Limits.`);
    }
    let againstListingId: Id<"listings"> | undefined;
    if (args.role === "RIVAL") {
      againstListingId = nearestOffice(listing, offices.filter((office) => office.source === "GOOGLE"))?._id;
      const against = links.filter((link) => link.role === "RIVAL" && link.listingId !== listing._id && (!link.againstListingId || link.againstListingId === againstListingId)).length;
      if (against >= limits.localRivalsPerOffice) {
        throw appError("CONFLICT", `Each office can have ${limits.localRivalsPerOffice} rivals watched against it: the limit in Limits.`);
      }
    }
    const held = links.find((link) => link.listingId === listing._id);
    if (held) {
      await ctx.db.patch(held._id, { role: args.role, againstListingId, addedFrom: "HAND" });
    } else {
      await ctx.db.insert("holdListings", {
        companyWebsiteId: hold._id,
        companyId: hold.companyId,
        listingId: listing._id,
        role: args.role,
        ...(againstListingId ? { againstListingId } : {}),
        addedFrom: "HAND",
        createdAt: Date.now(),
        createdBy: ctx.userId,
      });
    }
    // A Google profile linked is read whole now, so Business profile fills in at once — the
    // week's reading, which the next run then reuses (`localPlanning.ts`).
    const week = localPeriodStart(Date.now(), PROFILE_REFRESH_DAYS);
    if (listing.source === "GOOGLE" && (listing.profileReadAt ?? 0) < week && (await partIsOn(ctx, hold.companyId, "local"))) {
      await buyNow(ctx, site, BUSINESS_PROFILE_OPERATION, businessProfileParams(listing.key), "Read a linked profile", week);
    }
    await writeLocalSummary(ctx, hold._id);
    return null;
  },
});

/** Take a listing off the website: an office stops being checked, a rival stops being watched. */
export const unlinkListing = tenantMutation({
  args: { siteId: v.id("companyWebsites"), listingId: v.id("listings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const site = await requireOwnSite(ctx, args.siteId);
    const link = await ctx.db
      .query("holdListings")
      .withIndex("by_hold_listing", (q) => q.eq("companyWebsiteId", site.hold._id).eq("listingId", args.listingId))
      .first();
    if (!link) return null;
    await ctx.db.delete(link._id);
    // Rivals watched against an office that went are watched against every office.
    if (link.role === "OWN") {
      const against = await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", site.hold._id)).take(LINKS_READ);
      for (const rival of against.filter((entry) => entry.againstListingId === args.listingId)) {
        await ctx.db.patch(rival._id, { againstListingId: undefined });
      }
    }
    await writeLocalSummary(ctx, site.hold._id);
    return null;
  },
});

/** The office nearest a business, or the first office when either has no map point. */
function nearestOffice(listing: Doc<"listings">, offices: Doc<"listings">[]): Doc<"listings"> | undefined {
  if (listing.latitude === undefined || listing.longitude === undefined) return offices[0];
  const placed = offices.filter((office) => office.latitude !== undefined && office.longitude !== undefined);
  if (placed.length === 0) return offices[0];
  return placed
    .map((office) => ({ office, metres: metresBetween({ latitude: listing.latitude!, longitude: listing.longitude! }, { latitude: office.latitude!, longitude: office.longitude! }) }))
    .sort((left, right) => left.metres - right.metres)[0].office;
}
