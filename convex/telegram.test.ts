import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * Telegram, another way in to the same Assistant
 * (docs/plans/active/hakken-tasks-plan.md, item 6.1): a ten-minute code links
 * one person to one chat; nothing is answered for a chat that is not linked;
 * an offer's button acts only in its own conversation; alerts reach a linked
 * chat and are kept in its conversation. Telegram itself is faked.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

let sent: Array<{ method: string; body: Record<string, unknown> }> = [];

beforeEach(() => {
  sent = [];
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456:test-key");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    sent.push({ method: String(url).split("/").pop() ?? "", body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
    return new Response(JSON.stringify({ ok: true, result: { username: "AskHakkenBot", first_name: "AskHakken" } }));
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

const said = () => sent.filter((call) => call.method === "sendMessage").map((call) => String(call.body.text));

async function seed(t: Harness) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: now });
    const me = await ctx.db.insert("users", { name: "Anthony Basker", email: "anthony@ronins.test", role: "USER", companyId, createdAt: now });
    const colleague = await ctx.db.insert("users", { name: "Jo Hughes", email: "jo@ronins.test", role: "USER", companyId, createdAt: now });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.test", displayHost: "ronins.test", firstSeenAt: now });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: now });
    await ctx.db.insert("telegramBots", { username: "AskHakkenBot", name: "AskHakken", setUpAt: now });
    return { companyId, me, colleague, siteId };
  });
}

type Seeded = Awaited<ReturnType<typeof seed>>;

async function aTask(t: Harness, seeded: Seeded, userId: Id<"users">) {
  return await t.mutation(internal.hakkenTasks.createInternal, {
    companyId: seeded.companyId, userId, kind: "ALERT", title: "Tell me if ronins.test gets fewer than 10 visitors a day", measure: "visitors",
    target: { companyWebsiteId: seeded.siteId, website: "ronins.test" }, condition: { op: "below", value: 10, days: 1 },
    channels: { bell: true, email: true, telegram: false },
  } as never);
}

async function message(t: Harness, chatId: string, text: string) {
  vi.useFakeTimers();
  await t.action(internal.telegramActions.handleUpdateInternal, { update: { kind: "MESSAGE", chatId, text, telegramName: "@anthony" } });
  await finishScheduled(t);
  vi.useRealTimers();
}

async function link(t: Harness, userId: Id<"users">, chatId: string) {
  const { code } = await t.withIdentity({ subject: userId }).mutation(api.telegram.newTelegramCode, {});
  await message(t, chatId, `${code.slice(0, 3)} ${code.slice(3)}`);
  return code;
}

