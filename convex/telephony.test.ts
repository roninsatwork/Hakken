import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { computeTwilioSignature } from "./telephonyService";

const { generateTextWithResolvedModelMock } = vi.hoisted(() => ({
    generateTextWithResolvedModelMock: vi.fn(),
}));

// Mocked shallow on purpose — no importOriginal. The real module pulls in
// every provider SDK, seconds of import under a loaded suite, and the finale
// runs inside a fake-timer pump that a heavy import can starve into a
// spurious "scheduled function did not complete".
vi.mock("./aiProviderRegistry", () => ({
    generateTextWithResolvedModel: generateTextWithResolvedModelMock,
}));

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

describe("the transcript arriving mid-call", () => {
    const mintCallTicket = async (companyId: string) => {
        // The same shape the platform mints for a call: a company, no thread.
        const payload = Buffer.from(
            JSON.stringify({ companyId, model: "test-live-audio-model", expiresAt: Date.now() + 60_000 })
        ).toString("base64url");
        const { createHmac } = await import("node:crypto");
        const signature = createHmac("sha256", "shared-secret").update(payload).digest("base64url");
        return `${payload}.${signature}`;
    };

    const answeredCall = async (t: ReturnType<typeof convexTest>) => {
        const companyId = await seedCompany(t);
        vi.stubEnv("TELEPHONY_NUMBER_OWNERS", JSON.stringify({ [CALLED_NUMBER]: companyId }));
        await dial(t, { CallSid: "CA-turns", From: CALLER_NUMBER, To: CALLED_NUMBER });
        return companyId;
    };

    test("finished turns land on the call record as the call happens", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await answeredCall(t);

        const response = await t.fetch("/api/telephony/turns", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                ticket: await mintCallTicket(companyId),
                callSid: "CA-turns",
                turns: [
                    { role: "CALLER", text: "What are your opening hours?" },
                    { role: "SONAE", text: "We open at nine." },
                ],
            }),
        });

        expect(response.status).toBe(200);
        const [call] = await t.run(async (ctx) => ctx.db.query("phoneCalls").collect());
        expect(call.turns.map((turn) => turn.role)).toEqual(["CALLER", "SONAE"]);
    });

    test("a ticket for one workspace cannot write into another's call", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        await answeredCall(t);
        const otherCompanyId = await t.run(async (ctx) =>
            ctx.db.insert("companies", { name: "Other Corp", createdAt: Date.now() })
        );

        const response = await t.fetch("/api/telephony/turns", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                ticket: await mintCallTicket(otherCompanyId),
                callSid: "CA-turns",
                turns: [{ role: "CALLER", text: "somebody else's words" }],
            }),
        });

        // The endpoint accepts the authentic ticket; the write itself refuses
        // the mismatched company. Either way the record stays clean.
        expect(response.status).toBe(200);
        const [call] = await t.run(async (ctx) => ctx.db.query("phoneCalls").collect());
        expect(call.turns).toHaveLength(0);
    });

    test("an unsigned or expired ticket files nothing", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await answeredCall(t);

        const forged = await t.fetch("/api/telephony/turns", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ticket: "abc.def", callSid: "CA-turns", turns: [] }),
        });
        expect(forged.status).toBe(401);

        const payload = Buffer.from(
            JSON.stringify({ companyId, expiresAt: Date.now() - 20 * 60 * 1000 })
        ).toString("base64url");
        const { createHmac } = await import("node:crypto");
        const signature = createHmac("sha256", "shared-secret").update(payload).digest("base64url");
        const expired = await t.fetch("/api/telephony/turns", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                ticket: `${payload}.${signature}`,
                callSid: "CA-turns",
                turns: [{ role: "CALLER", text: "too late" }],
            }),
        });
        expect(expired.status).toBe(401);
    });

    test("a call cannot grow turns without end", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await answeredCall(t);
        const ticket = await mintCallTicket(companyId);

        // Fill to the cap in bounded posts, then confirm the next is dropped.
        for (let batch = 0; batch < 10; batch += 1) {
            await t.fetch("/api/telephony/turns", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    ticket,
                    callSid: "CA-turns",
                    turns: Array.from({ length: 40 }, (_, i) => ({
                        role: "CALLER" as const,
                        text: `turn ${batch}-${i}`,
                    })),
                }),
            });
        }
        const [call] = await t.run(async (ctx) => ctx.db.query("phoneCalls").collect());
        expect(call.turns.length).toBe(400);

        await t.fetch("/api/telephony/turns", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                ticket,
                callSid: "CA-turns",
                turns: [{ role: "CALLER", text: "one too many" }],
            }),
        });
        const [after] = await t.run(async (ctx) => ctx.db.query("phoneCalls").collect());
        expect(after.turns.length).toBe(400);
    });
});

