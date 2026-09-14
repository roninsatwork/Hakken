# Spoken Channels

Spoken Channels cover real-time voice in Ask Sonae, inbound telephony, call records, the receptionist screen, the shared spoken voice setting, and the voice relay knowledge endpoint. They are implemented across `convex/aiVoiceSession.ts`, `convex/voiceRelay.ts`, `convex/voiceSettings.ts`, `convex/voicePreview.ts`, `convex/telephony.ts`, `convex/telephonyActions.ts`, `convex/telephonyService.ts`, `convex/kiosk.ts`, `convex/kioskActions.ts`, `src/ui/components/chat/RealtimeVoiceOverlay.tsx`, `src/lib/googleLiveVoice.ts`, `src/lib/voiceSession.ts`, and the `/app/calls`, `/app/reception`, `/kiosk/[widgetId]`, and `/admin/ai/voice` routes.

Read this before changing real-time voice sessions, spoken model defaults, the voice relay, Twilio webhooks, call records, receptionist sessions, spoken-voice settings, or post-call follow-up behavior.

## Product Surfaces

Implemented routes and components:

- `/app/assistant` and `/app/assistant/[threadId]` can open a real-time voice overlay for an assistant thread.
- `src/ui/components/chat/RealtimeVoiceOverlay.tsx` owns the live browser session UI, captions, microphone/audio cleanup, knowledge tool responses, and turn persistence.
- `/app/calls` lists recent workspace calls and displays the dialable workspace number.
- `/app/calls/[id]` shows a single call, full caller number, transcript, summary, matched customer, and follow-up task link.
- `/app/reception` lists active receptionist screens for the current workspace.
- `/kiosk/[widgetId]` is the full-screen anonymous voice surface for an opted-in widget.
- `/admin/ai/voice` lets an admin choose and preview the workspace spoken voice.

Voice dictation through `src/hooks/useVoiceToText.ts` remains a separate turn-based transcription feature documented in the assistant guide. It calls `api.aiSpeech.transcribeAudio` and fills the text composer; it is not the live spoken conversation path.

## Real-Time Voice Sessions

`api.aiVoiceSession.createRealtimeVoiceSession` creates the session used by Ask Sonae voice mode. It:

- requires an authenticated tenant action
- rate-limits session creation through `aiActionRequests`
- resolves the configured `realtime` model use case
- supports Google Vertex live-audio sessions through `VOICE_RELAY_URL` and `VOICE_RELAY_SECRET`
- supports OpenAI real-time sessions when a compatible OpenAI realtime model and `OPENAI_API_KEY` are configured
- loads the workspace spoken voice through `internal.voiceSettings.getSpokenVoiceForCompany`
- includes company instructions, rules, skills, memories, and the spoken style in the session instructions
- declares a knowledge-search tool for live lookup

Google live-audio sessions use the relay ticket path. `signVoiceTicket` creates a
versioned AES-256-GCM encrypted and authenticated payload with a random nonce and
one-time id. Its key is derived from the relay secret using the fixed v2 domain.
The browser forwards ciphertext; it cannot decode the company instructions, rules
or memories. The relay claims the ticket locally and redeems it through
`/api/voice/redeem` before opening Vertex. The page never receives provider credentials.

Redemption and knowledge requests also require `x-voice-relay-auth`, an HMAC-SHA256
of the complete ticket under `VOICE_RELAY_SECRET`, encoded as base64url. A browser
holding a ticket cannot call these endpoints directly. Knowledge lookup requires a
redeemed, unclosed session and permits at most ten searches per minute and sixty
per session, enforced transactionally across relay instances. Queries are capped
at 2,000 characters. Redemption records outlive the one-minute ticket until the
15-minute session allowance ends. The relay closes the record through
`/api/voice/control` on shutdown; expiry is the backstop if that notification fails.
Authenticated browser voice-search actions separately allow ten requests per minute.

Deploy the backend and relay together in an authorized maintenance window.
Legacy plaintext signed tickets are deliberately refused; do not add a fallback
that restores prompt disclosure. Mixed versions cannot start working sessions.
Local tests and builds do not demonstrate a coordinated live rollout.

The relay admits browser sessions only on `/` and `/live`, and phone media only on `/twilio`. Both WebSocket doors cap caller frames at 128 KB and close connections that do not present their first authentication frame within five seconds. Set `VOICE_RELAY_URL` to the relay root or `/live`, and set `TELEPHONY_STREAM_URL` to `/twilio` on the same service.

