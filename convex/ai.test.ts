import { expect, test, describe } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";

describe("OWASP for LLMs: Denial of Wallet & Resource Exhaustion (LLM04)", () => {
    test("Core AI generator rejects excessive payload lengths before invoking Vertex AI", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        
        // Setup a mock thread
        const threadId = await t.run(async (ctx) => {
            const mockUser = await ctx.db.insert("users", {
                email: "ai@test.com", role: "USER", createdAt: Date.now() 
            });
            return await ctx.db.insert("threads", {
                userId: mockUser,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                title: "Test Thread"
            });
        });

        // 1. Generate an oversized payload string (11,000 characters)
        const massivePayload = "a".repeat(11000);

        // 2. We invoke the internal action. The action should immediately throw via security gate
        // rather than trying to construct the Vertex auth.
        await expect(
            t.action(internal.ai.generateSonaeResponse, {
                threadId,
                content: massivePayload,
            })
        ).rejects.toThrow("Payload Too Large");
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
});