describe("the hang-up-and-watch finale", () => {
    const endCall = async (
        t: ReturnType<typeof convexTest>,
        callSid: string,
        status = "completed"
    ) => {
        const fields = { CallSid: callSid, CallStatus: status };
        const signature = await computeTwilioSignature(
            "https://sonae.test/api/telephony/status",
            fields,
            AUTH_TOKEN
        );
        return await t.fetch("/api/telephony/status", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                "X-Twilio-Signature": signature,
            },
            body: new URLSearchParams(fields).toString(),
        });
    };

    beforeEach(async () => {
        vi.stubEnv("TELEPHONY_STATUS_PUBLIC_URL", "https://sonae.test/api/telephony/status");
        // The finale runs as a scheduled action inside a fake-timer pump, and
        // convex-test loads each function's module on first call — a dynamic
        // import that races the pump's iteration cap when the suite has
        // vitest's transformer under load. Import the chain here, in real
        // time, so the pump only ever waits on the work itself.
        await Promise.all([
            import("./telephonyActions"),
            import("./tasks"),
            import("./notifications"),
            import("./aiModels"),
        ]);
    });

    test("a completed call is closed, and closing it is idempotent", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await seedCompany(t);
        vi.stubEnv("TELEPHONY_NUMBER_OWNERS", JSON.stringify({ [CALLED_NUMBER]: companyId }));
        await dial(t, { CallSid: "CA-end", From: CALLER_NUMBER, To: CALLED_NUMBER });

        expect((await endCall(t, "CA-end")).status).toBe(200);
        const [call] = await t.run(async (ctx) => ctx.db.query("phoneCalls").collect());
        expect(call.status).toBe("COMPLETED");
        expect(call.endedAt).toBeDefined();

        // The provider redelivers; a completed call must not reopen or rerun.
        expect((await endCall(t, "CA-end")).status).toBe(200);
        const [again] = await t.run(async (ctx) => ctx.db.query("phoneCalls").collect());
        expect(again.status).toBe("COMPLETED");
    });

    test("an unsigned status report changes nothing", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await seedCompany(t);
        vi.stubEnv("TELEPHONY_NUMBER_OWNERS", JSON.stringify({ [CALLED_NUMBER]: companyId }));
        await dial(t, { CallSid: "CA-forge", From: CALLER_NUMBER, To: CALLED_NUMBER });

        const response = await t.fetch("/api/telephony/status", {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ CallSid: "CA-forge", CallStatus: "completed" }).toString(),
        });
        expect(response.status).toBe(403);
        const [call] = await t.run(async (ctx) => ctx.db.query("phoneCalls").collect());
        expect(call.status).toBe("IN_PROGRESS");
    });

    test("the finale files the summary, matches the customer, raises the task, rings the bell", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await seedCompany(t);
        vi.stubEnv("TELEPHONY_NUMBER_OWNERS", JSON.stringify({ [CALLED_NUMBER]: companyId }));

        // A workspace member to receive the follow-up, and the caller already
        // in the CRM under the number they are dialling from.
        const memberId = await t.run(async (ctx) =>
            ctx.db.insert("users", {
                email: "owner@ronins.test",
                role: "ADMIN",
                companyId,
                createdAt: Date.now(),
            })
        );
        await t.run(async (ctx) => {
            await ctx.db.insert("salesDataCustomers", {
                companyId,
                accountNameKey: "harbour-hotel",
                phone: "+44 7700 900123",
                updatedAt: Date.now(),
            });
        });

        await dial(t, { CallSid: "CA-finale", From: CALLER_NUMBER, To: CALLED_NUMBER });
        await t.run(async (ctx) => {
            const [call] = await ctx.db.query("phoneCalls").collect();
            await ctx.db.patch(call._id, {
                turns: [
                    { role: "CALLER" as const, text: "Do you deliver on Sundays?", at: Date.now() },
                    { role: "SONAE" as const, text: "Yes, before noon.", at: Date.now() },
                ],
            });
        });

        generateTextWithResolvedModelMock.mockResolvedValue({
            text: "The caller asked about Sunday delivery. Confirm their order is scheduled.",
        });

        vi.useFakeTimers();
        try {
            await endCall(t, "CA-finale");
            await t.finishAllScheduledFunctions(vi.runAllTimers);
        } finally {
            vi.useRealTimers();
        }

        const [call] = await t.run(async (ctx) => ctx.db.query("phoneCalls").collect());
        expect(call.summary).toContain("Sunday delivery");
        expect(call.matchedCustomerKey).toBe("harbour-hotel");
        expect(call.taskId).toBeDefined();

        const [task] = await t.run(async (ctx) => ctx.db.query("tasks").collect());
        expect(task.title).toContain("***123");
        expect(task.title).toContain("harbour-hotel");
        expect(task.title).not.toContain(CALLER_NUMBER);
        expect(task.assigneeUserId).toBe(memberId);
        expect(task.sourceUrl).toContain("/app/calls/");
        expect(task.detail).toContain("Sunday delivery");

        const notifications = await t.run(async (ctx) => ctx.db.query("notifications").collect());
        expect(notifications.some((n) => n.userId === memberId)).toBe(true);
    });

    test("a silent misdial closes quietly: no summary, no task, nobody's bell", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await seedCompany(t);
        vi.stubEnv("TELEPHONY_NUMBER_OWNERS", JSON.stringify({ [CALLED_NUMBER]: companyId }));
        await dial(t, { CallSid: "CA-quiet", From: CALLER_NUMBER, To: CALLED_NUMBER });

        vi.useFakeTimers();
        try {
            await endCall(t, "CA-quiet", "no-answer");
            await t.finishAllScheduledFunctions(vi.runAllTimers);
        } finally {
            vi.useRealTimers();
        }

        const [call] = await t.run(async (ctx) => ctx.db.query("phoneCalls").collect());
        expect(call.status).toBe("FAILED");
        expect(call.summary).toBeUndefined();
        expect(await t.run(async (ctx) => ctx.db.query("tasks").collect())).toHaveLength(0);
    });

    test("a dead summary model still files the transcript and raises the task", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await seedCompany(t);
        vi.stubEnv("TELEPHONY_NUMBER_OWNERS", JSON.stringify({ [CALLED_NUMBER]: companyId }));
        await dial(t, { CallSid: "CA-degrade", From: CALLER_NUMBER, To: CALLED_NUMBER });
        await t.run(async (ctx) => {
            const [call] = await ctx.db.query("phoneCalls").collect();
            await ctx.db.patch(call._id, {
                turns: [{ role: "CALLER" as const, text: "Hello?", at: Date.now() }],
            });
        });

        generateTextWithResolvedModelMock.mockRejectedValue(new Error("503"));

        vi.useFakeTimers();
        try {
            await endCall(t, "CA-degrade");
            await t.finishAllScheduledFunctions(vi.runAllTimers);
        } finally {
            vi.useRealTimers();
        }

        const [call] = await t.run(async (ctx) => ctx.db.query("phoneCalls").collect());
        expect(call.summary).toContain("transcript is attached");
        const [task] = await t.run(async (ctx) => ctx.db.query("tasks").collect());
        expect(task.detail).toContain("Hello?");
    });
});