`src/lib/googleLiveVoice.ts` contains tested browser-side helpers for downsampling microphone PCM to 16 kHz, parsing relay events, and formatting tool responses. `src/lib/voiceSession.ts` contains tested PCM decoding and older turn/chunk helpers still used by preview playback.

## Voice Knowledge Lookup

`convex/voiceRelay.ts` exposes the HTTP endpoints the relay calls to redeem a
ticket, meter kiosk turns, close sessions, and search company knowledge. The
redemption endpoint atomically records a ticket's one-time id before the relay
opens a provider session. `/api/voice/control` authenticates the same ticket and
relay HMAC; for kiosk tickets it reserves company quota at speech onset,
finalizes on Vertex `turnComplete`, refunds an unfinished turn on close, and
releases the widget's active-session lease. The knowledge endpoint:

- requires `VOICE_RELAY_SECRET`
- accepts a signed ticket and query as JSON
- allows request bodies up to 128 KB because tickets can carry full company spoken instructions
- verifies ticket encryption/authentication and the relay-only HMAC with Web Crypto
- allows lookups for a signed thread or company fallback
- rejects expired, unredeemed, closed, over-quota, malformed, unauthenticated, oversized, or scope-less requests
- calls `internal.aiVoiceSession.searchKnowledgeForVoiceInternal`

Thread id remains the preferred scope. The company id in the ticket is only a fallback for a thread that belongs to no workspace, which prevents a relay-side caller from swapping a ticket onto another tenant's documents.

## Phone Webhooks And Call Admission

`convex/telephony.ts` owns the public phone endpoints. The incoming voice webhook:

- reads Twilio-style form data with a 16 KB body limit
- chooses the credential from the claimed Twilio connector when present, falling back to deployment environment ownership
- validates `X-Twilio-Signature`
- refuses unsigned, mis-signed, unowned, disabled, busy, redialling, over-quota, or unconfigured calls before opening a model session
- atomically spends one company conversation allowance when the company plan has a finite message limit
- records the call with `upsertCallOnAnswer`
- optionally loads the matched caller's Wiki page for session instructions
- mints a company voice ticket with `internal.aiVoiceSession.createVoiceTicketForCompany`
- returns TwiML that speaks the AI disclosure, then connects the stream to `TELEPHONY_STREAM_URL`

Configured environment and connector inputs include:

- `TWILIO_AUTH_TOKEN`
- `CONNECTOR_SECRET_TWILIO_AUTH_TOKEN`
- `TELEPHONY_PUBLIC_URL`
- `TELEPHONY_STATUS_PUBLIC_URL`
- `TELEPHONY_STREAM_URL`
- `TELEPHONY_NUMBER_OWNERS`
- `TELEPHONY_MAX_CONCURRENT_CALLS`
- `TELEPHONY_MAX_CALLS_PER_NUMBER_PER_HOUR`
- `VOICE_RELAY_SECRET`

The connector path uses `TWILIO_VOICE_CONNECTOR_KEY` and `TWILIO_AUTH_TOKEN_SECRET_REF` from `convex/toolConnectorDefinitions.ts`. A disabled connector wins over the environment owner mapping, so the admin off switch actually stops calls.

## Call Turns And Status

`handleCallTurns` accepts transcript turns posted by the bridge during a call. It:

- requires `VOICE_RELAY_SECRET`
- verifies the same signed ticket shape as voice knowledge lookup
- requires the ticket company to match the call row company
- accepts at most 40 turns per request
- trims each turn to 2,000 characters
- caps a call at 400 turns

`handleCallStatus` processes provider status callbacks. It validates the provider signature, ignores non-terminal statuses, marks terminal calls as `COMPLETED` or `FAILED`, and schedules `internal.telephonyActions.runAfterCallStep` after returning to the provider.

## After-Call Step

`runAfterCallStep` is the hang-up-and-watch workflow. It reads the stored call, skips silent calls, builds a transcript, and then:

- summarizes the call using the configured `fast-chat` model
- falls back to a plain transcript task summary if the model call fails
- matches the caller against `salesDataCustomers.phone` or `mobile` after number normalization
- assigns the follow-up to a company admin or the earliest company member
- creates a task through `internal.tasks.createTaskInternal`
- writes the summary and optional task id back to the call row
- schedules `internal.wikiActions.rewriteCustomerPageAfterEvent` for matched customers

