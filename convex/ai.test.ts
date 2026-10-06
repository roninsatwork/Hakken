import { readTicket } from "../services/voice-relay/protocol.mjs";
import { beforeEach, expect, test, describe, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { GOOGLE_VERTEX_EMBEDDING_DIMENSIONS, SYSTEM_FAILSAFE_MODEL_ID } from "./aiModelService";
// This file predates the 2026-08-21 split of ai.ts into aiChat / aiSpeech /
// aiVoiceSession / workflowNodeConfig (foundation-quality plan, phase 3). It
// still covers all four; split it along the same lines when next touched.
import {
    assertSpeechCapableModelId,
    assertValidSpeechPayload,
    assertValidTranscriptionPayload,
    getBase64DecodedByteLength,
} from "./aiSpeech";
import { buildNodeConfigContext } from "./workflowNodeConfig";
import { REALTIME_VOICE_STYLE, VOICE_KNOWLEDGE_TOOL_DESCRIPTION } from "./aiVoiceSession";
import { assertWithinAiActionRateLimit } from "./aiActionRequestService";

const {
    createVertexGenAIClientMock,
    createVertexEmbeddingClientMock,
    embedVertexContentWithRetryMock,
    generateVertexContentWithRetryMock,
    generateTextWithResolvedModelMock,
} = vi.hoisted(() => ({
    createVertexGenAIClientMock: vi.fn(() => ({})),
    createVertexEmbeddingClientMock: vi.fn(() => ({})),
    embedVertexContentWithRetryMock: vi.fn(),
    generateVertexContentWithRetryMock: vi.fn(),
    generateTextWithResolvedModelMock: vi.fn(),
}));

vi.mock("./vertexProviderService", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./vertexProviderService")>();
    return {
        ...actual,
        createVertexGenAIClient: createVertexGenAIClientMock,
        createVertexEmbeddingClient: createVertexEmbeddingClientMock,
        embedVertexContentWithRetry: embedVertexContentWithRetryMock,
        generateVertexContentWithRetry: generateVertexContentWithRetryMock,
    };
});

vi.mock("./aiProviderRegistry", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./aiProviderRegistry")>();
    return {
        ...actual,
        generateTextWithResolvedModel: generateTextWithResolvedModelMock,
    };
});

beforeEach(() => {
    vi.stubEnv("CONVEX_SITE_URL", "https://voice-platform.test");
    createVertexGenAIClientMock.mockClear();
    createVertexEmbeddingClientMock.mockClear();
    embedVertexContentWithRetryMock.mockReset();
    generateVertexContentWithRetryMock.mockReset();
    generateTextWithResolvedModelMock.mockReset();
});

