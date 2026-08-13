# Sonae Speaks — The Voice Session And The Talking Character

Status: Drafted 2026-08-13 from verified code research. Phase 1 of the
showcase channels roadmap (`showcase-channels-plan.md`). Not started.
Owner: Anthony

Every claim below carries the file it rests on; verify anchors before editing,
because line numbers drift. Follow the repo's working rules in `AGENTS.md`.

## The decision

Ask Sonae gets a voice session: the user talks, Sonae talks back in a natural
voice, and a character on screen speaks the words. This is the foundation
phase — the languages phase, the telephone agent, and the receptionist kiosk
all reuse what is built here.

Recorded decisions:

1. **The character is a moving shape that represents sound — nothing more.**
   Anthony's call, 2026-08-13. The existing VRM avatars were rejected for
   this surface (anime/childlike, wrong for a business showcase), and a
   realistic digital human was considered and not wanted — the face is an
   elegant animated shape (the ChatGPT-voice-mode idiom) that ripples while
   listening, holds while thinking, and moves with the voice while
   speaking. It is still built behind the small interface below, so a
   different face could replace it later without touching the session — but
   no such work is planned or wanted.
2. **The speaking voice comes from Google, through the credentials the app
   already holds.** Transcription is already Google-only
   (`convex/aiModelService.ts:131` records that no neutral audio contract
   exists). Speech synthesis follows the same pattern: a new `speech` use
   case, Google-only, no new accounts or keys. The exact Google voice model
   is a build-time choice.
3. **Turn-based first.** You speak, it answers, you speak again. Interrupting
   Sonae mid-sentence ("barge-in") and hands-free open-mic detection are
   deliberately out of this phase — they are hard to get right and the demo
   does not need them. The receptionist kiosk phase revisits hands-free.
4. **A voice session is a normal thread.** No new conversation machinery:
   messages land in the existing `messages` table, the transcript is visible
   afterwards in the thread like any typed chat, retention and quota rules
   apply unchanged, and the session states clearly that an AI is speaking
   (umbrella plan commitment 7).

## What is actually true today (verified 2026-08-13)

**Hearing exists and is turn-based.** `src/hooks/useVoiceToText.ts` (90
lines): MediaRecorder buffers the whole clip, base64s it, and calls
`api.ai.transcribeAudio` (`convex/ai.ts:537-582`) — a `tenantAction`,
Google-Vertex-only, MIME allowlist (`convex/ai.ts:51-63`), 10 MB cap, 6
calls/minute rate limit reserved through `aiActionRequests`. No interim
results, no language setting, errors swallowed to `console.error`, and no
`MediaRecorder.isTypeSupported` negotiation (Safari's `audio/mp4` happens to
be allowlisted; unlisted codec strings fail server-side). The permission
modal copy claims "native Web Speech API" (`ChatInput.tsx:514`,
`messages/en.json`) — untrue; fix in passing.

**Replies stream progressively into one message row.** The backend flushes
accumulated text every 250 ms / 120 chars
(`convex/streamingService.ts:14-33`) via
`appendStreamingAssistantMessage` (`convex/chat.ts:412-421`), the client
re-renders through the `getMessages` subscription, and
`useSmoothStreamText` paces the reveal (90 chars/sec,
`src/lib/streamReveal.ts`). **`isStreaming === false` is the definitive
"reply finished" signal** (`getStreamPresentation`,
`convex/streamingService.ts:56-66`). This is what lets speech start before
the full answer exists.

**There is no text-to-speech anywhere.** Searched: no `speechSynthesis`, no
TTS SDK, no audio-out route. The model catalogue actively filters TTS models
out of sync (`convex/aiModelsActions.ts:73,100`;
`convex/vertexProviderService.ts:127`) — that filter must learn about the
`speech` use case. A media-capability concept already exists in the
catalogue (`getMediaCapabilities`, `convex/aiModelsActions.test.ts:34`).

**Audio playback precedent is thin.** The widget references a notification
chime whose asset does not exist (`src/app/w/[widgetId]/page.tsx:76` —
`public/sounds/` is missing; it fails silently). The only `AudioContext` in
the repo is the arcade game's self-contained engine
(`src/app/(dashboard)/app/arcade/ronins-run/engine/AudioEngine.ts`). Voice
playback is new ground on the client.

**A composer "mode" pattern exists to copy.** `isAutonomousMode` in
`ChatInput.tsx:86` changes what the composer sends
(`thinkingLevel: "SWARM"`) and disables selectors; the server branches in
`sendMessage` (`convex/chat.ts:303-324`). The i18n key
`ai.assistant.controls.speak` ("Speak") already exists. Thread-level
transient state has a pattern too: `threads.assistantStage` with a staleness
guard (`convex/chat.ts:100-130`).

**The three.js boundary is enforced by a test — and the shape never
touches it.** `src/movement-boundary.test.ts` fails the build if anything
outside `src/app/(dashboard)/demos/` or `src/lib/movements/` imports
three.js or VRM libraries — deliberate bundle-size protection (~4.3 MB of
client chunks). The sound-shape uses CSS/canvas only, so no boundary
change is ever needed. (For the record, should a 3D face ever be wanted
later: the roster VRMs carry full mouth-shape presets, and
`VrmExpressionTargetWriter` at
`src/app/(dashboard)/demos/movements/_lib/vrmRigging.ts:138` already
decouples expression driving from the VRM manager. No lip-sync-from-audio
code exists anywhere.)

