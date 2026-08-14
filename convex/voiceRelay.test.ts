import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const SECRET = "test-relay-secret";

/**
 * The relay's door into company knowledge.
 *
 * It is a public endpoint holding a company's documents behind it, so most of
 * what matters here is what it refuses.
 */
function mintTicket(payload: Record<string, unknown>, secret = SECRET) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
}

async function seedThread(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
        const companyId = await ctx.db.insert("companies", {
            name: "Voice Corp",
            createdAt: Date.now(),
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
        return { companyId, threadId };
    });
}

function lookup(t: ReturnType<typeof convexTest>, body: unknown) {
    return t.fetch("/api/voice/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

beforeEach(() => {
    vi.stubEnv("VOICE_RELAY_SECRET", SECRET);
});

describe("the relay asking for company knowledge", () => {
    test("answers a lookup carrying a ticket this platform signed", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const { threadId, companyId } = await seedThread(t);

        const response = await lookup(t, {
            ticket: mintTicket({
                threadId,
                companyId,
                model: "test-provider-model",
                expiresAt: Date.now() + 60_000,
            }),
            query: "what are the opening hours",
        });

        expect(response.status).toBe(200);
        // Nothing is in this workspace's knowledge, and the honest answer to
        // that is an empty one — the model is told what to say about it.
        expect(await response.json()).toEqual({ context: "" });
    });

    test("refuses a ticket signed with anything but this platform's secret", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const { threadId } = await seedThread(t);

        const response = await lookup(t, {
            ticket: mintTicket({ threadId, expiresAt: Date.now() + 60_000 }, "not-the-secret"),
            query: "anything at all",
        });

        expect(response.status).toBe(401);
    });

    test("refuses a ticket whose thread was swapped after signing", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const { threadId } = await seedThread(t);

        // The attack this endpoint exists to survive: point a real signature
        // at another workspace's conversation and read its documents out.
        const [, signature] = mintTicket({ threadId, expiresAt: Date.now() + 60_000 }).split(".");
        const swapped = Buffer.from(
            JSON.stringify({ threadId: "someone-elses-thread", expiresAt: Date.now() + 60_000 })
        ).toString("base64url");

        const response = await lookup(t, { ticket: `${swapped}.${signature}`, query: "secrets" });
        expect(response.status).toBe(401);
    });

    test("refuses once the session it belongs to could no longer be running", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const { threadId } = await seedThread(t);

        // A ticket is good for a minute at the socket; a lookup happens
        // mid-conversation, so it is bounded by the longest a call may last
        // rather than being usable forever.
        const response = await lookup(t, {
            ticket: mintTicket({ threadId, expiresAt: Date.now() - 20 * 60 * 1000 }),
            query: "still listening?",
        });

        expect(response.status).toBe(401);
    });

    test("refuses malformed and oversized bodies without touching the database", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));

        expect((await lookup(t, "not json at all")).status).toBe(400);
        expect((await lookup(t, { query: "no ticket" })).status).toBe(401);
        expect((await lookup(t, { ticket: "rubbish", query: "x" })).status).toBe(401);

        const oversized = await lookup(t, {
            ticket: mintTicket({ threadId: "x", expiresAt: Date.now() }),
            query: "q".repeat(200_000),
        });
        expect(oversized.status).toBe(413);
    });

    test("says so plainly when the deployment has no relay secret configured", async () => {
        vi.stubEnv("VOICE_RELAY_SECRET", "");
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));

        const response = await lookup(t, { ticket: "anything", query: "x" });
        expect(response.status).toBe(503);
    });

    test("a real ticket's size fits through the door", async () => {
        // The first live phone call failed here: a ticket carries the
        // company's full spoken instructions — prompt, rules, skills,
        // memories — and the door was sized for a bare question. Every
        // lookup bounced 413 and the voice told the caller it could not
        // check. This ticket is the shape the platform actually mints.
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const { threadId, companyId } = await seedThread(t);

        const response = await lookup(t, {
            ticket: mintTicket({
                threadId,
                companyId,
                model: "test-provider-model",
                instructions: "You speak for the company. ".repeat(1200),
                tools: [{ name: "search_company_knowledge", description: "d", parameters: {} }],
                expiresAt: Date.now() + 60_000,
            }),
            query: "what services do you offer",
        });

        expect(response.status).toBe(200);
    });

    test("a thread that belongs to no workspace falls back to the ticket's company", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const { companyId } = await seedThread(t);
        const orphanThreadId = await t.run(async (ctx) =>
            ctx.db.insert("threads", {
                title: "No workspace",
                createdAt: Date.now(),
                updatedAt: Date.now(),
            })
        );

        const response = await lookup(t, {
            ticket: mintTicket({
                threadId: orphanThreadId as Id<"threads">,
                companyId,
                expiresAt: Date.now() + 60_000,
            }),
            query: "anything",
        });

        expect(response.status).toBe(200);
    });
});
