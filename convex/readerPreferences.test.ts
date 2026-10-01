import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { queueOutboxMessage } from "./outbox";
import { ensureReaderPreferences } from "./readerPreferences";
import schema from "./schema";
import { signWebhook } from "./utils/webhookSignature";

/**
 * Subscribing, language, unsubscribing and bounces (docs/plans/active/
 * knowledge-news-and-digest-plan.md, phase 8) — all before any customer gets
 * an email. What must hold: every user gets the digest until they turn it
 * off; it is written in the language they last used; the link in the email
 * and a mail client's one-click both turn it off, and nothing else does; a
 * digest is never sent without a way to stop; and an address that bounced or
 * complained is never sent to again, on Resend's signed word only.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

const SECRET = `whsec_${btoa("a-test-signing-secret-of-enough-length")}`;

async function reader(t: ReturnType<typeof harness>, email = "anna@korda.example") {
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", { name: "Anna", email, role: "USER" }));
  return { userId, as: t.withIdentity({ subject: userId }) };
}

const tokenOf = (t: ReturnType<typeof harness>, userId: Id<"users">) =>
  t.run(async (ctx) => (await ensureReaderPreferences(ctx, userId)).unsubscribeToken);

async function digestFor(t: ReturnType<typeof harness>, userId: Id<"users">, email: string) {
  return await t.run(async (ctx) => {
    const issueId = await ctx.db.insert("weeklyDigestIssues", { weekKey: "2026-W40", introEn: "A quiet week.", itemIds: [], mode: "LIVE", createdAt: Date.now() });
    return (await queueOutboxMessage(ctx, {
      messageType: "WEEKLY_NEWS_DIGEST", userId, email, language: "en", payload: { issueId }, idempotencyKey: `digest:${userId}`,
    }))!;
  });
}

const render = (t: ReturnType<typeof harness>, messageId: Id<"outboxMessages">) =>
  t.query(internal.outboxTemplates.renderOutboxMessage, { messageId });

describe("a reader's choices", () => {
  test("every user gets the digest, in English, until they turn it off on their profile", async () => {
    const t = harness();
    const { as } = await reader(t);

    expect(await as.query(api.readerPreferences.getMyEmailPreferences, {})).toEqual({ newsDigest: true, language: "en" });
    await as.mutation(api.readerPreferences.setMyNewsDigest, { subscribed: false });
    expect(await as.query(api.readerPreferences.getMyEmailPreferences, {})).toMatchObject({ newsDigest: false });
    await as.mutation(api.readerPreferences.setMyNewsDigest, { subscribed: true });
    expect(await as.query(api.readerPreferences.getMyEmailPreferences, {})).toMatchObject({ newsDigest: true });
  });

  test("the language they last used is kept, from a switch or a sign-in, and only one the app is read in", async () => {
    const t = harness();
    const { as } = await reader(t);

    await as.mutation(api.readerPreferences.recordMyLanguage, { language: "it" });
    expect(await as.query(api.readerPreferences.getMyEmailPreferences, {})).toMatchObject({ language: "it" });
    await as.mutation(api.readerPreferences.recordMyLanguage, { language: "klingon" });
    expect(await as.query(api.readerPreferences.getMyEmailPreferences, {})).toMatchObject({ language: "it" });
    await as.mutation(api.users.recordLogin, { device: "test", ip: "1.1.1.1", location: "London", language: "en" });
    expect(await as.query(api.readerPreferences.getMyEmailPreferences, {})).toMatchObject({ language: "en" });
  });
});

describe("unsubscribing", () => {
  test("the page's button turns the digest off with the link's token, and a wrong token does nothing", async () => {
    const t = harness();
    const { userId, as } = await reader(t);
    const token = await tokenOf(t, userId);

    expect(await t.mutation(api.readerPreferences.unsubscribeWithToken, { token: "0".repeat(64) })).toBe(false);
    expect(await t.mutation(api.readerPreferences.unsubscribeWithToken, { token: "not-a-token" })).toBe(false);
    expect(await as.query(api.readerPreferences.getMyEmailPreferences, {})).toMatchObject({ newsDigest: true });

    expect(await t.mutation(api.readerPreferences.unsubscribeWithToken, { token })).toBe(true);
    expect(await as.query(api.readerPreferences.getMyEmailPreferences, {})).toMatchObject({ newsDigest: false });
  });

  test("a mail client's one-click unsubscribe is a POST to the platform, and answers the same whatever the token", async () => {
    const t = harness();
    const { userId, as } = await reader(t);
    const token = await tokenOf(t, userId);

    expect((await t.fetch(`/api/email/unsubscribe?token=${"f".repeat(64)}`, { method: "POST" })).status).toBe(200);
    expect(await as.query(api.readerPreferences.getMyEmailPreferences, {})).toMatchObject({ newsDigest: true });
    expect((await t.fetch(`/api/email/unsubscribe?token=${token}`, { method: "POST" })).status).toBe(200);
    expect(await as.query(api.readerPreferences.getMyEmailPreferences, {})).toMatchObject({ newsDigest: false });
  });

  test("a digest goes only to a reader who has it on, and never without a way to stop", async () => {
    const t = harness();
    const { userId, as } = await reader(t);
    const noWayToStop = await digestFor(t, userId, "anna@korda.example");
    expect(await render(t, noWayToStop)).toEqual({ skip: "It has no way to unsubscribe yet, so it is not sent." });

    await tokenOf(t, userId);
    expect(await render(t, noWayToStop)).toHaveProperty("email");
    await as.mutation(api.readerPreferences.setMyNewsDigest, { subscribed: false });
    expect(await render(t, noWayToStop)).toEqual({ skip: "The reader turned the Weekly News Digest off." });
  });
});

describe("bounces and complaints", () => {
  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  async function deliver(t: ReturnType<typeof harness>, event: unknown, options: { secret?: string; secondsAgo?: number } = {}) {
    const body = JSON.stringify(event);
    const id = "msg_test";
    const timestamp = String(Math.floor(Date.now() / 1000) - (options.secondsAgo ?? 0));
    const signature = await signWebhook({ secret: options.secret ?? SECRET, id, timestamp, body });
    return await t.fetch("/api/webhooks/resend", {
      method: "POST",
      headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` },
      body,
    });
  }

  test("a signed bounce stops every later email to that address", async () => {
    const t = harness();
    const { userId } = await reader(t, "Gone@Korda.example");
    await tokenOf(t, userId);
    const messageId = await digestFor(t, userId, "Gone@Korda.example");

    const response = await deliver(t, { type: "email.bounced", data: { email_id: "re_1", to: ["gone@korda.example"] } });

    expect(response.status).toBe(200);
    expect(await render(t, messageId)).toEqual({ skip: "This address bounced, so nothing more is sent to it." });
  });

  test("a complaint stops them too; other events change nothing", async () => {
    const t = harness();
    const { userId } = await reader(t, "angry@korda.example");
    await tokenOf(t, userId);
    const messageId = await digestFor(t, userId, "angry@korda.example");

    await deliver(t, { type: "email.delivered", data: { email_id: "re_1", to: ["angry@korda.example"] } });
    expect(await render(t, messageId)).toHaveProperty("email");
    await deliver(t, { type: "email.complained", data: { email_id: "re_1", to: ["angry@korda.example"] } });
    expect(await render(t, messageId)).toEqual({ skip: "This reader marked an email as spam, so nothing more is sent to them." });
  });

  test("a delivery that is unsigned, signed with another secret, or old is refused and changes nothing", async () => {
    const t = harness();
    const bounce = { type: "email.bounced", data: { to: ["anna@korda.example"] } };

    expect((await t.fetch("/api/webhooks/resend", { method: "POST", body: JSON.stringify(bounce) })).status).toBe(401);
    expect((await deliver(t, bounce, { secret: `whsec_${btoa("someone-else's-secret-entirely")}` })).status).toBe(401);
    expect((await deliver(t, bounce, { secondsAgo: 60 * 60 })).status).toBe(401);
    expect(await t.run(async (ctx) => await ctx.db.query("emailSuppressions").collect())).toEqual([]);
  });
});