describe("OWASP for LLMs: Denial of Wallet & Resource Exhaustion (LLM04)", () => {
    test("transcription guardrails reject unsupported, malformed, and oversized audio before provider calls", () => {
        expect(getBase64DecodedByteLength(Buffer.from("hello").toString("base64"))).toBe(5);
        expect(assertValidTranscriptionPayload({
            audioBase64: Buffer.from("small audio").toString("base64"),
            mimeType: "audio/webm;codecs=opus",
        })).toEqual({
            audioBase64: Buffer.from("small audio").toString("base64"),
            mimeType: "audio/webm",
        });

        expect(() => assertValidTranscriptionPayload({
            audioBase64: Buffer.from("small audio").toString("base64"),
            mimeType: "text/plain",
        })).toThrow("Unsupported audio MIME type");

        expect(() => assertValidTranscriptionPayload({
            audioBase64: "",
            mimeType: "audio/webm",
        })).toThrow("Audio payload is required");

        expect(() => assertValidTranscriptionPayload({
            audioBase64: "not base64!",
            mimeType: "audio/webm",
        })).toThrow("Invalid audio payload encoding");

        expect(() => assertValidTranscriptionPayload({
            audioBase64: "A".repeat(14 * 1024 * 1024),
            mimeType: "audio/webm",
        })).toThrow("Audio payload cannot exceed 10MB");
    });

    test("workflow node generation guardrails bound prompt and graph context before provider calls", () => {
        expect(buildNodeConfigContext({
            prompt: " Map the upstream summary ",
            nodeType: "agentNode",
            availableNodes: [{ id: "node-1", type: "input", label: "Lead intake" }],
        })).toEqual({
            prompt: "Map the upstream summary",
            nodeType: "agentNode",
            nodesContext: "- ID: node-1 (Type: input, Label: Lead intake)",
        });

        expect(() => buildNodeConfigContext({
            prompt: "x".repeat(4001),
            nodeType: "agentNode",
            availableNodes: [],
        })).toThrow("Prompt cannot exceed 4000 characters");

        expect(() => buildNodeConfigContext({
            prompt: "configure",
            nodeType: "agentNode",
            availableNodes: Array.from({ length: 101 }, (_, index) => ({
                id: `node-${index}`,
                type: "input",
            })),
        })).toThrow("Available node context cannot exceed 100 nodes");

        expect(() => buildNodeConfigContext({
            prompt: "configure",
            nodeType: "agentNode",
            availableNodes: [{ id: "x".repeat(121), type: "input" }],
        })).toThrow("Available node fields cannot exceed 120 characters");
    });

    test("AI action rate limiter rejects calls once the actor exhausts the request window", () => {
        const now = Date.now();
        const recentRequests = [
            { requestedAt: now - 1000 },
            { requestedAt: now - 2000 },
        ];

        expect(() => assertWithinAiActionRateLimit(recentRequests, {
            now,
            windowMs: 60000,
            maxRequests: 3,
        })).not.toThrow();

        expect(() => assertWithinAiActionRateLimit(recentRequests, {
            now,
            windowMs: 60000,
            maxRequests: 2,
        })).toThrow("429 Too Many Requests");
    });

    test("Model resolver safely ignores disabled overriding models", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        
        // The default model DB
        await t.run(async (ctx) => {
            await ctx.db.insert("aiModels", {
                 modelId: "safemodel-1.5",
                 displayName: "Safe Model Default",
                 isEnabled: true,
                 isDefault: true,
                 lastSyncedAt: Date.now()
            });
            await ctx.db.insert("aiModels", {
                 modelId: "expensive-model-2.0",
                 displayName: "Dangerous Overlap",
                 isEnabled: false,
                 isDefault: false,
                 lastSyncedAt: Date.now()
            });
        });

        // Resolve requested expensive model that is currently disabled in the DB
        const resolved = await t.run(async (ctx) => {
            return await ctx.runQuery(internal.aiModels.resolveModelForExecution, {
                requestedModelId: "expensive-model-2.0"
            });
        });
        
        // Should fall back to safemodel because expensive is disabled
        expect(resolved).not.toBe("expensive-model-2.0");
        expect(resolved).toBe("safemodel-1.5");
    });

    test("Model resolver uses platform failsafe when no active default exists", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));

        await t.run(async (ctx) => {
            await ctx.db.insert("aiModels", {
                 modelId: "disabled-default",
                 displayName: "Disabled Default",
                 isEnabled: false,
                 isDefault: true,
                 lastSyncedAt: Date.now()
            });
        });

        const resolved = await t.run(async (ctx) => {
            return await ctx.runQuery(internal.aiModels.resolveModelForExecution, {});
        });

        expect(resolved).toBe(SYSTEM_FAILSAFE_MODEL_ID);
    });
});

// Ask Hakken's safety gate, its streaming and its stage clearing are tested
// where Ask Hakken now answers — through the Assistant (askHakken.test.ts,
// assistant-foundation-plan.md item 9).

/**
 * The pre-reply stage pill says only what the run is doing. The run writes a
 * stage as it enters each phase and must clear it however it exits, or the
 * pill would keep claiming work after the reply landed.
 */
