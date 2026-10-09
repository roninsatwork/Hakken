import { createHmac, randomUUID } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { chargeEndedRun, PLATFORM_AI_SYSTEM_KEY } from "./modelSpend";
import schema from "./schema";
import { encryptVoiceTicket } from "./utils/voiceTicketEncryption";

/**
 * Every AI call's cost row, written one way (`modelSpend.ts`; Anthony,
 * 2026-10-09: "fix these" — eighteen kinds of call wrote none).
 */
function setup() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

const RELAY_SECRET = "test-relay-secret";

beforeEach(() => vi.stubEnv("VOICE_RELAY_SECRET", RELAY_SECRET));
afterEach(() => vi.unstubAllEnvs());

/** A model priced at $1 a million in, $0.25 a million cached, $2 a million out. */
async function seedModel(t: ReturnType<typeof setup>, modelId = "flash-test", providerModelId = modelId) {
  await t.run(async (ctx) => {
    await ctx.db.insert("aiModels", {
      modelId,
      providerKey: "google",
      providerModelId,
      displayName: modelId,
      isEnabled: true,
      isDefault: false,
      lastSyncedAt: Date.now(),
      standardInputCostBelow200k: 1,
      cachedInputCostBelow200k: 0.25,
      outputResponseCost: 2,
    });
  });
}

async function seedAgent(t: ReturnType<typeof setup>, name: string, systemKey?: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("agents", {
      name,
      modelId: "flash-test",
      thinkingMode: false,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...(systemKey ? { systemKey } : {}),
    }));
}

async function rows(t: ReturnType<typeof setup>) {
  return await t.run(async (ctx) => ctx.db.query("agentTransactions").collect());
}

async function agentName(t: ReturnType<typeof setup>, agentId: Id<"agents">) {
  return await t.run(async (ctx) => (await ctx.db.get(agentId))?.name);
}

const CALL = { actionContext: "Choosing wiki pages for a question", modelId: "flash-test", inputTokens: 1_000_000, outputTokens: 500_000 };

