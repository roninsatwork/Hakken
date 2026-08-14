import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

/**
 * The receptionist screen's doors. What matters: a widget must opt in
 * before the kiosk serves anything, the minted token is a real session
 * credential and the only one, spoken turns land in the anonymous
 * conversation, and the per-widget session window holds — a kiosk cannot be
 * a quota side-channel (kiosk plan, commitment 4).
 */

async function seedKioskWidget(t: ReturnType<typeof convexTest>, kioskEnabled: boolean) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Front Desk Co", createdAt: Date.now() });
    const widgetId = await ctx.db.insert("widgets", {
      companyId,
      name: "Reception",
      allowedDomains: [],
      isActive: true,
      ...(kioskEnabled ? { kioskEnabled: true } : {}),
      createdAt: Date.now(),
    });
    return { companyId, widgetId };
  });
}

describe("the receptionist screen", () => {
  beforeEach(() => {
    vi.stubEnv("VOICE_RELAY_URL", "wss://relay.example/live");
    vi.stubEnv("VOICE_RELAY_SECRET", "kiosk-test-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("a widget that has not opted in serves nothing at all", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { widgetId } = await seedKioskWidget(t, false);

    await expect(t.query(api.kiosk.getKioskConfig, { widgetId })).resolves.toBeNull();
    await expect(t.mutation(api.kiosk.createKioskThread, { widgetId })).resolves.toBeNull();
    // The heartbeat writes nothing on a non-kiosk widget.
    await t.mutation(api.kiosk.recordKioskHeartbeat, { widgetId });
    const widget = await t.run(async (ctx) => ctx.db.get(widgetId));
    expect(widget?.kioskLastSeenAt).toBeUndefined();
  });

  test("an opted-in kiosk names the company, mints a working session, and records spoken turns", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { widgetId } = await seedKioskWidget(t, true);

    const config = await t.query(api.kiosk.getKioskConfig, { widgetId });
    expect(config).toMatchObject({ companyName: "Front Desk Co" });

    const session = await t.mutation(api.kiosk.createKioskThread, { widgetId });
    expect(session).not.toBeNull();
    const { threadId, accessToken } = session!;

    // The spoken turn lands in the conversation — with the token, and only
    // with the token.
    await expect(
      t.mutation(api.kiosk.recordKioskVoiceTurn, {
        threadId,
        widgetAccessToken: "wrong-token",
        userText: "Hello",
        assistantText: "Welcome in!",
      })
    ).rejects.toThrow("Unauthorized");

    await t.mutation(api.kiosk.recordKioskVoiceTurn, {
      threadId,
      widgetAccessToken: accessToken,
      userText: "Hello",
      assistantText: "Welcome in!",
    });

    const messages = await t.query(api.chat.getMessages, { threadId, widgetAccessToken: accessToken });
    expect(messages?.map((message) => message.content)).toEqual(["Hello", "Welcome in!"]);

    // And a later visitor's token cannot open this conversation (decision 3:
    // it forgets between visitors).
    const nextSession = await t.mutation(api.kiosk.createKioskThread, { widgetId });
    await expect(
      t.query(api.chat.getMessages, { threadId, widgetAccessToken: nextSession!.accessToken })
    ).resolves.toBeNull();
  });

  test("the voice session is gated on the token and counted per widget", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { widgetId } = await seedKioskWidget(t, true);
    const session = await t.mutation(api.kiosk.createKioskThread, { widgetId });
    const { threadId, accessToken } = session!;

    await expect(
      t.action(api.kioskActions.createKioskVoiceSession, {
        widgetId,
        threadId,
        widgetAccessToken: "wrong-token",
      })
    ).rejects.toThrow("Unauthorized");

    // No realtime model is configured in this test deployment, so the honest
    // answer is a calm refusal — never a thrown stack for a visitor-facing
    // surface (commitment 3).
    const result = await t.action(api.kioskActions.createKioskVoiceSession, {
      widgetId,
      threadId,
      widgetAccessToken: accessToken,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("not available");

    // The tap still consumed a session slot and beat the heart.
    const widget = await t.run(async (ctx) => ctx.db.get(widgetId));
    expect(widget?.kioskSessionCount).toBe(1);
    expect(widget?.kioskLastSeenAt).toBeGreaterThan(0);
  });

  test("the per-widget hourly session window refuses the sixty-first tap", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { widgetId } = await seedKioskWidget(t, true);

    await t.run(async (ctx) => {
      await ctx.db.patch(widgetId, {
        kioskSessionWindowStart: Date.now() - 60_000,
        kioskSessionCountInWindow: 60,
      });
    });

    // Reserved through the internal door the voice session uses.
    const reservation = await t.mutation(internal.kiosk.reserveKioskSession, { widgetId });
    expect(reservation).toMatchObject({ ok: false });
  });
});
