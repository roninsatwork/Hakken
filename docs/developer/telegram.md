---
product: Hakken
documentation_type: developer guide
feature_area: Telegram assistant channel
audience: developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/telegram.md
last_reviewed: '2026-10-26T15:16:13+00:00'
reviewed_against: current implementation
status: Current
---
# Telegram

> **Product:** Hakken · **Document type:** developer guide · **Feature area:** Telegram assistant channel
> **Reviewed:** 26 October 2026, 15:16:13 GMT (Europe/London)
> **Source path:** `docs/developer/telegram.md` · **Status:** Current


## Architecture and setup boundary

Telegram uses `convex/telegram.ts` for persisted linking/conversation state,
`telegramActions.ts` for Bot API calls and Assistant relay,
`telegramHttp.ts` for inbound webhook validation, and `telegramSchema.ts`
for tables. The profile page is
`src/app/(dashboard)/app/profile/integrations/telegram/page.tsx`.
The [user guide](../end-user/telegram.md) covers linking and ordinary use;
the existing [operator setup runbook](../operator/telegram.md) remains the
place for deployment commands.

The bot token comes from `TELEGRAM_BOT_TOKEN`, its webhook secret from
`TELEGRAM_WEBHOOK_SECRET`, and the HTTP origin from `CONVEX_SITE_URL`.
`setUpTelegram` reads the bot identity, stores display metadata and configures
`/telegram/webhook`. It is an internal action that changes a live external
service and must not be invoked during documentation maintenance. A single
bot's last configured webhook deployment wins; local configuration support
is not evidence the intended production endpoint is receiving messages.

The channel answers through the same built-in Assistant as typed Ask Hakken.
It is not a second instruction/knowledge assembly. Supported text and
callback-button inputs should not be documented as browser-equivalent
photo, upload or voice-note support when those inputs are not forwarded by
the webhook parser.

## Personal linking and company association

`myTelegram`, `newTelegramCode` and `unlinkTelegram` use tenant builders.
A new code resolves the tenant and records its user and company with a
ten-minute expiry. Generating another code replaces prior user codes.
`myTelegram` returns the configured bot, current link and code metadata for
the profile. Do not expose the operator's bot token alongside that display
information.

`redeemCodeInternal` resolves a code by `by_code`, consumes it, checks expiry
and user existence, unlinks conflicting old associations and creates a
user-owned Telegram thread for the recorded company. One chat per person
and one person per chat are explicit invariants. Relinking is replacement,
not group access or a many-account inbox. A code is authorization material
within its lifetime and must not be copied into telemetry or guide examples
as a real value.

`unlink` removes the stored link and uses `tellInTelegram` to disable
Telegram channels on up to 300 non-deleted tasks in that user's linked
company. Existing conversation history remains. Linking enables the
applicable task channel. These bounded side effects are part of channel
behavior, not a permanent deletion cascade for tasks, messages or Telegram's
external copies.

## Webhook authentication and replay handling

`handleTelegramWebhook` compares
`X-Telegram-Bot-Api-Secret-Token` with the configured secret using
`constantTimeEqual`. A missing or mismatched secret returns 403 before
forwarding work. `readBoundedBody` enforces a 128 KiB body ceiling, malformed
JSON is refused and `update_id` must be a non-negative safe integer.
Keep those checks before scheduling any model or mutation work.

The parser forwards non-empty text only from `chat.type === "private"`.
It also recognizes callback queries whose associated message has a private
chat. Group inputs are not answered. Message text is trimmed and capped at
4,096 characters, callback data and display names are bounded, and only a
small explicit update shape reaches the worker. A generic provider JSON
object is not passed into the Assistant as authority.

`claimWebhookUpdateInternal` atomically checks `telegramWebhookUpdates`
by update ID, records a receipt and schedules `handleUpdateInternal` once.
Duplicate delivery returns without booking another worker. Receipt cleanup
is bounded to 50 old rows per admitted update with a seven-day retention
threshold. This is local replay suppression, not an unlimited exactly-once
external messaging guarantee: expired receipts and provider delivery failures
still have their own boundaries.

