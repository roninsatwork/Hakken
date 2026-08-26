import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { getActiveCompanyId, getCurrentUser } from "./authz";
import { moduleMutation, moduleQuery, superAdminQuery, softQuery } from "./tenantFunctions";
import { effectiveModulesFor } from "./tenantFunctions";
import { PROPERTIES_MODULE_KEY } from "./utils/coreModules";
import { appError } from "./utils/appError";

function getPropertyScope(user: Doc<"users">) {
  const activeCompanyId = getActiveCompanyId(user);
  return {
    activeCompanyId,
    canReadAllCompanies: user.role === "SUPER_ADMIN" && !activeCompanyId,
  };
}

/**
 * The row the scraped-data table draws: seven fields, and the id it keys
 * the row on and links to the detail page with.
 *
 * Everything a listing carries beyond this — the description, the gallery,
 * the floorplans, the agent's phone number, the Rightmove id and the Apify
 * run that fetched it — belongs to the detail page, and a table of fifteen
 * rows should not ship fifteen copies of it to a browser that renders none.
 */
const propertyListRowValidator = v.object({
  _id: v.id("properties"),
  address: v.string(),
  price: v.number(),
  bedrooms: v.optional(v.number()),
  bathrooms: v.optional(v.number()),
  propertyType: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  agentName: v.optional(v.string()),
});

/** The page envelope Convex's `paginate` returns, around our own rows. */
const propertyPageValidator = v.object({
  page: v.array(propertyListRowValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(
    v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())
  ),
});

function toPropertyListRow(property: Doc<"properties">) {
  return {
    _id: property._id,
    address: property.address,
    price: property.price,
    ...(property.bedrooms === undefined ? {} : { bedrooms: property.bedrooms }),
    ...(property.bathrooms === undefined ? {} : { bathrooms: property.bathrooms }),
    ...(property.propertyType === undefined ? {} : { propertyType: property.propertyType }),
    ...(property.imageUrl === undefined ? {} : { imageUrl: property.imageUrl }),
    ...(property.agentName === undefined ? {} : { agentName: property.agentName }),
  };
}

function projectPropertyPage<T extends { page: Doc<"properties">[] }>(result: T) {
  return {
    ...result,
    page: result.page.map(toPropertyListRow),
  };
}

export const listProperties = moduleQuery({
  module: PROPERTIES_MODULE_KEY,
  args: {
    paginationOpts: v.any(),
    searchTerm: v.optional(v.string()),
  },
  returns: propertyPageValidator,
  handler: async (ctx, args) => {
    const { user } = ctx;
    const { activeCompanyId, canReadAllCompanies } = getPropertyScope(user);

    if (args.searchTerm && args.searchTerm.trim() !== "") {
      if (canReadAllCompanies) {
        return projectPropertyPage(
          await ctx.db
            .query("properties")
            .withSearchIndex("search_address", (q) =>
              q.search("address", args.searchTerm!)
            )
            .paginate(args.paginationOpts)
        );
      }

      if (!activeCompanyId) throw appError("UNAUTHORIZED", "Unauthorized");
      return projectPropertyPage(
        await ctx.db
          .query("properties")
          .withSearchIndex("search_address", (q) =>
            q.search("address", args.searchTerm!).eq("companyId", activeCompanyId)
          )
          .paginate(args.paginationOpts)
      );
    }

    if (canReadAllCompanies) {
      return projectPropertyPage(
        await ctx.db
          .query("properties")
          .order("desc")
          .paginate(args.paginationOpts)
      );
    }

    if (!activeCompanyId) throw appError("UNAUTHORIZED", "Unauthorized");
    return projectPropertyPage(
      await ctx.db
        .query("properties")
        .withIndex("by_company", (q) => q.eq("companyId", activeCompanyId))
        .order("desc")
        .paginate(args.paginationOpts)
    );
  },
});

