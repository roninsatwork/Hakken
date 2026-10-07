import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { appUrl } from "./outboxTemplates";
import { appErrorMessage } from "./utils/appError";
import { emailWording } from "./utils/emailWording";
import { linkCodeOf, telegramHtml } from "./utils/telegramText";

/**
 * The bot (docs/plans/active/hakken-tasks-plan.md, item 6.1): what a linked
 * chat says is answered by the same Assistant as Ask Hakken
 * (`hakkenAssistant.answerInternal`) and relayed back, an offer's two buttons
 * with it; a code links a chat; anything else is told how to link. Alerts and
 * reports reach a linked person here too. Telegram's address carries the bot's
 * key from the backend environment (`TELEGRAM_BOT_TOKEN`), never stored; its
 * messages come in through `telegramHttp.ts`.
 */

type TelegramReply = { ok: boolean; result?: unknown; description?: string };
type Keyboard = Array<Array<{ text: string; callback_data: string }>>;

function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

/** One call to Telegram's Bot API; a failure is its own answer, never thrown. */
async function telegram(method: string, body: Record<string, unknown>): Promise<TelegramReply> {
  const token = botToken();
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN is not set" };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await response.json()) as TelegramReply;
  } catch (error) {
    return { ok: false, description: error instanceof Error ? error.message : String(error) };
  }
}

function plainOf(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
}

