# Sonae Answers The Phone

Status: **Built end to end 2026-08-14; awaiting only the real number.**
Everything below exists and is tested — Phase 0 (relay answers knowledge),
the audio translation, the call record with its 90-day purge, the answering
webhook with signature checks and admission ceilings, the media-stream
bridge with barge-in and live transcript filing, the hang-up finale
(summary, CRM match, task, bell), the Calls screen, and the quota spend.
4,700+ tests green. What remains needs Anthony: a Twilio account, a number,
and its three settings on the deployment — then the live proof call.
Phase 3 of the showcase channels roadmap (`showcase-channels-plan.md`).
Owner: Anthony

Every claim below carries the file it rests on; verify anchors before editing,
because line numbers drift. Follow the repo's working rules in `AGENTS.md`.

## The decision

Sonae gets a phone number. You dial it on speakerphone in front of a room;
Sonae answers, says it is an AI, knows the company, and holds a
conversation — at the speed of a person, and you can cut it off mid-sentence.
You hang up — and on the screen behind you, within seconds, a follow-up task
lands with a named person, the bell rings, and the full transcript is there
to read. That finale is the flagship demo of the whole roadmap.

Recorded decisions:

1. **Inbound only.** Sonae answers calls and never dials out — umbrella
   plan decision 1. Nothing in this plan may place, schedule, or return a
   call.
2. **The call joins the live audio loop. It does not get its own slower
   one.** Superseding the original 2026-08-13 decision to run turn-based
   over the provider's webhooks.

   That decision was written when the voice session recorded a clip,
   transcribed it, generated a written reply and read it back. On that
   footing, webhook turns were right: the phone would have sounded no worse
   than the screen.

   That is no longer the footing. The live session holds one open connection
   to a speech-to-speech model, answers in about a second, and stops when
   you talk over it. **A phone call is that same loop with a different
   microphone.** Building the webhook version now would put an automated
   hold system next to a screen that answers like a person, and the contrast
   is what the room would remember.

   So the call's audio is bridged into the relay that already exists, rather
   than a second, slower path being built beside it.
3. **Twilio is the telephony provider**, using its Media Streams feature
   rather than its speech-gathering. The boring, dominant choice: buy a
   number, point its voice webhook at us, validate its request signatures.
   Credentials follow the same `process.env` pattern as every other
   provider key (`RESEND_API_KEY` et al.).
4. **A call is a first-class record.** A new `phoneCalls` table owns the
   call: number (masked for display), timing, turn-by-turn transcript,
   outcome. The transcript lives on the call record, not in a chat thread —
   a call is not a thread and pretending otherwise would bend both.
5. **The relay answers the knowledge tool, not the caller's device.**
   See "The one architectural change" below. This is the only structural
   change this phase makes to existing code.

## What is actually true today (verified 2026-08-13)

**No telephony exists.** No number, no provider SDK, no audio route.
Confirmed absent.

**The live loop exists and is proven.** The browser holds a socket to
`services/voice-relay/server.mjs`, which holds the Vertex socket using the
service account and refuses anything without a signed ticket minted by
`createRealtimeVoiceSession` (`convex/ai.ts`). Confirmed working end to end
on 2026-08-13: ticket accepted, Vertex handshake, audio both ways, knowledge
searched mid-sentence and answered from. Its protocol rules are pure and
tested (`services/voice-relay/protocol.test.mjs`).

**Both halves of the transcript already arrive.** The relay asks Vertex for
`inputAudioTranscription` and `outputAudioTranscription`, so what the caller
said and what Sonae said both come back as text on the same connection. The
call transcript is therefore a by-product of the loop, not a second system.

**Barge-in already works.** Vertex reports `interrupted` when the caller
talks over the reply, and the session already acts on it
(`readLiveServerMessage`, `src/lib/googleLiveVoice.ts`). On the phone this
additionally needs the provider's buffered audio dropped — see Phase B.

**The audio formats do not match, and that is the real work.** Twilio Media
Streams carries 8kHz μ-law, base64, in 20ms frames. Vertex wants 16kHz
signed 16-bit PCM in and returns 24kHz PCM out. The browser already does the
equivalent conversion for microphone and playback
(`downsampleTo16k`, `decodePcm16Base64`); the phone needs the μ-law pair,
which is new and belongs beside the existing conversions as pure, tested
functions.

