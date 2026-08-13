# Ask In Any Language, Sonae Answers In Kind

Status: Drafted 2026-08-13 from verified code research. Phase 2 of the
showcase channels roadmap (`showcase-channels-plan.md`). Not started.
Depends on: `voice-session-plan.md` (phases A–B must exist first).
Owner: Anthony

Every claim below carries the file it rests on; verify anchors before editing,
because line numbers drift. Follow the repo's working rules in `AGENTS.md`.

## The decision

Someone speaks to the voice session in Portuguese, Polish, or Italian;
Sonae answers aloud in that same language, drawing on the company's
English knowledge. Deliberately scheduled second in the roadmap because it
is the cheapest large impression in the plan: almost everything it needs
is Phase 1 plus discipline about language.

Recorded decisions:

1. **The user's language wins, turn by turn.** The reply language follows
   the language of the user's latest turn — switch mid-conversation and
   Sonae switches with you. No language picker, no settings; detection is
   the feature.
2. **Knowledge stays in its own language.** Nothing translates the
   company's stored knowledge; the model reads English knowledge and
   answers in the caller's language, which modern models do natively.
3. **This phase covers the voice session only.** Typed chat already
   answers in whatever language it is addressed in at the model's
   discretion; making written-chat language behaviour a stated guarantee
   is out of scope here.

## What is actually true today (verified 2026-08-13)

**Transcription has no language handling at all.**
`api.ai.transcribeAudio` (`convex/ai.ts:537-582`) prompts "Transcribe the
following audio exactly…" with no language parameter; whatever language the
model hears, it transcribes at its own discretion. The client hook
(`src/hooks/useVoiceToText.ts`) sets no `lang` anywhere.

**No reply-language rule exists.** Nothing in the prompt assembly for
`generateSonaeResponse` (`convex/ai.ts:154`) mentions language.

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

- `transcribeAudio` (`convex/ai.ts:537`) prompt extended to return the
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
  `generateSonaeResponse` builds its system content, `convex/ai.ts:154` —
  scoped so typed chat behaviour is untouched.)
- `synthesizeSpeech` accepts the language code and picks the voice from
  the config map (commitment 3).
- The session UI captions both sides in whatever language is live, and the
  AI-disclosure line renders from the existing locale machinery.

## Phase C — Proof

- Unit: language map fallback, uncertain-detection holdover, first-turn
  default.
- Live, scripted for the showroom: ask in English, then switch to another
  language mid-session and watch Sonae switch back with you; transcript
  afterwards shows both languages verbatim.
- Done when a bilingual colleague can hold a two-language conversation
  without touching a setting.

## Out of scope, recorded

- Translating stored knowledge, documents, or the dashboard UI.
- A language guarantee for typed chat and the widget (behaviour today is
  model discretion; formalising it is a separate decision).
- Regional voice preferences per company (single global voice map first).
