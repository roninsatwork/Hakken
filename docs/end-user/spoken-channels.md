---
product: Hakken
documentation_type: user guide
feature_area: spoken channels
audience: workspace users, operators and developers
source_repository: roninsatwork/Hakken
source_path: docs/end-user/spoken-channels.md
last_reviewed: '2026-10-26T10:22:32+00:00'
reviewed_against: current implementation
status: Current
---
# Spoken Channels

> **Product:** Hakken · **Document type:** User guide · **Feature area:** Spoken channels
> **Reviewed:** 26 October 2026, 10:22:32 GMT (Europe/London)
> **Source path:** `docs/end-user/spoken-channels.md` · **Status:** Current

Spoken Channels cover the parts of Hakken where people speak to the assistant instead of typing. The current implementation has connected surfaces:

- real-time voice inside Ask Hakken
- inbound phone calls that Hakken answers for a workspace
- reception voice sessions on a walk-up screen
- the shared spoken voice setting used by Ask Hakken, phone calls, and reception

Voice dictation in the normal chat composer is still available, but it is different: dictation turns a recording into text for you to edit before sending. Real-time voice and phone calls are live spoken conversations.

## Ask Hakken Voice Mode

Ask Hakken can start a spoken conversation from the assistant welcome screen or an existing assistant thread. The browser asks for microphone permission, opens a live audio session, and shows an overlay with the listening, thinking, and speaking state.

During a live voice session:

- your microphone streams through Hakken’s relay for Google, or directly to OpenAI through a browser audio connection for the OpenAI transport
- Hakken speaks back with streamed audio
- captions show what the user and assistant said
- speaking over Hakken can interrupt the current reply
- finished voice turns are submitted to the normal assistant thread on a best-effort basis
- the session can look up company knowledge while it is already speaking

The voice session is still a normal assistant conversation. The session uses the thread’s authorized workspace and shared spoken instructions/knowledge path. It is not identical to every typed-turn tool, quota or persistence path; the differences below matter when checking results.

## Phone Calls

The Calls screen at `/app/calls` is the live phone display for the active workspace. It shows the workspace phone number, whether a call is in progress, and recent calls. The list masks caller numbers, but summaries or customer labels can still contain personal information. Masking the number alone does not make the entire screen safe for public display.

Open a call to see:

- the full caller number
- call status and timings
- any matched customer account
- the generated follow-up task link
- the call summary
- the transcript of caller and Hakken turns

The full caller number is only shown on the call detail page. Check all visible content before using a list in a demonstration; use call detail only when its personal information is appropriate for the viewer.

## What Happens When Someone Calls

Hakken only answers a call after several checks pass:

- the request must be signed by the phone provider
- the dialled number must belong to a workspace
- the workspace phone line must be active
- the live voice relay must be configured
- the real-time voice model must be configured
- abuse ceilings and plan allowance must permit the call

If a call cannot be accepted, Hakken returns a spoken refusal and hangs up rather than leaving the caller with a dead line.

Accepted calls spend from the same company conversation allowance used by chat and widgets. The platform also limits concurrent calls and repeated calls from the same number.

## After A Call Ends

After hang-up, Hakken runs a follow-up step:

- stores the completed call status
- keeps the transcript
- generates a short summary
- calls the optional customer-identity lookup; this checkout has no registered CRM lookup, so automatic customer matching currently returns no match
- creates a follow-up task for a workspace user when possible
- links the task back to the call record
- contains a Wiki handoff for a matched customer, but the absent CRM lookup prevents that match-driven path in the reviewed checkout

Summary and task failures are caught separately and do not erase the stored transcript. Other steps can still fail before the rest finishes, so inspect the call record rather than assuming every follow-up stage ran.

## Voice Settings

Administrators can choose the spoken voice from `/admin/ai/voice`. The setting is stored per workspace and is used by the Google relay paths:

- Google Ask Hakken voice mode
- inbound phone calls
- reception voice sessions

Each available voice can be previewed before choosing it. The preview uses the same live relay and real-time voice model as production voice sessions, so it demonstrates the real sound rather than a separate text-to-speech fallback.

## Receptionist Screen