describe("linking a Telegram chat", () => {
  test("a code from the profile links the chat, in a conversation of its own, and the person's tasks tell them there too", async () => {
    const t = harness();
    const seeded = await seed(t);
    const taskId = await aTask(t, seeded, seeded.me);

    const code = await link(t, seeded.me, "1001");

    expect(said()).toEqual(["You’re linked, Anthony! I’ll send your Hakken alerts here, and you can ask me anything, just like in Hakken."]);
    const mine = await t.withIdentity({ subject: seeded.me }).query(api.telegram.myTelegram, {});
    expect(mine).toMatchObject({ bot: { username: "AskHakkenBot", name: "AskHakken" }, linked: { telegramName: "@anthony" }, code: null });
    const linked = await t.query(internal.telegram.chatLinkInternal, { chatId: "1001" });
    expect(linked).toMatchObject({ userId: seeded.me, companyId: seeded.companyId, language: "en" });
    const thread = await t.run((ctx) => ctx.db.get(linked!.threadId));
    expect(thread).toMatchObject({ userId: seeded.me, companyId: seeded.companyId, title: "Telegram" });
    expect((await t.run((ctx) => ctx.db.get(taskId)))?.channels.telegram).toBe(true);

    // A code works once.
    sent = [];
    await message(t, "2002", code);
    expect(said()).toEqual(["I don’t know that code. Check it on your profile, or get a new one there."]);
  });

  test("a code that has run out links nothing", async () => {
    const t = harness();
    const seeded = await seed(t);
    await t.run((ctx) => ctx.db.insert("telegramLinkCodes", { userId: seeded.me, companyId: seeded.companyId, code: "482913", expiresAt: Date.now() - 1, createdAt: Date.now() - 600_001 }));

    await message(t, "1001", "/start 482913");

    expect(said()).toEqual(["That code has run out. Get a new one on your profile and send it to me."]);
    expect(await t.query(internal.telegram.chatLinkInternal, { chatId: "1001" })).toBeNull();
  });

  test("nothing is answered for a chat that is not linked: it is only told how to link", async () => {
    const t = harness();
    await seed(t);

    await message(t, "1001", "How many visitors did ronins.test get yesterday?");

    expect(said()).toEqual(["Hello! I’m Hakken. To talk with me here, open your profile in Hakken, find Telegram, and send me the code you see there."]);
    expect(await t.run((ctx) => ctx.db.query("messages").collect())).toEqual([]);
  });

  test("one chat per person and one person per chat: linking again unlinks the old, and their tasks stop saying Telegram", async () => {
    const t = harness();
    const seeded = await seed(t);
    const myTask = await aTask(t, seeded, seeded.me);
    await link(t, seeded.me, "1001");
    await link(t, seeded.me, "2002");
    expect(await t.query(internal.telegram.chatLinkInternal, { chatId: "1001" })).toBeNull();
    expect(await t.query(internal.telegram.chatLinkInternal, { chatId: "2002" })).toMatchObject({ userId: seeded.me });

    await link(t, seeded.colleague, "2002");

    expect(await t.query(internal.telegram.chatLinkInternal, { chatId: "2002" })).toMatchObject({ userId: seeded.colleague });
    expect(await t.query(internal.telegram.userLinkInternal, { userId: seeded.me })).toBeNull();
    expect((await t.run((ctx) => ctx.db.get(myTask)))?.channels.telegram).toBe(false);
  });

  test("unlinking from the profile stops everything going there", async () => {
    const t = harness();
    const seeded = await seed(t);
    const taskId = await aTask(t, seeded, seeded.me);
    await link(t, seeded.me, "1001");

    await t.withIdentity({ subject: seeded.me }).mutation(api.telegram.unlinkTelegram, {});

    expect(await t.query(internal.telegram.chatLinkInternal, { chatId: "1001" })).toBeNull();
    expect((await t.run((ctx) => ctx.db.get(taskId)))?.channels.telegram).toBe(false);
    sent = [];
    expect(await t.action(internal.telegramActions.sendToUserInternal, { userId: seeded.me, text: "Heads up" })).toBe(false);
    expect(sent).toEqual([]);
  });
});

