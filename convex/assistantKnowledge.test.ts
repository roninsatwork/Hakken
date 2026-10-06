import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { readTicket } from "../services/voice-relay/protocol.mjs";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { GOOGLE_VERTEX_EMBEDDING_DIMENSIONS, GOOGLE_VERTEX_EMBEDDING_MODEL_ID } from "./aiModelService";
import { REALTIME_VOICE_STYLE } from "./assistantKnowledge";
import schema from "./schema";

/**
 * One brain, many doors (assistant-foundation-plan.md, item 1).
 *
 * The same question, asked of the same company by the same person, through
 * typed Ask Hakken, a live voice session and an agent answering the
 * conversation. Each door used to put together what Hakken knows for itself,
 * so the agent never read the company's documents or rules and the spoken
 * session read by different rules from the typed one. These hold that every
 * door is told the same and reads the same, differing only in how much room
 * its answer has.
 */

const { embedMock, agentTurnMock } = vi.hoisted(() => ({
  embedMock: vi.fn(),
  agentTurnMock: vi.fn(),
}));

vi.mock("./vertexProviderService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vertexProviderService")>();
  return {
    ...actual,
    createVertexGenAIClient: () => ({}),
    createVertexEmbeddingClient: () => ({}),
    embedVertexContentWithRetry: embedMock,
    // No provider-side cache, so the agent's request carries its whole
    // instructions where the test can read them.
    createVertexPromptCache: async () => undefined,
    streamVertexContentWithRetry: async (_ai: unknown, params: unknown) => agentTurnMock(params),
    generateVertexContentWithRetry: async (_ai: unknown, params: unknown) => agentTurnMock(params),
  };
});

const QUESTION = "How much is a boiler service?";
const FACT = "A boiler service costs £89 including parts.";

beforeEach(() => {
  vi.stubEnv("CONVEX_SITE_URL", "https://voice-platform.test");
  vi.stubEnv("VOICE_RELAY_URL", "ws://relay.test:8787");
  vi.stubEnv("VOICE_RELAY_SECRET", "shared-secret");
  embedMock.mockReset();
  embedMock.mockResolvedValue({ embeddings: [{ values: new Array(GOOGLE_VERTEX_EMBEDDING_DIMENSIONS).fill(0.1) }] });
  agentTurnMock.mockReset();
  agentTurnMock.mockResolvedValue({
    text: "It is £89.",
    functionCalls: undefined,
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
  });
});

/**
 * A company with something in every part of what Hakken knows: its own prompt,
 * a rule, an always memory, a filed document, and a person with a private
 * note. Documents are answered from directly (the wiki switch off), so the
 * fact arrives by search rather than by the wiki's own chooser.
 */
async function seedCompany(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", {
      name: "One Brain Heating",
      createdAt: now,
      systemPrompt: "Always mention the five-year guarantee.",
      answersFromWiki: false,
    });
    const userId = await ctx.db.insert("users", { email: "owner@onebrain.test", role: "ADMIN", companyId, createdAt: now });
    await ctx.db.insert("aiRules", {
      companyId,
      trigger: "prices",
      instruction: "Quote prices including VAT.",
      priority: "HIGH",
      isActive: true,
      createdAt: now,
    });
    await ctx.db.insert("companyMemories", {
      companyId,
      title: "Service area",
      content: "We only cover West Yorkshire.",
      normalizedContent: "we only cover west yorkshire.",
      category: "POLICY",
      applyMode: "ALWAYS",
      status: "APPROVED",
      confidence: 1,
      sourceType: "MANUAL",
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
    });
    await ctx.db.insert("userMemories", {
      userId,
      content: "Prefers short answers.",
      normalizedContent: "prefers short answers.",
      status: "APPROVED",
      sourceType: "MANUAL",
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
    });
    const documentId = await ctx.db.insert("knowledgeDocuments", {
      title: "Price list",
      textContent: FACT,
      companyId,
      status: "ready",
      format: "text/plain",
      createdBy: userId,
      createdAt: now,
    });
    await ctx.db.insert("knowledgeChunks", {
      documentId,
      companyId,
      isGlobal: false,
      text: FACT,
      embedding: new Array(GOOGLE_VERTEX_EMBEDDING_DIMENSIONS).fill(0.1),
      embeddingProviderKey: "google",
      embeddingModelId: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
      embeddingProviderModelId: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
      embeddingDimensions: GOOGLE_VERTEX_EMBEDDING_DIMENSIONS,
    });
    // Deliberately provider-neutral ids: the drift guards forbid real model
    // names outside the model catalogue.
    await ctx.db.insert("aiModels", {
      modelId: "test-model",
      providerKey: "google",
      providerModelId: "test-provider-model",
      displayName: "Test Model",
      isEnabled: true,
      isDefault: true,
      lastSyncedAt: now,
      standardInputCostBelow200k: 1,
      outputResponseCost: 2,
    });
    await ctx.db.insert("aiModels", {
      modelId: "test-live-audio-model",
      displayName: "Test Live Audio",
      providerKey: "google",
      providerModelId: "test-live-audio-model",
      isEnabled: true,
      isDefault: false,
      lastSyncedAt: now,
    });
    await ctx.db.insert("aiModelDefaults", {
      scope: "global",
      useCase: "realtime",
      providerKey: "google",
      modelId: "test-live-audio-model",
      updatedAt: now,
    });
    const agentId = await ctx.db.insert("agents", {
      name: "Heating Helper",
      avatar: "agent.png",
      systemPrompt: "You help with heating questions.",
      modelId: "test-model",
      thinkingMode: false,
      isActive: true,
      companyId,
      createdAt: now,
      updatedAt: now,
    });
    const threadId = await ctx.db.insert("threads", { userId, companyId, title: "Typed", createdAt: now, updatedAt: now });
    const agentThreadId = await ctx.db.insert("threads", { userId, companyId, agentId, title: "Agent", createdAt: now, updatedAt: now });
    return { companyId, userId, agentId, threadId, agentThreadId };
  });
}

