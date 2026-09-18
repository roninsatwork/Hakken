import { createHmac, randomUUID } from "node:crypto";
import { encryptVoiceTicket } from "./utils/voiceTicketEncryption";
import { internal } from "./_generated/api";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_COMPANY_MODULE_KEYS } from "./utils/coreModules";

const SECRET = "test-relay-secret";

/**
 * The relay's door into company knowledge.
 *
 * It is a public endpoint holding a company's documents behind it, so most of
 * what matters here is what it refuses.
 */
function mintTicket(payload: Record<string, unknown>, secret = SECRET) {
    return encryptVoiceTicket(payload, secret);
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
    const ticket = typeof body === "object" && body !== null && "ticket" in body && typeof body.ticket === "string" ? body.ticket : "";
    return t.fetch("/api/voice/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json", "x-voice-relay-auth": createHmac("sha256", SECRET).update(ticket).digest("base64url") },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

function redeem(t: ReturnType<typeof convexTest>, ticket: string) {
    return t.fetch("/api/voice/redeem", {
        method: "POST",
        headers: { "content-type": "application/json", "x-voice-relay-auth": createHmac("sha256", SECRET).update(ticket).digest("base64url") },
        body: JSON.stringify({ ticket }),
    });
}

function control(t: ReturnType<typeof convexTest>, ticket: string, action: "begin-turn" | "complete-turn" | "close", turnIndex?: number) {
    return t.fetch("/api/voice/control", {
        method: "POST",
        headers: { "content-type": "application/json", "x-voice-relay-auth": createHmac("sha256", SECRET).update(ticket).digest("base64url") },
        body: JSON.stringify({ ticket, action, ...(turnIndex ? { turnIndex } : {}) }),
    });
}

beforeEach(() => {
    vi.stubEnv("VOICE_RELAY_SECRET", SECRET);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function admittedTicket(t: ReturnType<typeof convexTest>, payload: Record<string, unknown>) {
    const ticket = mintTicket({ jti: randomUUID(), ...payload });
    expect((await redeem(t, ticket)).status).toBe(200);
    return ticket;
}

describe("one-time voice ticket redemption", () => {
    test("one ticket opens only one relay connection", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const ticket = mintTicket({
            model: "test-provider-model",
            jti: "ticket-id-1234567890",
            redemptionUrl: "https://platform.test/api/voice/redeem",
            expiresAt: Date.now() + 60_000,
        });

        const [first, second] = await Promise.all([redeem(t, ticket), redeem(t, ticket)]);
        expect([first.status, second.status].sort()).toEqual([200, 409]);
        const rows = await t.run(async (ctx) => ctx.db.query("voiceTicketRedemptions").collect());
        expect(rows).toHaveLength(1);
        expect(rows[0].ticketId).toBe("ticket-id-1234567890");
    });

    test("forged, expired, and legacy tickets cannot be redeemed", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const forged = mintTicket({
            model: "test-provider-model",
            jti: "ticket-id-1234567890",
            expiresAt: Date.now() + 60_000,
        }, "wrong-secret");
        const expired = mintTicket({
            model: "test-provider-model",
            jti: "ticket-id-1234567890",
            expiresAt: Date.now() - 1,
        });
        const legacy = mintTicket({
            model: "test-provider-model",
            expiresAt: Date.now() + 60_000,
        });

        expect((await redeem(t, forged)).status).toBe(401);
        expect((await redeem(t, expired)).status).toBe(401);
        expect((await redeem(t, legacy)).status).toBe(401);
    });
});

describe("kiosk relay admission and company message quota", () => {
    test("counts a real relay session and each completed turn exactly once", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const { companyId, widgetId, threadId } = await t.run(async (ctx) => {
            const planId = await ctx.db.insert("plans", {
                name: "One turn", priceGBP: 1, messageLimit: 1, isActive: true, createdAt: Date.now(),
            });
            const companyId = await ctx.db.insert("companies", {
                name: "Kiosk Co", planId, enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], messagesUsedThisPeriod: 0, createdAt: Date.now(),
            });
            const widgetId = await ctx.db.insert("widgets", {
                companyId, name: "Desk", allowedDomains: [], isActive: true, kioskEnabled: true,
                createdAt: Date.now(),
            });
            const threadId = await ctx.db.insert("threads", {
                companyId, widgetId, sourceUrl: "kiosk", title: "Kiosk", createdAt: Date.now(), updatedAt: Date.now(),
            });
            return { companyId, widgetId, threadId };
        });
        const ticket = mintTicket({
            model: "test-provider-model",
            jti: "metered-kiosk-ticket-1234",
            redemptionUrl: "https://platform.test/api/voice/redeem",
            controlUrl: "https://platform.test/api/voice/control",
            expiresAt: Date.now() + 60_000,
            kioskWidgetId: widgetId,
            threadId,
            meteredVoiceTurns: true,
        });

        expect((await redeem(t, ticket)).status).toBe(200);
        expect((await redeem(t, ticket)).status).toBe(409);
        expect((await control(t, ticket, "begin-turn", 1)).status).toBe(200);
        expect((await control(t, ticket, "begin-turn", 1)).status).toBe(200);
        expect(await t.run(async (ctx) => (await ctx.db.get(companyId))?.messagesUsedThisPeriod)).toBe(1);
        expect((await control(t, ticket, "complete-turn", 1)).status).toBe(200);
        expect((await control(t, ticket, "begin-turn", 2)).status).toBe(429);
        expect((await control(t, ticket, "close")).status).toBe(200);

        const widget = await t.run(async (ctx) => ctx.db.get(widgetId));
        expect(widget?.kioskSessionCount).toBe(1);
        expect(widget?.kioskVoiceActiveTicketId).toBeUndefined();
    });

    test("abandons an unfinished reservation without charging the company", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const { companyId, widgetId, threadId } = await t.run(async (ctx) => {
            const planId = await ctx.db.insert("plans", {
                name: "Turns", priceGBP: 1, messageLimit: 10, isActive: true, createdAt: Date.now(),
            });
            const companyId = await ctx.db.insert("companies", {
                name: "Kiosk Co", planId, enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], messagesUsedThisPeriod: 0, createdAt: Date.now(),
            });
            const widgetId = await ctx.db.insert("widgets", {
                companyId, name: "Desk", allowedDomains: [], isActive: true, kioskEnabled: true,
                createdAt: Date.now(),
            });
            const threadId = await ctx.db.insert("threads", {
                companyId, widgetId, sourceUrl: "kiosk", title: "Kiosk", createdAt: Date.now(), updatedAt: Date.now(),
            });
            return { companyId, widgetId, threadId };
        });
        const ticket = mintTicket({
            model: "test-provider-model", jti: "refund-kiosk-ticket-12345",
            redemptionUrl: "https://platform.test/api/voice/redeem",
            expiresAt: Date.now() + 60_000, kioskWidgetId: widgetId, threadId, meteredVoiceTurns: true,
        });
        expect((await redeem(t, ticket)).status).toBe(200);
        expect((await control(t, ticket, "begin-turn", 1)).status).toBe(200);
        expect((await control(t, ticket, "close")).status).toBe(200);
        expect(await t.run(async (ctx) => (await ctx.db.get(companyId))?.messagesUsedThisPeriod)).toBe(0);
    });
});