/** A message to a chat, in Telegram's HTML; should Telegram refuse its tags, the same words as plain text. */
async function send(chatId: string, html: string, keyboard?: Keyboard): Promise<boolean> {
  const markup = keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {};
  const sent = await telegram("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...markup });
  if (sent.ok) return true;
  const plain = await telegram("sendMessage", { chat_id: chatId, text: plainOf(html), link_preview_options: { is_disabled: true }, ...markup });
  if (!plain.ok) console.error("Telegram refused a message", sent.description, plain.description);
  return plain.ok;
}

/** Their language as Telegram says it, for a chat not linked yet. */
function languageOfChat(languageCode: string | undefined): string {
  return languageCode?.toLowerCase().startsWith("it") ? "it" : "en";
}

/** The newest reply since a moment, sent to the conversation's chat — its words, its chart's link, an offer's buttons. Nothing for a conversation that is not a Telegram one. */
async function relay(ctx: ActionCtx, threadId: Id<"threads">, since: number): Promise<void> {
  const link = await ctx.runQuery(internal.telegram.threadLinkInternal, { threadId });
  if (!link) return;
  const reply = await ctx.runQuery(internal.telegram.newestReplyInternal, { threadId, since });
  if (!reply) return;
  const words = emailWording(link.language).telegram;
  const app = appUrl();
  const content = reply.chartLink ? `${reply.content}\n\n${words.seeChart({ link: `${app}${reply.chartLink}` })}` : reply.content;
  const proposal = reply.taskProposal;
  const buttons = proposal ? words.buttons({ action: proposal.action, report: Boolean(proposal.report) }) : null;
  await send(link.chatId, telegramHtml(content, app), buttons ? [[
    { text: buttons.yes, callback_data: `y:${reply.messageId}` },
    { text: buttons.no, callback_data: `n:${reply.messageId}` },
  ]] : undefined);
}

const messageValidator = v.object({
  kind: v.literal("MESSAGE"),
  chatId: v.string(),
  text: v.string(),
  telegramName: v.optional(v.string()),
  languageCode: v.optional(v.string()),
});

const tapValidator = v.object({
  kind: v.literal("TAP"),
  chatId: v.string(),
  tapId: v.string(),
  /** Telegram's id for the message the buttons are on, to take them off once answered. */
  telegramMessageId: v.optional(v.number()),
  data: v.string(),
});

/** What a person sent the bot, or which button they tapped: answered in its chat. */
export const handleUpdateInternal = internalAction({
  args: { update: v.union(messageValidator, tapValidator) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { platformName } = await ctx.runQuery(internal.settings.getEmailBranding, {});
    const update = args.update;
    if (update.kind === "TAP") {
      await answerTap(ctx, update);
      return null;
    }

    const link = await ctx.runQuery(internal.telegram.chatLinkInternal, { chatId: update.chatId });
    const code = linkCodeOf(update.text.replace(/^\/start\b/i, ""));
    if (code) {
      const linked = await ctx.runMutation(internal.telegram.redeemCodeInternal, {
        code, chatId: update.chatId, ...(update.telegramName ? { telegramName: update.telegramName } : {}),
      });
      if (!linked.ok) {
        const words = emailWording(link?.language ?? languageOfChat(update.languageCode)).telegram;
        await send(update.chatId, telegramHtml(linked.reason === "EXPIRED" ? words.codeExpired : words.codeUnknown, appUrl()));
        return null;
      }
      const now = await ctx.runQuery(internal.telegram.chatLinkInternal, { chatId: update.chatId });
      const welcome = emailWording(now?.language ?? "en").telegram.welcome({ name: linked.name, platformName });
      await send(update.chatId, telegramHtml(welcome, appUrl()));
      await ctx.runMutation(internal.telegram.saveSentInternal, { threadId: linked.threadId, content: welcome });
      return null;
    }
    if (!link || /^\/start\b/i.test(update.text)) {
      // Nothing is answered for a chat that is not linked: only how to link it.
      const words = emailWording(link?.language ?? languageOfChat(update.languageCode)).telegram;
      await send(update.chatId, telegramHtml(link ? words.alreadyLinked({ platformName }) : words.intro({ platformName }), appUrl()));
      return null;
    }

    const saved = await ctx.runMutation(internal.telegram.saveQuestionInternal, { chatId: update.chatId, text: update.text });
    if (!saved.ok) {
      if (saved.reply) await send(update.chatId, telegramHtml(saved.reply, appUrl()));
      return null;
    }
    await telegram("sendChatAction", { chat_id: update.chatId, action: "typing" });
    await send(update.chatId, telegramHtml(emailWording(link.language).telegram.lookingIntoIt, appUrl()));
    try {
      await ctx.runAction(internal.hakkenAssistant.answerInternal, { threadId: saved.threadId, content: saved.content, receivedAt: saved.receivedAt });
    } catch (error) {
      // Never left waiting: an answer that failed says so, as Ask Hakken does.
      console.error("The Assistant could not answer in Telegram", error);
      await send(update.chatId, telegramHtml(emailWording(link.language).telegram.couldNotAnswer, appUrl()));
      return null;
    }
    await relay(ctx, saved.threadId, saved.receivedAt);
    return null;
  },
});

/** An offer's button: answered as the tap in Ask Hakken is, by the conversation's owner only, and said back. */
async function answerTap(ctx: ActionCtx, tap: typeof tapValidator.type): Promise<void> {
  await telegram("answerCallbackQuery", { callback_query_id: tap.tapId });
  const link = await ctx.runQuery(internal.telegram.chatLinkInternal, { chatId: tap.chatId });
  if (!link) return;
  const words = emailWording(link.language).telegram;
  const match = /^([yn]):(.+)$/.exec(tap.data);
  const messageId = match ? await ctx.runQuery(internal.telegram.messageOfThreadInternal, { threadId: link.threadId, messageId: match[2] }) : null;
  if (!match || !messageId) {
    await send(tap.chatId, telegramHtml(words.notThere, appUrl()));
    return;
  }
  if (tap.telegramMessageId !== undefined) {
    await telegram("editMessageReplyMarkup", { chat_id: tap.chatId, message_id: tap.telegramMessageId, reply_markup: { inline_keyboard: [] } });
  }
  const yes = match[1] === "y";
  try {
    const before = await ctx.runQuery(internal.telegram.proposalOfInternal, { messageId });
    const answer = await ctx.runMutation(internal.hakkenTasks.answerProposalInternal, { userId: link.userId, messageId, yes });
    const answered = before && answer.status === (yes ? "DONE" : "DECLINED");
    await send(tap.chatId, telegramHtml(answered ? words.tapped({ yes, action: before.action, report: before.report }) : words.notThere, appUrl()));
  } catch (error) {
    await send(tap.chatId, telegramHtml(appErrorMessage(error, words.notThere), appUrl()));
  }
}

/**
 * Something to tell a person in their chat — an alert, a report — and kept in
 * their Telegram conversation, so replying "why?" is a question about it.
 * Nothing when they have not linked one.
 */
export const sendToUserInternal = internalAction({
  args: { userId: v.id("users"), text: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const link = await ctx.runQuery(internal.telegram.userLinkInternal, { userId: args.userId });
    if (!link) return false;
    const sent = await send(link.chatId, telegramHtml(args.text, appUrl()));
    if (sent) await ctx.runMutation(internal.telegram.saveSentInternal, { threadId: link.threadId, content: args.text });
    return sent;
  },
});

/** A reply written in the background — "find out why"'s write-up — relayed when its conversation is a Telegram one. */
export const relayInternal = internalAction({
  args: { threadId: v.id("threads"), since: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await relay(ctx, args.threadId, args.since);
    return null;
  },
});

/**
 * Setting the bot up, once its key is in the backend environment
 * (docs/operator/telegram.md): its name read from Telegram and kept for the
 * profile, and Telegram told where to send its messages — this deployment's
 * address, with the secret it must send back.
 */
export const setUpTelegram = internalAction({
  args: {},
  returns: v.object({ ok: v.boolean(), username: v.optional(v.string()), problem: v.optional(v.string()) }),
  handler: async (ctx): Promise<{ ok: boolean; username?: string; problem?: string }> => {
    if (!botToken()) return { ok: false, problem: "Set TELEGRAM_BOT_TOKEN in the backend environment first." };
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    const site = process.env.CONVEX_SITE_URL?.trim().replace(/\/+$/, "");
    if (!secret) return { ok: false, problem: "Set TELEGRAM_WEBHOOK_SECRET in the backend environment first." };
    if (!site) return { ok: false, problem: "This deployment has no CONVEX_SITE_URL." };
    const me = await telegram("getMe", {});
    const bot = me.result as { username?: string; first_name?: string } | undefined;
    if (!me.ok || !bot?.username) return { ok: false, problem: `Telegram did not accept the key: ${me.description ?? "no answer"}` };
    const hook = await telegram("setWebhook", {
      url: `${site}/telegram/webhook`,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    });
    if (!hook.ok) return { ok: false, problem: `Telegram did not take the address: ${hook.description ?? "no answer"}` };
    await ctx.runMutation(internal.telegram.saveBotInternal, { username: bot.username, name: bot.first_name ?? bot.username });
    return { ok: true, username: bot.username };
  },
});
