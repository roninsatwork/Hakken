import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// Auth moved from a manual getAuthUserId check inside each function to the
// shared tenant builders, so an anonymous caller is now rejected before the
// handler runs. The message is "Unauthenticated" rather than "Unauthorized",
// which is also more accurate for a caller with no session at all.
describe("Movements API Authentication Hardening", () => {
  test("Anonymous (unauthenticated) client is strictly rejected from all movements operations", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    // Insert a record so we have a valid movements ID for the tests
    const movementId = await t.run(async (ctx) => {
      return await ctx.db.insert("movements", {
        title: "Test Movement",
        difficulty: "Beginner",
        poseData: "[]",
        createdAt: Date.now()
      });
    });

    // 1. list query
    await expect(
      t.query(api.movements.list)
    ).rejects.toThrow("Unauthenticated");

    // 2. paginated list query
    await expect(
      t.query(api.movements.getPaginated, { paginationOpts: { numItems: 15, cursor: null } })
    ).rejects.toThrow("Unauthenticated");

    // 3. get query
    await expect(
      t.query(api.movements.get, { id: movementId })
    ).rejects.toThrow("Unauthenticated");

    // 4. create mutation
    await expect(
      t.mutation(api.movements.create, {
        title: "Pilates Roll Up",
        difficulty: "Intermediate",
        poseData: "[]"
      })
    ).rejects.toThrow("Unauthenticated");

    // 5. remove mutation
    await expect(
      t.mutation(api.movements.remove, { id: movementId })
    ).rejects.toThrow("Unauthenticated");

    // 6. generateUploadUrl mutation
    await expect(
      t.mutation(api.movements.generateUploadUrl)
    ).rejects.toThrow("Unauthenticated");

    // 7. getFileUrl query
    await expect(
      t.query(api.movements.getFileUrl, { movementId })
    ).rejects.toThrow("Unauthenticated");
  });

  test("authenticated users cannot read, debug, or delete another user's movement", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { debugSessionId, inlineMovementId, movementId, creatorId, viewerId } = await t.run(async (ctx) => {
      const creatorId = await ctx.db.insert("users", {
        email: "creator@pilates.com",
        role: "USER",
      });
      const viewerId = await ctx.db.insert("users", {
        email: "viewer@pilates.com",
        role: "USER",
      });
      const storageId = await ctx.storage.store(
        new Blob([JSON.stringify([{ frame: 1 }])], { type: "application/json" })
      );
      await ctx.storage.store(new Blob(["unrelated"], { type: "text/plain" }));
      const movementId = await ctx.db.insert("movements", {
        title: "Shared Demo",
        difficulty: "Beginner",
        poseData: storageId,
        poseStorageId: storageId,
        createdBy: creatorId,
        createdAt: Date.now(),
      });
      const debugSessionId = await ctx.db.insert("movementDebugSessions", {
        movementId,
        trigger: "manual-debug-save",
        sampleCount: 1,
        durationMs: 100,
        startedAt: 1,
        endedAt: 2,
        baselineSummary: "baseline",
        warningSummary: "none",
        samplesJson: "[]",
        createdBy: creatorId,
        createdAt: Date.now(),
      });
      const inlineMovementId = await ctx.db.insert("movements", {
        title: "Inline Demo",
        difficulty: "Beginner",
        poseData: "[]",
        createdBy: creatorId,
        createdAt: Date.now(),
      });

      return { debugSessionId, inlineMovementId, movementId, creatorId, viewerId };
    });

    const creatorClient = t.withIdentity({ subject: creatorId });
    const viewerClient = t.withIdentity({ subject: viewerId });
    const fileUrl = await creatorClient.query(api.movements.getFileUrl, { movementId });

    expect(fileUrl).toMatch(/^https?:\/\//);
    expect(await creatorClient.query(api.movements.getFileUrl, { movementId: inlineMovementId })).toBeNull();
    expect(await viewerClient.query(api.movements.list)).toEqual([]);
    expect((await viewerClient.query(api.movements.getPaginated, {
      paginationOpts: { numItems: 15, cursor: null },
    })).page).toEqual([]);
    expect((await viewerClient.query(api.movements.getPaginated, {
      paginationOpts: { numItems: 15, cursor: null },
      searchTerm: "Shared",
    })).page).toEqual([]);
    expect(await viewerClient.query(api.movements.get, { id: movementId })).toBeNull();
    expect(await viewerClient.query(api.movements.getFileUrl, { movementId })).toBeNull();
    expect(await viewerClient.query(api.movements.listDebugTrackingSessions, { movementId })).toEqual([]);
    expect(await viewerClient.query(api.movements.getDebugTrackingSession, { id: debugSessionId })).toBeNull();
    expect(await viewerClient.query(api.movements.getDebugTrackingSessions, { ids: [debugSessionId] })).toEqual([]);

    await expect(viewerClient.mutation(api.movements.saveDebugTrackingSession, {
      movementId,
      trigger: "manual-debug-save",
      sampleCount: 1,
      durationMs: 100,
      startedAt: 1,
      endedAt: 2,
      baselineSummary: "baseline",
      warningSummary: "none",
      samplesJson: "[]",
    })).rejects.toThrow("Movement not found");
    await expect(viewerClient.mutation(api.movements.remove, { id: movementId })).rejects.toThrow("Unauthorized");
    expect(await creatorClient.query(api.movements.get, { id: movementId })).toMatchObject({ title: "Shared Demo" });
  });

  test("Authenticated USER can access movements operations successfully", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const normalUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "student@pilates.com",
        role: "USER"
      });
    });

    const authedClient = t.withIdentity({ subject: normalUserId });

    // 1. Query list should be empty but NOT throw
    const listResult = await authedClient.query(api.movements.list);
    expect(listResult).toEqual([]);

    // 2. Create should insert successfully
    const movementId = await authedClient.mutation(api.movements.create, {
      title: "Hundred",
      difficulty: "Advanced",
      poseData: "[1, 2, 3]",
      poseDataFormat: "legacy-inline-json",
      frameCount: 1,
      durationMs: 1000,
      captureFps: 30,
      schemaVersion: 1,
      spineGoal: "neutralStack",
      primaryCue: "Stack head over hips.",
      bodyFocus: ["neck", "pelvis"],
    });
    expect(movementId).toBeDefined();

    // 3. List should now contain the new movement
    const updatedList = await authedClient.query(api.movements.list);
    expect(updatedList.length).toBe(1);
    expect(updatedList[0].title).toBe("Hundred");

    // 4. Get by ID should work
    const fetched = await authedClient.query(api.movements.get, { id: movementId });
    expect(fetched?.title).toBe("Hundred");
    expect(fetched?.poseDataFormat).toBe("legacy-inline-json");
    expect(fetched?.spineGoal).toBe("neutralStack");
    expect(fetched?.primaryCue).toBe("Stack head over hips.");
    expect(fetched?.bodyFocus).toEqual(["neck", "pelvis"]);
    expect(fetched?.createdBy).toBe(normalUserId);

    // 5. Remove should delete it
    await authedClient.mutation(api.movements.remove, { id: movementId });
    const emptyList = await authedClient.query(api.movements.list);
    expect(emptyList.length).toBe(0);
  });

  test("Authenticated USER can page and search movement records", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const normalUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "student@pilates.com",
        role: "USER"
      });
    });

    const authedClient = t.withIdentity({ subject: normalUserId });

    await authedClient.mutation(api.movements.create, {
      title: "Morning Hundred",
      difficulty: "Beginner",
      poseData: "[]",
      spineGoal: "neutralStack",
    });
    await authedClient.mutation(api.movements.create, {
      title: "Evening Roll Up",
      difficulty: "Intermediate",
      poseData: "[]",
      spineGoal: "rollDown",
    });

    const firstPage = await authedClient.query(api.movements.getPaginated, {
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(firstPage.page).toHaveLength(1);
    expect(firstPage.isDone).toBe(false);

    const searchPage = await authedClient.query(api.movements.getPaginated, {
      paginationOpts: { numItems: 15, cursor: null },
      searchTerm: "Roll",
    });
    expect(searchPage.page.map((movement) => movement.title)).toEqual(["Evening Roll Up"]);

    const filteredPage = await authedClient.query(api.movements.getPaginated, {
      paginationOpts: { numItems: 15, cursor: null },
      spineGoal: "neutralStack",
    });
    expect(filteredPage.page.map((movement) => movement.title)).toEqual(["Morning Hundred"]);

    const searchAndFilterPage = await authedClient.query(api.movements.getPaginated, {
      paginationOpts: { numItems: 15, cursor: null },
      searchTerm: "Roll",
      spineGoal: "rollDown",
    });
    expect(searchAndFilterPage.page.map((movement) => movement.title)).toEqual(["Evening Roll Up"]);
  });
});