describe("the relay asking for company knowledge", () => {
    test("a browser-held ticket alone cannot redeem or search", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const { threadId } = await seedThread(t);
        const ticket = mintTicket({ threadId, jti: "one-time-id-123456789", expiresAt: Date.now() + 60_000 });
        for (const path of ["redeem", "knowledge"]) {
            expect((await t.fetch(`/api/voice/${path}`, {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ ticket, query: "private data" }),
            })).status).toBe(401);
        }
        expect((await lookup(t, { ticket, query: "not yet redeemed" })).status).toBe(429);
    });

    test("concurrent lookups share a quota, and a closed session stays closed", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const jti = "one-time-id-123456789";
        await t.mutation(internal.voiceRelay.redeemVoiceTicketInternal, { ticketId: jti, expiresAt: Date.now() + 60_000 });
        const results = await Promise.all(Array.from({ length: 12 }, () =>
            t.mutation(internal.voiceRelay.admitKnowledgeLookup, { ticketId: jti })));
        expect(results.filter(Boolean)).toHaveLength(10);
        expect(await t.mutation(internal.voiceRelay.admitKnowledgeLookup, { ticketId: jti, close: true })).toBe(true);
        expect(await t.mutation(internal.voiceRelay.admitKnowledgeLookup, { ticketId: jti })).toBe(false);
    });

    test("session quotas persist past the one-minute admission ticket", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        let now = Date.now();
        vi.spyOn(Date, "now").mockImplementation(() => now);
        const jti = "one-time-id-123456789";
        await t.mutation(internal.voiceRelay.redeemVoiceTicketInternal, { ticketId: jti, expiresAt: now + 60_000 });
        for (let window = 0; window < 6; window++) {
            now += 60_001;
            for (let count = 0; count < 10; count++) {
                expect(await t.mutation(internal.voiceRelay.admitKnowledgeLookup, { ticketId: jti })).toBe(true);
            }
        }
        now += 60_001;
        expect(await t.mutation(internal.voiceRelay.admitKnowledgeLookup, { ticketId: jti })).toBe(false);
    });

    test("ticket bytes reveal no prompt and legacy plaintext passes are refused", async () => {
        const instructions = "Private company policy and memory";
        const ticket = mintTicket({ instructions, jti: "one-time-id-123456789", expiresAt: Date.now() + 60_000 });
        expect(ticket.split(".").map(part => Buffer.from(part, "base64url").toString("utf8")).join("")).not.toContain(instructions);
        const payload = Buffer.from(JSON.stringify({ instructions, jti: "one-time-id-123456789", expiresAt: Date.now() + 60_000 })).toString("base64url");
        const old = `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        expect((await redeem(t, old)).status).toBe(401);
    });

    test("answers a lookup carrying a ticket this platform signed", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const { threadId, companyId } = await seedThread(t);

        const response = await lookup(t, {
            ticket: await admittedTicket(t, {
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
            ticket: await admittedTicket(t, {
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
            ticket: await admittedTicket(t, {
                threadId: orphanThreadId as Id<"threads">,
                companyId,
                expiresAt: Date.now() + 60_000,
            }),
            query: "anything",
        });

        expect(response.status).toBe(200);
    });
});
