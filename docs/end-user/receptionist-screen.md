---
product: Hakken
documentation_type: user guide
feature_area: reception voice kiosk
audience: workspace users, operators and developers
source_repository: roninsatwork/Hakken
source_path: docs/end-user/receptionist-screen.md
last_reviewed: '2026-10-26T10:22:32+00:00'
reviewed_against: current implementation
status: Current
---
# Receptionist Screen

> **Product:** Hakken · **Document type:** User guide · **Feature area:** Reception voice kiosk
> **Reviewed:** 26 October 2026, 10:22:32 GMT (Europe/London)
> **Source path:** `docs/end-user/receptionist-screen.md` · **Status:** Current

The Receptionist screen turns a configured Hakken widget into a full-screen voice
assistant for a tablet at a reception desk, counter, showroom, or trade-show
stand. Visitors tap once, talk to the assistant, and then the screen resets for
the next visitor.

It uses the same Google workspace voice setting as Google Ask Hakken voice mode and phone
calls. The screen is meant for unattended, public use, so it shows a permanent
AI disclosure and a recording notice.

## Where To Find It

There are two places operators use the feature:

- `/app/reception` shows the active reception screens for the current workspace.
- `/kiosk/[widgetId]` is the full-screen visitor surface opened on the device.

A widget must be switched on for receptionist duty before `/kiosk/[widgetId]`
serves it. The toggle lives in the widget Integration section on the global
widget screen or the company widget screen.

## Turning One On

To prepare a reception screen:

1. Open the relevant widget configuration.
2. Review the widget name, branding, linked company, and linked agent.
3. Open the Integration section.
4. Switch on Receptionist screen.
5. Save the widget.
6. Open the receptionist screen link on the tablet or display.
7. Test a short conversation before leaving the device unattended.

The `/app/reception` page lists every active widget in the workspace that has
Receptionist screen enabled. Each card shows the screen name, an open-screen
link, the last-seen timestamp, and the total conversation count recorded for
that screen.

## Visitor Experience

The visitor sees a full-screen sound-shape, the company disclosure, and a
"Tap to talk" invitation. The first tap starts a fresh anonymous conversation
and requests microphone access through the browser.

During the conversation:

- the microphone streams to the live voice model through Hakken's relay
- Hakken speaks back with streamed audio
- captions show the visitor and assistant turns
- the visitor can end the conversation from the screen
- quiet periods show a gentle "Still there?" prompt
- continued silence resets the screen for the next visitor

The page keeps visitor session credentials only in memory. A reset or reload
clears the current captions and session token, so the next visitor receives a
new conversation rather than seeing the previous visitor's exchange.

## Availability And Failure States

If the widget is inactive or not enabled for kiosk duty, the page shows that the
screen is not in service. If the voice relay, realtime model, microphone, or
network path is unavailable, the visitor sees a calm "Back shortly" state rather
than a technical error.

Reception voice sessions depend on the same live voice readiness as other
spoken channels:

- the workspace spoken voice should be chosen and previewed
- a realtime voice model must be configured
- the live relay URL and signing secret must be present
- the browser must allow microphone access

For the wider spoken-channel setup, see [Spoken Channels](./spoken-channels.md).

## Privacy And Follow-Up

Reception conversations are recorded as widget-style chat threads for the
workspace, with the widget id and company context attached. Staff can review
them through the normal chat-log and follow-up processes. Treat the transcript
as customer data.

The screen is not always listening. The microphone is closed while the screen is
idle and only opens after a visitor taps to talk.

## Practical Checks

Before using the screen with customers:

- confirm the widget is active
- confirm Receptionist screen is enabled and saved
- confirm the screen appears on `/app/reception`
- open `/kiosk/[widgetId]` on the target device
- allow microphone access
- test a short conversation
- wait through the silence reset and confirm the next visitor starts fresh
- check the last-seen timestamp from the widget Integration section or
  `/app/reception`

Tablet or operating-system kiosk mode is outside Hakken. Locking the device to
the browser page is a venue/device policy decision.

## Workspace Capability And Public Access

The widget must be active, kiosk-enabled and attached to a company that effectively has the Reception capability. The public config and new-thread operations return unavailable when that capability is withheld. The signed-in Reception list uses the active workspace and a bounded set of widgets; it is not a platform-wide inventory. A missing card can be a company/capability issue rather than a broken tablet.

The kiosk route is public and does not use an embedded website's origin pass. Knowing its address is not the same as knowing a visitor thread's private session token, but the kiosk opt-in is not a physical-device lock. Keep the venue's tablet controls and public exposure expectations separate from Hakken configuration. The platform cannot establish where a visitor is physically standing from this page alone.

## Session Counts, Ticket Limits And Allowances

A newly created thread and a real voice session are counted differently. Each widget can create up to one hundred twenty kiosk threads in an hour. A conversation can request up to five voice tickets per hour, and each widget admits up to sixty redeemed voice sessions per hour. An unused ticket does not occupy a shared pending voice slot. One active voice lease is taken only when the relay redeems the ticket, so another visitor can be told the assistant is busy while that lease is active.

The lifetime conversation count shown to staff increments on redemption, before the relay necessarily completes its provider handshake. It measures admitted relay sessions rather than completed successful conversations. Last seen can also come from an idle heartbeat, so a recent timestamp does not prove microphone access, provider readiness, audible playback or a completed call. Use those indicators as clues rather than acceptance certificates.

The relay detects speech before reserving a company-plan turn. Completed model turns settle the reservation; closing an unfinished turn can refund it when the reservation accounting still permits it. This path does not charge ordinary open-mic silence. A missing close signal relies on expiry/reclamation rather than immediate cleanup. Exhaustion ends or refuses further conversation with calm visitor-facing wording; it does not silently provide an unlimited session.

## Transcripts And Reset Privacy

The browser clears captions and its in-memory access token on reset. That protects the next visitor's view, but does not delete the server-side thread or messages. The recording notice describes this stored conversation evidence; do not promise that walking away erases the exchange. No complete kiosk-specific retention/erasure policy was established by this review. Treat saved text and any personal details spoken into it as workspace data.

Each submitted user/assistant side is trimmed to four thousand characters. The server stops accepting new transcript batches once its query reaches four hundred message rows, while a final two-sided write near that boundary can cross the nominal count by one. Voice can continue after transcription storage stops. A best-effort save failure also does not necessarily stop audio. Captions visible during a visit therefore are not proof of complete saved history.

Silence shows a check-in after twenty-five seconds and resets after forty-five seconds. The page closes microphone tracks and audio resources as it returns to idle. A browser permission failure, network interruption, model mismatch or quota refusal can share the same calm Back shortly presentation. Staff need the configured system's diagnostic evidence to tell those causes apart; repeated visitor taps are not a recovery procedure for an operator configuration problem.

## Operating Checks And Evidence

Choose the Google workspace voice and compatible realtime model before relying on reception. Browser Ask Hakken's OpenAI transport is not a substitute for this Google-only kiosk path. Review the widget's company and public notices, then use an authorized device test if live acceptance is required. The checks listed earlier describe sensible operating work; they were not executed during this documentation pass.

Current source was inspected for public config, token creation, ticket admission, relay redemption, completed-turn metering, transcript limits, reset and heartbeat behavior. No session was opened, conversation recorded, provider called or allowance changed. A successful local implementation test or a recent heartbeat cannot establish deployed provider acceptance or completion of the known external rename cutover.
