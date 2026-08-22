import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { tenantMutation, tenantQuery } from "./tenantFunctions";

const movementDifficultyValidator = v.union(
  v.literal("Beginner"),
  v.literal("Intermediate"),
  v.literal("Advanced")
);

const movementDataFormatValidator = v.union(
  v.literal("legacy-inline-json"),
  v.literal("legacy-storage-json"),
  v.literal("storage-json-v1"),
  v.literal("storage-json-v2"),
  v.literal("storage-json-v3")
);

const movementSpineGoalValidator = v.union(
  v.literal("neutralStack"),
  v.literal("hipHinge"),
  v.literal("rollDown"),
  v.literal("thoracicRotation"),
  v.literal("sideBend"),
  v.literal("extension"),
  v.literal("squatWithStack")
);

const movementBodyFocusValidator = v.union(
  v.literal("neck"),
  v.literal("shoulders"),
  v.literal("ribcage"),
  v.literal("pelvis"),
  v.literal("hips"),
  v.literal("feet")
);

const movementDebugTriggerValidator = v.union(
  v.literal("debug-auto-baseline"),
  v.literal("manual-debug-save")
);

const movementCameraBodyPartValidator = v.union(
  v.literal("head"),
  v.literal("torso"),
  v.literal("leftArm"),
  v.literal("rightArm"),
  v.literal("leftHand"),
  v.literal("rightHand"),
  v.literal("leftLeg"),
  v.literal("rightLeg"),
  v.literal("leftFoot"),
  v.literal("rightFoot")
);

const movementStartReadinessValidator = v.object({
  blockedReasons: v.array(v.string()),
  calibrationQuality: v.union(v.number(), v.null()),
  canStartGame: v.boolean(),
  canStartRecording: v.boolean(),
  countdownMsRemaining: v.number(),
  promptEvents: v.array(v.union(
    v.literal("get-ready"),
    v.literal("walk-back-into-frame"),
    v.literal("show-your-whole-body"),
    v.literal("show-your-hands"),
    v.literal("show-your-feet"),
    v.literal("hold-still-for-calibration")
  )),
  requiredBodyParts: v.array(movementCameraBodyPartValidator),
  state: v.union(
    v.literal("countdown"),
    v.literal("checking-visibility"),
    v.literal("calibrating"),
    v.literal("ready"),
    v.literal("blocked")
  ),
  visibleBodyParts: v.array(movementCameraBodyPartValidator),
});

function isInlinePoseData(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("[") || trimmed.startsWith("{");
}

function movementIsOwnedByUser<T extends { createdBy?: Id<"users"> }>(
  movement: T | null | undefined,
  userId: Id<"users">,
): movement is T & { createdBy: Id<"users"> } {
  return movement?.createdBy === userId;
}

function getMovementStorageId(movement: { poseStorageId?: Id<"_storage">; poseData?: string }) {
  return movement.poseStorageId ?? (
    movement.poseData && !isInlinePoseData(movement.poseData)
      ? movement.poseData as Id<"_storage">
      : null
  );
}

export const list = tenantQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("movements")
      .withIndex("by_createdBy_createdAt", (q) => q.eq("createdBy", ctx.userId))
      .order("desc")
      .take(100);
  },
});

export const listReplayAlignmentRecordings = tenantQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 50, 100));
    const movements = await ctx.db
      .query("movements")
      .withIndex("by_createdBy_createdAt", (q) => q.eq("createdBy", ctx.userId))
      .order("desc")
      .take(limit);

    return await Promise.all(movements.map(async (movement) => {
      const storageId = getMovementStorageId(movement);

      return {
        ...movement,
        poseDataUrl: storageId ? await ctx.storage.getUrl(storageId) : null,
      };
    }));
  },
});

export const getPaginated = tenantQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
    spineGoal: v.optional(movementSpineGoalValidator),
  },
  handler: async (ctx, args) => {
    const searchTerm = args.searchTerm?.trim();

    return searchTerm
      ? await ctx.db
        .query("movements")
        .withSearchIndex("search_title", (q) => {
          const searched = q.search("title", searchTerm).eq("createdBy", ctx.userId);
          return args.spineGoal ? searched.eq("spineGoal", args.spineGoal) : searched;
        })
        .paginate(args.paginationOpts)
      : args.spineGoal
        ? await ctx.db
          .query("movements")
          .withIndex("by_createdBy_spineGoal_createdAt", (q) =>
            q.eq("createdBy", ctx.userId).eq("spineGoal", args.spineGoal)
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
        .query("movements")
        .withIndex("by_createdBy_createdAt", (q) => q.eq("createdBy", ctx.userId))
        .order("desc")
        .paginate(args.paginationOpts);
  },
});

export const get = tenantQuery({
  args: { id: v.id("movements") },
  handler: async (ctx, args) => {
    const movement = await ctx.db.get(args.id);
    return movementIsOwnedByUser(movement, ctx.userId) ? movement : null;
  },
});

