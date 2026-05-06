import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

describe("GARBAGE COLLECTION: purgeUserEntitiesInternal", () => {
  test("Successfully purges a small number of entities without recurring scheduling", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Test User",
        email: "test@example.com",
        role: "USER",
      });
    });

    // Seed 50 logins (< 100 limit)
    await t.run(async (ctx) => {
      for (let i = 0; i < 50; i++) {
        await ctx.db.insert("logins", {
          userId,
          device: `Device ${i}`,
          ip: "127.0.0.1",
          location: "Local",
          status: "SUCCESS",
          timestamp: Date.now()
        });
      }
    });

    // Run the internal purge mutation once
    await t.mutation(internal.users.purgeUserEntitiesInternal, { userId });

    // Assert that the 50 logins are entirely deleted
    const remainingLogins = await t.run(async (ctx) => {
      return await ctx.db.query("logins").withIndex("by_user", q => q.eq("userId", userId)).collect();
    });

    expect(remainingLogins.length).toBe(0);
  });

  test("Correctly batches deletions over limits to prevent transaction errors", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Heavy User",
        email: "heavy@example.com",
        role: "USER",
      });
    });

    // Seed 150 logins (> 100 limit)
    await t.run(async (ctx) => {
      for (let i = 0; i < 150; i++) {
        await ctx.db.insert("logins", {
          userId,
          device: `Heavy Device ${i}`,
          ip: "127.0.0.1",
          location: "Local",
          status: "SUCCESS",
          timestamp: Date.now()
        });
      }
    });

    // Run the mutation - it should only delete 100 in the first pass
    await t.mutation(internal.users.purgeUserEntitiesInternal, { userId });

    // We can't easily assert the mock scheduler with convex-test natively here without time-travel,
    // but we CAN assert that EXACTLY 50 logins remain in the database, proving it respected the .take(100) limit
    const remainingLoginsPhase1 = await t.run(async (ctx) => {
      return await ctx.db.query("logins").withIndex("by_user", q => q.eq("userId", userId)).collect();
    });
    
    expect(remainingLoginsPhase1.length).toBe(50); // 150 - 100 = 50

    // Simulating the scheduler's next tick manually
    await t.mutation(internal.users.purgeUserEntitiesInternal, { userId });

    const remainingLoginsPhase2 = await t.run(async (ctx) => {
      return await ctx.db.query("logins").withIndex("by_user", q => q.eq("userId", userId)).collect();
    });

    // Should be completely gone now
    expect(remainingLoginsPhase2.length).toBe(0);
  });

  test("Safely purges deeply nested threads and messages", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Chat User",
        email: "chat@example.com",
        role: "USER",
      });
    });

    await t.run(async (ctx) => {
      // 5 threads
      for (let i = 0; i < 5; i++) {
        const threadId = await ctx.db.insert("threads", {
          userId,
          title: `Thread ${i}`,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        
        // 5 messages per thread
        for (let j = 0; j < 5; j++) {
          await ctx.db.insert("messages", {
            threadId,
            content: "Hello",
            role: "user",
            createdAt: Date.now()
          });
        }
      }
    });

    await t.mutation(internal.users.purgeUserEntitiesInternal, { userId });

    const remainingThreads = await t.run(async (ctx) => {
      return await ctx.db.query("threads").withIndex("by_user", q => q.eq("userId", userId)).collect();
    });

    expect(remainingThreads.length).toBe(0);
  });
});
