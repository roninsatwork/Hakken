import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MAY_HAVE_GONE, OUTBOX_CLAIM_MS, queueOutboxMessage } from "./outbox";
import schema from "./schema";

/**
 * The outbox and the Email Sender (docs/plans/active/knowledge-news-and-
 * digest-plan.md, phase 7). What must hold: queuing the same email twice
 * queues it once; the Sender sends each waiting email once, in its reader's
 * language, with its idempotency key, and records Resend's receipt; a failure
 * is tried again later and fails for good after three tries; a reader who is
 * gone is skipped; a claim that died is returned, or failed when it may have
 * gone; and with no sender address set, nothing is sent and the run says why.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

async function world(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const agentId = await ctx.db.insert("agents", {
      name: "Email Sender", modelId: "none", thinkingMode: false, isActive: true, systemKey: "EMAIL_SENDER", createdAt: now, updatedAt: now,
    });
    const anna = await ctx.db.insert("users", { name: "Anna", email: "anna@korda.example", role: "USER" });
    const marco = await ctx.db.insert("users", { name: "Marco", email: "marco@korda.example", role: "USER" });
    const itemId = await ctx.db.insert("newsItems", {
      kind: "WEBSITE", sourceName: "The Blog", titleEn: "Google changes local results", summaryEn: "Maps answers moved up.",
      meaningEn: "Check your Business Profile.", url: "https://blog.example/news/local", publishedAt: Date.UTC(2026, 8, 29), externalKey: "k1", createdAt: now,
    });
    const issueId = await ctx.db.insert("weeklyDigestIssues", {
      weekKey: "2026-W40", introEn: "A quiet week, with one change to local results.", itemIds: [itemId], mode: "LIVE", createdAt: now,
    });
    return { agentId, anna, marco, issueId };
  });
}

async function queue(t: ReturnType<typeof harness>, userId: Id<"users">, email: string, language: string, issueId: Id<"weeklyDigestIssues">) {
  return await t.run(async (ctx) => await queueOutboxMessage(ctx, {
    messageType: "WEEKLY_NEWS_DIGEST", userId, email, language, payload: { issueId },
    idempotencyKey: `WEEKLY_NEWS_DIGEST:2026-W40:${userId}`,
  }));
}

async function send(t: ReturnType<typeof harness>, agentId: Id<"agents">) {
  const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
    agentId, triggerType: "MANUAL", objective: "send", status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
  }));
  await t.action(internal.newsAgentRunActions.runNewsRoleNow, { role: "EMAIL_SENDER", runId });
  return await t.run(async (ctx) => await ctx.db.get(runId));
}

const rows = (t: ReturnType<typeof harness>) => t.run(async (ctx) => await ctx.db.query("outboxMessages").collect());

type Sent = { url: string; headers: Record<string, string>; body: { from: string; to: string; subject: string; html: string; text: string } };

function resend(answer: (call: number) => Response) {
  const sent: Sent[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return answer(sent.length);
  });
  vi.stubGlobal("fetch", fetch);
  return sent;
}

describe("the outbox", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.NEWS_DIGEST_FROM_EMAIL = "News <news@hakken.example>";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.NEWS_DIGEST_FROM_EMAIL;
  });

  test("the same email queued twice is queued once", async () => {
    const t = harness();
    const { anna, issueId } = await world(t);

    expect(await queue(t, anna, "anna@korda.example", "en", issueId)).not.toBeNull();
    expect(await queue(t, anna, "anna@korda.example", "en", issueId)).toBeNull();
    expect(await rows(t)).toHaveLength(1);
  });

  test("each waiting email is sent once, in its reader's language, with its idempotency key and Resend's receipt kept", async () => {
    const t = harness();
    const { agentId, anna, marco, issueId } = await world(t);
    await queue(t, anna, "anna@korda.example", "en", issueId);
    await queue(t, marco, "marco@korda.example", "it", issueId);
    const sent = resend((call) => Response.json({ id: `re_${call}` }));

    const finished = await send(t, agentId);

    expect(finished).toMatchObject({ status: "SUCCESS", finalOutput: "Sent 2 emails." });
    expect(sent.map((call) => [call.url, call.body.to, call.body.from])).toEqual([
      ["https://api.resend.com/emails", "anna@korda.example", "News <news@hakken.example>"],
      ["https://api.resend.com/emails", "marco@korda.example", "News <news@hakken.example>"],
    ]);
    expect(sent[0].headers["Idempotency-Key"]).toBe(`WEEKLY_NEWS_DIGEST:2026-W40:${anna}`);
    expect(sent[0].body.subject).toMatch(/^This week in search, from /);
    expect(sent[1].body.subject).toMatch(/^Questa settimana nella ricerca, da /);
    expect(sent[0].body.text).toContain("Google changes local results");
    expect(sent[0].body.text).toContain("A quiet week, with one change to local results.");
    expect((await rows(t)).map((row) => [row.status, row.resendId, row.attempts])).toEqual([["SENT", "re_1", 1], ["SENT", "re_2", 1]]);

    // Nothing is sent again.
    expect((await send(t, agentId))?.finalOutput).toBe("Nothing is waiting in the outbox.");
    expect(sent).toHaveLength(2);
  });

  test("a failed send is tried again later, and fails for good after three tries", async () => {
    const t = harness();
    const { agentId, anna, issueId } = await world(t);
    await queue(t, anna, "anna@korda.example", "en", issueId);
    resend(() => Response.json({ message: "The from address is not verified." }, { status: 422 }));

    expect((await send(t, agentId))?.finalOutput).toBe("Sent 0 emails; 1 failed and will be tried again later.");
    const after = (await rows(t))[0];
    expect(after).toMatchObject({ status: "WAITING", attempts: 1 });
    expect(after.dueAt).toBeGreaterThan(Date.now());

    // Due again, twice more.
    for (const run of [2, 3]) {
      await t.run(async (ctx) => await ctx.db.patch(after._id, { dueAt: Date.now() - 1 }));
      const finished = await send(t, agentId);
      if (run === 3) expect(finished?.finalOutput).toBe("Sent 0 emails; 1 failed for good.");
    }
    expect((await rows(t))[0]).toMatchObject({ status: "FAILED", attempts: 3 });
  });

  test("a reader who is no longer a user is skipped, saying why", async () => {
    const t = harness();
    const { agentId, anna, issueId } = await world(t);
    await queue(t, anna, "anna@korda.example", "en", issueId);
    await t.run(async (ctx) => await ctx.db.delete(anna));
    const sent = resend(() => Response.json({ id: "re_1" }));

    expect((await send(t, agentId))?.finalOutput).toBe("Sent 0 emails; 1 skipped.");
    expect((await rows(t))[0]).toMatchObject({ status: "SKIPPED", error: "The reader is no longer a user." });
    expect(sent).toHaveLength(0);
  });

  test("with no sender address set, nothing is sent and the run says why", async () => {
    const t = harness();
    const { agentId, anna, issueId } = await world(t);
    await queue(t, anna, "anna@korda.example", "en", issueId);
    delete process.env.NEWS_DIGEST_FROM_EMAIL;
    const sent = resend(() => Response.json({ id: "re_1" }));

    const finished = await send(t, agentId);

    expect(finished).toMatchObject({ status: "FAILED" });
    expect(finished?.finalOutput).toMatch(/^NEWS_DIGEST_FROM_EMAIL is not set, so nothing was sent/);
    expect((await rows(t))[0]).toMatchObject({ status: "WAITING", attempts: 0 });
    expect(sent).toHaveLength(0);
  });

  test("a claim that died is given back, or failed when its send had started", async () => {
    const t = harness();
    const { agentId, anna, marco, issueId } = await world(t);
    const neverPosted = await queue(t, anna, "anna@korda.example", "en", issueId);
    const posted = await queue(t, marco, "marco@korda.example", "it", issueId);
    const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
      agentId, triggerType: "MANUAL", objective: "send", status: "FAILED", startedAt: Date.now(), updatedAt: Date.now(),
    }));
    const long = Date.now() - OUTBOX_CLAIM_MS - 1000;
    await t.run(async (ctx) => {
      await ctx.db.patch(neverPosted!, { status: "CLAIMED", claimedBy: runId, claimedAt: long });
      await ctx.db.patch(posted!, { status: "CLAIMED", claimedBy: runId, claimedAt: long, postedAt: long, attempts: 1 });
    });

    expect(await t.mutation(internal.outbox.reclaimOutbox, {})).toEqual({ returned: 1, failed: 1 });
    const read = await t.run(async (ctx) => [await ctx.db.get(neverPosted!), await ctx.db.get(posted!)]);
    expect(read[0]).toMatchObject({ status: "WAITING" });
    expect(read[1]).toMatchObject({ status: "FAILED", error: MAY_HAVE_GONE });
  });

  test("Admin's list and an email's own page, for super admins only", async () => {
    const t = harness();
    const { anna, issueId } = await world(t);
    const messageId = await queue(t, anna, "anna@korda.example", "en", issueId);
    const superAdmin = await t.run(async (ctx) => await ctx.db.insert("users", { email: "admin@hakken.example", role: "SUPER_ADMIN" }));
    const admin = t.withIdentity({ subject: superAdmin });

    const page = await admin.query(api.outboxAdmin.listOutboxForAdmin, { paginationOpts: { numItems: 15, cursor: null }, status: "WAITING" });
    expect(page.page).toMatchObject([{ email: "anna@korda.example", status: "WAITING", messageType: "WEEKLY_NEWS_DIGEST" }]);
    const one = await admin.query(api.outboxAdmin.getOutboxMessageForAdmin, { messageId: messageId! });
    expect(one?.preview).toMatchObject({ subject: expect.stringMatching(/^This week in search/) });

    await expect(t.withIdentity({ subject: anna }).query(api.outboxAdmin.listOutboxForAdmin, { paginationOpts: { numItems: 15, cursor: null } }))
      .rejects.toThrow();
  });
});
