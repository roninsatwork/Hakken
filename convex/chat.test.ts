import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("Message Quotas Enforcements", () => {
  test("Message limits strictly reject API drain when exhausted", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    // Set up active restricted plan
    const limitedPlanId = await t.run(async (ctx) => {
      return await ctx.db.insert("plans", {
        name: "Standard",
        messageLimit: 10,
        priceGBP: 10,
        isActive: true,
        createdAt: Date.now()
      });
    });

    // Set up company with the maxed out limits
    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", {
        name: "Test Corp",
        planId: limitedPlanId,
        messagesUsedThisPeriod: 10, // Exact limit boundary
        createdAt: Date.now()
      });
    });

    // Set up user part of that company
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "quota@test.com",
        role: "USER",
        companyId: companyId
      });
    });

    const client = t.withIdentity({ subject: userId });

    const threadId = await client.mutation(api.chat.createThread, {});

    // At limit, sendMessage should return true but inject warning
    await client.mutation(api.chat.sendMessage, {
      threadId,
      content: "Hello, this is a test message.",
    });

    // We verify what was inserted into the database
    const finalMessages = await t.query(api.chat.getMessages, { threadId });
    expect(finalMessages).not.toBeNull();
    
    // There should be exactly two messages: user input + rejection warning
    expect(finalMessages?.length).toBe(2);
    expect(finalMessages?.[0].role).toBe("user");
    expect(finalMessages?.[0].content).toBe("Hello, this is a test message.");
    
    expect(finalMessages?.[1].role).toBe("assistant");
    expect(finalMessages?.[1].content).toContain("exhausted its AI allocation");

    // Re-verify the company messages haven't gone beyond 10 to drain billing logic
    const companyRecords = await t.run(async (ctx) => {
      return await ctx.db.get(companyId);
    });
    expect(companyRecords?.messagesUsedThisPeriod).toBe(10);
  });
});
