# Receptionist Screen

The Receptionist screen turns a configured Hakken widget into a full-screen voice
assistant for a tablet at a reception desk, counter, showroom, or trade-show
stand. Visitors tap once, talk to the assistant, and then the screen resets for
the next visitor.

It uses the same workspace voice setting as Ask Hakken voice mode and phone
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
