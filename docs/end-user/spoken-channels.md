# Spoken Channels

Spoken Channels cover the parts of Sonae where people speak to the assistant instead of typing. The current implementation has three connected surfaces:

- real-time voice inside Ask Sonae
- inbound phone calls that Sonae answers for a workspace
- reception voice sessions on a walk-up screen
- the shared spoken voice setting used by Ask Sonae, phone calls, and reception

Voice dictation in the normal chat composer is still available, but it is different: dictation turns a recording into text for you to edit before sending. Real-time voice and phone calls are live spoken conversations.

## Ask Sonae Voice Mode

Ask Sonae can start a spoken conversation from the assistant welcome screen or an existing assistant thread. The browser asks for microphone permission, opens a live audio session, and shows an overlay with the listening, thinking, and speaking state.

During a live voice session:

- your microphone streams to the speech model through Sonae's relay
- Sonae speaks back with streamed audio
- captions show what the user and assistant said
- speaking over Sonae can interrupt the current reply
- finished voice turns are written back to the normal assistant thread
- the session can look up company knowledge while it is already speaking

The voice session is still a normal assistant conversation. The thread keeps the written record, company context, rules, model settings, and knowledge access that a typed assistant conversation would use.

## Phone Calls

The Calls screen at `/app/calls` is the live phone display for the active workspace. It shows the workspace phone number, whether a call is in progress, and recent calls. The list masks caller numbers so the screen can be shown publicly without exposing personal phone numbers.

Open a call to see:

- the full caller number
- call status and timings
- any matched customer account
- the generated follow-up task link
- the call summary
- the transcript of caller and Sonae turns

The full caller number is only shown on the call detail page. Use the list view for demos or wall displays; use the detail view only when the caller's personal data is appropriate for the person viewing it.

## What Happens When Someone Calls

Sonae only answers a call after several checks pass:

- the request must be signed by the phone provider
- the dialled number must belong to a workspace
- the workspace phone line must be active
- the live voice relay must be configured
- the real-time voice model must be configured
- abuse ceilings and plan allowance must permit the call

If a call cannot be accepted, Sonae returns a spoken refusal and hangs up rather than leaving the caller with a dead line.

Accepted calls spend from the same company conversation allowance used by chat and widgets. The platform also limits concurrent calls and repeated calls from the same number.

## After A Call Ends

After hang-up, Sonae runs a follow-up step:

- stores the completed call status
- keeps the transcript
- generates a short summary
- tries to match the caller to an existing customer by phone or mobile number
- creates a follow-up task for a workspace user when possible
- links the task back to the call record
- teaches the matched customer's Wiki page from the call without blocking the call record

If one part fails, the rest can still stand. For example, a summary failure does not erase the transcript, and a task failure does not remove the call record.

## Voice Settings

Administrators can choose the spoken voice from `/admin/ai/voice`. The setting is stored per workspace and is used everywhere Sonae speaks for that workspace:

- Ask Sonae voice mode
- inbound phone calls
- reception voice sessions

Each available voice can be previewed before choosing it. The preview uses the same live relay and real-time voice model as production voice sessions, so it demonstrates the real sound rather than a separate text-to-speech fallback.

## Receptionist Screen

The Receptionist screen at `/app/reception` lists workspace widgets that have
been enabled for kiosk duty. Opening a screen launches `/kiosk/[widgetId]`, a
full-screen visitor surface for a tablet or stand. Visitors tap once, talk to
Sonae, and the screen resets between visitors. See
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