Each step degrades independently. Do not make task creation, Wiki rewrite, or summary generation a reason to lose the call record or transcript.

## Spoken Voice Setting

`convex/voiceSettings.ts` stores `companies.spokenVoice`. The current allowed voice keys are `Kore`, `Puck`, `Charon`, and `Aoede`; `Aoede` is the default when a company has not chosen one.

`api.voiceSettings.setSpokenVoice` is an admin mutation. It validates the closed voice set, writes `UPDATE_SPOKEN_VOICE` to `auditLogs`, and stores the choice on the active company. `api.voicePreview.mintVoicePreviewTicket` lets admins preview a voice through the production relay/model path, rate-limited to 10 previews per minute per actor.

Ask Sonae voice, phone calls, and reception sessions should all read this one setting. Do not add separate hardcoded voice defaults per surface.

## Receptionist Screen

The Receptionist screen is the kiosk version of Sonae's live voice experience.
It uses a widget's company, linked agent, and branding, but opens as a top-level
Sonae page instead of an iframe. `convex/kioskActions.ts` creates Google relay
tickets for anonymous kiosk visitors after `convex/kiosk.ts` validates the
widget token. Ticket minting holds one pending slot; only relay redemption
increments the hourly/lifetime session counters and converts it to an active
lease. Open-mic silence is not a turn. Each completed voice turn consumes one
unit from the company plan through the relay control endpoint, and the next
turn winds down calmly when that allowance is exhausted.

Kiosk sessions are Google Vertex relay-only in the current implementation. If
the relay variables or a compatible realtime model are missing, the page returns
visitor-safe "not available" copy instead of throwing. The full kiosk contract,
limits, heartbeat, reset behavior, and tests live in
[Receptionist Screen](./receptionist-screen.md).

## Data Model

Relevant schema fields and tables:

- `companies.spokenVoice` stores the workspace voice choice.
- `phoneCalls` stores provider call id, company id, caller/called numbers, status, transcript turns, summary, matched customer key, task id, start/end timestamps, and end reason.
- `aiActionRequests` rate-limits transcription, speech synthesis, realtime session, and voice preview helper actions.
- `toolConnectors` stores the installed Twilio voice connector and its claimed phone number.
- `widgets` stores receptionist opt-in, kiosk heartbeat, session counts, kiosk
  rate windows, and expiring pending/active voice leases.
- `voiceTicketRedemptions` stores one-time redemption, knowledge limits, kiosk
  turn state, and the temporary quota reservation needed for close-time refund.
- `tasks` receives post-call follow-up tasks.
- `wikiPages` can be updated after matched customer calls.

Caller numbers are personal data. List screens should keep them masked; detail screens may show full numbers only to authorized workspace users.

## Tests And Verification

Focused tests include:

- `convex/telephony.test.ts`
- `convex/telephonyService.test.ts`
- `convex/voiceRelay.test.ts`
- `convex/voiceSettings.test.ts`
- `convex/voicePreview.ts` behavior through action tests where present
- `convex/kiosk.test.ts`
- `src/lib/googleLiveVoice.test.ts`
- `src/lib/voiceSession.test.ts`
- `src/app/(dashboard)/app/calls/page.test.tsx`

When changing the phone path, verify unsigned refusal, signature validation, disabled connector refusal, connector-secret ownership, admission ceilings, plan allowance spending, transcript turn limits, status callback handling, task creation, customer matching, and Wiki handoff. When changing live voice, verify relay-ticket signing, knowledge lookup scope, cleanup of microphone/audio resources, and model-default errors.

For documentation-only changes, run `git diff --check` plus the local Markdown link and index checks used by the documentation upkeep loop.

## Maintenance Rules

Preserve these invariants:

- Public phone endpoints must refuse before model spend unless the provider signature, line ownership, line switch, allowance, and relay/model configuration all pass.
- A caller hears a spoken refusal rather than a silent failure.
- Connector phone-line settings override legacy environment ownership when both exist.
- The full caller number appears only on call detail, not on public list/demo views.
- Voice relay tickets are signed by the platform, redeemed once before provider access, and verified before knowledge or transcript writes.
- Phone calls spend from company conversation allowance, not a hidden separate unlimited budget.
- Post-call failures must not erase the transcript.
- Spoken voice is one company setting shared by Ask Sonae, phone, and reception.