describe("assistant stage notes", () => {
    async function seedStageThread(t: ReturnType<typeof convexTest>) {
        return await t.run(async (ctx) => {
            const userId = await ctx.db.insert("users", {
                email: "stages@test.com",
                role: "USER",
                createdAt: Date.now(),
            });
            return await ctx.db.insert("threads", {
                userId,
                title: "Stage Test",
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        });
    }

    test("a stage can be written and cleared", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const threadId = await seedStageThread(t);

        await t.mutation(internal.chat.setAssistantStage, { threadId, stage: "WRITING" });
        let thread = await t.run(async (ctx) => ctx.db.get(threadId));
        expect(thread?.assistantStage).toBe("WRITING");
        expect(thread?.assistantStageAt).toEqual(expect.any(Number));

        await t.mutation(internal.chat.setAssistantStage, { threadId });
        thread = await t.run(async (ctx) => ctx.db.get(threadId));
        expect(thread?.assistantStage).toBeUndefined();
        expect(thread?.assistantStageAt).toBeUndefined();
    });
});

describe("use-case defaults that cannot do the job", () => {
    /**
     * The defaults screen promises that a model which cannot do a job "falls
     * through to whatever is set below it". The runtime used to resolve it
     * anyway: an OpenAI model saved as the transcription default threw at the
     * provider boundary and broke every dictation on the deployment.
     */
    test("an OpenAI transcription default falls through to the Google failsafe", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        await t.run(async (ctx) => {
            await ctx.db.insert("aiModels", {
                modelId: "openai:test-chat-model",
                displayName: "Test Chat Model",
                providerKey: "openai",
                providerModelId: "test-chat-model",
                isEnabled: true,
                isDefault: true,
                lastSyncedAt: Date.now(),
            });
            await ctx.db.insert("aiModelDefaults", {
                scope: "global",
                useCase: "transcription",
                providerKey: "openai",
                modelId: "openai:test-chat-model",
                updatedAt: Date.now(),
            });
        });

        const resolved = await t.run(async (ctx) =>
            ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
                useCase: "transcription",
            })
        );

        expect(resolved.modelId).toBe(SYSTEM_FAILSAFE_MODEL_ID);
        expect(resolved.providerKey).toBe("google");

        // The same rows still serve chat as chosen — capability filtering is
        // per job, not a ban on the model.
        const chatResolved = await t.run(async (ctx) =>
            ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
                useCase: "chat",
            })
        );
        expect(chatResolved.modelId).toBe("openai:test-chat-model");
    });
});

describe("speech synthesis", () => {
    test("speech guardrails reject empty, oversized, and unknown-voice payloads before provider calls", () => {
        expect(assertValidSpeechPayload({ text: "  Hello there. " })).toEqual({
            text: "Hello there.",
            voiceKey: "Kore",
        });
        expect(() => assertValidSpeechPayload({ text: "   " })).toThrow("Speech text is required");
        expect(() => assertValidSpeechPayload({ text: "A".repeat(2001) })).toThrow(
            "cannot exceed 2000"
        );
        expect(() => assertValidSpeechPayload({ text: "hi", voiceKey: "EvilVoice" })).toThrow(
            "Unknown speech voice"
        );
    });

    test("a model that cannot make sound is refused with the fix in the sentence", () => {
        expect(assertSpeechCapableModelId("test-speech-model-tts")).toBe(
            "test-speech-model-tts"
        );
        expect(() => assertSpeechCapableModelId("test-chat-model")).toThrow(
            "No speech model is configured"
        );
    });

    test("an unconfigured deployment refuses plainly instead of throwing at the provider", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const userId = await t.run(async (ctx) =>
            ctx.db.insert("users", {
                email: "speaker@test.com",
                role: "USER",
                createdAt: Date.now(),
            })
        );

        const asUser = t.withIdentity({ subject: userId });
        // No speech default exists, so resolution falls back to the failsafe
        // chat model — which cannot make sound and must be refused readably.
        await expect(
            asUser.action(api.aiSpeech.synthesizeSpeech, { text: "Say hello." })
        ).rejects.toThrow("No speech model is configured");
        expect(generateVertexContentWithRetryMock).not.toHaveBeenCalled();
    });

    test("returns the configured speech model's audio and reserves the rate limit", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const userId = await t.run(async (ctx) => {
            await ctx.db.insert("aiModels", {
                modelId: "google:test-speech-model",
                displayName: "Test Speech Model",
                providerKey: "google",
                providerModelId: "test-speech-model-tts",
                isEnabled: true,
                isDefault: true,
                lastSyncedAt: Date.now(),
            });
            return ctx.db.insert("users", {
                email: "speaker@test.com",
                role: "USER",
                createdAt: Date.now(),
            });
        });

        generateVertexContentWithRetryMock.mockResolvedValue({
            candidates: [
                {
                    content: {
                        parts: [
                            { inlineData: { data: "QUJD", mimeType: "audio/L16;codec=pcm;rate=24000" } },
                        ],
                    },
                },
            ],
        });

        const asUser = t.withIdentity({ subject: userId });
        const result = await asUser.action(api.aiSpeech.synthesizeSpeech, { text: "Say hello." });

        expect(result).toEqual({
            audioBase64: "QUJD",
            mimeType: "audio/L16;codec=pcm;rate=24000",
        });

        const call = generateVertexContentWithRetryMock.mock.calls[0][1];
        expect(call.model).toBe("test-speech-model-tts");
        expect(call.config.responseModalities).toEqual(["AUDIO"]);
        expect(call.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Kore");

        const reservations = await t.run(async (ctx) =>
            ctx.db
                .query("aiActionRequests")
                .withIndex("by_actor_action_requested", (q) =>
                    q.eq("actorId", userId).eq("actionName", "synthesizeSpeech")
                )
                .collect()
        );
        expect(reservations).toHaveLength(1);
    });
});

