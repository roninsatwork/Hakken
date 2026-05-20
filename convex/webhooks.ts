import { httpAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { timingSafeEqual } from "node:crypto";

export const processApifyWebhook = httpAction(async (ctx, request) => {
  // Validate dynamic shared webhook secret to prevent spoofing
  const requestUrl = new URL(request.url);
  const secretParam = requestUrl.searchParams.get("secret");
  const secretHeader = request.headers.get("X-Apify-Secret") || request.headers.get("x-apify-secret");
  const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;

  let isSecretValid = false;
  if (webhookSecret) {
    const expected = Buffer.from(webhookSecret);
    const expectedLen = expected.length;

    const checkSecret = (providedStr: string | null) => {
      if (!providedStr) return false;
      const provided = Buffer.from(providedStr);
      return provided.length === expectedLen && timingSafeEqual(provided, expected);
    };

    isSecretValid = checkSecret(secretHeader) || checkSecret(secretParam);
  }

  if (!isSecretValid) {
    return new Response("Unauthorized request origin", { status: 401 });
  }

  const payloadStr = await request.text();
  let payload;
  try {
    payload = JSON.parse(payloadStr);
  } catch (err) {
    return new Response("Invalid JSON payload", { status: 400 });
  }

  const { runId, status, actorId, datasetId } = payload;
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

    if (!run) throw new Error("Run not found");

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
        imageUrl: (Array.isArray(item.images) && item.images.length > 0) ? (item.images[0].url || item.images[0]) : (item.mainImage || ""),
        images: Array.isArray(item.images) ? item.images.map((img: any) => img.url || img).filter(Boolean) : [],
        description: item.description || item.summary || "",
        features: Array.isArray(item.features) ? item.features : [],
        floorplans: Array.isArray(item.floorplans) ? item.floorplans.map((fp: any) => fp.url || fp).filter(Boolean) : [],
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
  },
});
