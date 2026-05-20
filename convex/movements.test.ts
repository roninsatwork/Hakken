import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("Movements API Authentication Hardening", () => {
  test("Anonymous (unauthenticated) client is strictly rejected from all movements operations", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    // Insert a record so we have a valid movements ID for the tests
    const movementId = await t.run(async (ctx) => {
      return await ctx.db.insert("movements", {
        title: "Test Movement",
        difficulty: "Easy",
        poseData: "[]",
        createdAt: Date.now()
      });
    });

    // 1. list query
    await expect(
      t.query(api.movements.list)
    ).rejects.toThrow("Unauthorized");

    // 2. get query
    await expect(
      t.query(api.movements.get, { id: movementId })
    ).rejects.toThrow("Unauthorized");

    // 3. create mutation
    await expect(
      t.mutation(api.movements.create, {
        title: "Pilates Roll Up",
        difficulty: "Intermediate",
        poseData: "[]"
      })
    ).rejects.toThrow("Unauthorized");

    // 4. remove mutation
    await expect(
      t.mutation(api.movements.remove, { id: movementId })
    ).rejects.toThrow("Unauthorized");

    // 5. generateUploadUrl mutation
    await expect(
      t.mutation(api.movements.generateUploadUrl)
    ).rejects.toThrow("Unauthorized");

    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["test content"], { type: "text/plain" }));
    });

    // 6. getFileUrl query
    await expect(
      t.query(api.movements.getFileUrl, { storageId })
    ).rejects.toThrow("Unauthorized");
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
      poseData: "[1, 2, 3]"
    });
    expect(movementId).toBeDefined();

    // 3. List should now contain the new movement
    const updatedList = await authedClient.query(api.movements.list);
    expect(updatedList.length).toBe(1);
    expect(updatedList[0].title).toBe("Hundred");

    // 4. Get by ID should work
    const fetched = await authedClient.query(api.movements.get, { id: movementId });
    expect(fetched?.title).toBe("Hundred");

    // 5. Remove should delete it
    await authedClient.mutation(api.movements.remove, { id: movementId });
    const emptyList = await authedClient.query(api.movements.list);
    expect(emptyList.length).toBe(0);
  });
});