**The webhook pattern is established.** `convex/http.ts` registers routes
like `/api/webhooks/workflow` (secret header compared with
`constantTimeEqual`, body length capped — `convex/workflows.ts:305-340`).
Registering a new public endpoint means one `httpAction` plus one
`http.route({...})` block. **Note: the existing secret-header webhooks have
no rate limiting** — this plan must not copy that gap.

**The after-call landing pads exist and are proven.**
- Tasks: `createTaskInternal` (`convex/tasks.ts:400`) is the single door;
  it validates, audits `CREATE_TASK`, and notifies the assignee through
  `notifyUserInternal` (`convex/notifications.ts:89-112`), which the header
  bell renders. Tasks carry `sourceUrl` — stored but currently never
  rendered in the tasks UI (`src/app/(dashboard)/app/tasks/page.tsx`),
  which this plan fixes so a task can link to its call.
- Customers: `salesDataCustomers` holds `phone` and `mobile`
  (`convex/schema.ts:3041-3042`). **But the CRM is account-keyed**: its two
  writers both require the record to resolve to an imported account or
  filed prospect. An unknown caller cannot become a CRM record, and this
  plan does not bend that — see commitment 5.
- Audit: the direct-insert house pattern (`writeTaskAudit`,
  `convex/tasks.ts:64`) and `buildAgentActionAuditMetadata`
  (`convex/auditLogService.ts:211`).

**Rate limiting exists but its action list is closed.** The
`aiActionRequests` reserve-style limiter works per actor
(`convex/aiActionRequests.ts:10-40`) but its `actionName` union is a closed
schema literal (`convex/schema.ts:553`) — adding call-related actions means
a schema change, planned below.

**Retention rule applies.** The Retention And Purge Plan requires any new
time-growing table to arrive with its purge pipeline. `phoneCalls` grows
with time; its pipeline is in scope here, not deferred.

## The one architectural change: the relay answers the knowledge tool

Today the *browser* answers when the model reaches for company knowledge: it
receives the tool call, asks the platform to search, and sends the passages
back. That works, but it puts the answering in the caller's device.

A phone has no device to put it in. The options are to teach the phone
bridge to answer the tool as well — a second copy of the same logic — or to
move the answering into the relay, which both surfaces already share.

**Move it into the relay.** The relay already holds the session's signed
ticket, which names the company and the thread, so it has exactly the
authority needed and no more. It calls the platform's existing search over
HTTP and sends the result back to Vertex. The browser then stops answering
tool calls entirely, and the phone gets knowledge for free rather than as a
second implementation.

This is also the fix for the drift the earlier session flagged: with the
answering in one place, a spoken surface cannot quietly know less than the
typed one. Do this **first**, before any telephony work, and confirm the
browser session still answers from knowledge afterwards — it is a refactor
with a live proof already available.

## Design commitments (binding on every phase)

1. **Every call opens with disclosure.** The greeting states it is an AI
   for {company}, before anything else — umbrella commitment 7. Transcript
   is text only; **no call audio is stored, ever** — it passes through and
   is discarded, exactly as the browser session's audio is.
2. **The webhook and the media socket trust nothing.** Twilio signature
   validation on every HTTP request (the `constantTimeEqual` discipline),
   reject on mismatch, bodies capped. The media socket is authenticated by
   the same signed ticket the browser uses — the relay must not gain a
   second, weaker door. Per-call and per-number ceilings so a hostile
   dialer cannot spend the company's model budget; the gap the existing
   webhooks have is not copied.
3. **The caller's words are untrusted input.** Whatever is said on the
   phone reaches the model as speech and its knowledge results arrive
   through `buildUntrustedKnowledgeContext` like everything else. A caller
   can never trigger a tool beyond the read-only knowledge search, an
   approval, or a write — the call loop is read-only while live. Writes
   happen only in the after-call step, through the existing gated
   machinery.
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
6. **Quota is real.** Call time spends from the company's plan through the
   same quota machinery as widget messages (`resolveChatQuota`,
   `convex/chatService.ts:121-154`). Because a live call spends by the
   minute rather than by the message, the meter is time-based: a company
   out of quota hears a polite "call back later" and the call ends, not a
   silent dead line.
7. **A dropped model connection ends the call politely.** The browser can
   show "the connection dropped" and let someone press start again. A
   caller cannot. If Vertex closes mid-call, the bridge says one fixed
   apology line and hangs up, and the call record says why.