describe("model spend: priced and charged", () => {
  test("a call is priced from the catalogue, its cached part at the cached rate, and charged to its agent", async () => {
    const t = setup();
    await seedModel(t);
    const agentId = await seedAgent(t, "Answerer");

    // Under the 200k tier, where the cached rate applies.
    const cost = await t.mutation(internal.modelSpend.recordModelSpendInternal, {
      ...CALL, agentId, inputTokens: 100_000, cachedInputTokens: 40_000, outputTokens: 50_000,
    });

    // 60k fresh at $1, 40k cached at $0.25, 50k out at $2 — a million each.
    expect(cost).toBeCloseTo(0.06 + 0.01 + 0.1, 6);
    const [row] = await rows(t);
    expect(row).toMatchObject({ agentId, modelUsed: "flash-test", inputTokens: 100_000, outputTokens: 50_000, status: "SUCCESS" });
  });

  test("a system agent is found by its key; a call for no agent goes to one Platform AI agent, made once", async () => {
    const t = setup();
    await seedModel(t);
    const assistantId = await seedAgent(t, "The Assistant", "ASSISTANT");

    await t.mutation(internal.modelSpend.recordModelSpendInternal, { ...CALL, systemKey: "ASSISTANT" });
    await t.mutation(internal.modelSpend.recordModelSpendInternal, { ...CALL, actionContext: "Re-embedding knowledge pieces" });
    await t.mutation(internal.modelSpend.recordModelSpendInternal, { ...CALL, systemKey: "NO_SUCH_AGENT" });

    const all = await rows(t);
    expect(all[0].agentId).toBe(assistantId);
    expect(all[1].agentId).toBe(all[2].agentId);
    expect(await agentName(t, all[1].agentId)).toBe("Platform AI");
    const platformAgents = await t.run(async (ctx) =>
      ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", PLATFORM_AI_SYSTEM_KEY)).collect());
    expect(platformAgents).toHaveLength(1);
  });

  test("a call that knows only the provider's name for its model is priced from that row", async () => {
    const t = setup();
    await seedModel(t, "realtime-catalogue-id", "provider-name-test");

    const cost = await t.mutation(internal.modelSpend.recordModelSpendInternal, {
      ...CALL, modelId: "provider-name-test", providerKey: "google", providerModelId: "provider-name-test",
    });

    expect(cost).toBeCloseTo(2, 6);
  });

  test("a wiki staff call whose agent is missing is charged to Platform AI, not dropped", async () => {
    const t = setup();
    await seedModel(t);

    await t.mutation(internal.wikiStaff.recordStaffModelCallInternal, {
      systemKey: "WIKI_FILING_CLERK",
      actionContext: "Wiki Filing: deciding whether to file",
      modelId: "flash-test",
      inputTokens: 1_000,
      outputTokens: 100,
      promptContent: "prompt",
      responseContent: "response",
    });

    const [row] = await rows(t);
    expect(await agentName(t, row.agentId)).toBe("Platform AI");
  });
});

describe("model spend: a run that ends away from its loop", () => {
  async function seedRun(t: ReturnType<typeof setup>, status: "PENDING_APPROVAL" | "RUNNING" | "SUCCESS", tokens: { run: number; checkpoint?: number }) {
    await seedModel(t);
    const agentId = await seedAgent(t, "Runner");
    return await t.run(async (ctx) => {
      const now = Date.now();
      const runId = await ctx.db.insert("agentRuns", {
        agentId,
        triggerType: "MANUAL",
        objective: "Look something up",
        status,
        modelId: "flash-test",
        inputTokens: tokens.run,
        outputTokens: 0,
        startedAt: now,
        updatedAt: now,
      });
      if (tokens.checkpoint !== undefined) {
        await ctx.db.insert("agentRunCheckpoints", {
          runId,
          agentId,
          status: "ACTIVE",
          transcriptJson: "[]",
          stepIndex: 1,
          loopIndex: 1,
          toolCallCount: 0,
          inputTokens: tokens.checkpoint,
          outputTokens: 0,
          segmentCount: 1,
          resumeAttempts: 0,
          createdAt: now,
          updatedAt: now,
        });
      }
      return { agentId, runId };
    });
  }

  test("a failed run is charged once, from the furthest it reached", async () => {
    const t = setup();
    const { runId } = await seedRun(t, "RUNNING", { run: 0, checkpoint: 2_000_000 });

    await t.mutation(internal.modelSpend.chargeEndedRunInternal, { runId, status: "FAILED", actionContext: "Agent run, failed" });

    const [row] = await rows(t);
    expect(row).toMatchObject({ inputTokens: 2_000_000, status: "FAILED", actionContext: "Agent run, failed" });
    expect(row.costUsd).toBeCloseTo(2, 6);
  });

  test("a run already ended was charged by its loop, and is not charged again", async () => {
    const t = setup();
    const { runId } = await seedRun(t, "SUCCESS", { run: 1_000_000 });

    await t.run(async (ctx) => chargeEndedRun(ctx, runId, { status: "FAILED", actionContext: "Agent run, failed" }));

    expect(await rows(t)).toHaveLength(0);
  });

  test("a run cancelled while waiting for approval is charged what it had spent", async () => {
    const t = setup();
    const { runId } = await seedRun(t, "PENDING_APPROVAL", { run: 1_000_000 });
    const adminId = await t.run(async (ctx) => ctx.db.insert("users", { email: "owner@example.com", role: "SUPER_ADMIN" }));

    await t.withIdentity({ subject: adminId }).mutation(api.agentRuns.cancelRun, { runId });

    const all = await rows(t);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ inputTokens: 1_000_000, actionContext: "Agent run, cancelled while waiting for approval" });
  });
});

describe("model spend: live voice", () => {
  test("a relay session's spend is recorded once, when it closes, against the Assistant", async () => {
    const t = setup();
    await seedModel(t, "live-test");
    const assistantId = await seedAgent(t, "The Assistant", "ASSISTANT");
    const companyId = await t.run(async (ctx) => ctx.db.insert("companies", { name: "Voice Corp", createdAt: Date.now() }));
    const ticket = encryptVoiceTicket({ jti: randomUUID(), modelId: "live-test", model: "live-test", companyId, expiresAt: Date.now() + 60_000 }, RELAY_SECRET);
    const auth = createHmac("sha256", RELAY_SECRET).update(ticket).digest("base64url");
    const post = (path: string, body: unknown) =>
      t.fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-voice-relay-auth": auth }, body: JSON.stringify(body) });

    expect((await post("/api/voice/redeem", { ticket })).status).toBe(200);
    const usage = { inputTokens: 1_000_000, outputTokens: 250_000 };
    expect((await post("/api/voice/knowledge", { ticket, close: true, usage })).status).toBe(200);
    // A second close finds the session closed: nothing more is charged.
    await post("/api/voice/knowledge", { ticket, close: true, usage });

    const all = await rows(t);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ agentId: assistantId, companyId, actionContext: "A live voice session", inputTokens: 1_000_000, outputTokens: 250_000 });
    expect(all[0].costUsd).toBeCloseTo(1.5, 6);
  });
});
