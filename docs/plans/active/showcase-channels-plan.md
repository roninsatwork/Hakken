# Hakken Can Be Spoken To, Phoned, Emailed, And Shown A Photo

Status: **Mostly built by 2026-08-16.** The voice session, reply-language
behavior, telephone answering, photo actions, Gmail mailbox implementation, and
receptionist screen have all landed in code and have maintained documentation.
Some operational proof remains channel-specific: Gmail still needs the dedicated
mailbox/OAuth deployment proof, photo actions still need the real-phone widget
demo, and the receptionist screen still needs sustained tablet proof.
Owner: Anthony

Every claim below carries the file it rests on; verify anchors before editing,
because line numbers drift. Follow the repo's working rules in `AGENTS.md`.

## Current implementation state (verified 2026-08-16)

The current shipped channel set is documented in these maintained guides:

- `docs/end-user/spoken-channels.md` and
  `docs/developer/spoken-channels.md` for Ask Hakken live voice, phone calls,
  shared spoken voice, and reception's shared voice setting.
- `docs/end-user/gmail-mailbox.md` and `docs/developer/gmail-mailbox.md` for
  the connected Gmail mailbox implementation and live-proof boundary.
- `docs/end-user/photo-actions.md` and `docs/developer/photo-actions.md` for
  image-bearing chat/widget turns and human-confirmed task creation.
- `docs/end-user/receptionist-screen.md` and
  `docs/developer/receptionist-screen.md` for the walk-up kiosk screen.

Keep the roadmap below as the decision record and phase story. Treat the guides
above as the current implementation reference.

## The decision

Hakken's brain is finished enough to be worth showing off: one company's
knowledge, rules, memories and audit trail behind every answer. But the only
ways to reach that brain today are typed chat and the embedded widget — both
keyboards. This plan gives the same brain more doors: a voice, a face, a phone
number, an email address, a camera, and a screen in a reception area. Six
features, one story — *wherever you are and however you talk, it is the same
Hakken answering*.

Anthony's calls, recorded 2026-08-13:

1. **Hakken answers calls; it never makes them.** An inbound number demos
   better, raises no spam or consent questions, and needs no dialling rules.
   Outbound calling is not in this plan and needs a fresh decision before
   anyone builds it.
2. **The email door is a real Gmail inbox the agent looks at and replies
   from.** Recorded 2026-08-13, and it supersedes two same-day earlier
   versions of this decision (webhook-only delivery with no mailbox, then a
   separate product domain) — both rejected by Anthony, who wants a visible
   inbox humans can also open, and who holds the company policy that all
   Ronins mail lives on Gmail with no exceptions. So the email phase builds
   the platform's first working connector: Google/Gmail, through Google's
   official consent door (OAuth), scoped to one dedicated mailbox such as
   ask@ronins.co.uk. **MFA is not an obstacle on this route and never was:**
   a person connects the mailbox once, signing in with their normal password
   and authenticator, and Google issues Hakken its own revocable key for that
   one mailbox. No password is ever seen or stored by the platform. What MFA
   blocks — rightly — is only the crude approach of giving software a
   password, and that approach stays rejected.
3. **The connector catalogue stays out of scope, except Gmail.** The other
   channels in this plan are ones Hakken owns outright (its own number, its
   own screen). The Gmail connector is deliberately the one exception, and
   it must be built so cloning still ships no credentials: connection keys
   live in tenant data, never in code or config, and each clone's owner
   connects their own mailbox through their own consent screen. For the
   showcase the app registers as an *internal* application in Ronins'
   Google Workspace, which keeps Google's public verification process out
   of scope; that process only becomes a question when a future client
   wants Gmail under a shared public registration, and per-client
   registration is the default answer.

## Pre-build baseline (verified 2026-08-13)

The following notes record the state before the showcase channels were built.
Keep them as historical context for the roadmap; do not treat them as the
current product state.

**Hakken can hear but cannot speak.** `src/hooks/useVoiceToText.ts` gives Ask
Hakken speech-to-text input. There is no text-to-speech anywhere; no reply has
ever been spoken aloud.

**A talking character is closer than it looks.** The movement demo renders and
animates VRM avatars in real time
(optional module (not included in this copy)).
The rendering knowledge transfers; the character work here is a new, separate
surface — the movement demo itself is fenced and stays untouched.

**Chat already accepts photos.** Images attach inline to Ask Hakken messages
(`convex/chat.ts`, limits in `src/lib/constants/uploads.ts` —
`CHAT_IMAGE_MAX_BYTES`, and `WIDGET_ATTACHMENT_IMAGE_MAX_BYTES` for the
widget). What is missing is *acting* on a photo, not seeing one.

