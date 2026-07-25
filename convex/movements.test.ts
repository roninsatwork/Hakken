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

    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["test content"], { type: "text/plain" }));
    });

    // 7. getFileUrl query
    await expect(
      t.query(api.movements.getFileUrl, { storageId })
    ).rejects.toThrow("Unauthenticated");
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