describe("the call screen's queries", () => {
    const seedCallFor = async (
        t: ReturnType<typeof convexTest>,
        companyId: Awaited<ReturnType<typeof seedCompany>>,
        providerCallId: string
    ) =>
        await t.run(async (ctx) =>
            ctx.db.insert("phoneCalls", {
                companyId,
                providerCallId,
                fromNumber: CALLER_NUMBER,
                toNumber: CALLED_NUMBER,
                status: "COMPLETED" as const,
                turns: [{ role: "CALLER" as const, text: "hello", at: Date.now() }],
                startedAt: Date.now(),
            })
        );

    const memberOf = async (
        t: ReturnType<typeof convexTest>,
        companyId: Awaited<ReturnType<typeof seedCompany>>,
        email: string
    ) =>
        await t.run(async (ctx) =>
            ctx.db.insert("users", { email, role: "USER", companyId, createdAt: Date.now() })
        );

    test("the list masks every caller and stays inside the caller's workspace", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await seedCompany(t);
        const otherCompanyId = await t.run(async (ctx) =>
            ctx.db.insert("companies", { name: "Other", createdAt: Date.now() })
        );
        await seedCallFor(t, companyId, "CA-mine");
        await seedCallFor(t, otherCompanyId, "CA-theirs");
        const userId = await memberOf(t, companyId, "member@ronins.test");

        const calls = await t
            .withIdentity({ subject: userId })
            .query(api.telephony.listCalls, {});

        expect(calls).toHaveLength(1);
        expect(calls[0].fromMasked).toBe("***123");
        // The full number must not appear anywhere in the list payload.
        expect(JSON.stringify(calls)).not.toContain(CALLER_NUMBER);
    });

    test("a call from another workspace reads as not found, not as someone else's", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await seedCompany(t);
        const otherCompanyId = await t.run(async (ctx) =>
            ctx.db.insert("companies", { name: "Other", createdAt: Date.now() })
        );
        const theirCallId = await seedCallFor(t, otherCompanyId, "CA-theirs");
        const userId = await memberOf(t, companyId, "member@ronins.test");

        const call = await t
            .withIdentity({ subject: userId })
            .query(api.telephony.getCall, { callId: theirCallId });

        expect(call).toBeNull();
    });

    test("the company's own number comes from the same setting that routes its calls", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await seedCompany(t);
        vi.stubEnv("TELEPHONY_NUMBER_OWNERS", JSON.stringify({ [CALLED_NUMBER]: companyId }));
        const userId = await memberOf(t, companyId, "member@ronins.test");

        const number = await t
            .withIdentity({ subject: userId })
            .query(api.telephony.getCompanyPhoneNumber, {});

        expect(number).toBe(CALLED_NUMBER);
    });
});