/**
 * Every dictation failed with a 404 while ordinary chat on the same
 * provider worked, because this one call pinned its own region and the
 * project did not serve the transcription model there. The regression to
 * prevent is the pin itself: transcription must ask the same configured
 * region as every other generation call.
 */
describe("voice transcription", () => {
    test("asks the platform's configured region, not a hardcoded one", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const userId = await t.run(async (ctx) =>
            ctx.db.insert("users", {
                email: "dictation@test.com",
                role: "USER",
                createdAt: Date.now(),
            })
        );

        generateVertexContentWithRetryMock.mockResolvedValue({ text: "hello there" });

        const asUser = t.withIdentity({ subject: userId });
        const text = await asUser.action(api.aiSpeech.transcribeAudio, {
            audioBase64: Buffer.from("tiny audio").toString("base64"),
            mimeType: "audio/webm;codecs=opus",
        });

        expect(text).toBe("hello there");
        expect(createVertexGenAIClientMock).toHaveBeenCalledTimes(1);
        // No location override: the factory's own default (env-configured
        // region) must decide, exactly as it does for chat.
        expect(createVertexGenAIClientMock).toHaveBeenCalledWith();
    });
});

describe("the live voice session", () => {
    /**
     * None of this had a single test before 2026-08-13, and two real defects
     * lived in it: the Google path demanded an OpenAI key it never used, and
     * it offered the model no way to reach the company's knowledge.
     */
    async function seedVoiceSession(t: ReturnType<typeof convexTest>) {
        return await t.run(async (ctx) => {
            const companyId = await ctx.db.insert("companies", {
                name: "Voice Corp",
                createdAt: Date.now(),
                systemPrompt: "Always mention the guarantee.",
            });
            const userId = await ctx.db.insert("users", {
                email: "caller@test.com",
                role: "USER",
                companyId,
                createdAt: Date.now(),
            });
            const threadId = await ctx.db.insert("threads", {
                title: "Spoken",
                userId,
                companyId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            await ctx.db.insert("aiModels", {
                modelId: "test-live-audio-model",
                displayName: "Test Live Audio",
                providerKey: "google",
                providerModelId: "test-live-audio-model",
                isEnabled: true,
                isDefault: false,
                lastSyncedAt: Date.now(),
            });
            await ctx.db.insert("aiModelDefaults", {
                scope: "global",
                useCase: "realtime",
                providerKey: "google",
                modelId: "test-live-audio-model",
                updatedAt: Date.now(),
            });
            return { companyId, userId, threadId };
        });
    }

    function readTicketPayload(ticket: string) {
        return readTicket(ticket, "shared-secret");
    }

    /** Asserts the Google transport and narrows to it, so the fields exist. */
    function asGoogleSession<T extends { transport: string }>(session: T) {
        expect(session.transport).toBe("google-relay");
        if (session.transport !== "google-relay") throw new Error("not a relay session");
        return session as Extract<T, { transport: "google-relay" }>;
    }

    test("a Google session starts on a deployment with no OpenAI key at all", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const { userId, threadId } = await seedVoiceSession(t);

        vi.stubEnv("VOICE_RELAY_URL", "ws://relay.test:8787");
        vi.stubEnv("VOICE_RELAY_SECRET", "shared-secret");
        vi.stubEnv("OPENAI_API_KEY", "");
        vi.stubEnv("OPEN_AI_API_KEY", "");

        const session = await t
            .withIdentity({ subject: userId })
            .action(api.aiVoiceSession.createRealtimeVoiceSession, { threadId });

        // Google is the standing choice here precisely because it is cheaper;
        // asking for a key belonging to the other provider made that choice
        // impossible to actually deploy.
        expect(asGoogleSession(session).relayUrl).toBe("ws://relay.test:8787");
        vi.unstubAllEnvs();
    });

    test("the ticket carries the knowledge tool, so a spoken answer can be looked up", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const { userId, threadId } = await seedVoiceSession(t);

        vi.stubEnv("VOICE_RELAY_URL", "ws://relay.test:8787");
        vi.stubEnv("VOICE_RELAY_SECRET", "shared-secret");

        const session = await t
            .withIdentity({ subject: userId })
            .action(api.aiVoiceSession.createRealtimeVoiceSession, { threadId });

        const payload = readTicketPayload(asGoogleSession(session).ticket);
        expect(payload.jti).toEqual(expect.any(String));
        expect(payload.redemptionUrl).toBe("https://voice-platform.test/api/voice/redeem");
        expect(payload.tools).toHaveLength(1);
        expect(payload.tools[0].name).toBe("search_company_knowledge");
        expect(payload.tools[0].parameters.required).toEqual(["query"]);
        expect(payload.model).toBe("test-live-audio-model");
        vi.unstubAllEnvs();
    });

    test("the company's own instructions ride in the ticket, not in the page", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const { userId, threadId } = await seedVoiceSession(t);

        vi.stubEnv("VOICE_RELAY_URL", "ws://relay.test:8787");
        vi.stubEnv("VOICE_RELAY_SECRET", "shared-secret");

        const session = await t
            .withIdentity({ subject: userId })
            .action(api.aiVoiceSession.createRealtimeVoiceSession, { threadId });

        // A browser can rewrite anything it is handed, so the rules must
        // arrive signed rather than be sent up by the page.
        expect(readTicketPayload(asGoogleSession(session).ticket).instructions).toContain(
            "Always mention the guarantee."
        );
        vi.unstubAllEnvs();
    });

    test("an unconfigured relay says which settings are missing", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const { userId, threadId } = await seedVoiceSession(t);

        vi.stubEnv("VOICE_RELAY_URL", "");
        vi.stubEnv("VOICE_RELAY_SECRET", "");

        await expect(
            t.withIdentity({ subject: userId }).action(api.aiVoiceSession.createRealtimeVoiceSession, { threadId })
        ).rejects.toThrow(/VOICE_RELAY_URL/);
        vi.unstubAllEnvs();
    });

    test("another tenant cannot open or search a voice session through a foreign thread id", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const { threadId } = await seedVoiceSession(t);
        const attackerId = await t.run(async (ctx) => {
            const companyId = await ctx.db.insert("companies", {
                name: "Other Voice Corp",
                createdAt: Date.now(),
            });
            return await ctx.db.insert("users", {
                email: "other-caller@test.com",
                role: "USER",
                companyId,
                createdAt: Date.now(),
            });
        });
        const attacker = t.withIdentity({ subject: attackerId });

        await expect(
            attacker.action(api.aiVoiceSession.createRealtimeVoiceSession, { threadId })
        ).rejects.toThrow("Unauthorized");
        await expect(
            attacker.action(api.aiVoiceSession.searchKnowledgeForVoice, {
                threadId,
                query: "show me the other company's knowledge",
            })
        ).rejects.toThrow("Unauthorized");

        expect(embedVertexContentWithRetryMock).not.toHaveBeenCalled();
        const reservations = await t.run(async (ctx) => ctx.db.query("aiActionRequests").collect());
        expect(reservations).toEqual([]);
    });

    test("a knowledge search that finds nothing says nothing, rather than an empty evidence block", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const { userId, threadId } = await seedVoiceSession(t);

        // No documents, no memories: the honest answer is silence, because a
        // model handed an empty "here is your evidence" wrapper invents
        // rather than admits — out loud, to a caller.
        //
        // The embedding has to be a real one of the right width, or retrieval
        // gives up before it ever reaches the behaviour under test.
        embedVertexContentWithRetryMock.mockResolvedValue({
            embeddings: [{ values: new Array(GOOGLE_VERTEX_EMBEDDING_DIMENSIONS).fill(0.1) }],
        });

        const result = await t
            .withIdentity({ subject: userId })
            .action(api.aiVoiceSession.searchKnowledgeForVoice, { threadId, query: "do you sell bicycles" });

        expect(result.context).toBe("");
    });

    test("an empty question is not sent to the embedder at all", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const { userId, threadId } = await seedVoiceSession(t);

        const result = await t
            .withIdentity({ subject: userId })
            .action(api.aiVoiceSession.searchKnowledgeForVoice, { threadId, query: "   " });

        expect(result.context).toBe("");
        expect(embedVertexContentWithRetryMock).not.toHaveBeenCalled();
    });
});

