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
 * an email; then each type of email a person may choose (outbox-and-
 * preferences-plan.md, B1). What must hold: every user gets each until they
 * turn it off; it is written in the language they last used; the link in the
 * email and a mail client's one-click both turn off the type it names, and
 * nothing else does; a digest is never sent without a way to stop; and an address that bounced or
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

const onOf = async (as: Awaited<ReturnType<typeof reader>>["as"], communication: string) =>
  (await as.query(api.readerPreferences.getMyEmailPreferences, {})).choices.find((choice) => choice.communication === communication)?.on;

describe("a reader's choices", () => {
  test("every user gets every email they may choose, in English, until they turn one off; and all at once", async () => {
    const t = harness();
    const { as } = await reader(t);

    // Weekly website performance joins when its email is built (outbox-and-preferences-plan.md, B1).
    expect(await as.query(api.readerPreferences.getMyEmailPreferences, {})).toEqual({
      language: "en",
      choices: [{ communication: "WEEKLY_NEWS_DIGEST", on: true }, { communication: "HAKKEN_TASKS", on: true }],
    });
    await as.mutation(api.readerPreferences.setMyEmail, { communication: "WEEKLY_NEWS_DIGEST", on: false });
    await as.mutation(api.readerPreferences.setMyEmail, { communication: "HAKKEN_TASKS", on: false });
    expect([await onOf(as, "WEEKLY_NEWS_DIGEST"), await onOf(as, "HAKKEN_TASKS")]).toEqual([false, false]);
    await as.mutation(api.readerPreferences.setAllMyEmails, { on: true });
    expect([await onOf(as, "WEEKLY_NEWS_DIGEST"), await onOf(as, "HAKKEN_TASKS")]).toEqual([true, true]);
    await as.mutation(api.readerPreferences.setAllMyEmails, { on: false });
    expect([await onOf(as, "WEEKLY_NEWS_DIGEST"), await onOf(as, "HAKKEN_TASKS")]).toEqual([false, false]);
  });

  test("a task's alert carries its own way to stop Hakken tasks emails; turning them off changes how their tasks tell them", async () => {
    const t = harness();
    const { userId, as } = await reader(t, "jo@example.co.uk");
    const token = await tokenOf(t, userId);
    const { taskId, messageId } = await t.run(async (ctx) => {
      const now = Date.now();
      const companyId = await ctx.db.insert("companies", { name: "Example", createdAt: now });
      const websiteId = await ctx.db.insert("websites", { host: "example.co.uk", displayHost: "example.co.uk", firstSeenAt: now });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: now });
      const taskId = await ctx.db.insert("hakkenTasks", {
        companyId, userId, kind: "ALERT", title: "Tell me if example.co.uk gets fewer than 10 visitors a day", measure: "visitors",
        target: { companyWebsiteId: holdId, website: "example.co.uk" }, condition: { op: "below", value: 10, days: 1 },
        timeOfDay: "09:00", timeZone: "Europe/London", channels: { bell: true, email: true, telegram: false }, state: "ON", createdAt: now, updatedAt: now,
      } as never);
      const messageId = (await queueOutboxMessage(ctx, {
        messageType: "TASK_ALERT", userId, email: "jo@example.co.uk", language: "en", idempotencyKey: "TASK_ALERT:1",
        payload: { taskId, day: "2026-10-05", value: 7, usual: 23, measure: "visitors", link: "/app/hakken-tasks", headline: "7 visitors on Monday", body: "It had 7 visitors." },
      }))!;
      return { taskId, messageId };
    });

    const rendered = await render(t, messageId);
    expect("email" in rendered && rendered.email.text).toContain(`/unsubscribe?token=${token}&kind=HAKKEN_TASKS`);
    expect("email" in rendered && rendered.email.headers["List-Unsubscribe"]).toContain("kind=HAKKEN_TASKS");

    await as.mutation(api.readerPreferences.setMyEmail, { communication: "HAKKEN_TASKS", on: false });
    expect((await t.run((ctx) => ctx.db.get(taskId)))?.channels.email).toBe(false);
    expect(await render(t, messageId)).toEqual({ skip: "Turned off on their profile." });
    await as.mutation(api.readerPreferences.setMyEmail, { communication: "HAKKEN_TASKS", on: true });
    expect((await t.run((ctx) => ctx.db.get(taskId)))?.channels.email).toBe(true);
  });

  test("a type nobody may choose cannot be turned off", async () => {
    const t = harness();
    const { userId, as } = await reader(t);

    await as.mutation(api.readerPreferences.setMyEmail, { communication: "SYSTEM_HEALTH", on: false });
    expect(await t.query(internal.readerPreferences.isEmailOnInternal, { userId, communication: "SYSTEM_HEALTH" })).toBe(true);
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
  test("the page's button turns off the email its link names, with the link's token; a wrong token does nothing", async () => {
    const t = harness();
    const { userId, as } = await reader(t);
    const token = await tokenOf(t, userId);

    expect(await t.mutation(api.readerPreferences.unsubscribeWithToken, { token: "0".repeat(64) })).toBe(false);
    expect(await t.mutation(api.readerPreferences.unsubscribeWithToken, { token: "not-a-token" })).toBe(false);
    expect(await t.mutation(api.readerPreferences.unsubscribeWithToken, { token, kind: "SYSTEM_HEALTH" })).toBe(false);
    expect(await onOf(as, "WEEKLY_NEWS_DIGEST")).toBe(true);

    // A link from before the types names none: it stops the digest, as it always did.
    expect(await t.mutation(api.readerPreferences.unsubscribeWithToken, { token })).toBe(true);
    expect([await onOf(as, "WEEKLY_NEWS_DIGEST"), await onOf(as, "HAKKEN_TASKS")]).toEqual([false, true]);
    expect(await t.mutation(api.readerPreferences.unsubscribeWithToken, { token, kind: "HAKKEN_TASKS" })).toBe(true);
    expect(await onOf(as, "HAKKEN_TASKS")).toBe(false);
  });

  test("a mail client's one-click unsubscribe is a POST to the platform, and answers the same whatever the token", async () => {
    const t = harness();
    const { userId, as } = await reader(t);
    const token = await tokenOf(t, userId);

    expect((await t.fetch(`/api/email/unsubscribe?token=${"f".repeat(64)}`, { method: "POST" })).status).toBe(200);
    expect(await onOf(as, "HAKKEN_TASKS")).toBe(true);
    expect((await t.fetch(`/api/email/unsubscribe?token=${token}&kind=HAKKEN_TASKS`, { method: "POST" })).status).toBe(200);
    expect([await onOf(as, "WEEKLY_NEWS_DIGEST"), await onOf(as, "HAKKEN_TASKS")]).toEqual([true, false]);
  });

  test("a digest goes only to a reader who has it on, and never without a way to stop", async () => {
    const t = harness();
    const { userId, as } = await reader(t);
    const noWayToStop = await digestFor(t, userId, "anna@korda.example");
    expect(await render(t, noWayToStop)).toEqual({ skip: "It has no way to unsubscribe yet, so it is not sent." });

    await tokenOf(t, userId);
    expect(await render(t, noWayToStop)).toHaveProperty("email");
    await as.mutation(api.readerPreferences.setMyEmail, { communication: "WEEKLY_NEWS_DIGEST", on: false });
    expect(await render(t, noWayToStop)).toEqual({ skip: "Turned off on their profile." });
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
