# Receptionist Screen

The Receptionist screen is the kiosk runtime built on top of Hakken's widget and
spoken-channel machinery. It is implemented by `/app/reception`,
`/kiosk/[widgetId]`, `convex/kiosk.ts`, `convex/kioskActions.ts`, the widget
Integration section, and the existing live voice relay helpers.

Read this before changing reception routing, kiosk opt-in, anonymous kiosk
thread creation, kiosk voice sessions, per-widget kiosk rate limits, heartbeat
health, or reset behavior.

## Route And Component Map

- `src/app/(dashboard)/app/reception/page.tsx` lists active receptionist screens
  for the current workspace through `api.kiosk.listMyReceptionScreens`.
- `src/app/kiosk/[widgetId]/page.tsx` renders the full-screen anonymous visitor
  surface. It owns wake, microphone setup, relay WebSocket connection, captions,
  silence reset, daily reload, in-memory session credentials, heartbeat calls,
  and visitor-facing failure copy.
- `src/app/(dashboard)/admin/_features/widget-config/WidgetIntegrationSection.tsx`
  exposes the Receptionist screen switch, `/kiosk/[widgetId]` link, last-seen
  timestamp, and session count in the shared widget editor.
  The company widget path imports that same shared component; there is no
  route-local copy.

The public kiosk route is intentionally not protected by dashboard auth. It is
served only when the backing widget exists, is active, and has `kioskEnabled`
set.

## Convex API

`convex/kiosk.ts` owns the kiosk-specific public and tenant doors:

- `getKioskConfig` is a public query for the kiosk page. It returns only
  visitor-safe widget/company branding and returns `null` unless the widget is
  active and kiosk-enabled.
- `createKioskThread` is a public mutation that creates a fresh anonymous
  widget-style thread for an opted-in kiosk widget and returns the raw access
  token to the page. It does not use widget embed-pass origin checks because the
  kiosk is opened on Hakken's own top-level origin, not framed on a customer
  site.
- `recordKioskVoiceTurn` stores the visitor and assistant transcript text in
  the kiosk thread after validating the raw widget session token.
- `validateKioskThreadAccess` is the internal token check used by the voice
  session action.
- `reserveKioskSession` is the internal per-widget voice-session admission gate
  and heartbeat/session-count writer.
- `listMyReceptionScreens` is a tenant query for `/app/reception`; it lists the
  active kiosk-enabled widgets for the current workspace.
- `recordKioskHeartbeat` lets the idle kiosk page update `kioskLastSeenAt`
  without creating a session.

`convex/kioskActions.ts` owns `createKioskVoiceSession`. It validates the kiosk
thread token, reserves the session, requires `VOICE_RELAY_URL` and
`VOICE_RELAY_SECRET`, resolves the `realtime` model default, requires the Google
Vertex speech-to-speech relay path for this surface, loads the workspace spoken
voice, builds spoken session instructions, and signs a one-minute relay ticket.

## Data Model

The `widgets` table stores both ordinary widget configuration and kiosk
bookkeeping:

- `kioskEnabled` gates whether `/kiosk/[widgetId]` serves anything.
- `kioskSessionWindowStart` and `kioskSessionCountInWindow` enforce the hourly
  voice-session ceiling.
- `kioskLastSeenAt` records idle heartbeat and session activity for staff.
- `kioskSessionCount` is the lifetime conversation count shown in UI.
- `kioskThreadWindowStart` and `kioskThreadCountInWindow` cap anonymous kiosk
  thread minting.

Kiosk conversations are stored in `threads` with `sourceUrl: "kiosk"`,
`widgetId`, optional `companyId`, optional `agentId`, and
`widgetAccessTokenHash`. The browser receives the raw token but it is kept in a
React ref, not localStorage, so a reset, refresh, or closed tab drops the
visitor credential.

Transcript rows are stored in `messages` with the kiosk thread id and optional
company/widget dimensions. `recordKioskVoiceTurn` trims each side of a turn and
stops adding rows once the conversation reaches the kiosk message cap.

## Runtime Behavior

The kiosk page starts in `idle`. A click/tap calls `createKioskThread`, then
`createKioskVoiceSession`, then `navigator.mediaDevices.getUserMedia`. Once the
relay WebSocket opens, the page sends the signed ticket, streams downsampled
16 kHz microphone PCM, plays received PCM audio, and records completed turns
back to Convex.

Important runtime details:

- the permanent disclosure and recording notice remain visible throughout
- the first user gesture is required because browsers block microphone/audio
  until then
- the sound-shape meter uses microphone level while listening and playback
  level while speaking
- connection close returns the page to idle
- connection or microphone errors show calm "Back shortly" copy
- silence shows "Still there?" after 25 seconds and resets after 45 seconds
- the idle page sends a heartbeat at load and then roughly once per minute
- an idle screen reloads around 03:00 device-local time to pick up deploys and
  free browser memory

Do not add navigation or dashboard chrome to the kiosk page. Configuration
belongs in the widget admin screens and `/app/reception`.

## Relationship To Widgets And Spoken Channels

The kiosk is a widget presented as a full-screen voice surface. It reuses the
widget's company, linked agent, branding, and anonymous token pattern, but it
does not use `/w/[widgetId]`, `public/embed.js`, `src/proxy.ts`, or widget
embed-pass because it is not embedded in a host page.

It also reuses spoken-channel infrastructure: the `realtime` model default,
the workspace spoken voice, the live relay URL/secret, Google live voice helper
code, spoken instructions, and the voice knowledge tool. Keep the shared spoken
voice contract aligned with [Spoken Channels](./spoken-channels.md).

## Limits And Abuse Controls

Current limits are:

- `KIOSK_SESSIONS_PER_HOUR = 60`
- `KIOSK_THREADS_PER_HOUR = 120`
- `KIOSK_THREAD_MESSAGE_CAP = 400`
- `KIOSK_HEARTBEAT_MIN_INTERVAL_MS = 30000`
- `VOICE_TURN_MAX_LENGTH = 4000`

Thread minting records `RATE_LIMITED_KIOSK_THREADS` once when the hourly thread
ceiling is crossed. Session reservation refuses with visitor-safe copy when the
per-widget hourly session count is exhausted. Heartbeats are accepted at most
once per interval.

## Tests And Verification

Focused coverage lives in:

- `convex/kiosk.test.ts` for opt-in gating, token access, transcript writes,
  session reservation, hourly ceilings, audit logging, message caps, and
  heartbeat throttling
- `src/app/(dashboard)/admin/_features/widget-config/WidgetConfigSections.test.tsx`
  for the Receptionist screen switch, link, last-seen timestamp, and count
- spoken-channel tests for shared relay, voice setting, model, and ticket
  behavior

For documentation-only changes, run `git diff --check` and the local Markdown
link/index checks. For implementation changes, add focused kiosk tests and any
route/component coverage needed for the changed UI.

## Maintenance Rules

Preserve these invariants:

- `/kiosk/[widgetId]` serves nothing unless the widget is active and
  kiosk-enabled.
- Kiosk access uses a fresh anonymous widget-style token per visitor session.
- The raw token must not be persisted beyond the active page session.
- Visitor-facing failures must stay calm and non-technical.
- The microphone is closed while idle.
- The screen must reset between visitors.
- Kiosk session/thread minting must remain bounded per widget.
- Spoken voice stays a workspace setting shared with Ask Hakken and phone calls.
