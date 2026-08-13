# Sonae Answers The Phone

Status: Drafted 2026-08-13 from verified code research. Phase 3 of the
showcase channels roadmap (`showcase-channels-plan.md`). Not started.
Depends on: `voice-session-plan.md` phase A (the `speech` use case).
Owner: Anthony

Every claim below carries the file it rests on; verify anchors before editing,
because line numbers drift. Follow the repo's working rules in `AGENTS.md`.

## The decision

Sonae gets a phone number. You dial it on speakerphone in front of a room;
Sonae answers, says it is an AI, knows the company, and holds a
conversation. You hang up — and on the screen behind you, within seconds,
a follow-up task lands with a named person, the bell rings, and the full
transcript is there to read. That finale is the flagship demo of the whole
roadmap.

Recorded decisions:

1. **Inbound only.** Sonae answers calls and never dials out — umbrella
   plan decision 1. Nothing in this plan may place, schedule, or return a
   call.
2. **Turn-based over the provider's webhooks, not live audio streaming.**
   The call flows as speak-then-listen turns: the telephony provider
   transcribes the caller's turn and POSTs it to us; we answer with text
   and audio. No websocket audio bridge, no streaming infrastructure —
   Convex's HTTP actions (`convex/http.ts`) handle everything, exactly like
   the webhook routes that already exist. Barge-in (interrupting Sonae
   mid-sentence) is out of scope, same as the voice session.
3. **Twilio is the telephony provider.** The boring, dominant choice: buy
   a number, point its voice webhook at us, validate its request
   signatures. Its API key and number configuration follow the same
   `process.env` pattern as every other provider key
   (`RESEND_API_KEY` et al.).
4. **A call is a first-class record.** A new `phoneCalls` table owns the
   call: number (masked for display), timing, turn-by-turn transcript,
   outcome. The transcript lives on the call record, not in a chat thread —
   a call is not a thread and pretending otherwise would bend both.

## What is actually true today (verified 2026-08-13)

**No telephony exists.** No number, no provider SDK, no audio route.
Confirmed absent.

**The webhook pattern is established.** `convex/http.ts` (59 lines)
registers routes like `/api/webhooks/workflow` (secret header compared
with `constantTimeEqual`, body length capped —
`convex/workflows.ts:305-340`) and `/apify-webhook`
(`convex/webhooks.ts:24-42`). Registering a new public endpoint means one
`httpAction` plus one `http.route({...})` block. **Note: the existing
secret-header webhooks have no rate limiting** — this plan must not copy
that gap.

**The brain can be driven headlessly and hands back text.**
`runTriggeredAgentObjective` (`convex/agentRuntime.ts:2140`) runs an agent
without a chat thread and the final text is read back from the run row
(`finalOutput`, via `getRunExecutionStateInternal`,
`convex/agentRuns.ts:995-1015`). But a full agent loop per conversational
turn is too slow for a live call; the plain-chat generation path
(`generateSonaeResponse`, `convex/ai.ts:154`) answers in seconds with the
same company knowledge. The call loop therefore uses the plain path
per turn, and the agent machinery only for the after-call step.

**The after-call landing pads exist and are proven.**
- Tasks: `createTaskInternal` (`convex/tasks.ts:400`) is the single door;
  it validates, audits `CREATE_TASK`, and notifies the assignee through
  `notifyUserInternal` (`convex/notifications.ts:89-112`), which the header
  bell renders (`NotificationBell.tsx`, badge hidden at zero). Tasks carry
  `sourceUrl` — stored but currently never rendered in the tasks UI
  (`src/app/(dashboard)/app/tasks/page.tsx`), which this plan fixes so a
  task can link to its call.
- Customers: `salesDataCustomers` holds `phone` and `mobile`
  (`convex/schema.ts:3041-3042`). **But the CRM is account-keyed**: its two
  writers (`saveCustomerDetails`, `convex/salesDataCustomers.ts:633-731`;
  `writeCustomerField`, `convex/salesDataResearch.ts:545-587`) both require
  the record to resolve to an imported account or filed prospect. An
  unknown caller cannot become a CRM record, and this plan does not bend
  that — see commitment 5.
- Audit: the direct-insert house pattern (`writeTaskAudit`,
  `convex/tasks.ts:64`) and `buildAgentActionAuditMetadata`
  (`convex/auditLogService.ts:211`).

**Rate limiting exists but its action list is closed.** The
`aiActionRequests` reserve-style limiter works per actor
(`convex/aiActionRequests.ts:10-40`) but its `actionName` union is a
closed schema literal (`convex/schema.ts:553`) — adding call-related
actions means a schema change, planned below.

**Retention rule applies.** The Retention And Purge Plan requires any new
time-growing table to arrive with its purge pipeline. `phoneCalls` grows
with time; its pipeline is in scope here, not deferred.

## Design commitments (binding on every phase)

1. **Every call opens with disclosure.** The greeting states it is an AI
   for {company}, before anything else — umbrella commitment 7. Transcript
   is text only; no audio recording is stored, ever.
2. **The webhook trusts nothing.** Twilio signature validation on every
   request (the `constantTimeEqual` discipline), reject on mismatch,
   request bodies capped, and a per-call and per-number rate ceiling so a
   hostile dialer cannot spend the company's model budget — the gap the
   existing webhooks have is not copied.
