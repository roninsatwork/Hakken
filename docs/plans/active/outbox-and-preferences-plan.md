# The Outbox, and what people choose to receive

Every email the platform sends, except signing in and invitations, goes
through the Outbox and is visible there: what type of communication it is,
whether it waits, went, failed or was skipped, and why. One agent sends what
waits, once an hour, from one address. People choose on their profile which
of the emails meant for them they get, and every such email carries its own
way to stop. Telegram moves to its own Integrations tab, built to take more
apps later.

**Status, 2026-10-07: agreed with Anthony and the drawings approved the same
day ("this are great the designs are approved"); built on `dev` the same day
("yes go for it"), every slice: the Outbox's core, choosing, the screens,
each approved screen held to its drawing by a look test
([`look/`](../assets/outbox-and-preferences/look/)).** The drawings are the canvas "Hakken tasks — the wider assistant",
row "The Outbox, and what you choose to receive"; copies in
[`boards/`](../assets/outbox-and-preferences/boards/). About 3 building days,
in four slices.

## What was decided (Anthony, 2026-10-07)

| Question | Answer |
|---|---|
| **Which emails go through the Outbox** | All of them except the sign-in link, the sign-in code and invitations, which "should never go through the outbox": a sign-in link works like a password, and signing in must not wait on an agent. System health alerts, an automation's email and an agent's "send email" now go through it. |
| **Where they come from** | One address for every Outbox email, `OUTBOX_FROM_EMAIL` ("one email address can handle all the outbox email types"), falling back to the general sender (`RESEND_FROM_EMAIL`). |
| **Who sends them, and when** | A new built-in agent, the **Outbox Queue Processing Agent**, on an hourly schedule shown on the Schedules screen. Oldest first. It sends **only on its hourly run** — queuing an email starts nothing. It replaces the Email Sender role. |
| **Types of communication** | Stored on every Outbox email: Weekly News Digest, Weekly website performance (a new email every company will get; the type is reserved until it is built), Hakken tasks, Collecting stopped, System health, Automations, Agent emails. |
| **The Outbox screen** | A type column, a search box (by address), Type and Status filters, 15 rows a page. Each email opens on its own page: its type, when it goes, the address it goes from, and the email itself. |
| **What a person chooses** | The profile is for clients, so only what they get: a **Communication preferences** tab with a table of the emails they may choose, a tick box each, no search box or page footer, and "Unsubscribe from all" / "Subscribe to all". **Everyone starts subscribed and opts out.** Weekly website performance stays hidden until its email exists. An email someone turned off shows on the Outbox as skipped, "Turned off on their profile". |
| **Stopping from the email** | Every email a person can opt out of carries its own one-click unsubscribe link, for its own type. |
| **Stuck emails** | The super admins are told in their bell when anything has waited more than two hours — at most once a day while it lasts. The bell does not go through the Outbox. |
| **Integrations** | Telegram on its own **Integrations** tab: a table of the apps a person can link, each opening its own page. Telegram's page links in one tap ("Open Telegram") or with the code; once linked it says so, with Unlink (a yes-or-no). |

## What gets built

| # | What | Days |
|---|---|---|
| **A — The Outbox's core** | | **1** |
| A1 | Types of communication on every row (`utils/communications.ts`, `outboxSchema.ts`); a row may be for an address that is no user's; one sender address (`emailBrandingService.outboxFromAddress`). | |
| A2 | The Outbox Queue Processing Agent (`outboxQueueAgent.ts`, `outboxQueueRun.ts`), its hourly schedule, and no send started on queuing; the Email Sender role and template removed. | |
| A3 | System health (`platformAlerts.ts`), an automation's email (`workflowRuntime.ts`) and an agent's (`aiToolExecutionService.ts`) queued as written (`outbox.queueWrittenEmailInternal`). | |
| A4 | The hourly watch (`outbox-watch`): the agent kept there, stuck emails told in the bell. | |
| **B — Choosing** | | **0.5** |
| B1 | Each choosable type on or off (`readerPreferences.ts`: the digest keeps `newsDigest`, the rest `turnedOff`); skipped when sent; every such email's own unsubscribe link and one-click headers, by type. | |
| B2 | A new task's offer says "by email" only while Hakken tasks emails are on; turning them off or on changes the person's tasks too. | |
| **C — The screens** | | **1** |
| C1 | Admin → Content → Outbox and an email's page, as drawn. | |
| C2 | The profile's Communication preferences and Integrations tabs; Telegram's page, linked and not. | |
| C3 | English and Italian; a look test per approved screen. | |
| **D — Docs and checks** | Operator and developer docs, the full gate. | **0.5** |
| | **Total** | **3** |

## Risks

- **Every email now waits up to an hour.** Chosen: a 9am alert may arrive by
  10am. The bell and Telegram still tell people at once.
- **The agent switched off or its schedule stopped.** Nothing sends; the bell
  says so after two hours.
- **An email someone turned off is still queued** (it shows as skipped), so
  the Outbox holds a row per person per week for the digest. Kept on purpose,
  so the screen shows every email.
