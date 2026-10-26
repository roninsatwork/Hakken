---
product: Hakken
documentation_type: end-user guide
feature_area: Telegram assistant channel
audience: signed-in company members
source_repository: roninsatwork/Hakken
source_path: docs/end-user/telegram.md
last_reviewed: '2026-10-26T09:19:03+00:00'
reviewed_against: current implementation
status: Current
---
# Telegram

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Telegram assistant channel
> **Reviewed:** 26 October 2026, 09:19:03 GMT (Europe/London)
> **Source path:** `docs/end-user/telegram.md` · **Status:** Current

## Another door to Ask Hakken

Telegram lets you ask the same Assistant through a private chat with the
platform's bot. Linking associates that chat with your Hakken user and
company, creates its own conversation, and lets supported Hakken task alerts
and reports reach you there. It does not create a separate unrestricted
assistant or grant access to another company's figures.

The channel is useful when you want a short question or task notification
on your phone. Use the main [Ask Hakken](./assistant-chat.md) interface when
you need its file/photo controls, live voice, richer charts or full report
screens. The reviewed Telegram inbound path accepts private text messages
and supported proposal buttons. Do not assume that sending a voice note,
photo or group message exercises the browser's corresponding feature.

This guide describes implementation reviewed on the date above. It does
not establish that the bot is configured on your deployment or that a live
message has been accepted. The platform operator must set up the bot first;
that is different from each person's account-linking step.

## Find the integration

Open your profile and select **Integrations**, then Telegram. The direct
page is `/app/profile/integrations/telegram`, with a return link to
`/app/profile?tab=integrations`. If the deployment has no configured bot,
the integrations list may offer no Telegram app. Ask the operator about bot
setup rather than searching for a random similarly named bot.

The integration page shows the configured bot and either the current link
or a linking code. The code identifies your signed-in Hakken account and
company context. Before linking, check that you are using the right Hakken
account and intended company. A personal Telegram chat linked in one client
context should not be mistaken for a company-wide shared mailbox.

You do not enter the bot's platform token on this page. That token belongs
to the operator's backend configuration. Your short-lived linking code has
a different purpose: it tells the already configured bot which person to
associate with the private chat. Never substitute a provider secret or your
account password for that code.

## Link through Open Telegram or the code

Use **Open Telegram** and press Start in the bot conversation. The generated
start link carries your current linking code. Alternatively, follow the
page's instructions to send the displayed code to that bot. The code lasts
ten minutes. If it has expired, obtain the current one from the integration
page rather than forwarding or repeatedly reusing an old link.

Treat the linking code as personal. Anyone redeeming it can establish the
association represented by that code during its valid window. Do not share
it in a group, paste it into a support ticket or send it to a different bot.
Once linked, verify the page shows the expected Telegram identity and link
time before relying on the channel for private company questions.

The model is one person per Telegram chat and one chat per person. Linking
again can replace the previous association. If the chat was associated with
another person, redeeming a new person's code moves the link rather than
creating a shared group of accounts. This makes it especially important to
use your own private chat and account when linking.

## Ask questions and find the conversation later

After linking, send text in the private bot chat. The platform saves your
message into a Hakken conversation and schedules the built-in Assistant's
response. The conversation belongs to your user and is also visible through
Ask Hakken's personal history. You can return to the app to inspect the
thread rather than keeping Telegram as the only record of the discussion.

Questions use the linked company's context and the shared instruction and
knowledge assembly. Existing company restrictions, message limits, paid
access checks and redaction behavior still apply. Telegram is not a way to
bypass an exhausted allowance or obtain another tenant's knowledge.
A refusal in the bot should be investigated through the same source and
account context as a refusal in Ask Hakken.

Keep messages reasonably short. The inbound webhook caps forwarded text at
4,096 characters, so a long document pasted into Telegram is not equivalent
to a supported file upload. If the detail matters, use an appropriately
scoped document workflow in the main app and ask a concise question there.
A short reply also should not be treated as a full source audit merely
because it came from the same Assistant.

## Confirm proposals deliberately

Supported Assistant proposals can show Yes and No buttons in Telegram.
Review the task title, website, condition, timing and side effects before
pressing one. The button answers the stored proposal associated with your
linked conversation; it is not a general platform approval token that can
be forwarded to authorize unrelated work.

A proposal already answered returns its recorded state rather than creating
another copy when the button is tapped again. If a button no longer applies
or the chat was relinked, open the Hakken conversation and inspect the
current proposal. Do not infer that a task was created merely because a
button remains visible in Telegram's older message history.

Some accepted proposals add a tracked question/search, create recurring
work or start background research. They are real actions governed by the
proposal and task rules, not ordinary chat reactions. Read
[Hakken Tasks](./hakken-tasks.md) before relying on their monitoring and
delivery behavior.

## Alerts, reports and follow-up context

Linking enables Telegram delivery on applicable existing Hakken tasks in
the linked company. A task's own source and condition still determine when
anything is sent. Telegram does not independently refresh every tracked
search or AI question merely because the channel has been connected.

When an alert/report is sent through the linked-user path, it can also be
recorded in the Telegram-backed Hakken conversation. That gives a short
reply such as “why?” context about the preceding alert. Check the website,
source dates and threshold in that context before treating the alert as
proof of a cause or a completed fix.

Telegram delivery is separate from optional email. Turning task email off
on your profile does not necessarily unlink Telegram or cancel the task.
Likewise, unlinking Telegram does not delete the task's bell or email
configuration. See [Emails From Hakken](./emails.md) for the different
communication preferences and queued email timing.

## Unlink and change accounts

Use **Unlink** on the Telegram integration page and confirm the choice.
The backend removes the link and disables Telegram on applicable tasks
for that association. It stops future platform delivery to that linked
chat and prevents further normal questions there from being answered as
your account.

Unlinking does not erase the existing Hakken conversation or messages already
sent to Telegram. Those are retained under their own systems. A formal data
removal request is different from disconnecting a channel and requires the
relevant retention/account process. Do not assume deleting a local Telegram
chat performs a Hakken deletion.

To move to another private chat, link it deliberately from the correct
profile context. The previous association is replaced. If you did not expect
a replacement or recognize the identity shown, unlink and ask the operator
to investigate the account association without sharing your linking code.

## If messages do not arrive

Check whether the integration page says linked, whether the bot matches the
configured one, and whether your message was private text. Group chats are
ignored. An unlinked chat receives linking guidance rather than private
company answers. A task sending nothing can also mean its condition was
not met or its source has not been collected again.

The operator's bot can point to only one webhook deployment at a time.
Reconfiguring the same bot on a different environment can move where its
messages go. That is an operator setup issue; repeatedly generating personal
codes will not correct a webhook pointed at another deployment.

For support, provide your account context, linked/unlinked state, approximate
time, affected task or conversation and visible error. Do not include the
linking code, bot token or webhook secret. The
[developer guide](../developer/telegram.md) describes replay protection,
private-chat filtering and account boundaries. This documentation review
opened no Telegram session, configured no webhook and sent no messages.
