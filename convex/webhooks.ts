import { httpAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
// template:remove:start properties
import { producesPropertyListings } from "./apifyActors";
// template:remove:end
import { readBoundedJson } from "./utils/boundedRequestBody";
import { constantTimeEqual } from "./utils/security";
import { appError } from "./utils/appError";


// template:remove:start properties
const getUrlValue = (value: unknown) => {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "url" in value) {
    const url = (value as { url?: unknown }).url;
    return typeof url === "string" ? url : "";
  }
  return "";
};
// template:remove:end

export const processApifyWebhook = httpAction(async (ctx, request) => {
  // Validate dynamic shared webhook secret to prevent spoofing
  // 🛡️ SECURITY: Enforce webhook secret strictly via headers to prevent credential leak in proxy/server logs.
  const secretHeader = request.headers.get("X-Apify-Secret") || request.headers.get("x-apify-secret");
  const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;

  let isSecretValid = false;
  if (webhookSecret) {
    const checkSecret = (providedStr: string | null) => {
      if (!providedStr) return false;
      return constantTimeEqual(providedStr, webhookSecret);
    };

    isSecretValid = checkSecret(secretHeader);
  }

  if (!isSecretValid) {
    return new Response("Unauthorized request origin", { status: 401 });
  }

  /*
   * Only after the secret has been proven, and never more than the cap: the
   * public API and the workflow webhook both read this way, and this handler
   * was the one that did not — it took `request.text()` on whatever arrived and
   * had already buffered it before it could object.
   */
  const body = await readBoundedJson(request);
  if (!body.ok) {
    return body.reason === "too_large"
      ? new Response("Payload too large", { status: 413 })
      : new Response("Invalid JSON payload", { status: 400 });
  }

  const payload = body.payload as { runId?: string; status?: string; datasetId?: string };
  const { runId, status, datasetId } = payload;
  if (!runId || !status) {
    return new Response("Missing runId or status", { status: 400 });
  }

  if (status === "SUCCEEDED" && datasetId) {
    // Delegate to Node action to use apify-client
    await ctx.runAction(internal.apify.fetchDatasetAndStore, {
      runId,
      datasetId,
      status,
    });
  } else {
    await ctx.runMutation(internal.webhooks.updateRunStatus, {
      runId,
      status,
    });
  }

  return new Response("Webhook processed", { status: 200 });
});

export const updateRunStatus = internalMutation({
  args: {
    runId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.query("apifyRuns")
      .withIndex("by_runId", q => q.eq("runId", args.runId))
      .unique();

    if (run) {
      let newStatus: "PENDING" | "COMPLETED" | "FAILED" = "PENDING";
      let completedAt = run.completedAt;

      if (args.status === "FAILED" || args.status === "ABORTED" || args.status === "TIMED-OUT") {
        newStatus = "FAILED";
        completedAt = Date.now();
      } else if (args.status === "SUCCEEDED") {
        newStatus = "COMPLETED";
        completedAt = Date.now();
      } else {
        newStatus = "PENDING";
        completedAt = undefined;
      }

      await ctx.db.patch(run._id, {
        status: newStatus,
        completedAt,
      });
    }
  },
});

export const getRunByRunIdInternal = internalQuery({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.query("apifyRuns")
      .withIndex("by_runId", q => q.eq("runId", args.runId))
      .unique();
  },
});

export const recordRunStart = internalMutation({
  args: {
    runId: v.string(),
    actorId: v.string(),
    startedBy: v.id("users"),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("apifyRuns", {
      runId: args.runId,
      actorId: args.actorId,
      startedBy: args.startedBy,
      companyId: args.companyId,
      status: "PENDING",
      startedAt: Date.now(),
    });
  },
});

export const storeRightmoveData = internalMutation({
  args: {
    runId: v.string(),
    status: v.string(),
    items: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.query("apifyRuns")
      .withIndex("by_runId", q => q.eq("runId", args.runId))
      .unique();

    if (!run) throw appError("NOT_FOUND", "Run not found");

    // template:remove:start properties
    if (producesPropertyListings(run.actorId)) {
      for (const itemStr of args.items) {
        const item = JSON.parse(itemStr);
        const rightmoveId = String(item.id || item.url || Date.now());

        // Check for existing property to prevent duplicates
        const existing = await ctx.db.query("properties")
          .withIndex("by_rightmoveId", q => q.eq("rightmoveId", rightmoveId))
          .filter(q => q.eq(q.field("companyId"), run.companyId))
          .first();

        const propertyData = {
          runId: args.runId,
          rightmoveId,
          address: item.address || item.displayAddress || "Unknown",
          price: typeof item.price === 'number' ? item.price : parseInt(String(item.price).replace(/[^0-9]/g, '')) || 0,
          currency: "GBP",
          bedrooms: item.bedrooms || 0,
          bathrooms: item.bathrooms || 0,
          propertyType: item.propertyType || "Unknown",
          url: item.url || "",
          imageUrl: (Array.isArray(item.images) && item.images.length > 0) ? (getUrlValue(item.images[0]) || item.mainImage || "") : (item.mainImage || ""),
          images: Array.isArray(item.images) ? item.images.map(getUrlValue).filter(Boolean) : [],
          description: item.description || item.summary || "",
          features: Array.isArray(item.features) ? item.features : [],
          floorplans: Array.isArray(item.floorplans) ? item.floorplans.map(getUrlValue).filter(Boolean) : [],
          epcRating: item.epcRating || item.epc?.rating || "",
          latitude: item.coordinates?.latitude || item.location?.latitude || undefined,
          longitude: item.coordinates?.longitude || item.location?.longitude || undefined,
          agentName: item.agent?.name || item.branch?.name || (typeof item.agent === 'string' ? item.agent : ""),
          agentPhone: item.agentPhone || item.agent?.phone || item.branch?.phone || "",
          agentProfileUrl: item.agentProfileUrl || "",
          addedOn: item.addedOn || "",
          firstVisibleDate: item.firstVisibleDate || "",
          listingUpdateDate: item.listingUpdateDate || "",
          listingUpdateReason: item.listingUpdateReason || "",
          productLabel: item.productLabel || "",
          sizeSqFeetMin: String(item.sizeSqFeetMin || ""),
          sizeSqFeetMax: String(item.sizeSqFeetMax || ""),
          companyId: run.companyId,
          scrapedAt: Date.now(),
        };

        if (existing) {
          // Upsert: Update existing property with fresh data
          await ctx.db.patch(existing._id, propertyData);
        } else {
          // Insert: Brand new property
          await ctx.db.insert("properties", propertyData);
        }
      }

      await ctx.db.patch(run._id, {
        status: "COMPLETED",
        completedAt: Date.now(),
        propertiesScraped: args.items.length,
      });
      return;
    }
    // template:remove:end
    // Generic jobs finish without interpreting their results as property listings.
    await ctx.db.patch(run._id, { status: "COMPLETED", completedAt: Date.now(), propertiesScraped: 0 });
  },
});
