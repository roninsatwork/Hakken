# Telegram: Setting Up the Bot

Telegram is another way in to the same Assistant as Ask Hakken
([hakken-tasks-plan.md](../plans/active/hakken-tasks-plan.md), item 6.1). One
bot serves the whole platform; each person links their own chat from their
profile with a ten-minute code. Until the bot is set up, the profile shows no
Telegram section.

## What you need

- A Telegram account, on your phone or at web.telegram.org.
- Access to the backend environment (`npx convex env set`).

## Steps

1. **Create the bot.** In Telegram, open **@BotFather** and send `/newbot`.
   - Give it the name people will see: **AskHakken** for now.
   - Give it a username ending in `bot`, such as `AskHakkenBot`.
   - BotFather replies with the bot's key (a token such as `123456:ABC…`).
     Treat it as a password.
2. **Give the backend the key and a secret.** The secret is any long random
   string: Telegram sends it back with every message, so the backend knows
   the message came from Telegram.

   ```bash
   npx convex env set TELEGRAM_BOT_TOKEN '<the key from BotFather>'
   npx convex env set TELEGRAM_WEBHOOK_SECRET "$(openssl rand -hex 32)"
   ```

3. **Connect the bot to this deployment.** This reads the bot's name from
   Telegram, keeps it for the profile, and tells Telegram to send the bot's
   messages to `<CONVEX_SITE_URL>/telegram/webhook`:

   ```bash
   npx convex run telegramActions:setUpTelegram
   ```

   It answers `{ ok: true, username: "AskHakkenBot" }`, or says in plain words
   what to fix.

4. **Check it.** Open your profile, find Telegram, search for the bot in
   Telegram and send it your code. It replies that you're linked.

Each deployment (development, production) runs its own step 3: Telegram sends
a bot's messages to one address at a time, so the last deployment set up is
the one that answers.

## What it does

- **Linking.** A code from the profile links one person to one chat. Linking
  again from another chat unlinks the first; a chat linked by someone else is
  moved to them. Unlink on the profile stops everything.
- **Asking.** A linked chat's messages are answered by the Assistant, with the
  same limits and redaction as Ask Hakken, in a conversation of its own that
  Ask Hakken also lists. Offers come with their two buttons.
- **Alerts and reports.** A task tells its owner in Telegram too, once they are
  linked. Replying "why?" asks about it.
- **A chat that isn't linked** is told how to link and nothing else. Group
  chats are ignored.

## Changing the key

Set the new `TELEGRAM_BOT_TOKEN` and run step 3 again. Changing the secret also
needs step 3, so Telegram sends the new one.