**Email goes out but never comes in.** `convex/resendEmailService.ts` sends,
`convex/emailLayoutService.ts` renders the shared shell, and the workflow
email node delivers (`convex/workflowRuntime.ts`). There is no inbound email
of any kind — no connected mailbox, no reader, no reply path.

**Connector scaffolding exists; the working half does not.** Connector
definitions live in `convex/toolConnectorDefinitions.ts`, install state and a
`toolConnectorOAuthConnections` table exist (`convex/schema.ts:2236`), but
there is no token exchange, storage, refresh, or revocation — no connector
has ever completed a real connection. The Gmail phase builds that missing
half, and builds it once for every connector that comes after.

**Tasks and notifications exist and are the landing pad.** `tasks`
(`convex/schema.ts:419`) and `notifications` (`convex/schema.ts:449`) are
live, with `convex/tasks.ts` as the single door agents and workflows come
through. A phone call or email that needs a human can already become a task
with a notification — nothing new required at that end.

**The workspace CRM can receive what a call captures.** The customer and
prospect list with editable profiles exists under the sales data vertical
(Workspace Customer CRM Plan). A caller's details have somewhere real to land.

**There is no telephony anywhere.** No number, no provider, no audio
streaming. Confirmed absent; searched, zero matches.

## Design commitments (binding on every phase)

1. **No passwords, ever.** The platform never holds, sees, or types anyone's
   password. The one connection in this plan (the Gmail mailbox, phase 5)
   happens through Google's own consent screen, completed by a person with
   their normal login and MFA, and yields a scoped, revocable key held in
   tenant data. Any future channel that cannot work that way is out.
2. **Every door leads to the same brain.** A call, an email, or a photo runs
   through the same company knowledge, rules, skills and memories as typed
   chat, produces a conversation record like any other, and appears in chat
   logs, usage, and the audit trail. PII masking and retention rules apply
   unchanged. No channel gets a private side-brain.
3. **Inbound only.** Hakken never dials a phone number and never emails a
   person who has not emailed it first (replies only). Recorded above as
   Anthony's call.
4. **Each phase ends with a performable demo.** Done means Anthony can stand
   in front of a room and run it without a developer beside him — not that
   the code merged.
5. **This document owns order, scope and the recorded decisions only.** Each
   phase gets its own detailed plan (schema, files, tests) before build
   starts, written to the standard of the other active plans.
6. **The movement demo is a quarry, not a foundation.** Its avatar knowledge
   is reused by reading, never by moving or entangling its fenced code.
7. **Calls and voice sessions are recorded honestly.** A caller is told they
   are talking to an AI at the start of every call. Transcripts are stored as
   conversation records subject to the same retention rules as chat.

## The gate: a spoken channel must be able to search knowledge

**CLEARED 2026-08-13, proven live.** A spoken session on Google's engine
searched the company's knowledge mid-conversation and answered from what it
found, in Anthony's own browser. Phases 3 and 6 are unblocked.

What it took, beyond the tool itself: the relay was hanging up on every
Google call before a word reached Vertex — the page streams the microphone
the instant its socket opens, and audio arriving while the relay was still
fetching its Google token was being read as a second connection ticket. The
relay had no test coverage and logged nothing on a refusal, so the failure
looked identical to a caller who never arrived. Both are fixed: the ordering
is decided synchronously and covered by tests that fail if it regresses, and
every session now logs connect, ticket, Vertex handshake and close.

The original reason for the gate, recorded 2026-08-13, after Anthony asked a
live voice session about the knowledge base and it answered that it could not
see one — correctly.

A live voice model receives the company's instructions once when the
session opens and then talks to the caller directly; it never comes back
to this platform, so nothing in an uploaded document reaches it. The
typed assistant searches for every question. The voice does not.

**Anthony's point, and it is decisive: a receptionist that cannot answer
from the company's documents is not a receptionist.** Neither is a
telephone agent — the first real question a caller asks is about a
product, an order, or an opening time.

So the knowledge-search tool (specified in `voice-session-plan.md`) is a
**prerequisite for phases 3 and 6, not an enhancement**. Neither the
telephone agent nor the receptionist screen may be built before a spoken
session can search the company's knowledge mid-conversation and answer
from what it finds. Nothing else in this roadmap is worth demonstrating
until that is true.

## The six features, in build order

### Phase 1 — Voice-to-voice with a moving sound-shape

**What the audience sees:** you talk to Hakken on the Ask Hakken screen; it
talks back in a natural voice while an elegant animated shape moves with
the sound — rippling as it listens, moving with the voice as it speaks.