export const create = tenantMutation({
  args: {
    title: v.string(),
    difficulty: movementDifficultyValidator,
    poseData: v.string(),
    poseDataFormat: v.optional(movementDataFormatValidator),
    poseStorageId: v.optional(v.id("_storage")),
    frameCount: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    captureFps: v.optional(v.number()),
    schemaVersion: v.optional(v.number()),
    spineGoal: v.optional(movementSpineGoalValidator),
    primaryCue: v.optional(v.string()),
    bodyFocus: v.optional(v.array(movementBodyFocusValidator)),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("movements", {
      title: args.title,
      difficulty: args.difficulty,
      poseData: args.poseData,
      poseDataFormat: args.poseDataFormat ?? (isInlinePoseData(args.poseData) ? "legacy-inline-json" : "legacy-storage-json"),
      poseStorageId: args.poseStorageId,
      frameCount: args.frameCount,
      durationMs: args.durationMs,
      captureFps: args.captureFps,
      schemaVersion: args.schemaVersion,
      spineGoal: args.spineGoal,
      primaryCue: args.primaryCue,
      bodyFocus: args.bodyFocus,
      createdBy: ctx.userId,
      createdAt: Date.now(),
    });
  },
});

export const remove = tenantMutation({
  args: { id: v.id("movements") },
  handler: async (ctx, args) => {
    const movement = await ctx.db.get(args.id);
    if (!movementIsOwnedByUser(movement, ctx.userId)) throw new Error("Unauthorized");

    const storageId = getMovementStorageId(movement);

    if (storageId) {
      await ctx.storage.delete(storageId).catch(() => {});
    }

    await ctx.db.delete(args.id);
  },
});

export const generateUploadUrl = tenantMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getFileUrl = tenantQuery({
  args: { movementId: v.id("movements") },
  handler: async (ctx, args) => {
    const movement = await ctx.db.get(args.movementId);
    if (!movementIsOwnedByUser(movement, ctx.userId)) return null;

    const storageId = getMovementStorageId(movement);

    return storageId ? await ctx.storage.getUrl(storageId) : null;
  },
});

export const saveDebugTrackingSession = tenantMutation({
  args: {
    movementId: v.id("movements"),
    trigger: movementDebugTriggerValidator,
    sampleCount: v.number(),
    durationMs: v.number(),
    startedAt: v.number(),
    endedAt: v.number(),
    baselineSummary: v.string(),
    warningSummary: v.string(),
    captureStartReadiness: v.optional(movementStartReadinessValidator),
    samplesJson: v.string(),
  },
  handler: async (ctx, args) => {
    const movement = await ctx.db.get(args.movementId);
    if (!movementIsOwnedByUser(movement, ctx.userId)) throw new Error("Movement not found");

    return await ctx.db.insert("movementDebugSessions", {
      movementId: args.movementId,
      trigger: args.trigger,
      sampleCount: args.sampleCount,
      durationMs: args.durationMs,
      startedAt: args.startedAt,
      endedAt: args.endedAt,
      baselineSummary: args.baselineSummary,
      warningSummary: args.warningSummary,
      captureStartReadiness: args.captureStartReadiness,
      samplesJson: args.samplesJson,
      createdBy: ctx.userId,
      createdAt: Date.now(),
    });
  },
});

export const listDebugTrackingSessions = tenantQuery({
  args: {
    movementId: v.optional(v.id("movements")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 10, 50));
    if (args.movementId) {
      const movement = await ctx.db.get(args.movementId);
      if (!movementIsOwnedByUser(movement, ctx.userId)) return [];
    }
    const sessions = args.movementId
      ? await ctx.db
          .query("movementDebugSessions")
          .withIndex("by_movement_createdBy_createdAt", (q) =>
            q.eq("movementId", args.movementId!).eq("createdBy", ctx.userId)
          )
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("movementDebugSessions")
          .withIndex("by_createdBy_createdAt", (q) => q.eq("createdBy", ctx.userId))
          .order("desc")
          .take(limit);

    return sessions.map((session) => ({
      ...session,
      samplesJson: undefined,
      samplesPreview: session.samplesJson.slice(0, 800),
    }));
  },
});

export const getDebugTrackingSession = tenantQuery({
  args: {
    id: v.id("movementDebugSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    return session?.createdBy === ctx.userId ? session : null;
  },
});

export const getDebugTrackingSessions = tenantQuery({
  args: {
    ids: v.array(v.id("movementDebugSessions")),
  },
  handler: async (ctx, args) => {
    const limitedIds = args.ids.slice(0, 20);
    const sessions = await Promise.all(limitedIds.map((id) => ctx.db.get(id)));
    return sessions.filter((session) => session?.createdBy === ctx.userId);
  },
});