## Design commitments (binding on every phase)

1. **The character interface is
   `{ state: listening | thinking | speaking, level: 0..1 }` and nothing
   more.** No face implementation may reach into chat state, threads, or
   audio internals. `level` is the live loudness of whichever side is
   talking, from a WebAudio analyser.
2. **Every voice session discloses the AI and lands in a real thread.** The
   session screen shows a permanent "You're talking to {platformName}'s AI"
   line; every user turn and spoken reply is a normal `messages` row;
   nothing is audio-only. The spoken text is exactly the message text —
   never a separate script.
3. **Speech synthesis is a tenant-scoped, rate-limited action** shaped like
   `transcribeAudio`: `tenantAction`, reserved through `aiActionRequests`,
   size-capped, Google-only behind the `speech` use case. No client ever
   holds a Google credential.
4. **Voice mode degrades to text gracefully.** Any synthesis or playback
   failure shows the reply as text in place with a quiet notice — a voice
   session must never eat an answer.
5. **No autoplay traps.** Audio playback starts only from the user's
   session-start gesture (browsers require it); the session holds one
   unlocked audio pipeline for its lifetime.
6. **Quota is charged once.** A voice turn is one message — the existing
   chat quota path (`convex/chatService.ts:121-154`) applies; synthesis and
   transcription ride the `aiActionRequests` rate limits, not the message
   quota.

## Phase A — Sonae can make sound

**Goal:** a Convex action turns text into speech audio, the house way.

- `speech` use case added beside `transcription` in
  `convex/aiModelService.ts` (Google-only, same guard shape); the TTS
  exclusion filters in `convex/aiModelsActions.ts:73,100` and
  `convex/vertexProviderService.ts:127` learn to admit the configured
  speech model rather than stripping every TTS model from the catalogue.
- `convex/ai.ts` gains `synthesizeSpeech` (tenantAction): input
  `{ text, voiceKey? }`, text length cap, rate limit via
  `aiActionRequests.reserve` (new `"synthesizeSpeech"` literal beside
  `"transcribeAudio"` in `convex/schema.ts:553` and
  `convex/aiActionRequests.ts:6`), returns base64 audio + MIME. Nothing is
  persisted — same in-memory discipline as transcription.
- Tests first, mirroring `transcribeAudio`'s: rejects oversize text,
  reserves the rate limit, refuses when the speech model is unconfigured
  with a plain error.

## Phase B — The voice session surface

**Goal:** a full-screen voice mode inside Ask Sonae with the turn loop.

- Entry: a "Speak" control in the assistant composer (the i18n key already
  exists) opening a full-screen session overlay on the current thread (or a
  fresh thread from the welcome screen). Exit returns to the normal thread
  view showing everything said.
- The turn loop, built on what exists: tap to talk → `useVoiceToText`-style
  capture → `transcribeAudio` → `api.chat.sendMessage` (unchanged) →
  watch the reply row via the existing `getMessages` subscription →
  synthesize and play → back to listening.
- **Sentence-buffered speaking:** as flushed content grows in the streaming
  row, completed sentences are cut, synthesized, and queued, so Sonae
  starts talking a beat after the first sentence lands rather than waiting
  for the whole answer; `isStreaming === false` closes the queue. Ordering
  is strictly FIFO; a turn's queue is abandoned wholesale if the user
  starts a new turn.
- Mic hook hardening while we are in there: expose explicit start/stop
  (today only `toggleRecording` exists), add
  `MediaRecorder.isTypeSupported` negotiation, surface errors as state
  instead of `console.error`, and fix the misleading "Web Speech API"
  permission copy in both locales.
- The session shows live captions of both sides (accessibility and demo
  legibility), the AI-disclosure line, and a visible "tap to talk" state
  machine: **listening → thinking → speaking**, driven by recording state,
  `assistantStage`/`isStreaming`, and playback state respectively.

## Phase C — The shape

**Goal:** the moving sound-shape, live on the session screen.

- `SpeakingCharacter` component with the commitment-1 interface; a WebAudio
  `AnalyserNode` on the playback pipeline supplies `level` while speaking,
  and on the mic stream while listening — so the shape genuinely moves
  with the sound in the room, both ways.
- Implementation is CSS/canvas — no three.js, no boundary-test change —
  branded from theme tokens per the Theme Compliance Plan rather than
  hardcoded colours, with distinct listening / thinking / speaking
  characters of movement so a viewer can read the state from across a room.
- Honours `prefers-reduced-motion` with a gentler variant.

## Phase D — Proof

- Unit: sentence cutter (never speaks a half-sentence, handles the final
  fragment), queue abandonment on new turn, degrade-to-text on synthesis
  failure, quota charged exactly once per voice turn.
- Live: a full spoken conversation on dev — question in, spoken answer
  begins before the row finishes streaming, transcript visible in the
  thread afterwards, session survives a synthesis failure mid-conversation
  by falling back to text.
- Done when Anthony can run a voice conversation in front of a room with no
  developer present.

## Out of scope, recorded

- Barge-in and open-mic/hands-free (kiosk phase revisits).
- Voice in the embedded widget (the iframe already carries
  `allow="microphone"` — `public/embed.js` — so it is feasible later; not
  this phase).
- Speaking any language other than the reply's own text — that is Phase 2's
  plan.
- Persisting audio. Nothing stores sound; only text is kept.