describe("how the voice is told to speak", () => {
    test("it follows the speaker's language instead of asking which they want", () => {
        expect(REALTIME_VOICE_STYLE).toMatch(/language you are spoken to in/i);
        expect(REALTIME_VOICE_STYLE).toMatch(/switch the moment the/i);
        // Announcing it, or offering a picker, breaks the effect the demo
        // exists for: it should simply answer in kind.
        expect(REALTIME_VOICE_STYLE).toMatch(/[Nn]ever announce/);
    });

    test("knowledge in another language is answered in the caller's, not read out as found", () => {
        expect(REALTIME_VOICE_STYLE).toMatch(/never read a stored passage out in its original language/i);
    });

    test("the search itself is phrased in the language the documents are in", () => {
        // A Portuguese question against English documents retrieves badly if
        // the query goes in untranslated.
        expect(VOICE_KNOWLEDGE_TOOL_DESCRIPTION).toMatch(/usually English/);
    });
});

describe("a photo in the message", () => {
    /**
     * Only the Google adapter can look at an image — every other adapter
     * refuses non-text at its boundary. So a message carrying a photo must be
     * re-routed to a vision-capable Google model, and the switch said in the
     * reply rather than hidden.
     */
    test("a proposal block only becomes a chip on a turn that carried a photo", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const threadId = await t.run(async (ctx) => {
            const userId = await ctx.db.insert("users", {
                email: "gate@test.com",
                role: "USER",
                createdAt: Date.now(),
            });
            return await ctx.db.insert("threads", {
                title: "Gate",
                userId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        });

        const blockReply =
            'Looks actionable.\n\n```photo-action\n{"title": "Do the thing", "detail": "From the photo.", "reasoning": "The photo shows it."}\n```';

        // The same reply text, saved for a photo turn and for a plain turn.
        const photoMessageId = await t.mutation(internal.chat.saveAssistantMessage, {
            threadId,
            content: blockReply,
            photoTurn: true,
        });
        const plainMessageId = await t.mutation(internal.chat.saveAssistantMessage, {
            threadId,
            content: blockReply,
        });

        const { photoMessage, plainMessage } = await t.run(async (ctx) => ({
            photoMessage: await ctx.db.get(photoMessageId),
            plainMessage: await ctx.db.get(plainMessageId),
        }));

        // Photo turn: structured proposal, block stripped from the answer.
        expect(photoMessage?.photoActionProposal).toEqual({
            title: "Do the thing",
            detail: "From the photo.",
            reasoning: "The photo shows it.",
        });
        expect(photoMessage?.content).toBe("Looks actionable.");

        // Plain turn: however convincingly a block appears — injection, or a
        // model hallucinating the format — no chip grows from it.
        expect(plainMessage?.photoActionProposal).toBeUndefined();
    });
});