**Recorded 2026-08-13:** the character is a moving shape that represents
sound, nothing more complex — Anthony's call. The VRM avatars were
rejected for this surface as anime/childlike, and a realistic digital
human was considered and not wanted. The shape is built behind a small
swappable interface, so a face could replace it later without rework, but
none is planned.

Builds on: `useVoiceToText.ts` (hearing), streaming replies (words arrive
progressively, so speech can begin before the answer finishes).

Genuinely new: text-to-speech; a voice-session mode in Ask Hakken that
listens, speaks and shows the shape.

This phase is the foundation — phases 2, 3 and 6 all stand on it.
Detailed plan: `voice-session-plan.md`.

### Phase 2 — Any language in, answers come back in kind

**What the audience sees:** someone asks in Portuguese or Polish; Hakken
answers aloud in the same language, from the company's English knowledge.

Builds on: phase 1 whole. Genuinely new: almost nothing — detecting the
spoken language and holding the reply to it. Deliberately scheduled second
because it is the cheapest large impression in the plan.

### Phase 3 — The telephone agent, and the hang-up-and-watch finale — **DONE, proven live 2026-08-14**

**What the audience sees:** you dial a number on speakerphone; Hakken answers,
knows the company, and holds a conversation. You hang up — and on the screen
behind you, within seconds, the caller appears in the customer list, a
follow-up task lands with a named person, the bell notification fires, and
the full transcript and summary are attached.

Builds on: the voice loop from phase 1; `convex/tasks.ts` and notifications
for the follow-up; the workspace CRM for the caller record; the audit trail.

Genuinely new: a phone number with a telephony provider; the live audio
bridge between the call and the brain; the after-call step that files the
contact, raises the task, and stores the transcript.

This is the flagship demo and the reason phases 1 and 2 come first.

### Phase 4 — Show it a photo, and it acts — **BUILT, proven on dev in a browser 2026-08-14; Anthony's own phone demo outstanding**

**What the audience sees:** a photo of a delivery note, a broken part or a
price ticket goes into chat or the widget; Hakken reads it, explains it, and
does something — logs it, raises a task, answers the question it contains.

Builds on: inline chat images (already working), widget image attachments,
tasks. Genuinely new: the acting — turning what the model reads in the image
into a task, a customer note, or a structured answer, on the user's say-so.

### Phase 5 — A Gmail inbox that answers itself — **BUILT AND TESTED 2026-08-14; awaiting the mailbox, the Google app, and the live proof**

**What the audience sees:** anyone emails ask@ronins.co.uk — a real Gmail
address with a real inbox. Hakken reads the new message and replies from that
same address using the company's knowledge — or, when a human is genuinely
needed, raises a task and notification instead and tells the sender someone
will be in touch. Anyone at Ronins can open the inbox in Gmail and see
exactly what the agent received and sent — the whole exchange is inspectable
by a person, which is itself part of the demo.

Builds on: the connector scaffolding (`convex/toolConnectorDefinitions.ts`,
the `toolConnectorOAuthConnections` table), tasks and notifications, the
audit trail.

Genuinely new: the working half of connectors — Google's consent flow with
token exchange, storage, refresh and revocation; a dedicated Gmail mailbox in
Ronins' Workspace connected once by a person through Google's own login (MFA
and all); Gmail read and reply tools for the agent; the answer-versus-task
rules; and the connect/disconnect admin screen showing exactly which mailbox
Hakken holds a key to.

Boundaries, binding: Hakken is connected to **one dedicated mailbox only** —
never a person's. The key is revocable from both sides (a Hakken admin screen
and Google's own security page). Replies go only to people who emailed first.
The agent reading or sending a mail is audited like any other tool call.

### Phase 6 — The receptionist screen — **BUILT AND TESTED 2026-08-14; the tablet day is the remaining proof**

**What the audience sees:** a tablet or monitor at a reception desk or a
trade-show stand showing the talking character full-screen; visitors walk up
and just talk.

Builds on: phase 1 whole, packaged as a locked, self-resetting kiosk surface —
wakes on speech, resets between visitors, no keyboard, no navigation.
Genuinely new: only the packaging. Deliberately last: it is presentation, not
capability, and it is the piece that most benefits from every earlier phase
being solid.

## What this plan does not cover

- **The rest of the connector catalogue** — Gmail (phase 5) is the one
  deliberate exception, recorded above; nothing else connects to a
  third-party account in this plan. The consent-flow plumbing phase 5 builds
  is shared groundwork for whichever connectors come later.
- **Outbound calling** — excluded; needs its own decision.
- **WhatsApp and SMS** — a natural sibling of the telephone agent once a
  number exists, but a separate decision for a later day; not scoped here.
- **Which providers to use for speech, voices, and telephony** — a build-time
  choice belonging to each phase's detailed plan, not a product decision.
