---
product: Hakken
documentation_type: developer guide
feature_area: outbound email and communication preferences
audience: developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/email-system.md
last_reviewed: '2026-10-26T09:34:12+00:00'
reviewed_against: current implementation
status: Current
---
# Email System

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Outbound email and communication preferences
> **Reviewed:** 26 October 2026, 09:34:12 GMT (Europe/London)
> **Source path:** `docs/developer/email-system.md` · **Status:** Current


Every email the platform sends renders through one shell:
`convex/emailLayoutService.ts`. This document is the contract for changing it.

Historical design context: [Email Design System Plan](../plans/active/email-design-system-plan.md). Current behavior is established by the implementation described below.
Sender identity and branding resolution are covered separately in
[Email Branding](./email-branding.md). Magic-link URL construction is covered by
`convex/magicLinkUrlService.ts` and [Route Protection And Authentication](./route-protection-and-authentication.md).
The inherited inbound Gmail mailbox was removed on 9 October 2026; see the
[Gmail retirement note](./gmail-mailbox.md). Remaining generic Google OAuth
code must not be taken as an active mailbox watcher or company Mailbox screen.

## The one rule

**Callers supply content. Callers never supply markup.**

`renderEmail(content, options)` takes structured data and returns
`{ html, text }`. There is no way to pass HTML through it, which is deliberate:
before this existed, four call sites hand-rolled their own markup, and the two
that looked worst were not the two with escaping bugs. Removing the ability to
pass markup removes both failure modes at once.

If you find yourself wanting to inject a tag, add a field to `EmailContent`
instead.

## Content shape

| Field | Purpose |
| --- | --- |
| `kind` | Uppercase label beside the wordmark: "System health", "Invitation" |
| `preheader` | Inbox preview text. Falls back to `lede`, then `verdict` |
| `verdict` | What happened, in one sentence. Never a metric dump |
| `lede` | One supporting paragraph |
| `paragraphs` | Prose body. Single newlines become breaks |
| `stats` | Structured numeric summary. `tone` drives colour |
| `picture` | Attached chart CID, alternate description and date labels |
| `sections` | Additional headed card groups, each bounded like the main cards |
| `facts` | Term/value rows for a summary block |
| `cards` | One per real event. `severity` drives the left stripe. `link` routes to the record |
| `overflow` | Shown when the card list was capped |
| `actions` | Buttons. The first is primary |
| `quiet` | Small print under the action |
| `footer` | Scope covered, how to change or stop these, the credit line |

Anything optional that is absent renders nothing — a minimal message is just
`{ kind, verdict }`.

## Who sends what

| Surface | Builder | Renders |
| --- | --- | --- |
| Platform alerts | `buildSystemHealthAlertEmail` in `convex/platformAlertService.ts` | Sent from `convex/platformAlerts.ts` |
| Invites | `convex/invites.ts` calls `renderEmail` directly | Template record supplies headline and body |
| Agent notifications | `buildAgentNotificationEmail` in `convex/aiToolNotificationService.ts` | Sent from `convex/aiToolExecutionService.ts` |
| Workflow email nodes | `convex/workflowRuntime.ts` calls `renderEmail` directly | Body is author-written and template-substituted |
| Magic-link and one-time-code auth | Convex Auth email provider plus `convex/oneTimeCodes.ts` | Sign-in links route through `/verify`; typed codes are scanner-safe |

These builders still define the content, but most delivery now passes through
`outbox.ts` and `emailSenderRun.ts`, rather than a direct send at the call site.
Sign-in and invitations remain outside the queue. Keep both HTML and text;
`sendResendEmail` accepts the prepared result when delivery actually occurs.
See the delivery lifecycle below before adding another caller.

## Accessible status colour contract

`EMAIL_PALETTE` in `convex/emailLayoutService.ts` is part of the implementation
contract, not decoration. The current shell is the October 2026 light-sheet design: dark ink on white
over a light grey ground, with the status signals below. Earlier charcoal
variants are historical and must not supply current palette values.

