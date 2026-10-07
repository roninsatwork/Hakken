import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { constantTimeEqual } from "./utils/security";

/**
 * Telegram's messages in (docs/plans/active/hakken-tasks-plan.md, item 6.1):
 * only from Telegram — the secret it was given when the bot was set up
 * (`telegramActions.setUpTelegram`) comes back with each one — and only what
 * a private chat says or which button it tapped. Answered in the background,
 * so Telegram hears "received" at once and never sends the same twice.
 */

type TelegramChat = { id?: number | string; type?: string };
type TelegramUser = { id?: number; first_name?: string; username?: string; language_code?: string };
type TelegramUpdate = {
  message?: { chat?: TelegramChat; from?: TelegramUser; text?: string };
  callback_query?: { id?: string; data?: string; message?: { message_id?: number; chat?: TelegramChat } };
};

const MOST_CHARACTERS = 4096;

export const handleTelegramWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const given = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!secret || !constantTimeEqual(given, secret)) return new Response("Forbidden", { status: 403 });

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const message = update.message;
  if (message?.chat?.id !== undefined && message.chat.type === "private" && typeof message.text === "string" && message.text.trim()) {
    const from = message.from;
    const telegramName = from?.username ? `@${from.username}` : from?.first_name;
    await ctx.scheduler.runAfter(0, internal.telegramActions.handleUpdateInternal, {
      update: {
        kind: "MESSAGE",
        chatId: String(message.chat.id),
        text: message.text.trim().slice(0, MOST_CHARACTERS),
        ...(telegramName ? { telegramName: telegramName.slice(0, 64) } : {}),
        ...(from?.language_code ? { languageCode: from.language_code.slice(0, 16) } : {}),
      },
    });
  }

  const tap = update.callback_query;
  const tapChat = tap?.message?.chat;
  if (tap?.id && typeof tap.data === "string" && tapChat?.id !== undefined && tapChat.type === "private") {
    await ctx.scheduler.runAfter(0, internal.telegramActions.handleUpdateInternal, {
      update: {
        kind: "TAP",
        chatId: String(tapChat.id),
        tapId: tap.id,
        data: tap.data.slice(0, 64),
        ...(typeof tap.message?.message_id === "number" ? { telegramMessageId: tap.message.message_id } : {}),
      },
    });
  }
  return new Response("ok", { status: 200 });
});
