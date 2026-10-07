import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * The company's own figures, as the Assistant reads them
 * (assistant-foundation-plan.md, item 7): each the very figure its screen
 * shows, for the conversation's company only, and reached by the Assistant
 * through tools bound to it.
 */

const { agentTurnMock } = vi.hoisted(() => ({ agentTurnMock: vi.fn() }));

vi.mock("./vertexProviderService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vertexProviderService")>();
  return {
    ...actual,
    createVertexGenAIClient: () => ({}),
    createVertexEmbeddingClient: () => ({}),
    embedVertexContentWithRetry: async () => ({ embeddings: [] }),
    createVertexPromptCache: async () => undefined,
    streamVertexContentWithRetry: async (_ai: unknown, params: unknown) => agentTurnMock(params),
    generateVertexContentWithRetry: async (_ai: unknown, params: unknown) => agentTurnMock(params),
  };
});

beforeEach(() => {
  agentTurnMock.mockReset();
});

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function company(t: Harness, name: string) {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function admin(t: Harness, companyId: Id<"companies">, role: "ADMIN" | "USER" = "ADMIN") {
  return await t.run(async (ctx) => await ctx.db.insert("users", {
    name: "Owner", email: `owner-${Math.random()}@figures.test`, role, companyId, createdAt: Date.now(),
  }));
}

async function hold(t: Harness, companyId: Id<"companies">, host: string, against?: Id<"companyWebsites">) {
  return await t.run(async (ctx) => {
    const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const againstWebsiteId = against ? (await ctx.db.get(against))!.websiteId : undefined;
    return await ctx.db.insert("companyWebsites", {
      companyId,
      websiteId,
      relationship: against ? "TRACKED" : "OWNED",
      ...(againstWebsiteId ? { againstWebsiteId } : {}),
      createdAt: Date.now(),
    });
  });
}

/** Search Console connected, holding fourteen days to 26 September, as the collection files them. */
async function connected(t: Harness, companyId: Id<"companies">, siteId: Id<"companyWebsites">) {
  await t.run(async (ctx) => {
    const site = (await ctx.db.get(siteId))!;
    await ctx.db.insert("searchConsoleConnections", {
      companyId,
      companyWebsiteId: siteId,
      websiteId: site.websiteId,
      status: "CONNECTED",
      property: "sc-domain:figures.test",
      dataProperty: "sc-domain:figures.test",
      oldestDay: "2026-09-13",
      newestDay: "2026-09-26",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    for (let index = 0; index < 14; index += 1) {
      const day = `2026-09-${String(13 + index).padStart(2, "0")}`;
      const clicks = 10 + index;
      const impressions = 200 + index * 10;
      await ctx.db.insert("searchConsoleDays", {
        companyWebsiteId: siteId, searchType: "web", day, clicks, impressions, ctr: clicks / impressions, position: 5 + index / 10, fetchedAt: Date.now(),
      });
    }
  });
}

describe("the Assistant's company figures", () => {
  test("each is the figure its screen shows, with the screen's address", async () => {
    const t = harness();
    const companyId = await company(t, "Figures Ltd");
    const userId = await admin(t, companyId);
    const siteId = await hold(t, companyId, "figures.test");
    await connected(t, companyId, siteId);
    const asOwner = t.withIdentity({ subject: userId });

    const read = await t.query(internal.assistantReads.searchConsoleInternal, { companyId, website: "https://www.figures.test/", days: 7 });
    const screen = await asOwner.query(api.searchConsoleReads.searchConsolePerformance, {
      siteId, searchType: "web", from: "2026-09-20", to: "2026-09-26",
    });
    expect(read).toMatchObject({ ok: true, website: "figures.test", from: "2026-09-20", to: "2026-09-26", link: `/app/search-console/${siteId}` });
    if (!read.ok || !("totals" in read)) throw new Error("expected the website's totals");
    expect(read.totals).toEqual(screen.totals);
    expect(read.theDaysBefore).toEqual(screen.previous);
    expect(read.totals?.clicks).toBe(23 + 22 + 21 + 20 + 19 + 18 + 17);

    const overview = await t.query(internal.assistantReads.siteOverviewInternal, { companyId, website: "figures.test" });
    const header = await asOwner.query(api.sites.getMySite, { siteId });
    expect(overview).toMatchObject({
      ok: true,
      searchesRankedFor: header?.counts.keywords ?? null,
      inGooglesTopThree: header?.counts.top3 ?? null,
      aiAnswersNamingIt: header?.counts.aiNamed ?? null,
      link: `/app/sites/${siteId}`,
    });

    const mentions = await t.query(internal.assistantReads.aiMentionsInternal, { companyId, website: "figures.test" });
    const mentionsScreen = await asOwner.query(api.siteAi.listMentions, { siteId });
    expect(mentions).toMatchObject({ ok: true, link: `/app/sites/${siteId}/ai/mentions` });
    if (!mentions.ok || !("answers" in mentions)) throw new Error("expected the answers");
    expect(mentions.answers).toHaveLength(mentionsScreen.length);
  });

  test("one company can never read another's: its website answers as not the company's", async () => {
    const t = harness();
    const mine = await company(t, "Mine Ltd");
    const theirs = await company(t, "Theirs Ltd");
    await hold(t, mine, "mine.test");
    const theirSite = await hold(t, theirs, "theirs.test");
    await connected(t, theirs, theirSite);

    const listed = await t.query(internal.assistantReads.websitesInternal, { companyId: mine });
    expect(listed.websites.map((entry) => entry.website)).toEqual(["mine.test"]);
    for (const read of [
      await t.query(internal.assistantReads.searchConsoleInternal, { companyId: mine, website: "theirs.test", days: 30 }),
      await t.query(internal.assistantReads.siteOverviewInternal, { companyId: mine, website: "theirs.test" }),
      await t.query(internal.assistantReads.aiMentionsInternal, { companyId: mine, website: "theirs.test" }),
    ]) {
      expect(read).toEqual({ ok: false, problem: "theirs.test is not one of this company's websites. Its websites are: mine.test." });
    }
  });

  test("a website with no Search Console yet says so, rather than inventing figures", async () => {
    const t = harness();
    const companyId = await company(t, "Unconnected Ltd");
    await hold(t, companyId, "quiet.test");
    const read = await t.query(internal.assistantReads.searchConsoleInternal, { companyId, website: "quiet.test", days: 7 });
    expect(read).toMatchObject({ ok: false });
    if (read.ok) throw new Error("expected a problem");
    expect(read.problem).toContain("no Search Console figures yet");
  });

  test("open tasks are the company's own and open ones only", async () => {
    const t = harness();
    const mine = await company(t, "Mine Ltd");
    const theirs = await company(t, "Theirs Ltd");
    await t.run(async (ctx) => {
      for (const [companyId, title, status] of [
        [mine, "Fix the title tags", "OPEN"],
        [mine, "Done already", "DONE"],
        [theirs, "Their secret task", "OPEN"],
      ] as const) {
        await ctx.db.insert("tasks", { companyId, title, status, createdBySource: "PERSON", createdAt: Date.now() });
      }
    });
    const read = await t.query(internal.assistantReads.openTasksInternal, { companyId: mine });
    expect(read.tasks.map((task) => task.title)).toEqual(["Fix the title tags"]);
    expect(read.link).toBe("/app/tasks");
  });

  test("the Assistant is given its figure and task tools once, installed by the first person who asks", async () => {
    const t = harness();
    const companyId = await company(t, "Asker Ltd");
    const userId = await admin(t, companyId);

    // Nobody asking: nothing is installed in nobody's name.
    const agentId = await t.mutation(internal.hakkenAssistant.ensureAssistantInternal, {});
    expect(await t.run(async (ctx) => await ctx.db.query("agentTools").collect())).toEqual([]);

    await t.mutation(internal.hakkenAssistant.ensureAssistantInternal, { installedBy: userId });
    await t.mutation(internal.hakkenAssistant.ensureAssistantInternal, { installedBy: userId });
    const bound = await t.run(async (ctx) => {
      const rows = await ctx.db.query("agentTools").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect();
      return await Promise.all(rows.map(async (row) => (await ctx.db.get(row.toolId))?.handlerMapping));
    });
    expect(bound.sort()).toEqual([
      "assistant.ai.mentions",
      // Its chart (hakken-tasks-plan.md, item 2.1).
      "assistant.chart",
      "assistant.searchConsole",
      "assistant.site.overview",
      // Its Hakken task tools, from their own connector (hakken-tasks-plan.md, item 1.2).
      "assistant.tasks.change",
      "assistant.tasks.list",
      "assistant.tasks.open",
      "assistant.tasks.propose",
      "assistant.tasks.proposeReport",
      "assistant.tasks.proposeResearch",
      "assistant.websites",
    ]);
  });

  test("a tool its connector gained after it was installed reaches the Assistant; one an administrator switched off stays off", async () => {
    const t = harness();
    const companyId = await company(t, "Grown Ltd");
    const userId = await admin(t, companyId);
    const agentId = await t.mutation(internal.hakkenAssistant.ensureAssistantInternal, { installedBy: userId });
    // As though the connector was installed before these two tools existed, and an administrator then switched one off.
    await t.run(async (ctx) => {
      const tools = await ctx.db.query("aiTools").collect();
      const gained = tools.find((tool) => tool.handlerMapping === "assistant.tasks.list")!;
      for (const row of await ctx.db.query("agentTools").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect()) {
        if (row.toolId === gained._id) await ctx.db.delete(row._id);
      }
      await ctx.db.delete(gained._id);
      // Switched off as the connector's screen does it: out of its enabled tools, and inactive.
      const off = tools.find((tool) => tool.handlerMapping === "assistant.tasks.change")!;
      await ctx.db.patch(off._id, { isActive: false });
      const connector = (await ctx.db.get(off.connectorId!))!;
      await ctx.db.patch(connector._id, { enabledToolMappings: (connector.enabledToolMappings ?? []).filter((mapping) => mapping !== "assistant.tasks.change" && mapping !== "assistant.tasks.list") });
    });

    await t.mutation(internal.hakkenAssistant.ensureAssistantInternal, { installedBy: userId });

    const tools = await t.run(async (ctx) => await ctx.db.query("aiTools").collect());
    const gained = tools.find((tool) => tool.handlerMapping === "assistant.tasks.list");
    expect(gained?.isActive).toBe(true);
    const bound = await t.run(async (ctx) => (await ctx.db.query("agentTools").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect()).map((row) => row.toolId));
    expect(bound).toContain(gained?._id);
    expect(tools.find((tool) => tool.handlerMapping === "assistant.tasks.change")?.isActive).toBe(false);
  });

  test("a competitor's overview and AI answers can be read; its Search Console is the owner's, and says so", async () => {
    const t = harness();
    const companyId = await company(t, "Rival Watch Ltd");
    const own = await hold(t, companyId, "ours.test");
    const rival = await hold(t, companyId, "rival.test", own);

    const listed = await t.query(internal.assistantReads.websitesInternal, { companyId });
    expect(listed.websites).toContainEqual({ website: "rival.test", kind: "a competitor of ours.test", link: `/app/sites/${rival}` });
    expect(await t.query(internal.assistantReads.siteOverviewInternal, { companyId, website: "rival.test" })).toMatchObject({
      ok: true, website: "rival.test", link: `/app/sites/${rival}`,
    });
    expect(await t.query(internal.assistantReads.aiMentionsInternal, { companyId, website: "rival.test" })).toMatchObject({
      ok: true, website: "rival.test",
    });
    const console = await t.query(internal.assistantReads.searchConsoleInternal, { companyId, website: "rival.test", days: 7 });
    expect(console).toMatchObject({ ok: false });
    if (console.ok) throw new Error("expected a problem");
    expect(console.problem).toContain("Search Console covers the company's own websites only");
  });

  test("asked about the company's work by an ordinary member, the Assistant looks it up and answers from it", async () => {
    const t = harness();
    const companyId = await company(t, "Busy Ltd");
    // Not an administrator: the company-figure reads are any member's (Anthony, 2026-10-06).
    const userId = await admin(t, companyId, "USER");
    await t.run(async (ctx) => {
      await ctx.db.insert("tasks", { companyId, title: "Fix the title tags", status: "OPEN", createdBySource: "PERSON", createdAt: Date.now() });
      await ctx.db.insert("aiModels", {
        modelId: "default-model", providerKey: "google", providerModelId: "default-model-provider", displayName: "Default",
        isEnabled: true, isDefault: true, lastSyncedAt: Date.now(), standardInputCostBelow200k: 1, outputResponseCost: 2,
      });
    });
    const threadId = await t.run(async (ctx) => await ctx.db.insert("threads", { userId, companyId, title: "Work", createdAt: Date.now(), updatedAt: Date.now() }));
    agentTurnMock
      .mockResolvedValueOnce({
        text: "",
        functionCalls: [{ name: "read_open_tasks", args: {}, thoughtSignature: "signature-0" }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      })
      .mockResolvedValueOnce({
        text: "One task is open: fix the title tags.",
        functionCalls: undefined,
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 8 },
      });

    await t.action(internal.hakkenAssistant.answerInternal, { threadId, content: "What's open for us?" });

    const { calls, messages } = await t.run(async (ctx) => ({
      calls: await ctx.db.query("agentToolCalls").collect(),
      messages: await ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("threadId", threadId)).collect(),
    }));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ status: "SUCCESS" });
    expect(JSON.stringify(calls[0])).toContain("Fix the title tags");
    const reply = messages.find((message) => message.content === "One task is open: fix the title tags.");
    // The reply keeps what it looked up, for the quiet line under it.
    expect(reply?.lookedUp).toEqual([{ kind: "tasks", link: "/app/tasks" }]);
  });
});