export const getPropertiesCount = softQuery({
  reason: "The properties screen shows a zero count for a caller with no session rather than an error; company scoping is still applied in the handler.",
  args: { searchTerm: v.optional(v.string()) },
  returns: v.number(),
  empty: 0,
  handler: async (ctx, args) => {
    const current = { user: ctx.user, userId: ctx.userId };

    const { activeCompanyId, canReadAllCompanies } = getPropertyScope(current.user);

    if (args.searchTerm && args.searchTerm.trim() !== "") {
      if (canReadAllCompanies) {
        const properties = await ctx.db
          .query("properties")
          .withSearchIndex("search_address", (q) =>
            q.search("address", args.searchTerm!)
          )
          .take(10000);
        return properties.length;
      }

      if (!activeCompanyId) return 0;
      const properties = await ctx.db
        .query("properties")
        .withSearchIndex("search_address", (q) =>
          q.search("address", args.searchTerm!).eq("companyId", activeCompanyId)
        )
        .take(10000);
      return properties.length;
    }

    if (canReadAllCompanies) {
      const properties = await ctx.db
        .query("properties")
        .take(10000);
      return properties.length;
    }

    if (!activeCompanyId) return 0;
    const properties = await ctx.db
      .query("properties")
      .withIndex("by_company", (q) => q.eq("companyId", activeCompanyId))
      .take(10000);
    return properties.length;
  }
});

/**
 * What the listing's own page draws.
 *
 * The whole row used to leave, which meant the browser also received the
 * Apify run id and the Rightmove id — our scraper's internal bookkeeping,
 * rendered nowhere — plus the tenant that triggered the scrape and the
 * timestamp it happened. None of it is on the page, so none of it leaves.
 */
