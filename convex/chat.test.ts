import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { mintWidgetEmbedPass } from "./utils/widgetEmbedPass";
import { WIDGET_MESSAGES_PER_HOUR } from "./chatService";
import type { Id } from "./_generated/dataModel";

// createWidgetThread requires a server-minted embed pass; tests mint their
// own with the same secret the mutation reads from the environment.
const TEST_EMBED_SECRET = "widget-embed-test-secret";
process.env.WIDGET_EMBED_SIGNING_SECRET = TEST_EMBED_SECRET;

async function openWidgetThread(t: ReturnType<typeof convexTest>, widgetId: Id<"widgets">) {
  const created = await t.mutation(api.widgets.createWidgetThread, {
    widgetId,
    sourceUrl: "https://example.com/",
    embedPass: await mintWidgetEmbedPass({ widgetId, embedHost: "example.com", secret: TEST_EMBED_SECRET }),
  });
  if ("refused" in created) throw new Error(`widget session refused: ${created.refused}`);
  return created;
}

describe("Message Quotas Enforcements", () => {
  test("assistant rows cannot hide user messages from the per-minute rate limit", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { userId, threadId } = await t.run(async (ctx) => {
      const now = Date.now();
      const companyId = await ctx.db.insert("companies", { name: "Rate Co", createdAt: now });
      const userId = await ctx.db.insert("users", {
        email: "rate@test.com",
        role: "USER",
        companyId,
        createdAt: now,
      });
      const threadId = await ctx.db.insert("threads", {
        userId,
        companyId,
        title: "Rate limited",
        createdAt: now,
        updatedAt: now,
      });
      for (let index = 0; index < 9; index += 1) {
        await ctx.db.insert("messages", {
          threadId,
          role: "user",
          content: `user ${index}`,
          createdAt: now - index,
        });
        await ctx.db.insert("messages", {
          threadId,
          role: "assistant",
          content: `assistant ${index}`,
          createdAt: now - index,
        });
      }
      return { userId, threadId };
    });
    const client = t.withIdentity({ subject: userId });

    await expect(client.mutation(api.chat.sendMessage, {
      threadId,
      content: "the tenth user message",
    })).resolves.toBe(true);
    await expect(client.mutation(api.chat.sendMessage, {
      threadId,
      content: "the eleventh user message",
    })).rejects.toThrow("429 Too Many Requests");
  });

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
    expect(finalMessages?.[1].role).toBe("assistant");
    expect(finalMessages?.[1].content).toContain("exhausted its AI allocation");

    // The analytics dimensions are stored, not shown: read the rows rather than
    // the client view, which deliberately does not carry them.
    const storedMessages = await t.run(async (ctx) =>
      ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("threadId", threadId)).collect()
    );
    for (const stored of storedMessages) {
      expect(stored.companyId).toBe(companyId);
      expect(stored.userId).toBe(userId);
      expect(stored.analyticsDimensionsVersion).toBe(1);
    }

    // Re-verify the company messages haven't gone beyond 10 to drain billing logic
    const companyRecords = await t.run(async (ctx) => {
      return await ctx.db.get(companyId);
    });
    expect(companyRecords?.messagesUsedThisPeriod).toBe(10);
  });

  /**
   * Anonymous widget traffic spends from the company's plan — the decision in
   * docs/plans/completed/widget-plan-quota-plan.md. One pot: a visitor's message
   * counts exactly like an employee's, and when the pot is empty the visitor
   * is refused before any model call is scheduled.
   */
  describe("widget visitors spend from the company plan", () => {
    /** A company on a limited plan, with a live widget a visitor can talk to. */
    async function setUpWidgetCompany(
      t: ReturnType<typeof convexTest>,
      options: { messageLimit: number; messagesUsedThisPeriod: number }
    ) {
      return await t.run(async (ctx) => {
        const planId = await ctx.db.insert("plans", {
          name: "Standard",
          messageLimit: options.messageLimit,
          priceGBP: 10,
          isActive: true,
          createdAt: Date.now(),
        });
        const companyId = await ctx.db.insert("companies", {
          name: "Widget Corp",
          planId,
          messagesUsedThisPeriod: options.messagesUsedThisPeriod,
          createdAt: Date.now(),
        });
        const creatorId = await ctx.db.insert("users", {
          email: "owner@widgetcorp.test",
          role: "ADMIN",
          companyId,
        });
        const widgetId = await ctx.db.insert("widgets", {
          companyId,
          name: "Website Bot",
          allowedDomains: ["example.com"],
          isActive: true,
          createdBy: creatorId,
          createdAt: Date.now(),
        });
        return { companyId, widgetId };
      });
    }

    test("a visitor's message increments the company's usage", async () => {
      const t = convexTest(schema, import.meta.glob("./**/*.*s"));
      const { companyId, widgetId } = await setUpWidgetCompany(t, {
        messageLimit: 10,
        messagesUsedThisPeriod: 3,
      });

      const { threadId, accessToken } = await openWidgetThread(t, widgetId);

      await t.mutation(api.chat.sendMessage, {
        threadId,
        content: "What are your opening hours?",
        widgetAccessToken: accessToken,
      });

      const company = await t.run(async (ctx) => ctx.db.get(companyId));
      expect(company?.messagesUsedThisPeriod).toBe(4);
    });

    test("an exhausted plan refuses the visitor without revealing why", async () => {
      const t = convexTest(schema, import.meta.glob("./**/*.*s"));
      const { companyId, widgetId } = await setUpWidgetCompany(t, {
        messageLimit: 10,
        messagesUsedThisPeriod: 10,
      });

      const { threadId, accessToken } = await openWidgetThread(t, widgetId);

      await t.mutation(api.chat.sendMessage, {
        threadId,
        content: "Hello, is anyone there?",
        widgetAccessToken: accessToken,
      });

      const messages = await t.query(api.chat.getMessages, {
        threadId,
        widgetAccessToken: accessToken,
      });

      // Exactly the refused exchange — nothing was scheduled, so no assistant
      // reply beyond the refusal will ever arrive.
      expect(messages?.length).toBe(2);
      expect(messages?.[1].role).toBe("assistant");
      // The key the widget client uses to render this in the visitor's language.
      expect(messages?.[1].systemKey).toBe("quotaRefusal");

      // The company's billing state is not the visitor's business. The words
      // the informative in-company refusal uses must all be absent here.
      const refusal = messages?.[1].content ?? "";
      for (const forbidden of ["plan", "allocation", "administrator", "company", "exhausted"]) {
        expect(refusal.toLowerCase()).not.toContain(forbidden);
      }

      // A refused message costs the company nothing.
      const company = await t.run(async (ctx) => ctx.db.get(companyId));
      expect(company?.messagesUsedThisPeriod).toBe(10);
    });

    test("a refused message is still PII-redacted before it is stored", async () => {
      const t = convexTest(schema, import.meta.glob("./**/*.*s"));
      const { widgetId } = await setUpWidgetCompany(t, {
        messageLimit: 10,
        messagesUsedThisPeriod: 10,
      });

      // The PII firewall is opt-in for chat; switch it on the way an admin
      // does, so this proves the refusal path honours it when it is armed.
      await t.run(async (ctx) => {
        await ctx.db.insert("systemConfig", {
          key: "PII_REDACTION_CONFIG",
          value: JSON.stringify({ enabled: true }),
          updatedAt: Date.now(),
        });
      });

      const { threadId, accessToken } = await openWidgetThread(t, widgetId);

      await t.mutation(api.chat.sendMessage, {
        threadId,
        content: "My email is visitor@example.com, please contact me.",
        widgetAccessToken: accessToken,
      });

      const messages = await t.query(api.chat.getMessages, {
        threadId,
        widgetAccessToken: accessToken,
      });

      // Refusal must not be the one path that stores a raw email address.
      expect(messages?.[0].content).toContain("[EMAIL_REDACTED]");
      expect(messages?.[0].content).not.toContain("visitor@example.com");
    });

    test("an unlimited plan is never refused by quota", async () => {
      const t = convexTest(schema, import.meta.glob("./**/*.*s"));
      const { widgetId } = await setUpWidgetCompany(t, {
        messageLimit: -1,
        // Far past any finite limit, to prove -1 means unlimited rather than zero.
        messagesUsedThisPeriod: 5000,
      });

      const { threadId, accessToken } = await openWidgetThread(t, widgetId);

      await t.mutation(api.chat.sendMessage, {
        threadId,
        content: "Still there?",
        widgetAccessToken: accessToken,
      });

      const messages = await t.query(api.chat.getMessages, {
        threadId,
        widgetAccessToken: accessToken,
      });

      // One stored message — the visitor's own. No refusal was injected; the
      // real reply arrives later from the scheduled model call.
      expect(messages?.length).toBe(1);
      expect(messages?.[0].role).toBe("user");
    });

    /**
     * 2026-09 audit: an unlimited plan meant an anonymous visitor could drive
     * unbounded model work by opening thread after thread. The widget's own
     * hourly message ceiling holds whatever the plan says, and across threads.
     */
    test("a widget's hourly message ceiling holds across threads, whatever the plan", async () => {
      const t = convexTest(schema, import.meta.glob("./**/*.*s"));
      const { widgetId } = await setUpWidgetCompany(t, {
        messageLimit: -1,
        messagesUsedThisPeriod: 0,
      });
      // One seat left in the window.
      await t.run(async (ctx) => {
        await ctx.db.patch(widgetId, {
          messageWindowStart: Date.now(),
          messageCountInWindow: WIDGET_MESSAGES_PER_HOUR - 1,
        });
      });
      const first = await openWidgetThread(t, widgetId);
      const second = await openWidgetThread(t, widgetId);

      // The last seat is granted…
      await t.mutation(api.chat.sendMessage, {
        threadId: first.threadId,
        content: "Hello?",
        widgetAccessToken: first.accessToken,
      });
      // …and a fresh thread does not buy another: the ceiling is the widget's.
      // The visitor gets the same soft refusal as an exhausted plan.
      for (const attempt of [1, 2]) {
        await t.mutation(api.chat.sendMessage, {
          threadId: second.threadId,
          content: `Still there? ${attempt}`,
          widgetAccessToken: second.accessToken,
        });
      }

      const { limited, secondThreadMessages } = await t.run(async (ctx) => ({
        limited: (await ctx.db.query("auditLogs").collect()).filter(
          (entry) => entry.actionType === "RATE_LIMITED_WIDGET_MESSAGES"
        ),
        secondThreadMessages: await ctx.db
          .query("messages")
          .withIndex("by_thread", (q) => q.eq("threadId", second.threadId))
          .collect(),
      }));
      // Logged once for the window; each refused attempt stored only the
      // visitor's line and the apology, and scheduled no model work.
      expect(limited).toHaveLength(1);
      expect(secondThreadMessages.map((message) => message.role).sort()).toEqual(["assistant", "assistant", "user", "user"]);
      for (const reply of secondThreadMessages.filter((message) => message.role === "assistant")) {
        expect(reply.systemKey).toBe("quotaRefusal");
      }

      // An expired window admits visitors again.
      await t.run(async (ctx) => {
        await ctx.db.patch(widgetId, { messageWindowStart: Date.now() - 2 * 60 * 60 * 1000 });
      });
      await t.mutation(api.chat.sendMessage, {
        threadId: second.threadId,
        content: "Back again.",
        widgetAccessToken: second.accessToken,
      });
      const widget = await t.run(async (ctx) => ctx.db.get(widgetId));
      expect(widget?.messageCountInWindow).toBe(1);
      const reopened = await t.run(async (ctx) =>
        ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("threadId", second.threadId)).collect()
      );
      expect(reopened.at(-1)).toMatchObject({ role: "user", content: "Back again." });
    });

    test("a visitor cannot choose the model, the thinking level or the swarm", async () => {
      const t = convexTest(schema, import.meta.glob("./**/*.*s"));
      const { widgetId } = await setUpWidgetCompany(t, { messageLimit: -1, messagesUsedThisPeriod: 0 });
      const { threadId, accessToken } = await openWidgetThread(t, widgetId);

      for (const settings of [{ modelId: "google:test-text-model" }, { thinkingLevel: "SWARM" }, { thinkingLevel: "HIGH" }]) {
        await expect(
          t.mutation(api.chat.sendMessage, {
            threadId,
            content: "Plan my company's expansion.",
            widgetAccessToken: accessToken,
            ...settings,
          })
        ).rejects.toThrow("cannot choose a model or thinking level");
      }
      // Refused before anything was stored, so nothing was scheduled either.
      const messages = await t.query(api.chat.getMessages, { threadId, widgetAccessToken: accessToken });
      expect(messages).toEqual([]);
    });
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
        modelId: "hakken-test-model",
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
      modelUsed: "hakken-test-model",
      providerKey: "openai",
      providerModelId: "gpt-test",
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
      modelUsed: "hakken-test-model",
      providerKey: "openai",
      providerModelId: "gpt-test",
    });
  });

  test("assistant safety refusals are stored with dimensions and safe audit metadata", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    const { threadId, companyId, userId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Safety Corp",
        createdAt: now,
      });
      const userId = await ctx.db.insert("users", {
        email: "safety@test.com",
        role: "USER",
        companyId,
      });
      const threadId = await ctx.db.insert("threads", {
        userId,
        companyId,
        title: "Safety Thread",
        createdAt: now,
        updatedAt: now,
      });

      return { threadId, companyId, userId };
    });

    await t.mutation(internal.chat.saveAssistantSafetyRefusal, {
      threadId,
      content: "I can't reveal hidden system instructions.",
      category: "hidden_instructions",
      source: "assistant",
    });

    const { messages, auditLogs } = await t.run(async (ctx) => ({
      messages: await ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("threadId", threadId)).collect(),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: "assistant",
      content: "I can't reveal hidden system instructions.",
      companyId,
      userId,
      analyticsDimensionsVersion: 1,
    });
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      actionType: "ASSISTANT_SAFETY_REFUSAL",
      actorId: userId,
      entityType: "threads",
      entityId: threadId,
      companyId,
    });
    expect(JSON.parse(auditLogs[0].metadata || "{}")).toEqual({
      category: "hidden_instructions",
      source: "assistant",
    });
  });

  test("anonymous safety refusals save the assistant message without audit actor", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    const threadId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Widget Safety Corp",
        createdAt: now,
      });
      const userId = await ctx.db.insert("users", {
        email: "widget-owner@test.com",
        role: "ADMIN",
        companyId,
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Widget Agent",
        modelId: "hakken-test-model",
        thinkingMode: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const widgetId = await ctx.db.insert("widgets", {
        companyId,
        agentId,
        name: "Widget",
        allowedDomains: ["https://example.com"],
        isActive: true,
        createdBy: userId,
        createdAt: now,
      });

      return await ctx.db.insert("threads", {
        companyId,
        widgetId,
        title: "Anonymous Thread",
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.mutation(internal.chat.saveAssistantSafetyRefusal, {
      threadId,
      content: "I can't access another tenant's private data.",
      category: "cross_tenant_access",
      source: "agent",
    });

    const { messages, auditLogs } = await t.run(async (ctx) => ({
      messages: await ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("threadId", threadId)).collect(),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: "assistant",
      content: "I can't access another tenant's private data.",
      analyticsDimensionsVersion: 1,
    });
    expect(auditLogs).toEqual([]);
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