describe("talking with the Assistant in Telegram", () => {
  test("a question is saved into its conversation with the same limits as Ask Hakken", async () => {
    const t = harness();
    const seeded = await seed(t);
    await link(t, seeded.me, "1001");

    const saved = await t.mutation(internal.telegram.saveQuestionInternal, { chatId: "1001", text: "why?" });
    expect(saved).toMatchObject({ ok: true, userId: seeded.me, content: "why?" });

    for (let index = 0; index < 9; index += 1) await t.mutation(internal.telegram.saveQuestionInternal, { chatId: "1001", text: `again ${index}` });
    expect(await t.mutation(internal.telegram.saveQuestionInternal, { chatId: "1001", text: "one more" })).toEqual({ ok: false, reply: "That's a lot at once: give me a moment, then try again." });
  });

  test("an offer's button answers it as a tap in Ask Hakken would, and only in its own conversation", async () => {
    const t = harness();
    const seeded = await seed(t);
    const taskId = await aTask(t, seeded, seeded.me);
    await link(t, seeded.me, "1001");
    await link(t, seeded.colleague, "3003");
    const mine = (await t.query(internal.telegram.chatLinkInternal, { chatId: "1001" }))!;
    const offer = await t.run((ctx) => ctx.db.insert("messages", {
      threadId: mine.threadId, role: "assistant", content: "Shall I pause it?", createdAt: Date.now(),
      taskProposal: { action: "PAUSE", status: "PENDING", title: "Tell me if ronins.test gets fewer than 10 visitors a day", taskId },
    }));

    // The colleague's chat cannot answer an offer in someone else's conversation.
    sent = [];
    await t.action(internal.telegramActions.handleUpdateInternal, { update: { kind: "TAP", chatId: "3003", tapId: "tap-1", data: `y:${offer}`, telegramMessageId: 7 } });
    expect(said()).toEqual(["That offer isn’t there any more."]);
    expect((await t.run((ctx) => ctx.db.get(taskId)))?.state).toBe("ON");

    sent = [];
    await t.action(internal.telegramActions.handleUpdateInternal, { update: { kind: "TAP", chatId: "1001", tapId: "tap-2", data: `y:${offer}`, telegramMessageId: 8 } });
    expect(said()).toEqual(["Paused."]);
    expect(sent.map((call) => call.method)).toEqual(["answerCallbackQuery", "editMessageReplyMarkup", "sendMessage"]);
    expect((await t.run((ctx) => ctx.db.get(taskId)))?.state).toBe("PAUSED");
  });

  test("an alert reaches a linked chat and is kept in its conversation, so “why?” is about it", async () => {
    const t = harness();
    const seeded = await seed(t);
    await link(t, seeded.me, "1001");
    sent = [];

    const text = "Heads up: your page had a quiet day. It had **7 visitors** from Google.";
    expect(await t.action(internal.telegramActions.sendToUserInternal, { userId: seeded.me, text })).toBe(true);

    expect(said()).toEqual(["Heads up: your page had a quiet day. It had <b>7 visitors</b> from Google."]);
    const { threadId } = (await t.query(internal.telegram.chatLinkInternal, { chatId: "1001" }))!;
    const kept = await t.run((ctx) => ctx.db.query("messages").withIndex("by_thread_role_created", (q) => q.eq("threadId", threadId)).collect());
    expect(kept.map((row) => row.content)).toContain(text);
  });
});

describe("Telegram's messages in", () => {
  test("only with the secret Telegram was given, and answered in the background", async () => {
    const t = harness();
    await seed(t);
    const update = { message: { chat: { id: 1001, type: "private" }, from: { id: 1001, first_name: "Anthony" }, text: "hello" } };

    const refused = await t.fetch("/telegram/webhook", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong" }, body: JSON.stringify(update) });
    expect(refused.status).toBe(403);

    vi.useFakeTimers();
    const taken = await t.fetch("/telegram/webhook", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "test-secret" }, body: JSON.stringify(update) });
    expect(taken.status).toBe(200);
    await finishScheduled(t);
    vi.useRealTimers();
    expect(said()).toEqual(["Hello! I’m Hakken. To talk with me here, open your profile in Hakken, find Telegram, and send me the code you see there."]);
  });

  test("a group chat is not answered", async () => {
    const t = harness();
    await seed(t);
    const update = { message: { chat: { id: -500, type: "group" }, text: "hello" } };

    vi.useFakeTimers();
    await t.fetch("/telegram/webhook", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "test-secret" }, body: JSON.stringify(update) });
    await finishScheduled(t);
    vi.useRealTimers();
    expect(sent).toEqual([]);
  });
});

describe("setting the bot up", () => {
  test("reads its name from Telegram and tells Telegram where to send its messages, with the secret", async () => {
    const t = harness();
    vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");

    expect(await t.action(internal.telegramActions.setUpTelegram, {})).toEqual({ ok: true, username: "AskHakkenBot" });

    const hook = sent.find((call) => call.method === "setWebhook");
    expect(hook?.body).toMatchObject({ url: "https://example.convex.site/telegram/webhook", secret_token: "test-secret" });
    expect(await t.query(internal.telegram.botInternal, {})).toEqual({ username: "AskHakkenBot", name: "AskHakken" });
  });
});