## Phase 0 — Move the knowledge answering into the relay

**Goal:** the browser session behaves exactly as it does today, with the
relay doing the answering.

- The relay gains a platform URL and answers `toolCall` frames itself,
  using the ticket's company and thread.
- `RealtimeVoiceOverlay` stops handling tool calls on the Google path.
- Tests: the relay's routing of a tool call and its response frame, in the
  existing pure-protocol suite.
- **Proof before moving on:** ask the browser voice session a question only
  answerable from an uploaded document, and get the answer.

## Phase A — Sonae picks up

**Goal:** dial the number, hear the disclosed greeting, say anything, be
answered by the live model, hang up; the call record exists with both sides
of the transcript.

- μ-law conversion as pure functions beside the existing audio helpers:
  8kHz μ-law → 16kHz PCM16, and 24kHz PCM16 → 8kHz μ-law. Tested against
  known byte fixtures, including silence and full-scale, before anything is
  wired to a phone.
- `phoneCalls` table: `companyId`, `providerCallId` (idempotency key),
  `fromNumber`, `toNumber`, `status (RINGING|IN_PROGRESS|COMPLETED|FAILED)`,
  `turns: [{ role, text, at }]` (bounded), `startedAt`, `endedAt?`,
  `matchedCustomerKey?`, `taskId?`. Indexes by company/time and by provider
  call id. Purge pipeline registered per the Retention And Purge Plan in
  the same change.
- `/api/telephony/voice` httpAction in `convex/http.ts`: signature
  validation, call-record upsert keyed on `providerCallId`, and a TwiML
  response that opens a media stream to the bridge. The platform mints the
  session ticket here, exactly as it does for a browser.
- The bridge: a media-stream endpoint that converts audio both ways and
  speaks the relay's existing protocol. It stores nothing.
- Number configuration: env vars for the Twilio credentials and the
  number→company mapping (one number, one company, for the showcase; the
  mapping is data, so a second number later is config not code).
- Tests: signature rejection, idempotent double-delivery of the same
  webhook, turn bounding, unknown number → polite refusal TwiML, and the
  conversion fixtures above.

## Phase B — It sounds like a person

**Goal:** the caller asks real questions, gets answers from the company's
knowledge, and can interrupt.

- Knowledge on the call needs no new code once Phase 0 has landed — this
  phase proves it rather than builds it.
- **Barge-in:** on Vertex's `interrupted`, the bridge sends Twilio a `clear`
  so already-buffered reply audio is dropped. Without this the caller talks
  over a sentence that keeps playing for seconds — the single most
  noticeable way a phone agent sounds artificial.
- Latency budget: the caller hears the first word within about a second, as
  the browser session does. If measurement shows the bridge adding more
  than a few hundred milliseconds, the conversion is the suspect.
- New `aiActionRequests` literals for calls (schema change noted above),
  plus the commitment-6 time-based quota spend.
- The reply-language rule already applies: it lives in the spoken-style
  instruction, so a caller speaking Portuguese is answered in Portuguese
  with no work here.
- Tests: barge-in drops buffered audio; a Vertex close mid-call produces
  the apology line and a `FAILED` record; quota exhaustion ends the call
  politely.

## Phase C — Hang up and watch

**Goal:** the flagship finale.

- On the provider's call-completed webhook: a summarisation pass over the
  transcript (one model call) produces summary + suggested follow-up; then,
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

- Abuse ceilings: max call duration, max concurrent calls, max calls per
  number per hour, all configurable; exceeded → polite wind-down.
- Live proof on dev: a real call from a seeded customer number, hang up,
  task + bell + transcript + customer link all land within seconds;
  a second call from an unknown number produces task + call record only.
- Done when Anthony can dial on speakerphone in front of a room, hold a
  real conversation, interrupt it and be listened to, hang up, and point at
  the screen — no developer present.

## Out of scope, recorded

- Outbound calling (umbrella decision; needs a fresh decision ever to
  exist).
- Storing call audio, hold music, and call transfer to a human.
- SMS/WhatsApp on the same number — natural later, separate decision.
- Voicemail and out-of-hours behaviour beyond a single polite message.
- Creating CRM records for unknown callers (commitment 5).
- Running the relay anywhere but one instance. Two callers at once works;
  a room full does not, and scaling it is a deployment decision (Cloud Run
  in the same Google project) rather than a change to this design.
