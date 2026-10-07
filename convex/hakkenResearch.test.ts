import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * The Research Agent (docs/plans/active/hakken-tasks-plan.md, item 4.2): its
 * name, its read tools, what it says when switched off, and the bell once its
 * write-up is in the conversation.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

async function world(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: now });
    const userId = await ctx.db.insert("users", { name: "Anthony Basker", email: "anthony@ronins.test", role: "ADMIN", companyId, createdAt: now });
    const threadId = await ctx.db.insert("threads", { userId, companyId, title: "Why did it drop?", createdAt: now, updatedAt: now });
    return { companyId, userId, threadId };
  });
}

describe("The Research Agent", () => {
  test("is named from the platform's name and looks with the read tools and the chart, never the task tools", async () => {
    const t = harness();
    const { userId } = await world(t);
    const agentId = await t.mutation(internal.hakkenResearch.ensureResearcherInternal, { installedBy: userId });
    const agent = await t.run((ctx) => ctx.db.get(agentId));
    expect(agent?.name).toBe("The Hakken Research Agent");
    const tools = await t.run(async (ctx) => {
      const rows = await ctx.db.query("agentTools").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect();
      return (await Promise.all(rows.map(async (row) => (await ctx.db.get(row.toolId))?.handlerMapping))).sort();
    });
    expect(tools).toEqual(["assistant.ai.mentions", "assistant.chart", "assistant.searchConsole", "assistant.site.overview", "assistant.tasks.open", "assistant.websites"]);
  });

  test("switched off, it says so in the conversation rather than leaving the yes unanswered", async () => {
    const t = harness();
    const { userId, threadId } = await world(t);
    const agentId = await t.mutation(internal.hakkenResearch.ensureResearcherInternal, { installedBy: userId });
    await t.run((ctx) => ctx.db.patch(agentId, { isActive: false }));
    await t.action(internal.hakkenResearch.researchInternal, { threadId, userId, research: { question: "Why did it drop?" } });
    const [message] = await t.run((ctx) => ctx.db.query("messages").collect());
    expect(message.content).toMatch(/^The Hakken Research Agent is switched off, so this wasn't looked into\./);
  });

  test("tells its owner in the bell, in their language, that the write-up is in their conversation", async () => {
    const t = harness();
    const { userId, threadId, companyId } = await world(t);
    await t.run((ctx) => ctx.db.insert("readerPreferences", { userId, newsDigest: true, language: "it", unsubscribeToken: "token", updatedAt: Date.now() }));
    vi.useFakeTimers();
    try {
      await t.mutation(internal.hakkenResearch.tellOwnerInternal, { userId, threadId, companyId, question: "Perché è calato?" });
      await finishScheduled(t);
    } finally {
      vi.useRealTimers();
    }
    const [notification] = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notification).toMatchObject({ kind: "HAKKEN_RESEARCH", title: "Hakken ci ha guardato: ecco cosa ha trovato", body: "Perché è calato?", href: `/app/assistant/${threadId}` });
  });
});
