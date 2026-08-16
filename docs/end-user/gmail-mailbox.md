# Gmail Mailbox

The Gmail mailbox connector lets Sonae watch one dedicated Gmail account for a
workspace and answer incoming mail from that account. It is for a shared mailbox,
not a personal inbox. The point is that people can still open Gmail and inspect
the real conversation: received mail, sent replies, and the label Sonae applies
after handling a message.

This is separate from [Emails From Sonae](./emails.md). Those are outbound
platform messages such as invites, approval requests, alerts, and agent
notifications. The Gmail mailbox is an inbound channel: a customer emails the
dedicated address, Sonae reads the conversation, replies when company knowledge
can answer it, or creates a task when a person needs to follow up.

## What It Does

When the Gmail connector is installed and connected:

- An admin connects a dedicated Gmail account from the connector detail screen
  under `/admin/ai/tools/connectors/[id]`.
- Sonae polls connected mailboxes once a minute.
- New inbox messages are recorded before any action is taken, so the same
  message is not answered twice during overlapping polls.
- Bulk mail, spam, drafts, no-reply senders, promotions, and messages sent by
  the mailbox itself are skipped.
- For normal inbound mail, Sonae reads the whole Gmail thread, searches company
  knowledge, and writes a reply in the sender's language.
- If the answer is grounded enough, the reply is sent in the same Gmail thread
  and appears in the mailbox's Sent folder.
- If the sender needs a person, Sonae still sends a holding reply and creates a
  task for follow-up.
- If the sender matches a known customer, the customer Wiki page can be updated
  from the exchange after the reply is sent.

Handled messages are labelled `Sonae` in Gmail. A colleague opening the mailbox
should be able to see which messages Sonae has dealt with.

## What It Will Not Do

The mailbox connector is deliberately reply-only:

- It does not start new outbound emails.
- It does not add recipients.
- It does not reply to no-reply or bulk addresses.
- It does not answer mail from another company's connector.
- It does not use a personal mailbox.
- It does not treat the AI answer as final when the sender needs a bespoke
  quote, complaint handling, account-specific decision, or anything else outside
  the knowledge base.

Automatic replies are also rate-limited. A conversation that was answered only
moments ago, a thread that has hit its daily reply cap, or a mailbox that has
hit its daily send ceiling is routed to a human task instead of another
automatic reply.

## Connecting A Mailbox

Open the installed Gmail connector from `/admin/ai/tools`. The connector detail
page shows a connected-account panel for OAuth connectors.

When the mailbox is not connected, choose **Connect mailbox**. Sonae opens
Google's own approval screen. The platform stores a scoped, revocable token; it
does not see or store the mailbox password. After Google redirects back, the
connector shows the connected account and connection time.

When disconnecting, Sonae revokes the token at Google and then removes its
stored token. The Gmail account itself is untouched.

## Human Follow-Up

When Sonae decides a person is needed, it creates a task and sends a holding
reply so the sender is not left with silence. The task includes the sender,
subject, a shortened copy of the latest message, and what Sonae already sent.

The task assignee follows the same workspace handoff route used by phone calls,
so inbound email and inbound voice can land with the same responsible person.

## Privacy And Audit Boundary

Sonae stores operational metadata for the mailbox ledger: connector, Gmail
message id, thread id, sender, subject, decision, task link, and timestamps. The
message body is read to answer the mail, but the ledger records subjects and
counterparties rather than storing the full email body.

Every reply includes an AI disclosure in the sign-off. The sender should be told
that the reply was written by AI, may contain mistakes, and is still overseen by
a colleague reading the inbox.

## Setup Dependencies

The feature depends on a dedicated Gmail account, Google connector OAuth
credentials, the connector token encryption key, the installed `google-gmail`
connector, and company knowledge that is good enough for grounded answers. The
live proof step in the Gmail plan still depends on the real dedicated mailbox
and deployment credentials being present.
