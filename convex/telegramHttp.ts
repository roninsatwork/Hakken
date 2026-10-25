import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { constantTimeEqual } from "./utils/security";
import { readBoundedBody } from "./utils/boundedRequestBody";

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
  update_id?: number;
  message?: { chat?: TelegramChat; from?: TelegramUser; text?: string };
  callback_query?: { id?: string; data?: string; message?: { message_id?: number; chat?: TelegramChat } };
};

const MOST_CHARACTERS = 4096;
const TELEGRAM_WEBHOOK_MAX_BODY_BYTES = 128 * 1024;

export const handleTelegramWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const given = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!secret || !constantTimeEqual(given, secret)) return new Response("Forbidden", { status: 403 });

  const bounded = await readBoundedBody(request, TELEGRAM_WEBHOOK_MAX_BODY_BYTES);
  if (!bounded.ok) {
    return new Response("Bad request", { status: bounded.reason === "too_large" ? 413 : 400 });
  }

  let update: TelegramUpdate;
  try {
    update = JSON.parse(bounded.text) as TelegramUpdate;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (!Number.isSafeInteger(update.update_id) || (update.update_id ?? -1) < 0) {
    return new Response("Bad request", { status: 400 });
  }
  const message = update.message;
  let forwarded:
    | { kind: "MESSAGE"; chatId: string; text: string; telegramName?: string; languageCode?: string }
    | { kind: "TAP"; chatId: string; tapId: string; data: string; telegramMessageId?: number }
    | undefined;
  if (message?.chat?.id !== undefined && message.chat.type === "private" && typeof message.text === "string" && message.text.trim()) {
    const from = message.from;
    const telegramName = from?.username ? `@${from.username}` : from?.first_name;
    forwarded = {
      kind: "MESSAGE",
      chatId: String(message.chat.id),
      text: message.text.trim().slice(0, MOST_CHARACTERS),
      ...(telegramName ? { telegramName: telegramName.slice(0, 64) } : {}),
      ...(from?.language_code ? { languageCode: from.language_code.slice(0, 16) } : {}),
    };
  }

  const tap = update.callback_query;
  const tapChat = tap?.message?.chat;
  if (!forwarded && tap?.id && typeof tap.data === "string" && tapChat?.id !== undefined && tapChat.type === "private") {
    forwarded = {
      kind: "TAP",
      chatId: String(tapChat.id),
      tapId: tap.id,
      data: tap.data.slice(0, 64),
      ...(typeof tap.message?.message_id === "number" ? { telegramMessageId: tap.message.message_id } : {}),
    };
  }

  await ctx.runMutation(internal.telegram.claimWebhookUpdateInternal, {
    updateId: update.update_id as number,
    ...(forwarded ? { update: forwarded } : {}),
  });
  return new Response("ok", { status: 200 });
});
