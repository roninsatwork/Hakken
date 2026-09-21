# Ask In Any Language, Hakken Answers In Kind

Status: **Reply-language work done 2026-08-13.** Phase 2 of the showcase
channels roadmap (`showcase-channels-plan.md`). Interpreter mode is still
to do and is a separate phase. Owner: Anthony

**This plan was drafted against the old turn-based voice and its phases A–C
below no longer describe the work.** That voice recorded a clip, transcribed
it, generated a written reply and then read it aloud, so making it
multilingual meant detecting a language code, threading it through the
prompt, and choosing a matching synthesis voice. The live voice session
replaced all three steps with one speech-to-speech model: it hears the
caller directly and speaks directly back. There is no transcription step to
report a language, no per-turn prompt assembly to receive one, and no
synthesis call to pick a voice for.

So the reply-language feature became an instruction rather than a pipeline,
and it is now in `REALTIME_VOICE_STYLE` (`convex/aiVoiceSession.ts`): answer in the
language you are spoken to in, switch the moment the speaker switches, never
announce it, and never read a stored passage out in its language rather than
theirs. The knowledge tool's description carries the other half — search in
the language the documents are written in, usually English, then answer in
the caller's — because a Portuguese question embedded against English
documents retrieves badly. Covered by tests in `convex/ai.test.ts`.

Phases A–C are kept below for the record and because Phase A still describes
real work for the **dictation** path (`useVoiceToText.ts`), which is
unchanged and still transcribes. Do not build B or C as written.

Every claim below carries the file it rests on; verify anchors before editing,
because line numbers drift. Follow the repo's working rules in `AGENTS.md`.

## The decision

Someone speaks to the voice session in Portuguese, Polish, or Italian;
Hakken answers aloud in that same language, drawing on the company's
English knowledge. Deliberately scheduled second in the roadmap because it
is the cheapest large impression in the plan: almost everything it needs
is Phase 1 plus discipline about language.

Recorded decisions:

1. **The user's language wins, turn by turn.** The reply language follows
   the language of the user's latest turn — switch mid-conversation and
   Hakken switches with you. No language picker, no settings; detection is
   the feature.
2. **Knowledge stays in its own language.** Nothing translates the
   company's stored knowledge; the model reads English knowledge and
   answers in the caller's language, which modern models do natively.
3. **This phase covers the voice session only.** Typed chat already
   answers in whatever language it is addressed in at the model's
   discretion; making written-chat language behaviour a stated guarantee
   is out of scope here.

## The interpreter, recorded 2026-08-13

Anthony raised the live speech-to-speech translation models — Google's
live-translate preview and OpenAI's realtime-translate, both around 3–4p
per minute. They are worth building — but as a **second, separate mode**,
not as the engine for this plan.

The distinction that decides it: a translate model *renders* what you say
into another language. It does not answer from company knowledge, follow
company rules, or use skills — it interprets. So it cannot replace the
conversation model; it earns its place as an **interpreter mode**, where
two people who share no language talk through Hakken in the middle, live.
That is a genuinely striking demo and a real product for a business with
overseas customers.

Availability, checked in the catalogue on 2026-08-13: OpenAI's
realtime-translate model is synced and available. Google's live-translate
model is not published to this Vertex project, though its native-audio
conversation model **is** — and is now switched on for the Realtime job.
Whichever provider is used, it stays a Model Defaults choice under its own
job, never a hardcoded id. Model ids are deliberately not written here:
the guard in the drift suite forbids them everywhere outside the
catalogue, precisely so a name in a document cannot become a name in code.

Sequence: the reply-language work below lands first, because it makes
every existing surface multilingual for almost no new machinery.
Interpreter mode follows as its own phase with its own screen — it is a
different conversation shape (two humans, no assistant answering) and
should not be bolted onto the assistant session.

## Pre-live-voice baseline (verified 2026-08-13)

The following notes record the older turn-based transcription baseline. The
reply-language feature is now implemented as realtime voice instruction and
knowledge-tool behavior, as described at the top of this plan.

**Transcription has no language handling at all.**
`api.aiSpeech.transcribeAudio` (`convex/aiSpeech.ts:537-582`) prompts "Transcribe the
following audio exactly…" with no language parameter; whatever language the
model hears, it transcribes at its own discretion. The client hook
(`src/hooks/useVoiceToText.ts`) sets no `lang` anywhere.

**No reply-language rule exists.** Nothing in the prompt assembly for
`generateHakkenResponse` (`convex/aiChat.ts:154`) mentions language.

**Messages carry no language field** (`messages`,
`convex/schema.ts:1930-1971`) — and this plan does not add one; language
is resolved per turn, not stored.

**A locale precedent exists for platform-authored text.** The widget's
quota refusal renders by `systemKey` in the visitor's browser language
(`src/lib/widgetSystemMessages.ts`, en + it implemented) — the pattern for
any fixed UI copy the voice session shows, not for the spoken replies
themselves.

**Phase 1 gives us the mouth.** The `speech` use case and
`synthesizeSpeech` action are Phase 1 deliverables; Google's speech
synthesis is voice-per-language, so speaking a language means choosing a
voice for it.

## Design commitments

1. **Detection is server-side and single-source.** The transcription step
   returns `{ text, languageCode }` in one call — no separate detection
   request, no client-side guessing. If detection is uncertain, the
   session's previous turn language holds; the first turn defaults to
   English.
2. **The spoken reply and the stored text are the same words in the same
   language.** The thread transcript shows exactly what was said, in the
   language it was said in — no shadow translations.
3. **Voice selection is a small config map, not a schema.** Language code →
   Google voice name, with an explicit fallback voice; unmapped languages
   still answer (default voice attempts the text) rather than failing the
   turn.

## Phase A — Transcription reports the language

- `transcribeAudio` (`convex/aiSpeech.ts:537`) prompt extended to return the
  transcript plus a BCP-47 language code as structured output; the action's
  return shape becomes `{ text, languageCode }`. Existing callers
  (`ChatInput.tsx:68`, assistant welcome page) keep working — they use only
  `text`.
- Tests: English clip → `en`; a non-Latin-script clip fixture → correct
  code; garbage audio → empty text and no crash.

## Phase B — The reply follows the language

- The voice session passes the detected code with `sendMessage`, and the
  prompt assembly for voice-session turns gains one instruction: reply in
  the language of the user's message. (Anchor the change where
  `generateHakkenResponse` builds its system content, `convex/aiChat.ts:154` —
  scoped so typed chat behaviour is untouched.)
- `synthesizeSpeech` accepts the language code and picks the voice from
  the config map (commitment 3).
- The session UI captions both sides in whatever language is live, and the
  AI-disclosure line renders from the existing locale machinery.

## Phase C — Proof

- Unit: language map fallback, uncertain-detection holdover, first-turn
  default.
- Live, scripted for the showroom: ask in English, then switch to another
  language mid-session and watch Hakken switch back with you; transcript
  afterwards shows both languages verbatim.
- Done when a bilingual colleague can hold a two-language conversation
  without touching a setting.

## Out of scope, recorded

- Translating stored knowledge, documents, or the dashboard UI.
- A language guarantee for typed chat and the widget (behaviour today is
  model discretion; formalising it is a separate decision).
- Regional voice preferences per company (single global voice map first).
