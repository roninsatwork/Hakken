import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";
import { computeTwilioSignature } from "./telephonyService";

const AUTH_TOKEN = "test-twilio-token";
const PUBLIC_URL = "https://sonae.test/api/telephony/voice";
const CALLED_NUMBER = "+441234567890";
const CALLER_NUMBER = "+447700900123";

/**
 * The webhook that answers the phone.
 *
 * It is a public endpoint that spends a company's model budget every time it
 * says yes, so most of what matters is what it refuses — and that a refusal
 * is always a sentence and a hang-up rather than a dead line, which is what a
 * caller hears as "this company is broken".
 */
async function seedCompany(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
        const companyId = await ctx.db.insert("companies", {
            name: "Ronins",
            createdAt: Date.now(),
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
        return companyId;
    });
}

async function dial(
    t: ReturnType<typeof convexTest>,
    fields: Record<string, string>,
    options: { sign?: boolean; token?: string } = {}
) {
    const body = new URLSearchParams(fields).toString();
    const headers: Record<string, string> = {
        "content-type": "application/x-www-form-urlencoded",
    };
    if (options.sign !== false) {
        headers["X-Twilio-Signature"] = await computeTwilioSignature(
            PUBLIC_URL,
            fields,
            options.token ?? AUTH_TOKEN
        );
    }
    return await t.fetch("/api/telephony/voice", { method: "POST", headers, body });
}

beforeEach(() => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", AUTH_TOKEN);
    vi.stubEnv("TELEPHONY_PUBLIC_URL", PUBLIC_URL);
    vi.stubEnv("TELEPHONY_STREAM_URL", "wss://relay.test/call");
    vi.stubEnv("VOICE_RELAY_SECRET", "shared-secret");
});

describe("answering the phone", () => {
    test("a signed call to a claimed number is answered, and the call exists", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await seedCompany(t);
        vi.stubEnv("TELEPHONY_NUMBER_OWNERS", JSON.stringify({ [CALLED_NUMBER]: companyId }));

        const response = await dial(t, {
            CallSid: "CA-1",
            From: CALLER_NUMBER,
            To: CALLED_NUMBER,
        });

        expect(response.status).toBe(200);
        const twiml = await response.text();
        expect(twiml).toContain("A.I. assistant for Ronins");
        expect(twiml).toContain('<Stream url="wss://relay.test/call">');
        expect(twiml).toContain('<Parameter name="ticket"');

        const calls = await t.run(async (ctx) => ctx.db.query("phoneCalls").collect());
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({
            providerCallId: "CA-1",
            fromNumber: CALLER_NUMBER,
            status: "IN_PROGRESS",
            turns: [],
        });
    });

    test("the same call delivered twice is one call, not two", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await seedCompany(t);
        vi.stubEnv("TELEPHONY_NUMBER_OWNERS", JSON.stringify({ [CALLED_NUMBER]: companyId }));

        // A provider redelivers a webhook it believes failed. Two rows for
        // one call would mean two transcripts and two follow-up tasks.
        const fields = { CallSid: "CA-repeat", From: CALLER_NUMBER, To: CALLED_NUMBER };
        expect((await dial(t, fields)).status).toBe(200);
        expect((await dial(t, fields)).status).toBe(200);

        const calls = await t.run(async (ctx) => ctx.db.query("phoneCalls").collect());
        expect(calls).toHaveLength(1);
    });

    test("an unsigned call is refused before any model call is spent", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await seedCompany(t);
        vi.stubEnv("TELEPHONY_NUMBER_OWNERS", JSON.stringify({ [CALLED_NUMBER]: companyId }));

        const response = await dial(
            t,
            { CallSid: "CA-2", From: CALLER_NUMBER, To: CALLED_NUMBER },
            { sign: false }
        );

        expect(response.status).toBe(403);
        expect(await t.run(async (ctx) => ctx.db.query("phoneCalls").collect())).toHaveLength(0);
    });

    test("a call signed with the wrong token is refused", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await seedCompany(t);
        vi.stubEnv("TELEPHONY_NUMBER_OWNERS", JSON.stringify({ [CALLED_NUMBER]: companyId }));

        const response = await dial(
            t,
            { CallSid: "CA-3", From: CALLER_NUMBER, To: CALLED_NUMBER },
            { token: "somebody-elses-token" }
        );

        expect(response.status).toBe(403);
        expect(await t.run(async (ctx) => ctx.db.query("phoneCalls").collect())).toHaveLength(0);
    });

    test("a number nobody owns is told so, politely, and leaves no record", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        await seedCompany(t);
        vi.stubEnv("TELEPHONY_NUMBER_OWNERS", "{}");

        const response = await dial(t, {
            CallSid: "CA-4",
            From: CALLER_NUMBER,
            To: "+449999999999",
        });

        expect(response.status).toBe(200);
        const twiml = await response.text();
        expect(twiml).toContain("not in service");
        expect(twiml).toContain("<Hangup/>");
        expect(await t.run(async (ctx) => ctx.db.query("phoneCalls").collect())).toHaveLength(0);
    });

    test("a deployment with no telephony token does not answer at all", async () => {
        vi.stubEnv("TWILIO_AUTH_TOKEN", "");
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));

        const response = await dial(t, { CallSid: "CA-5", From: CALLER_NUMBER, To: CALLED_NUMBER });
        expect(response.status).toBe(503);
        expect(await response.text()).toContain("<Hangup/>");
    });

    test("a call with no id or no dialled number is refused", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await seedCompany(t);
        vi.stubEnv("TELEPHONY_NUMBER_OWNERS", JSON.stringify({ [CALLED_NUMBER]: companyId }));

        expect((await dial(t, { From: CALLER_NUMBER, To: CALLED_NUMBER })).status).toBe(400);
        expect((await dial(t, { CallSid: "CA-6", From: CALLER_NUMBER })).status).toBe(400);
    });

    test("a claimed number whose workspace has since been deleted is refused", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await seedCompany(t);
        await t.run(async (ctx) => ctx.db.delete(companyId));
        vi.stubEnv("TELEPHONY_NUMBER_OWNERS", JSON.stringify({ [CALLED_NUMBER]: companyId }));

        const response = await dial(t, {
            CallSid: "CA-7",
            From: CALLER_NUMBER,
            To: CALLED_NUMBER,
        });

        expect(response.status).toBe(200);
        expect(await response.text()).toContain("not in service");
    });

    test("no live-audio model configured means a polite apology, not a dead line", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await t.run(async (ctx) =>
            ctx.db.insert("companies", { name: "Ronins", createdAt: Date.now() })
        );
        vi.stubEnv("TELEPHONY_NUMBER_OWNERS", JSON.stringify({ [CALLED_NUMBER]: companyId }));

        const response = await dial(t, {
            CallSid: "CA-8",
            From: CALLER_NUMBER,
            To: CALLED_NUMBER,
        });

        expect(response.status).toBe(200);
        expect(await response.text()).toContain("cannot take your call");
    });
});