| Meaning | Token | Hex | Notes |
| --- | --- | --- | --- |
| Healthy / link | `blue` | `#1d4ed8` | Used for good stats and all links. |
| Warning | `gold` | `#a16207` | Deliberately the brightest signal. |
| Critical | `red` | `#7f1d1d` | Darker than warning so severity survives without hue. |

Do not reintroduce a green-vs-red status ramp. The 2026-08-04 email accessibility
fix removed the previous forest green/red signalling because red/green colour
blindness made the healthy and failed states collapse into the same perceived
signal. Warning and critical must differ by brightness, not only hue, and colour
must never be the only carrier of severity.

The renderer enforces this in two ways:

- `tone` and severity helpers return both a colour and a dark-mode lock class,
  so clients that rewrite inline colours still preserve the signal.
- A warning or critical card without a caller-supplied badge renders the severity
  as text (`Needs attention` or `Critical`) in both HTML and plain text.

Tests in `convex/emailLayoutService.test.ts` assert WCAG AA contrast, pairwise
signal separation under deuteranopia and protanopia simulation, a brightness gap
between warning and critical, and the no-green signal rule. If a product change
needs new status language or a new tone, update the renderer, preview fixtures,
plain-text output, and those tests together.

## Why the markup looks like 2005

Legacy Outlook renders through Microsoft Word, not a browser. That is not an old
browser engine — it is a word processor, and it drives real design decisions:

- **Nested presentation tables** with fixed pixel widths. No flexbox, no grid,
  no `max-width`, no `position`, no custom properties, no gradients.
- **Spacing on `<td>` only.** Margins and padding on a `<div>` are unreliable.
- **`mso-line-height-rule:exactly` on every text cell**, or Word adds its own
  leading and the stat row stops lining up.
- **No `border-radius`.** Corners are square in Outlook. Radius is decoration
  here, never meaning. The primary button gets a VML `<v:roundrect>` fallback
  inside an `<!--[if mso]>` conditional because that is the one place roundness
  reads as broken when lost.
- **No `text-transform`.** Word ignores it, so uppercase labels would render
  mixed-case there while looking correct everywhere else. `up()` cases the
  string itself.
- **No `letter-spacing`.** Tracking collapses. Labels read through size, weight
  and colour instead.
- **The `<o:PixelsPerInch>96` head conditional is mandatory.** Windows above
  96 DPI silently rescales fixed widths and breaks the 600px column — and it
  does not reproduce at 100% scaling, so without this it ships unnoticed.

Other client constraints:

- **No design depends on a `<style>` block.** One `COLOUR_LOCK` block restates
  the already-inline palette for supported dark-mode clients. Removing it
  leaves the intended design; it must not acquire layout or unique colors.
- **The only image is an attached chart referenced by content ID.** External
  images remain unsuitable as the sole carrier of meaning. Chart dates,
  figures and alternate text accompany it; `emailPictureEncoder.ts` supplies
  the attachment. The wordmark is rendered without a remote image.
- **Cards cap at `MAX_CARDS` (8)** with an overflow link, so a noisy alert
  cannot cross Gmail's ~102KB clip threshold.
- **URLs are filtered to http(s) and mailto.** An action URL can reach the shell
  from a workflow definition or an agent's tool arguments, both of which are
  attacker-influenced.

These are enforced by tests in `convex/emailLayoutService.test.ts`, not by
convention. A change that breaks one fails the suite.

## Previewing

```bash
curl http://localhost:3000/api/email-preview
```

Renders every template side by side, built by the real code rather than a copy
of it. Add `?raw=<key>` for the HTML source and `&format=text` for the text
part — useful for pasting into a render service.

Keys: `alert`, `alert-hostile`, `invite`, `agent-notification`, `workflow`.

The `alert-hostile` fixture puts markup in every field, fires 11 signals against
the cap of 8, and uses an oversized provider payload. Check it after any change
to the shell — the failures worth catching are invisible in tidy sample data.