const propertyDetailValidator = v.object({
  address: v.string(),
  price: v.number(),
  url: v.string(),
  bedrooms: v.optional(v.number()),
  bathrooms: v.optional(v.number()),
  propertyType: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  description: v.optional(v.string()),
  features: v.optional(v.array(v.string())),
  images: v.optional(v.array(v.string())),
  floorplans: v.optional(v.array(v.string())),
  epcRating: v.optional(v.string()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  agentName: v.optional(v.string()),
  agentPhone: v.optional(v.string()),
  agentProfileUrl: v.optional(v.string()),
  addedOn: v.optional(v.string()),
  firstVisibleDate: v.optional(v.string()),
  listingUpdateReason: v.optional(v.string()),
  productLabel: v.optional(v.string()),
  sizeSqFeetMin: v.optional(v.string()),
  sizeSqFeetMax: v.optional(v.string()),
});

export const getProperty = moduleQuery({
  module: PROPERTIES_MODULE_KEY,
  args: { id: v.id("properties") },
  returns: v.union(v.null(), propertyDetailValidator),
  handler: async (ctx, args) => {
    const { user } = ctx;

    const property = await ctx.db.get(args.id);
    if (!property) return null;

    const { activeCompanyId, canReadAllCompanies } = getPropertyScope(user);
    if (!canReadAllCompanies) {
      if (property.companyId !== activeCompanyId) {
        throw appError("UNAUTHORIZED", "Unauthorized");
      }
    }

    // Named field by field rather than spread: a column added to the table
    // later must be put on the page deliberately before it can reach one.
    return {
      address: property.address,
      price: property.price,
      url: property.url,
      ...(property.bedrooms === undefined ? {} : { bedrooms: property.bedrooms }),
      ...(property.bathrooms === undefined ? {} : { bathrooms: property.bathrooms }),
      ...(property.propertyType === undefined ? {} : { propertyType: property.propertyType }),
      ...(property.imageUrl === undefined ? {} : { imageUrl: property.imageUrl }),
      ...(property.description === undefined ? {} : { description: property.description }),
      ...(property.features === undefined ? {} : { features: property.features }),
      ...(property.images === undefined ? {} : { images: property.images }),
      ...(property.floorplans === undefined ? {} : { floorplans: property.floorplans }),
      ...(property.epcRating === undefined ? {} : { epcRating: property.epcRating }),
      ...(property.latitude === undefined ? {} : { latitude: property.latitude }),
      ...(property.longitude === undefined ? {} : { longitude: property.longitude }),
      ...(property.agentName === undefined ? {} : { agentName: property.agentName }),
      ...(property.agentPhone === undefined ? {} : { agentPhone: property.agentPhone }),
      ...(property.agentProfileUrl === undefined
        ? {}
        : { agentProfileUrl: property.agentProfileUrl }),
      ...(property.addedOn === undefined ? {} : { addedOn: property.addedOn }),
      ...(property.firstVisibleDate === undefined
        ? {}
        : { firstVisibleDate: property.firstVisibleDate }),
      ...(property.listingUpdateReason === undefined
        ? {}
        : { listingUpdateReason: property.listingUpdateReason }),
      ...(property.productLabel === undefined ? {} : { productLabel: property.productLabel }),
      ...(property.sizeSqFeetMin === undefined ? {} : { sizeSqFeetMin: property.sizeSqFeetMin }),
      ...(property.sizeSqFeetMax === undefined ? {} : { sizeSqFeetMax: property.sizeSqFeetMax }),
    };
  },
});

export const deleteProperty = moduleMutation({
  module: PROPERTIES_MODULE_KEY,
  args: { id: v.id("properties") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = ctx;

    const property = await ctx.db.get(args.id);
    if (!property) throw appError("NOT_FOUND", "Property not found");

    const { activeCompanyId, canReadAllCompanies } = getPropertyScope(user);
    if (!canReadAllCompanies) {
      if (property.companyId !== activeCompanyId) {
        throw appError("UNAUTHORIZED", "Unauthorized");
      }
    }

    await ctx.db.delete(args.id);

    return null;
  },
});

export const getLatestRuns = softQuery({
  // Returns an empty list rather than throwing when the caller has no session
  // or no company, so the dashboard renders an empty state instead of an error.
  reason: "The dashboard's run list renders empty for a caller with no session rather than erroring; company scoping is still applied in the handler.",
  args: {},
  returns: v.array(v.object({ _id: v.id("apifyRuns"), runId: v.string(), status: v.union(v.literal("PENDING"), v.literal("COMPLETED"), v.literal("FAILED")), startedAt: v.number(), completedAt: v.optional(v.number()), propertiesScraped: v.optional(v.number()) })),
  empty: [],
  handler: async (ctx) => {
  const current = await getCurrentUser(ctx);
  if (!current) return [];

  const { activeCompanyId, canReadAllCompanies } = getPropertyScope(current.user);

  // Withheld capability reads as empty, matching this surface's soft contract.
  if (current.user.role !== "SUPER_ADMIN" && activeCompanyId) {
    const company = await ctx.db.get(activeCompanyId);
    if (!(await effectiveModulesFor(ctx, company)).includes(PROPERTIES_MODULE_KEY)) return [];
  }

  const runs = canReadAllCompanies
    ? await ctx.db.query("apifyRuns").order("desc").take(5)
    : activeCompanyId
      ? await ctx.db
          .query("apifyRuns")
          .withIndex("by_company", (q) => q.eq("companyId", activeCompanyId))
          .order("desc")
          .take(5)
      : [];

  return runs.map((run) => ({
    _id: run._id,
    runId: run.runId,
    status: run.status,
    startedAt: run.startedAt,
    ...(run.completedAt !== undefined ? { completedAt: run.completedAt } : {}),
    ...(run.propertiesScraped !== undefined ? { propertiesScraped: run.propertiesScraped } : {}),
  }));
  },
});

export const getAllRunsAdmin = superAdminQuery(async (ctx) => {
  return await ctx.db.query("apifyRuns").order("desc").take(5);
});