The HTTP response acknowledges receipt after admission while processing
happens asynchronously. An HTTP 200 does not establish that the Assistant
finished, a task was accepted or a response reached Telegram. Keep admission,
model completion and delivery evidence distinct in diagnostics.

## Questions use the shared chat safeguards

`saveQuestionInternal` resolves the chat link, thread and user before storing
content. It applies the per-thread message rate check, `resolveChatQuota`,
PII configuration/redaction and the relevant usage increment rather than
creating an unrestricted alternate posting path. `resolveChatQuota` includes
the paid-company access policy before overrides. A Telegram request cannot
legitimately bypass an expired subscription with an unlimited personal
message plan.

The worker handles linking/start messages separately from ordinary questions.
An unlinked chat receives setup guidance rather than company data. Normal
admitted text schedules the Assistant in the linked user's thread and
company. The same shared instruction and reading spine applies, but channel
presentation and provider length constraints remain distinct from the web
client's streaming and rich components.

`threadLinkInternal`, `chatLinkInternal` and `userLinkInternal` supply narrow
link context for relay/delivery. Use them rather than a model-produced chat
ID or company argument. Losing the link while a run is underway must not be
interpreted as permission to send future private output to an arbitrary
replacement address.

## Proposal buttons and task delivery

`telegramActions` renders Yes/No callbacks associated with stored proposal
messages. The callback handler resolves the linked chat/user and validates
its conversation before calling `hakkenTasks.answerProposalInternal`.
The underlying proposal helper requires thread ownership and a company,
then accepts only a pending state. Repeated taps return the completed or
declined result instead of replaying CREATE, RESEARCH or a state change.

The bot's callback acknowledgment is not the task write itself. If a task
confirmation fails, preserve the failure and message state rather than
showing a fabricated success. Relinking a chat does not give its new owner
authority over another person's old proposal simply because the button
remains in Telegram history.

`sendToUserInternal` uses the user's stored link for supported task messages.
The message can be recorded into that conversation so follow-up questions
have context about an alert/report. This is separate from Outbox email and
its hourly sender. Unsubscribing from optional email does not globally
turn off Telegram, nor does unlinking Telegram cancel the underlying task.
See [Hakken Tasks](./hakken-tasks.md) for scheduling and source conditions.

## Tables, retention and tests

`telegramLinks` associates user, company, chat and thread with indexes for
lookup by user/chat/thread. `telegramLinkCodes` indexes by code and user;
`telegramBots` holds non-secret display identity; and
`telegramWebhookUpdates` indexes by update ID and receipt time. Conversation
content stays in ordinary threads/messages rather than an unrelated bot-only
transcript store.

Ten-minute linking expiry, seven-day replay-receipt retention and personal
conversation retention are different policies. Unlinking does not delete
messages in Hakken or the external chat. This review did not establish a
universal permanent-erasure cascade for all channel records; formal deletion
claims require the actual account/purge paths reviewed separately.

`telegram.test.ts` covers expired codes, relinking invariants, unlink,
private-chat handling, shared question limits, proposal ownership, task
messages and setup behavior. Future tests should also preserve the atomic
update-claim contract and bounded-body/secret checks: counting a successful
worker response alone would miss duplicate-admission or unauthorized-input
regressions.

This pass read selected source and test declarations without running a bot
setup, webhook call, Telegram session, Assistant response, task or application
test. For a reported fault, inspect link state, target deployment, receipt
admission, conversation state and delivery outcome in that order. Use
sanitized identifiers; never ask the user to send a live code, webhook secret
or bot token as diagnostic evidence.

The profile's code-expiry timer only changes presentation. Server redemption
still checks `expiresAt`, so a stale browser cannot extend a code's life.
Keep that server check when changing the profile, and preserve the
confirmation step for unlinking rather than treating a hidden code as an
unlinked account.

## Linking and message evidence

A valid account link establishes which Hakken user owns a Telegram conversation; it does not independently prove that the latest webhook update was admitted, that the Assistant finished, or that Telegram accepted a reply. Diagnose those stages separately. A successful local secret check also does not verify the public webhook URL after a deployment or domain cutover. Use the [operator setup guide](../operator/telegram.md) for that separate configuration workflow.