The route is unreachable in production unless `EMAIL_PREVIEW_ENABLED=1`.
`GET /api/email-preview` returns 404 in production unless explicitly enabled.
`?raw=<key>` returns HTML source as `text/plain`; `?raw=<key>&format=text`
returns the plain-text part. Keep the route dev-only unless there is a specific
deployment decision to expose it.

## Adding a new email

1. Build an `EmailContent` object. Lead with a verdict, not a metric.
2. Give it exactly one primary action that routes back into the app.
3. Pass `platformName` from settings. Never hardcode it.
4. Queue normal outbound email with its communication type and stable idempotency key; preserve both `html` and `text`. Sign-in and invitations use their dedicated paths.
5. Add a fixture to `src/app/api/email-preview/fixtures.ts` so it is visible
   without sending mail.


## Current delivery lifecycle

The shared rendering contract above remains useful, but rendering and delivery
are separate responsibilities. The current lifecycle is implemented in
`convex/outbox.ts`, `outboxSchema.ts`, `outboxTemplates.ts`,
`outboxQueueAgent.ts`, `outboxQueueRun.ts` and `emailSenderRun.ts`.
`queueOutboxMessage` inserts a WAITING row if its `idempotencyKey` is not
already indexed by `by_idempotency`. It stores the recipient address, optional
user, language, message payload, communication classification and due time.
Queuing sends nothing and does not trigger the sender. Normal messages wait
for the Outbox Queue Processing Agent's next scheduled run.

`ensureOutboxAgentInternal` creates the system agent and its initial hourly
schedule idempotently. It preserves an existing activation switch and changed
schedule. `processOutboxNow` marks its role run started, takes the role turn to
avoid overlapping role work, calls `sendOutbox` and records the result. The
sender runs as plain code on Node; it does not call a model. That fact says
nothing about external provider charges, runtime costs or the cost of a
separate agent that produced the message.

`claimOutboxBatch` claims up to 50 eligible rows. The sender renders each row
before posting, then `markOutboxPosting` checks claim ownership and records
`postedAt` immediately before the provider call. The same stable idempotency
key is sent in Resend's `Idempotency-Key` header. A receipt settles the row as
SENT; a rejected message can become WAITING for another attempt or terminal
FAILED. A rendering/preference condition can settle it as SKIPPED. SENT means
submission succeeded in this path, not that a recipient opened or even
received the mail in their inbox.

The queue permits three posting attempts and waits 15 minutes before a failed
send becomes eligible again. The low-level provider transport also has its
own retry policy, so distinguish queue posting attempts from HTTP attempts.
Sends are spaced by 600 milliseconds. A sender stops starting new messages
after seven minutes and releases unreached claims for a later scheduled run.
There is no claim here that every backlog finishes in a single action or that
an eligibility delay is an exact delivery time.

`reclaimOutbox` treats claims older than ten minutes carefully. If the row
never reached posting, it can return to WAITING. If posting began and the
worker disappeared, the row becomes FAILED with `MAY_HAVE_GONE` rather than
being blindly sent again. This avoids repeating an email whose delivery is
uncertain, at the cost of requiring investigation for an ambiguous failure.
Do not describe this as an unconditional exactly-once delivery guarantee or
reset such a row merely because a recipient has not replied.

## Message types, preferences and authorization

`OUTBOX_MESSAGE_TYPES` and `COMMUNICATION_OF_TYPE` in `outboxSchema.ts` separate
an email template from its communication category. Types currently include
the weekly digest, collection-needs-attention, task alerts and reports,
system health, automation email and agent email. A new type needs a category
mapping before it can be queued. `utils/communications.ts` owns which
categories a person may turn off: currently WEEKLY_NEWS_DIGEST and
HAKKEN_TASKS. The existence of WEBSITE_PERFORMANCE in a validator does not
establish a delivered feature or visible subscription switch.

