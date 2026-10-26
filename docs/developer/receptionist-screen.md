---
product: Hakken
documentation_type: developer guide
feature_area: reception voice kiosk
audience: workspace users, operators and developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/receptionist-screen.md
last_reviewed: '2026-10-26T10:22:32+00:00'
reviewed_against: current implementation
status: Current
---
# Receptionist Screen

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Reception voice kiosk
> **Reviewed:** 26 October 2026, 10:22:32 GMT (Europe/London)
> **Source path:** `docs/developer/receptionist-screen.md` · **Status:** Current

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
served only when the backing widget exists, is active, has `kioskEnabled` set and the company effectively has the Reception module.

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
- `authorizeKioskVoiceTicket` limits ticket issuance per anonymous conversation
  and checks the widget's real-session allowance. It holds no shared slot;
  relay redemption alone admits an active session and performs accounting.
- `listMyReceptionScreens` is a tenant query for `/app/reception`; it lists the
  active kiosk-enabled widgets for the current workspace.
- `recordKioskHeartbeat` lets the idle kiosk page update `kioskLastSeenAt`
  without creating a session.

`convex/kioskActions.ts` owns `createKioskVoiceSession`. It validates the kiosk
thread token, requires `VOICE_RELAY_URL` and
`VOICE_RELAY_SECRET`, resolves the `realtime` model default, requires the Google
Vertex speech-to-speech relay path for this surface, loads the workspace spoken
voice, admits a per-thread ticket before building spoken session instructions,
then signs a one-minute relay ticket. An abandoned ticket cannot block another
visitor. Failed configuration attempts consume no ticket or session allowance.

## Data Model

The `widgets` table stores both ordinary widget configuration and kiosk
bookkeeping:

- `kioskEnabled` gates whether `/kiosk/[widgetId]` serves anything.
- `kioskSessionWindowStart` and `kioskSessionCountInWindow` enforce the hourly
  voice-session ceiling.
- `kioskLastSeenAt` records idle heartbeat and session activity for staff.
- `kioskSessionCount` is the lifetime conversation count shown in UI.
- `kioskVoicePendingThreadId` / `kioskVoicePendingUntil` are legacy optional
  fields retained for existing rows; they no longer gate admission.
- `kioskVoiceActiveTicketId` / `kioskVoiceActiveUntil` allow one redeemed voice
  session at a time and expire safely if close delivery fails.
- `kioskThreadWindowStart` and `kioskThreadCountInWindow` cap anonymous kiosk
  thread minting.

Kiosk conversations are stored in `threads` with `sourceUrl: "kiosk"`,
`widgetId`, optional `companyId`, optional `agentId`, and
`widgetAccessTokenHash`. `kioskTicketWindowStart` and
`kioskTicketCountInWindow` limit one conversation to five ticket requests per
hour. The browser receives the raw token but it is kept in a
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

For kiosk tickets, the relay drops open-mic silence until PCM crosses the
speech threshold, then calls `/api/voice/control` before forwarding that turn
to Vertex. The control mutation atomically reserves one unit from the company
plan. Vertex's `turnComplete` finalizes it exactly once; closing before that
boundary refunds the reservation. An exhausted next turn receives a private
`relay.quota` signal, and the visitor sees only calm `Back shortly.` copy.

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
ceiling is crossed. A widget can hold one active redeemed voice lease. Ticket issuance holds no shared pending slot.
The hourly count advances when the relay redeems the ticket, before the Vertex
connection succeeds; close releases the active lease and expiry is its
backstop. Heartbeats are accepted at most once per interval.

## Tests And Verification

Focused coverage lives in:

- `convex/kiosk.test.ts` for opt-in gating, token access, transcript writes,
  ticket/lease admission, hourly ceilings, audit logging, message caps, and
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
- Each completed kiosk voice turn spends one company-plan message allowance;
  silence and abandoned turns do not.
- Spoken voice stays a workspace setting shared with Google Ask Hakken and phone calls.

## Current Capability And Accounting Boundaries

`getKioskConfig`, `createKioskThread`, ticket authorization and relay redemption check the effective Reception module, in addition to widget active/kiosk flags. These public surfaces have their own capability gate and do not inherit a signed-in super-admin bypass. `listMyReceptionScreens` is a module query over at most one hundred company widgets. Heartbeats are public widget-ID calls and are throttled, not proof of a valid voice conversation or device identity.

`authorizeKioskVoiceTicket` checks the existing active lease and session window, increments only the per-thread ticket counter and returns. Legacy `kioskVoicePending*` fields do not reserve capacity. The action performs provider/relay configuration checks before this ticket reservation, then assembles instructions and signs. Later prompt/ticket failure can still consume a per-thread ticket attempt; do not describe every failed mint as leaving every counter untouched.

`redeemVoiceTicketInternal` validates widget/thread/company and kiosk source identity, effective module, lease and hourly count in one mutation. It increments lifetime/hourly session counters and creates the active ticket lease before the relay connects to Vertex. Admitted sessions are not completed conversations. Redemption scans a bounded expired-record batch, refunding an eligible unfinished quota reservation and releasing matching widget leases. Expiry is a backstop, not instantaneous cleanup at a universal wall-clock deadline.

`controlKioskVoiceTurn` requires the next integer turn index, makes repeated begin calls for the same pending turn a no-op, resolves chat quota on the kiosk thread, and increments allowance transactionally. Complete settles that exact pending turn; close conditionally refunds a remaining company reservation and records usage. These turn IDs do not deduplicate browser transcript writes. The transcript handler checks existing message count before inserting up to two rows, so a count of 399 can become 401; it does not enforce a strict final maximum of 400.

`recordKioskVoiceTurn` uses token/thread access and stores each nonempty side with Google provider attribution, while failed browser persistence is caught. Reset discards browser references and closes tracks/sockets; it does not purge the saved conversation. The one-hour thread/session windows, per-thread ticket allowance and fifteen-minute relay life are distinct from data retention. No complete dedicated kiosk purge path was established here.

The daily reload runs on an hourly timer and reloads only when device-local hour is three and phase is idle, rather than promising an exact 03:00 event. The silence prompt/reset timers and one-minute heartbeat were inspected from current page source. No browser or audio session was run. Existing tests are source evidence only, and coordinated live backend/relay behavior remains unverified.
