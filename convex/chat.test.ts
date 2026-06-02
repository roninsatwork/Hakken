import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
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
    const finalMessages = await client.query(api.chat.getMessages, { threadId });
    expect(finalMessages).not.toBeNull();
    
    // There should be exactly two messages: user input + rejection warning
    expect(finalMessages?.length).toBe(2);
    expect(finalMessages?.[0].role).toBe("user");
    expect(finalMessages?.[0].content).toBe("Hello, this is a test message.");
    expect(finalMessages?.[0].companyId).toBe(companyId);
    expect(finalMessages?.[0].userId).toBe(userId);
    expect(finalMessages?.[0].analyticsDimensionsVersion).toBe(1);
    
    expect(finalMessages?.[1].role).toBe("assistant");
    expect(finalMessages?.[1].content).toContain("exhausted its AI allocation");
    expect(finalMessages?.[1].companyId).toBe(companyId);
    expect(finalMessages?.[1].userId).toBe(userId);
    expect(finalMessages?.[1].analyticsDimensionsVersion).toBe(1);

    // Re-verify the company messages haven't gone beyond 10 to drain billing logic
    const companyRecords = await t.run(async (ctx) => {
      return await ctx.db.get(companyId);
    });
    expect(companyRecords?.messagesUsedThisPeriod).toBe(10);
  });

  test("assistant messages inherit analytics dimensions from their thread", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    const { threadId, companyId, userId, agentId, widgetId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Dimension Corp",
        createdAt: now,
      });
      const userId = await ctx.db.insert("users", {
        email: "dimension@test.com",
        role: "USER",
        companyId,
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Dimension Agent",
        modelId: "sonae-test-model",
        thinkingMode: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const widgetId = await ctx.db.insert("widgets", {
        companyId,
        agentId,
        name: "Dimension Widget",
        allowedDomains: ["https://example.com"],
        isActive: true,
        createdBy: userId,
        createdAt: now,
      });
      const threadId = await ctx.db.insert("threads", {
        userId,
        companyId,
        agentId,
        widgetId,
        title: "Dimension Thread",
        createdAt: now,
        updatedAt: now,
      });

      return { threadId, companyId, userId, agentId, widgetId };
    });

    await t.mutation(internal.chat.saveAssistantMessage, {
      threadId,
      content: "Dimensioned assistant response",
      inputTokens: 10,
      outputTokens: 20,
      modelUsed: "sonae-test-model",
    });

    const messages = await t.run(async (ctx) =>
      ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("threadId", threadId)).collect()
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: "assistant",
      companyId,
      userId,
      agentId,
      widgetId,
      analyticsDimensionsVersion: 1,
      inputTokens: 10,
      outputTokens: 20,
      modelUsed: "sonae-test-model",
    });
  });

  test("AI context fetch keeps only recent messages in chronological order", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const threadId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "context@test.com",
        role: "USER",
        createdAt: Date.now(),
      });
      const threadId = await ctx.db.insert("threads", {
        userId,
        title: "Context Window",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      for (let index = 0; index < 45; index++) {
        await ctx.db.insert("messages", {
          threadId,
          role: index % 2 === 0 ? "user" : "assistant",
          content: `message-${index}`,
          createdAt: Date.now() + index,
        });
      }

      return threadId;
    });

    const messages = await t.run(async (ctx) => ctx.runQuery(internal.chat.getMessagesForAI, { threadId }));

    expect(messages).toHaveLength(40);
    expect(messages[0].content).toBe("message-5");
    expect(messages.at(-1)?.content).toBe("message-44");
  });
});