`readerPreferences.ts` exposes `getMyEmailPreferences`, `setMyEmail` and
`setAllMyEmails` through tenant builders and acts on `ctx.userId`. Preferences
are personal, not a company-wide setting. With no saved row, choosable mail
is on and the language falls back to the source language. The digest has its
own `newsDigest` boolean; other optional categories use `turnedOff`.
Changing HAKKEN_TASKS also updates the email channel on up to 300 of the user's
non-deleted tasks. Do not silently assume that bound updates an unlimited
collection or alter it as part of documentation work.

`renderOutboxRow` rechecks that an associated user still exists, evaluates
current opt-out choices and tests the recipient against `emailSuppressions`
before choosing a template. These checks happen at send preparation time,
so a message queued while subscribed can be skipped after an opt-out.
Deleted tasks and missing digest issues also have explicit skip reasons.
Written system-health, automation and agent messages carry their already
prepared subject/HTML/text; structured digest and task templates use the
shared renderer and can include unsubscribe controls and pictures.

The queue supports explicit addresses with no `userId`; it is not itself a
universal tenant-recipient authorization service. The producer must enforce
its recipient rules. In contrast, administration of the global queue is
strictly platform-level: `listOutboxForAdmin`, `getOutboxMessageForAdmin` and
`getOutboxSummaryForAdmin` in `outboxAdmin.ts` use `superAdminQuery`.
`/admin/content/outbox` and its detail page are not granted to ordinary
company administrators just because those users receive company mail.

## Unsubscribe, suppression and configuration

`readerPreferences` stores a random 64-hex-character unsubscribe token indexed
by `by_token`; the link does not identify a user by an exposed row ID. A typed
communication chooses what to stop, and a legacy link without one means the
digest. Only choosable categories can be turned off. The visible
`src/app/unsubscribe/page.tsx` requires a deliberate action, while
`emailHttp.handleOneClickUnsubscribe` handles the mail client's POST to
`/api/email/unsubscribe`. It returns 200 regardless of token validity to avoid
revealing whether a guessed token exists.

`emailHttp.handleResendWebhook` reads a bounded body (128 KiB), verifies the
Svix signature/timestamp with `RESEND_WEBHOOK_SECRET`, and records bounce or
complaint suppressions through `emailSuppressions.recordSuppression`.
Suppression is address-based and independent of a profile opt-in. The HTTP
handler's presence is not proof that Resend has the callback registered or
that a live event has been accepted. The public HTTP routes are wired in
`convex/http.ts` rather than inferred from frontend route names.

The sender requires `RESEND_API_KEY` and resolves a sender using
`emailBrandingService.outboxFromAddress`: `OUTBOX_FROM_EMAIL` or an allowed
general sender fallback. An unconfigured fallback does not silently send.
`CONVEX_SITE_URL` supplies the one-click endpoint, and branding supplies the
app URL for the visible unsubscribe link. Preserve variable names without
copying values into documentation, screenshots or error reports. Consult
[Email Branding](./email-branding.md) before changing resolution precedence.

## Monitoring, data model and evidence

`outboxSchema.ts` defines `outboxMessages`, `weeklyDigestIssues`,
`readerPreferences` and `emailSuppressions`. Queue indexes include
`by_status_due`, `by_status_created`, `by_communication_created`,
`by_idempotency` and `by_created`. Reader preferences use `by_user` and
`by_token`; suppressions use `by_email`. These names matter when adding an
admin filter or repair diagnostic: avoid replacing the indexed queue scan
with a full-table search. The schema fragment is composed into the wider
content schema and main schema.

The hourly `outbox-watch` cron routes through the job ledger to `watchOutbox`.
It ensures the system agent exists and calls `tellIfStuckInternal`.
Eligible WAITING rows overdue by more than two hours trigger a bell message
for super administrators, at most once per day while the condition remains.
That notification bypasses email so it can report a failed email queue.
The admin message detail includes its current rendered preview or skip
reason, next schedule and resolved sender. Check these before changing
recipient data or attempting any manual resend.