/** What a run sent the model last: its instructions, and the turn it was asked to answer. */
function lastAgentRequest() {
  const request = agentTurnMock.mock.calls.at(-1)?.[0] as {
    contents: Array<{ role: string; parts: Array<{ text?: string }> }>;
    config?: { systemInstruction?: string };
  };
  return {
    systemInstruction: request.config?.systemInstruction ?? "",
    prompt: request.contents.at(-1)?.parts.map((part) => part.text ?? "").join("") ?? "",
  };
}

/** What typed Ask Hakken sent the model — answered, since item 5, by the Assistant. */
async function askTyped(t: ReturnType<typeof convexTest>, threadId: Id<"threads">) {
  await t.action(internal.hakkenAssistant.answerInternal, { threadId, content: QUESTION });
  return lastAgentRequest();
}

/** What an agent answering the conversation sent the model. */
async function askAgent(t: ReturnType<typeof convexTest>, seeded: Awaited<ReturnType<typeof seedCompany>>) {
  await t.action(internal.agentRuntime.runAgentObjective, {
    threadId: seeded.agentThreadId,
    agentId: seeded.agentId,
    content: QUESTION,
  });
  return lastAgentRequest();
}

describe("one brain, many doors", () => {
  test("typed, spoken and agent doors are told the same, the spoken one only adding how to speak", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const seeded = await seedCompany(t);

    const typed = await askTyped(t, seeded.threadId);
    const session = await t
      .withIdentity({ subject: seeded.userId })
      .action(api.aiVoiceSession.createRealtimeVoiceSession, { threadId: seeded.threadId });
    if (session.transport !== "google-relay") throw new Error("expected the relay transport");
    const spoken = readTicket(session.ticket, "shared-secret").instructions as string;
    const agent = await askAgent(t, seeded);

    for (const told of [typed.systemInstruction, agent.systemInstruction]) {
      expect(told).toContain("Always mention the five-year guarantee.");
      expect(told).toContain("Quote prices including VAT.");
      expect(told).toContain("We only cover West Yorkshire.");
      expect(told).toContain("Prefers short answers.");
    }
    // Word for word what the typed door is told, then the speech style.
    expect(spoken).toBe(`${typed.systemInstruction}\n\n====================\nSPEAKING OUT LOUD:\n\n${REALTIME_VOICE_STYLE}`);
    // The agent's own part sits inside the same instructions, not in place of them.
    expect(agent.systemInstruction).toContain("CONFIGURED AGENT BEHAVIOR:\n\nYou help with heating questions.");
  });

  test("typed, spoken and agent doors read the same documents and memories for the same question", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const seeded = await seedCompany(t);

    const typed = await askTyped(t, seeded.threadId);
    const spoken = await t
      .withIdentity({ subject: seeded.userId })
      .action(api.aiVoiceSession.searchKnowledgeForVoice, { threadId: seeded.threadId, query: QUESTION });
    const agent = await askAgent(t, seeded);

    // The agent used to read only its own knowledge, so the company's price
    // list never reached a website chat with an agent attached.
    for (const read of [typed.prompt, spoken.context, agent.prompt]) {
      expect(read).toContain(FACT);
      expect(read).toContain("[UNTRUSTED REFERENCE DATA:");
    }
  });

  test("a phone call or an email reads what the company knows, but never Helpful content or a private note", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const seeded = await seedCompany(t);

    // No conversation behind it: the caller is the public.
    const call = await t.action(internal.aiVoiceSession.searchKnowledgeForVoiceInternal, {
      query: QUESTION,
      fallbackCompanyId: seeded.companyId,
    });
    expect(call.context).toContain(FACT);
    expect(call.context).not.toContain("Helpful content");
    expect(call.context).not.toContain("Prefers short answers.");
  });

  test("a spoken conversation with no company reads the platform's own brain, as a typed one does", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { userId, threadId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "visitor@platform.test", role: "USER", createdAt: Date.now() });
      const threadId = await ctx.db.insert("threads", { userId, title: "Platform", createdAt: Date.now(), updatedAt: Date.now() });
      const documentId = await ctx.db.insert("knowledgeDocuments", {
        title: "Platform guide",
        textContent: "Hakken measures cited and chosen separately.",
        status: "ready",
        format: "text/plain",
        createdAt: Date.now(),
      });
      await ctx.db.insert("knowledgeChunks", {
        documentId,
        isGlobal: true,
        text: "Hakken measures cited and chosen separately.",
        embedding: new Array(GOOGLE_VERTEX_EMBEDDING_DIMENSIONS).fill(0.1),
        embeddingProviderKey: "google",
        embeddingModelId: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
        embeddingProviderModelId: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
        embeddingDimensions: GOOGLE_VERTEX_EMBEDDING_DIMENSIONS,
      });
      return { userId, threadId };
    });

    const spoken = await t
      .withIdentity({ subject: userId })
      .action(api.aiVoiceSession.searchKnowledgeForVoice, { threadId, query: "What does Hakken measure?" });
    expect(spoken.context).toContain("Hakken measures cited and chosen separately.");

    // The platform's own question is logged against the platform's brain,
    // the same bookkeeping the typed door has always done.
    const outcomes = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(outcomes.some((job) => job.name.includes("wikiFeedback"))).toBe(true);
  });
});