describe("who gets answered — ceilings and the plan", () => {
    const withOwnership = async (t: ReturnType<typeof convexTest>) => {
        const companyId = await seedCompany(t);
        vi.stubEnv("TELEPHONY_NUMBER_OWNERS", JSON.stringify({ [CALLED_NUMBER]: companyId }));
        return companyId;
    };

    test("a room full of simultaneous callers hears busy, not a crash", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await withOwnership(t);
        vi.stubEnv("TELEPHONY_MAX_CONCURRENT_CALLS", "2");

        // Two live calls already on the line.
        await t.run(async (ctx) => {
            for (let i = 0; i < 2; i += 1) {
                await ctx.db.insert("phoneCalls", {
                    companyId,
                    providerCallId: `CA-live-${i}`,
                    fromNumber: `+44770090000${i}`,
                    toNumber: CALLED_NUMBER,
                    status: "IN_PROGRESS" as const,
                    turns: [],
                    startedAt: Date.now(),
                });
            }
        });

        const response = await dial(t, {
            CallSid: "CA-third",
            From: CALLER_NUMBER,
            To: CALLED_NUMBER,
        });

        expect(response.status).toBe(200);
        const twiml = await response.text();
        expect(twiml).toContain("lines are busy");
        expect(twiml).toContain("<Hangup/>");
        // Refused calls leave no record and no ticket.
        const calls = await t.run(async (ctx) => ctx.db.query("phoneCalls").collect());
        expect(calls).toHaveLength(2);
    });

    test("the same number redialling all hour gets told to stop, others still get through", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await withOwnership(t);
        vi.stubEnv("TELEPHONY_MAX_CALLS_PER_NUMBER_PER_HOUR", "3");

        await t.run(async (ctx) => {
            for (let i = 0; i < 3; i += 1) {
                await ctx.db.insert("phoneCalls", {
                    companyId,
                    providerCallId: `CA-old-${i}`,
                    fromNumber: CALLER_NUMBER,
                    toNumber: CALLED_NUMBER,
                    status: "COMPLETED" as const,
                    turns: [],
                    startedAt: Date.now() - 10 * 60 * 1000,
                });
            }
        });

        const again = await dial(t, {
            CallSid: "CA-again",
            From: CALLER_NUMBER,
            To: CALLED_NUMBER,
        });
        expect(await again.text()).toContain("called several times");

        // A different caller is unaffected by somebody else's redialling.
        const other = await dial(t, {
            CallSid: "CA-other",
            From: "+447700900999",
            To: CALLED_NUMBER,
        });
        expect(await other.text()).toContain("A.I. assistant");
    });

    test("calls from an hour ago no longer count against the redial ceiling", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await withOwnership(t);
        vi.stubEnv("TELEPHONY_MAX_CALLS_PER_NUMBER_PER_HOUR", "2");

        await t.run(async (ctx) => {
            for (let i = 0; i < 2; i += 1) {
                await ctx.db.insert("phoneCalls", {
                    companyId,
                    providerCallId: `CA-yesterday-${i}`,
                    fromNumber: CALLER_NUMBER,
                    toNumber: CALLED_NUMBER,
                    status: "COMPLETED" as const,
                    turns: [],
                    startedAt: Date.now() - 2 * 60 * 60 * 1000,
                });
            }
        });

        const response = await dial(t, {
            CallSid: "CA-fresh",
            From: CALLER_NUMBER,
            To: CALLED_NUMBER,
        });
        expect(await response.text()).toContain("A.I. assistant");
    });

    test("a company out of plan hears call-back-later; answering spends one conversation", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        const companyId = await withOwnership(t);

        const planId = await t.run(async (ctx) =>
            ctx.db.insert("plans", {
                name: "Small",
                messageLimit: 5,
                priceGBP: 10,
                isActive: true,
                createdAt: Date.now(),
            })
        );
        await t.run(async (ctx) =>
            ctx.db.patch(companyId, { planId, messagesUsedThisPeriod: 4 })
        );

        // One conversation left: this call takes it.
        const first = await dial(t, { CallSid: "CA-q1", From: CALLER_NUMBER, To: CALLED_NUMBER });
        expect(await first.text()).toContain("A.I. assistant");
        const company = await t.run(async (ctx) => ctx.db.get(companyId));
        expect(company?.messagesUsedThisPeriod).toBe(5);

        // The plan is now exhausted: the next caller is told kindly.
        const second = await dial(t, {
            CallSid: "CA-q2",
            From: "+447700900888",
            To: CALLED_NUMBER,
        });
        expect(await second.text()).toContain("call back later");
    });

    test("a company on no plan is not rationed", async () => {
        const t = convexTest(schema, import.meta.glob("./**/*.*s"));
        await withOwnership(t);

        const response = await dial(t, {
            CallSid: "CA-noplan",
            From: CALLER_NUMBER,
            To: CALLED_NUMBER,
        });
        expect(await response.text()).toContain("A.I. assistant");
    });
});