`outbox.test.ts`, `outboxQueueAgent.test.ts`, `readerPreferences.test.ts`,
`resendEmailService.test.ts` and `emailLayoutService.test.ts` cover different
layers: queue claims and recovery, schedule/watch behavior, personal choices,
provider transport and rendering. Profile look tests also exercise the
communication controls. This documentation pass inspected relevant source
and selected test declarations; it ran no sends, scheduled jobs or application
tests. No universal retention duration for Outbox bodies was established by
this review; consult the retention service before promising automatic
expiry or proposing cleanup. The [end-user guide](../end-user/emails.md)
explains the user-facing timing and preference boundaries.


## Weekly Digest production and interrupted-run limits

The generation path is `weeklyDigestRun.writeWeeklyDigest`, dispatched by
`newsAgentRunActions.runNewsRoleNow` for WEEKLY_DIGEST. The role wrapper marks
the run started, takes the role turn and records a final summary or failure.
`weeklyDigest.readDigestSetup` reads the agent's instructions, model-selection
mode and `plannerMode`, defaulting the latter to TEST. Runtime model resolution
uses the configured agent use case, not a literal provider model in the digest
worker.

The worker computes an ISO week key from UTC and a rolling seven-day material
window. `readDigestMaterial` inspects up to 200 recently published News rows,
orders Google updates first, and supplies at most 20 News items. It separately
includes up to 20 published Knowledge titles and eight shown Helpful content
articles. No News items means it exits before the model call, even when other
material exists. These bounded source reads are not a comprehensive archive
or an all-content digest guarantee.

`readDigestAnswer` parses the model's opening and zero-based selected News
indices, deduplicating valid indices and limiting usable explicit picks to
five. Missing/invalid selections can fall back to the full provided News list;
invalid JSON is treated as opening text with all items. The code therefore
does not guarantee the five-story shape requested by the prompt. The model
call is recorded through `roleRuns.recordRunModelCall`, with usage/cost evidence;
provider/model acceptance and useful editorial selection remain distinct.

`weeklyDigest.saveIssue` inserts the issue and source IDs before translation
and recipient expansion. `translateNow` attempts the opening's translations.
A thrown translation error is caught so English can proceed, and a disabled
Translator can also return without writing translations. `outboxTemplates`
uses `readerFields` at render time, so publication/generation, available
translation and final send-time words are separate states. Deleted News items
are omitted at render; Helpful content is included only while its article is
still shown. The saved issue is consequently not an immutable snapshot of
every email's eventual full contents.

`queueDigestPage` processes Live users in pages of 200; Test reads up to 100
SUPER_ADMIN users. It skips missing addresses, ensures reader preferences,
and snapshots the stored email and language into each queue row. It does not
exclude opted-out users at this stage: current preferences and suppressions
produce an explicit SKIPPED result during send preparation. Live queue
idempotency is week plus user; Test idempotency is issue ID plus user. Repeating
one recipient page cannot create another row with the same key.

There is an important recovery limit. The Live guard checks whether an issue
already exists, not whether all reader pages were queued. `saveIssue` and the
subsequent cursor loop are separate transactions inside one worker action;
that loop does not persist its recipient cursor as a resumable expansion job.
If the worker dies after saving or part-way through queueing, the next ordinary
Live run can stop at the existing-issue guard while some users remain unqueued.
The atomic queue keys help avoid duplicate rows but do not by themselves
resume missing pages. This is an implementation concern to review separately,
not authorization to change delivery contracts or replay a live run here.

The sender is not started by digest creation. Current executable code leaves
messages for the Outbox Queue Processing Agent's next scheduled run, despite
older comments mentioning an immediate Email Sender start. Its hourly default
is operator-changeable. A queued total or a SUCCESS production summary proves
neither provider submission nor inbox receipt.

`weeklyDigest.test.ts` covers ISO weeks, Test audience, Helpful content,
Live per-user queueing, same-week duplicate avoidance, empty News and selection
fallback. Those declarations and current source were inspected during this
pass; tests and live production were not run. No interrupted-recipient-loop
recovery guarantee was established, and no full digest-issue expiry policy
was inferred from the week index. Recovery needs a separately authorized,
evidence-based operator action with the issue/run and queue keys preserved.