The Receptionist screen at `/app/reception` lists workspace widgets that have
been enabled for kiosk duty. Opening a screen launches `/kiosk/[widgetId]`, a
full-screen visitor surface for a tablet or stand. Visitors tap once, talk to
Hakken, and the screen resets between visitors. See
[Receptionist Screen](./receptionist-screen.md) for setup and operating
guidance.

## Practical Guidance

Before using spoken channels with customers:

- choose and preview the workspace voice
- confirm the real-time voice model is configured
- confirm the relay and phone line are configured
- test a short internal voice session
- test a short phone call
- check that the transcript and follow-up task appear
- review any customer match before acting on it

Spoken channels are live customer-facing AI surfaces. Treat transcripts, caller numbers, and call summaries as customer data.

## Provider And Session Differences

Ask Hakken supports two implemented live transports. Google uses Hakken's relay; OpenAI receives a short-lived provider client secret and connects the browser by WebRTC. The current OpenAI session defaults to its own Marin voice unless an explicit voice is supplied, so the four Google voice choices do not universally change both providers. Google voice previews, telephone and reception require a compatible Google live-audio model even though normal browser voice can use OpenAI.

The realtime model is resolved from the platform job in the reviewed creation paths, without a company-model argument. Workspace instructions and a Google voice choice can therefore be company-specific while the realtime engine still follows platform routing. Switching a company chat default does not establish that live speech uses the same model. Ask an operator to check the actual realtime job and transport when the voice or behavior differs.

Google admission tickets last one minute for opening a session; that is different from the relay's fifteen-minute maximum conversation. The relay requires one-time redemption and closes its audio resources at the session bound. Starting a fresh session may be necessary after expiry. Browser session creation is rate-limited to ten attempts per minute per person. Missing microphone permission, incompatible model configuration or an unreachable relay can fail before conversation starts; repeated clicking does not repair configuration.

## Written Records And Follow-Up Limits

Captions and saved transcripts are related but separate. The browser submits finished voice text without blocking the live conversation if saving fails. A conversation that audibly worked can therefore have incomplete written history. The reviewed transcript writer also stores a fixed OpenAI provider label for assistant voice text, even when the overlay used Google; use the model/session evidence when diagnosing provider attribution. No implementation change was made here.

Phone transcripts are bounded to forty submitted turns per request, two thousand characters per turn and four hundred accumulated turns per call. A long or repeated transcript submission can be truncated or duplicated rather than being an unlimited word-perfect recording. The recent call list reads the newest fifty calls; it is not a complete history export. Full phone numbers remain available on authorized detail queries.

After-call summaries read at most twelve thousand transcript characters. Follow-up task construction can include up to six thousand transcript characters, while generic tasks reject detail longer than two thousand. Long calls can therefore keep their summary but fail to create the follow-up task. Check for a task link before promising that someone was notified. A short summary alone does not show that a task, customer match or Wiki update succeeded.

## Quotas, Cost And Availability

Telephone admission checks a bounded recent-call set, with defaults of four concurrent calls and six calls per number per hour. For finite company plans it increments the company's conversation allowance before minting the live ticket. This is a call-level admission charge, not reception's completed-turn accounting. Ticket/configuration failure after admission does not show a refund in the inspected path. Provider webhook redelivery and admission are separate from call-row deduplication, so an existing call record is not proof of exactly-once allowance charging.

Reception reserves a company allowance at speech onset and settles it when the model completes a turn. Open-microphone silence is not a chargeable turn in that path. Normal browser voice has separate session and persistence functions; the reviewed code does not establish identical per-turn plan enforcement across all three surfaces. Treat their limits separately and refer to [Receptionist Screen](./receptionist-screen.md) and [Platform Plans And Quotas](./platform-plans-and-quotas.md).

Voice supplier cost is recorded separately from a customer's plan allowance. Google usage reaches the backend when the relay closes; an older relay or failed close can leave missing spend records. Direct OpenAI reports arrive from browser response events. These are operational accounting paths rather than a reconciled invoice or guaranteed record of every spoken token.

This review inspected session minting, relay redemption/control, browser persistence, phone admission/callbacks, follow-up code and the workspace voice setting. No microphone, preview, phone call, model request, relay connection or deployment operation was run. Local source/tests do not establish that the current backend and relay were deployed together or that accepted external rename cutover issues have been resolved.
