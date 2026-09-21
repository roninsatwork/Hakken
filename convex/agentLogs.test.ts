import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

describe("Agent Logs Authorization", () => {
  test("admins can only access agent logs from their own company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { agentId, adminAId, adminBId, logAId, logBId } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const adminAId = await ctx.db.insert("users", {
        email: "admin-a@example.com",
        role: "ADMIN",
        companyId: companyAId,
      });
      const adminBId = await ctx.db.insert("users", {
        email: "admin-b@example.com",
        role: "ADMIN",
        companyId: companyBId,
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Support Agent",
        modelId: "test-model",
        thinkingMode: false,
        isActive: true,
        temperature: 1,
        humanApprovalRequired: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const logAId = await ctx.db.insert("agentLogs", {
        agentId,
        companyId: companyAId,
        interactionType: "LLM SYNTHESIS",
        promptContent: "Company A prompt",
        responseContent: "Company A response",
        createdAt: Date.now(),
      });
      const logBId = await ctx.db.insert("agentLogs", {
        agentId,
        companyId: companyBId,
        interactionType: "LLM SYNTHESIS",
        promptContent: "Company B prompt",
        responseContent: "Company B response",
        createdAt: Date.now(),
      });

      return { agentId, adminAId, adminBId, logAId, logBId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    const page = await adminAClient.query(api.agentLogs.getJobGroups, {
      agentId,
      searchTerm: "",
      page: 1,
      pageSize: 15,
    });

    const visibleIds = page.groups.flatMap((group) => group.entries.map((entry) => entry._id));
    expect(visibleIds).toEqual([logAId]);

    await expect(adminAClient.query(api.agentLogs.getLogById, { id: logBId })).rejects.toThrow("Unauthorized");
    await expect(adminBClient.mutation(api.agentLogs.deleteLog, { id: logAId })).rejects.toThrow("Unauthorized");
  });

  test("super admins can search, read, seed, and delete logs across companies", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { agentId, superAdminId, logId } = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const agentId = await ctx.db.insert("agents", {
        name: "Search Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        temperature: 0.2,
        humanApprovalRequired: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const logId = await ctx.db.insert("agentLogs", {
        agentId,
        companyId,
        interactionType: "LLM SYNTHESIS",
        promptContent: "Find a needle in this prompt",
        responseContent: "Found it",
        createdAt: Date.now(),
      });

      return { agentId, superAdminId, logId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const searchPage = await superAdminClient.query(api.agentLogs.getJobGroups, {
      agentId,
      searchTerm: "needle",
      page: 1,
      pageSize: 15,
    });
    expect(searchPage.groups.flatMap((group) => group.entries.map((entry) => entry._id))).toEqual([logId]);
    expect(await superAdminClient.query(api.agentLogs.getLogById, { id: logId })).toMatchObject({
      promptContent: "Find a needle in this prompt",
    });
    await expect(superAdminClient.query(api.agentLogs.getLogById, { id: "missing" as never })).rejects.toThrow(
      "Validator error"
    );

    await t.mutation(internal.agentLogs.insertAgentLogInternal, {
      agentId,
      interactionType: "TOOL DISPATCH",
      promptContent: "tool",
      responseContent: "{}",
    });
    await t.mutation(internal.agentLogs.seedForAgent, { agentId });

    const allLogs = await superAdminClient.query(api.agentLogs.getJobGroups, {
      agentId,
      page: 1,
      pageSize: 100,
    });
    // Every entry here was written outside a job, so each is its own group.
    expect(allLogs.groups.flatMap((group) => group.entries)).toHaveLength(47);

    await expect(superAdminClient.mutation(api.agentLogs.deleteLog, { id: logId })).resolves.toBeNull();
    await expect(superAdminClient.mutation(api.agentLogs.deleteLog, { id: logId })).rejects.toThrow("Log not found");
  });
});

describe("Agent log outcomes", () => {
  async function setup() {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const agentId = await t.run(async (ctx) =>
      await ctx.db.insert("agents", {
        name: "Research Agent",
        modelId: "test-model",
        thinkingMode: false,
        isActive: true,
        temperature: 1,
        humanApprovalRequired: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    return { t, agentId };
  }

  test("a failed tool dispatch is recorded as failed, not inferred from its name", async () => {
    const { t, agentId } = await setup();

    // The exact case the screen used to get wrong: the interaction type says
    // "TOOL DISPATCH", which contains neither "ERROR" nor "FAIL", so the old
    // string test reported this as a success.
    const logId = await t.mutation(internal.agentLogs.insertAgentLogInternal, {
      agentId,
      interactionType: "TOOL DISPATCH: property_search",
      promptContent: "Find three-bed listings in Bristol",
      responseContent: "Property search timed out after 24000ms",
      outcome: "FAILED",
      durationMs: 23900,
    });

    const log = await t.run(async (ctx) => await ctx.db.get(logId));
    expect(log?.outcome).toBe("FAILED");
    expect(log?.durationMs).toBe(23900);
  });

  test("a successful tool dispatch carries no failure key", async () => {
    const { t, agentId } = await setup();

    const logId = await t.mutation(internal.agentLogs.insertAgentLogInternal, {
      agentId,
      interactionType: "TOOL DISPATCH: property_search",
      promptContent: "Find three-bed listings in Bath",
      responseContent: '{"functionCall": {"name": "property_search"}}',
      outcome: "SUCCESS",
    });

    const log = await t.run(async (ctx) => await ctx.db.get(logId));
    expect(log?.outcome).toBe("SUCCESS");
    expect(log?.failureKey).toBeUndefined();
  });

  test("two wordings of the same failure share a key so they group together", async () => {
    const { t, agentId } = await setup();

    const [first, second] = await Promise.all([
      t.mutation(internal.agentLogs.insertAgentLogInternal, {
        agentId,
        interactionType: "TOOL DISPATCH: property_search",
        promptContent: "Bristol",
        responseContent: "Property search timed out after 24000ms",
        outcome: "FAILED",
      }),
      t.mutation(internal.agentLogs.insertAgentLogInternal, {
        agentId,
        interactionType: "TOOL DISPATCH: property_search",
        promptContent: "Bath",
        responseContent: "Property search timed out after 19000ms",
        outcome: "FAILED",
      }),
    ]);

    const [logA, logB] = await t.run(async (ctx) => [await ctx.db.get(first), await ctx.db.get(second)]);
    expect(logA?.failureKey).toBeDefined();
    expect(logA?.failureKey).toBe(logB?.failureKey);
  });

  test("an entry written without an outcome says so rather than claiming success", async () => {
    const { t, agentId } = await setup();

    const logId = await t.mutation(internal.agentLogs.insertAgentLogInternal, {
      agentId,
      interactionType: "LLM SYNTHESIS",
      promptContent: "prompt",
      responseContent: "reply",
    });

    const log = await t.run(async (ctx) => await ctx.db.get(logId));
    expect(log?.outcome).toBe("UNKNOWN");
  });

  test("an entry can name the run it belongs to", async () => {
    const { t, agentId } = await setup();

    const runId = await t.run(async (ctx) =>
      await ctx.db.insert("agentRuns", {
        agentId,
        triggerType: "SCHEDULE",
        objective: "Find three-bed listings in Bristol",
        status: "FAILED",
        startedAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    const logId = await t.mutation(internal.agentLogs.insertAgentLogInternal, {
      agentId,
      interactionType: "TOOL DISPATCH: property_search",
      promptContent: "Bristol",
      responseContent: "Property search timed out",
      outcome: "FAILED",
      runId,
    });

    const log = await t.run(async (ctx) => await ctx.db.get(logId));
    expect(log?.runId).toBe(runId);
  });

  test("following one repeated failure shows the others and nothing else", async () => {
    const { t, agentId } = await setup();

    const superAdminId = await t.run(async (ctx) =>
      await ctx.db.insert("users", { email: "super@example.com", role: "SUPER_ADMIN" })
    );

    // Two wordings of one fault, plus an unrelated failure and a healthy entry.
    await t.mutation(internal.agentLogs.insertAgentLogInternal, {
      agentId,
      interactionType: "TOOL DISPATCH: property_search",
      promptContent: "Bristol",
      responseContent: "Property search timed out after 24000ms",
      outcome: "FAILED",
    });
    await t.mutation(internal.agentLogs.insertAgentLogInternal, {
      agentId,
      interactionType: "TOOL DISPATCH: property_search",
      promptContent: "Bath",
      responseContent: "Property search timed out after 19000ms",
      outcome: "FAILED",
    });
    await t.mutation(internal.agentLogs.insertAgentLogInternal, {
      agentId,
      interactionType: "TOOL DISPATCH: send_email",
      promptContent: "Henderson",
      responseContent: "The mailbox was rejected",
      outcome: "FAILED",
    });
    await t.mutation(internal.agentLogs.insertAgentLogInternal, {
      agentId,
      interactionType: "LLM SYNTHESIS",
      promptContent: "Bath",
      responseContent: "Filed 14 listings",
      outcome: "SUCCESS",
    });

    const client = t.withIdentity({ subject: superAdminId });

    const everything = await client.query(api.agentLogs.getJobGroups, {
      agentId,
      page: 1,
      pageSize: 50,
    });
    const timeouts = everything.groups
      .flatMap((group) => group.entries)
      .filter((entry) => entry.responseContent.startsWith("Property search timed out"));
    const timeoutKey = timeouts[0]?.failureKey;
    expect(timeoutKey).toBeDefined();
    // The two wordings must already have collapsed to one fault, or narrowing
    // by that fault would show one row where the reader expects two.
    expect(everything.failureCounts[timeoutKey as string]).toBe(2);

    const focused = await client.query(api.agentLogs.getJobGroups, {
      agentId,
      failureKey: timeoutKey,
      page: 1,
      pageSize: 50,
    });
    const focusedEntries = focused.groups.flatMap((group) => group.entries);
    expect(focusedEntries).toHaveLength(2);
    expect(focusedEntries.every((entry) => entry.failureKey === timeoutKey)).toBe(true);
  });
});