3. **The caller's words are untrusted input.** Whatever is said on the
   phone runs through the same knowledge path as anonymous widget text; a
   caller can never trigger a tool, an approval, or a write — the call
   loop is read-only while live. Writes happen only in the after-call
   step, through the existing gated machinery.
4. **Caller numbers are personal data.** Stored on the call record,
   masked in every list view (last three digits), full number visible only
   on the call detail; included in the retention pipeline; never placed in
   a URL (house privacy rule).
5. **The CRM stays account-keyed.** A call from a number matching an
   existing customer's `phone`/`mobile` links the call to that customer
   and may append a research-provenance note; an unknown caller produces a
   task and a call record, not a CRM row. The "caller appears in the
   customer list" beat of the demo is honest: it works when the caller is
   a known customer, and the demo script calls from a seeded customer
   number.
6. **Quota is real.** Call turns spend from the company's plan through the
   same quota machinery as widget messages
   (`resolveChatQuota`, `convex/chatService.ts:121-154`); a company out of
   quota gets a polite "call back later" turn, not a silent dead line.

## Phase A — Sonae picks up

**Goal:** dial the number, hear the disclosed greeting, say anything, get
a fixed acknowledgement, hang up; the call record exists with the turns
logged.

- `phoneCalls` table: `companyId`, `providerCallId` (idempotency key),
  `fromNumber`, `toNumber`, `status (RINGING|IN_PROGRESS|COMPLETED|FAILED)`,
  `turns: [{ role, text, at }]` (bounded), `startedAt`, `endedAt?`,
  `matchedCustomerKey?`, `taskId?`. Indexes by company/time and by
  provider call id. Purge pipeline registered per the Retention And Purge
  Plan in the same change.
- `/api/telephony/voice` httpAction in `convex/http.ts`: signature
  validation, call-record upsert keyed on `providerCallId`, TwiML response
  with the disclosure greeting and the provider's speech gathering.
- Number configuration: env vars for the Twilio credentials and the
  number→company mapping (one number, one company, for the showcase;
  the mapping is data, so a second number later is config not code).
- Tests: signature rejection, idempotent double-delivery of the same
  webhook, turn bounding, unknown number → polite refusal TwiML.

## Phase B — The conversation

**Goal:** the caller asks real questions; Sonae answers from the company's
knowledge, turn by turn.

- Each caller turn: provider posts the transcribed speech → the turn is
  appended to the call record → the plain-chat generation path
  (`generateSonaeResponse`'s knowledge assembly, refactored just enough to
  be callable without a thread) produces the reply → reply text goes back
  as speech. Voice audio via the Phase-1 `speech` use case where latency
  allows; the provider's own voice as the pragmatic fallback — decided at
  build time by measured latency, recorded here when known.
- Latency budget: a caller hears something within ~2 seconds — a brief
  acknowledgement first if generation needs longer ("let me check that").
- New `aiActionRequests` literals for call turns (schema change noted
  above), plus the commitment-6 quota spend per turn.
- The reply-language rule from the languages plan applies if that phase
  has landed; otherwise calls are English-first.
- Tests: knowledge answer parity with chat for the same question, quota
  exhaustion mid-call behaviour, provider retry idempotency.

## Phase C — Hang up and watch

**Goal:** the flagship finale.

- On the provider's call-completed webhook: a summarisation pass over the
  turns (one model call) produces summary + suggested follow-up; then,
  through existing doors only:
  - the caller number is matched against `salesDataCustomers.phone/mobile`
    — on match, the call record links the customer and the customer
    profile shows the call under its research-provenance pattern;
  - `createTaskInternal` raises the follow-up task (assignee from a
    per-company "calls go to" setting), `sourceUrl` pointing at the call
    detail screen — and the tasks UI learns to render `sourceUrl` as a
    link, closing that gap;
  - the assignee's bell rings via the existing `TASK_ASSIGNED`
    notification;
  - the audit trail records the call and the task with the house metadata
    builders.
- New screen: a call log under the workspace (list, masked numbers,
  status) with a call detail page (full transcript, summary, linked
  customer and task).
- **The number-on-screen demo view** (Anthony's ask, 2026-08-13): the
  call screen leads with the phone number, displayed large enough for a
  room to read and dial, with live status beside it — ringing, in
  progress, completed — and the latest calls beneath. This page sitting
  open behind the presenter *is* the demo: the room dials the number they
  can see, and watches the call, the task, and the transcript land on the
  same screen.
- Tests: end-to-end from completed-webhook to task+notification+audit in
  one pass; unknown caller path; matched-customer path.

## Phase D — Hardening and proof

- Abuse ceilings: max turns per call, max call duration, max calls per
  number per hour, all configurable; exceeded → polite wind-down turn.
- Live proof on dev: a real call from a seeded customer number, hang up,
  task + bell + transcript + customer link all land within seconds;
  a second call from an unknown number produces task + call record only.
- Done when Anthony can dial on speakerphone in front of a room, hold a
  real conversation, hang up, and point at the screen — no developer
  present.

## Out of scope, recorded

- Outbound calling (umbrella decision; needs a fresh decision ever to
  exist).
- Live audio streaming, barge-in, and hold music.
- SMS/WhatsApp on the same number — natural later, separate decision.
- Voicemail and out-of-hours behaviour beyond a single polite message.
- Creating CRM records for unknown callers (commitment 5).