describe("the debug-session reads, from the owner's side", () => {
  /**
   * These three were only ever called by the wrong owner, where they correctly
   * answer with nothing — so nothing exercised the answer that actually carries
   * data, and their declared shapes were checked by the compiler alone. No
   * screen calls them either, so the browser could not stand in for a test.
   *
   * `samplesJson` is the raw capture blob and the list deliberately replaces it
   * with a short preview. That narrowing is the one thing here worth pinning.
   */
  test("a session is listed with a preview, fetched whole, and fetched by id", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const ownerId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "coach@pilates.com", role: "USER" }));
    const owner = t.withIdentity({ subject: ownerId });

    const movementId = await owner.mutation(api.movements.create, {
      title: "Roll Down",
      difficulty: "Beginner",
      poseData: "[1, 2, 3]",
      poseDataFormat: "legacy-inline-json",
      frameCount: 1,
      durationMs: 1000,
      captureFps: 30,
      schemaVersion: 1,
      spineGoal: "rollDown",
      primaryCue: "Peel the spine off the wall.",
      bodyFocus: ["pelvis"],
    });

    const samplesJson = JSON.stringify(Array.from({ length: 200 }, (_, index) => ({ index })));
    const sessionId = await owner.mutation(api.movements.saveDebugTrackingSession, {
      movementId,
      trigger: "manual-debug-save",
      sampleCount: 200,
      durationMs: 100,
      startedAt: 1,
      endedAt: 2,
      baselineSummary: "baseline",
      warningSummary: "none",
      samplesJson,
    });

    const listed = await owner.query(api.movements.listDebugTrackingSessions, { movementId });
    const byIds = await owner.query(api.movements.getDebugTrackingSessions, { ids: [sessionId] });
    const one = await owner.query(api.movements.getDebugTrackingSession, { id: sessionId });

    // Proof each read had something to be wrong about.
    expect(listed).toHaveLength(1);
    expect(byIds).toHaveLength(1);
    expect(one?._id).toBe(sessionId);

    // The list sends a preview and not the blob; the single reads send it whole.
    expect(listed[0]).not.toHaveProperty("samplesJson");
    expect(listed[0].samplesPreview).toBe(samplesJson.slice(0, 800));
    expect(samplesJson.length).toBeGreaterThan(800);
    expect(one?.samplesJson).toBe(samplesJson);
    expect(byIds[0].samplesJson).toBe(samplesJson);
  });
});
