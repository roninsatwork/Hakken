# Sonae Can Be Spoken To, Phoned, Emailed, And Shown A Photo

Status: Agreed with Anthony 2026-08-13. Not started.
Owner: Anthony

Every claim below carries the file it rests on; verify anchors before editing,
because line numbers drift. Follow the repo's working rules in `AGENTS.md`.

## The decision

Sonae's brain is finished enough to be worth showing off: one company's
knowledge, rules, memories and audit trail behind every answer. But the only
ways to reach that brain today are typed chat and the embedded widget — both
keyboards. This plan gives the same brain more doors: a voice, a face, a phone
number, an email address, a camera, and a screen in a reception area. Six
features, one story — *wherever you are and however you talk, it is the same
Sonae answering*.

Anthony's calls, recorded 2026-08-13:

1. **Sonae answers calls; it never makes them.** An inbound number demos
   better, raises no spam or consent questions, and needs no dialling rules.
   Outbound calling is not in this plan and needs a fresh decision before
   anyone builds it.
2. **The email door is Sonae's own address, not anyone's mailbox.** Sonae
   never logs into an inbox, so there is no password, no OAuth, and no MFA
   involved — Anthony's authenticator-protected email is untouched. Mail sent
   to Sonae's own address is delivered straight to the platform by the email
   provider.
3. **Connectors stay out of scope.** Every channel in this plan is one Sonae
   owns outright (its own number, its own address, its own screen). Nothing
   here authenticates against a third-party account, so all of it survives
   cloning the app for a new client.

## What is actually true today (verified 2026-08-13)

**Sonae can hear but cannot speak.** `src/hooks/useVoiceToText.ts` gives Ask
Sonae speech-to-text input. There is no text-to-speech anywhere; no reply has
ever been spoken aloud.

**A talking character is closer than it looks.** The movement demo renders and
animates VRM avatars in real time
(`src/app/(dashboard)/demos/movements/[id]/play/_components/useVrmAvatarFrameRuntime.ts`).
The rendering knowledge transfers; the character work here is a new, separate
surface — the movement demo itself is fenced and stays untouched.

**Chat already accepts photos.** Images attach inline to Ask Sonae messages
(`convex/chat.ts`, limits in `src/lib/constants/uploads.ts` —
`CHAT_IMAGE_MAX_BYTES`, and `WIDGET_ATTACHMENT_IMAGE_MAX_BYTES` for the
widget). What is missing is *acting* on a photo, not seeing one.

**Email goes out but never comes in.** `convex/resendEmailService.ts` sends,
`convex/emailLayoutService.ts` renders the shared shell, and the workflow
email node delivers (`convex/workflowRuntime.ts`). There is no inbound email
of any kind — no address, no webhook, no parser.

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

1. **No third-party authentication, ever, in this plan.** No OAuth, no
   mailbox logins, no MFA prompts. Every channel is Sonae-owned. If a phase
   turns out to need a connector, that phase stops and the plan is revisited.
2. **Every door leads to the same brain.** A call, an email, or a photo runs
   through the same company knowledge, rules, skills and memories as typed
   chat, produces a conversation record like any other, and appears in chat
   logs, usage, and the audit trail. PII masking and retention rules apply
   unchanged. No channel gets a private side-brain.
3. **Inbound only.** Sonae never dials a phone number and never emails a
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

## The six features, in build order

### Phase 1 — Voice-to-voice with a talking character

**What the audience sees:** you talk to Sonae on the Ask Sonae screen; it
talks back in a natural voice while an animated character on screen speaks
the words.

Builds on: `useVoiceToText.ts` (hearing), streaming replies (words arrive
progressively, so speech can begin before the answer finishes), VRM rendering
knowledge from the movement demo.

Genuinely new: text-to-speech; a voice-session mode in Ask Sonae that listens,
speaks and shows the character; mouth movement driven by the audio.

This phase is the foundation — phases 2, 3 and 6 all stand on it.

### Phase 2 — Any language in, answers come back in kind

**What the audience sees:** someone asks in Portuguese or Polish; Sonae
answers aloud in the same language, from the company's English knowledge.

Builds on: phase 1 whole. Genuinely new: almost nothing — detecting the
spoken language and holding the reply to it. Deliberately scheduled second
because it is the cheapest large impression in the plan.

### Phase 3 — The telephone agent, and the hang-up-and-watch finale

**What the audience sees:** you dial a number on speakerphone; Sonae answers,
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

### Phase 4 — Show it a photo, and it acts

**What the audience sees:** a photo of a delivery note, a broken part or a
price ticket goes into chat or the widget; Sonae reads it, explains it, and
does something — logs it, raises a task, answers the question it contains.

Builds on: inline chat images (already working), widget image attachments,
tasks. Genuinely new: the acting — turning what the model reads in the image
into a task, a customer note, or a structured answer, on the user's say-so.

### Phase 5 — An email address that answers itself

**What the audience sees:** anyone emails Sonae's own address; a correct,
on-brand reply comes back from the company's knowledge — or, when a human is
genuinely needed, a task and notification appear instead and the sender is
told someone will be in touch.

Builds on: outbound email (`resendEmailService.ts`, the shared shell), tasks
and notifications. Genuinely new: inbound delivery — Sonae's own address, the
provider webhook that hands mail to the platform, and the decision rules for
answer-versus-task.

Recorded here because Anthony asked: **his MFA is not a problem.** Sonae
never touches an existing mailbox. The address is Sonae's own; mail arrives
by webhook from the provider; there is nothing to log into.

### Phase 6 — The receptionist screen

**What the audience sees:** a tablet or monitor at a reception desk or a
trade-show stand showing the talking character full-screen; visitors walk up
and just talk.

Builds on: phase 1 whole, packaged as a locked, self-resetting kiosk surface —
wakes on speech, resets between visitors, no keyboard, no navigation.
Genuinely new: only the packaging. Deliberately last: it is presentation, not
capability, and it is the piece that most benefits from every earlier phase
being solid.

## What this plan does not cover

- **Connectors and third-party OAuth** — deliberately excluded, recorded
  above.
- **Outbound calling** — excluded; needs its own decision.
- **WhatsApp and SMS** — a natural sibling of the telephone agent once a
  number exists, but a separate decision for a later day; not scoped here.
- **Which providers to use for speech, voices, and telephony** — a build-time
  choice belonging to each phase's detailed plan, not a product decision.
