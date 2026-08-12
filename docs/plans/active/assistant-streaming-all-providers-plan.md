# The Assistant Streams Its Reply On Every Provider

Status: Built 2026-08-11, same day as agreed. Full gate green (4,496 tests,
504 files). Proven live in Anthony's browser on OpenAI the same evening — see
"As built" below for what that proof showed and which proofs remain.
Owner: Anthony

Every claim below carries the file it rests on; verify anchors before editing,
because line numbers drift. Follow the repo's working rules in `AGENTS.md`.

## The decision

A reply should appear word by word as the model writes it, whichever provider
is answering. Today that is true only some of the time, and which times is an
accident of provider choice that no user could be expected to understand.
Anthony's call, 2026-08-11: close the gap on all three remaining providers so
streaming is a property of the platform, not of one vendor. This plan owns the
`onText` behaviour of the three assistant-path provider adapters and nothing
else about them; provider resolution stays with the OpenRouter And Model Scale
Plan, and the agent loop's streaming (already complete) stays with the agent
runtime.

## What is actually true today (verified 2026-08-11)

The hard part of streaming was built long ago and is shared. The write side —
lazy row creation on the first fragment, throttled full-content patches, the
stalled presentation, mid-stream failure closing the row with partial text and
a notice — lives in `convex/chat.ts` (`startStreamingAssistantMessage`,
`appendStreamingAssistantMessage`, `finishStreamingAssistantMessage`),
`convex/streamingService.ts` (flush policy: at most one write per 250 ms or
120 pending characters), and `src/hooks/useStreamPresentation.ts`. The widget,
the assistant, and the agentic-testing sandbox all render through it already.

What varies is whether anything feeds it:

- **Agent-backed threads stream on all four providers.** Every adapter behind
  `convex/agentProviderRegistry.ts` honours `onText`
  (`googleAgentProvider.ts`, `anthropicAgentProvider.ts`,
  `openaiAgentProvider.ts`, `openrouterAgentProvider.ts`).
- **Plain assistant threads stream on Google Vertex only.** Phase 3 of the
  Platform Improvement Plan (done 2026-08-09) added `onText` to
  `AiGenerationRequest` (`convex/aiRuntimeTypes.ts`) and taught
  `convex/googleProviderAdapter.ts` to route to
  `streamVertexContentWithRetry` when a listener is present. The other three
  assistant adapters — `convex/openaiProviderService.ts`,
  `convex/anthropicProviderService.ts`, `convex/openrouterProviderService.ts`
  — never call `onText`; their replies land in one write. That phase's own
  closing note names this exact remainder: "~1 day each."
- **The plumbing the three adapters need already exists and is proven in the
  agent loop.** Shared SSE framing in `parseProviderSseChunk`
  (`convex/providerHttpService.ts`); delta-and-usage accumulators in
  `createOpenRouterStreamAccumulator` (`convex/openrouterMessageService.ts`,
  used byte-for-byte by the OpenAI agent adapter too) and
  `createAnthropicStreamAccumulator` (`convex/anthropicStreamService.ts`);
  and the uniform retry rule — retry only while no fragment has been
  delivered, because a retry after delivery would replay the answer
  (`withProviderRetry(... shouldRetry: () => !delivered)`, seen at all four
  agent streaming sites).
- **A widget without an agent takes the plain assistant path**, so an
  agent-less widget on a non-Google model answers in one lump today
  (`convex/widgets.ts` stamps `agentId` onto widget threads when one is set;
  `convex/chat.ts` fans out accordingly).
- **The existing proof to imitate** is `convex/ai.test.ts`, describe block
  "assistant reply streaming": long reply lands via the streamed row with
  tokens intact; a non-streaming provider keeps the single-write path; a
  provider killed mid-answer yields one closed message, not a stalled row
  plus an error message.

### Confirmed absent (searched, zero matches)

- No HTTP/SSE endpoint serves streamed text to the browser; delivery is
  incremental Convex document writes fanned out by reactive queries. This
  plan does not change that.
- No server-side sweeper closes an orphaned plain-assistant stream (the agent
  loop has one via the checkpoint cron). Recorded below, not fixed here.

## Design commitments (binding on every phase)

1. The flush policy in `convex/streamingService.ts` is not touched. One write
   per 250 ms / 120 characters is the agreed cost ceiling; per-token writes
   would turn a 500-token answer into 500 transactions.
2. The append mutation keeps writing the full accumulated text, never a
   delta. A retried or out-of-order write must not be able to corrupt a
   reply.
3. The retry rule is the agent loop's, verbatim: retry a failed stream only
   if no fragment has been delivered. After the first delivered fragment, a
   failure closes the row with the partial text and the failure notice.
4. Structured-output callers (`jsonSchema`) never stream. The boundary
   already written into `convex/googleProviderAdapter.ts` — listeners and
   schemas are mutually exclusive — holds for all four adapters.
5. A provider that cannot stream must degrade to exactly today's single-write
   behaviour, not fail. No caller may be required to know which providers
   stream.
6. Token counts survive streaming. `finishStreamingAssistantMessage` carries
   the same usage figures the single-write path saves; a streamed reply that
   loses its token count is a regression, and the existing test proves it.

## Phase 1 — OpenRouter streams

**Goal:** the provider with the widest model coverage (~400 catalogued
models) answers word by word in plain assistant threads.

Work: teach `convex/openrouterProviderService.ts` to request `stream: true`
and feed `onText` when a listener is present, reusing
`createOpenRouterStreamAccumulator` and `parseProviderSseChunk` exactly as
`convex/openrouterAgentProvider.ts` does; wrap in `withProviderRetry` with
the delivered guard. No listener → today's `requestProviderJson` path,
unchanged.

### 1.1 Tests (write first), in `convex/ai.test.ts` or a sibling

- "an openrouter reply streams into the message row" — simulated SSE chunks;
  `streamStartedAt` defined; final content equals the concatenation; tokens
  present.
- "an openrouter stream that dies mid-answer closes the row once" — partial
  text plus the failure notice; `isStreaming` false; no second message.
- "an openrouter failure before the first fragment retries" — and after the
  first fragment does not.

**Definition of done:** the three tests pass; the no-listener path is proven
untouched by an existing-behaviour test; full suite green.

## Phase 2 — OpenAI streams

**Goal:** same behaviour on `convex/openaiProviderService.ts`.

Work: identical shape to Phase 1 — the OpenAI agent adapter already consumes
the OpenRouter accumulator byte-for-byte, so this is the same wiring against
the OpenAI endpoint. Same three tests, same definition of done.

## Phase 3 — Anthropic streams, and its parser debt is paid

**Goal:** same behaviour on `convex/anthropicProviderService.ts`, using
`createAnthropicStreamAccumulator`.

This phase also honours a note recorded in `convex/providerHttpService.ts`:
`anthropicStreamService.ts` predates the shared SSE parser and keeps its own
copy, to be adopted "whenever that path is next touched". This plan touches
it, so the private copy goes and both the agent and assistant Anthropic paths
frame SSE through `parseProviderSseChunk`. The accumulator's own tests must
pass unchanged after the swap.

Same three tests as Phase 1, plus: "the anthropic accumulator behaves
identically through the shared parser" (existing fixtures, re-run).

**Decision gate — live proof.** The Anthropic adapter has never made a live
call (recorded in `docs/plans/active/OUTSTANDING-TASKS.md`). Simulated-chunk
tests satisfy this plan's gate, matching how every other adapter was proven.
A live streamed call needs a funded key and Anthony's go-ahead; when it
happens, record it here. Do not hold the phase for it.

## Phase 4 — Truth pass and browser proof

**Goal:** the documents say what is now true, and a person has watched it.

- `PRODUCT.md` §10 stops listing response streaming as not built; the
  Platform Improvement Plan's Phase 3 closing note gains a pointer here.
- Browser proof in the usual form: one plain assistant thread per provider,
  watched answering word by word in Anthony's browser, noted here with the
  date. An agent-less widget on a non-Google model is the fourth check, since
  it exercises the same path anonymously.

## As built, 2026-08-11

All three adapters stream, by the shape the plan specified. Departures from
the spec above, each deliberate:

- **The fetch-read-decode-frame loop was extracted once rather than copied
  three more times.** `readProviderSseStream` in
  `convex/providerHttpService.ts` now owns the response check, the
  `stream: true` decode, and the dispatch; the three new assistant streaming
  paths call it. The three agent adapters keep their in-line copies — their
  refactor stays out of scope as planned.
- **Twelve adapter tests, not nine.** Each provider also proves its
  no-listener path untouched (OpenAI's additionally pins that schema and
  plain calls stay on the Responses API while streaming goes over chat
  completions).
- The framing tests in `convex/anthropicStreamService.test.ts` were
  re-pointed at the shared parser rather than moved, so the
  split-mid-line-under-load coverage survives the private copy's retirement
  in place.

**Proof:**
- Full gate 2026-08-11: guards, lint, typecheck, 4,496 tests in 504 files,
  all green.
- **OpenAI, proven live in Anthony's browser 2026-08-11:** a plain assistant
  reply on an OpenAI chat model landed with `streamStartedAt` set,
  `isStreaming: false`, and usage intact (475 in / 170 out) — the
  database-visible proof the reply arrived through the streamed path. This
  was also the first live streamed call through the OpenAI assistant adapter.
- Vertex was proven 2026-08-09 under the Platform Improvement Plan.
- **OpenRouter live proof pending — on credits, not code.** An OpenRouter
  model (MoonshotAI Kimi K3) is now offered in the chat picker, but the
  OpenRouter account carries no credits yet (Anthony, 2026-08-12), so a live
  call would be refused at their door. Simulated-chunk tests are green; the
  first real message after crediting the account completes this proof.
- **Anthropic live proof pending** behind decision gate 3g, as specified.

## Addendum — reveal pacing, 2026-08-11 (Anthony's feedback, same evening)

Watching the live proof, Anthony's verdict was that the streaming *felt*
weak: a fast model's answer landed in lumps, or all at once. He was right,
and the cause is by design — the flush policy writes at most four times a
second, so the raw row grows in blocks, and a model that answers in under a
second produces one or two blocks.

The fix is presentation, not more writes (design commitment 1 stands): the
screen now types out whatever has arrived at a readable pace, accelerating
so it never trails the row by more than ~1.2s, and finishing within ~0.4s of
the stream closing. Pure pacing in `src/lib/streamReveal.ts` (6 tests), the
animation in `src/hooks/useSmoothStreamText.ts`, applied to the dashboard
bubble (`ChatMessage.tsx`) and the widget. The caret, timestamp, and rating
controls follow the reveal rather than the raw row, so a reply still typing
still reads as being written. History does not replay: only a row seen
streaming animates.

Verified in Anthony's browser 2026-08-11: consecutive frames of a live GPT
5.6 Luna reply show the answer growing progressively with the controls
appearing only at the end.

**The decorative status line is gone — replaced with real stages, decided by
Anthony and built 2026-08-11.** `useProgressiveLoading.ts` (four random
phrases on a 1.2s timer) is deleted along with its `loadingStages` strings in
both locales. The run itself now notes which phase it is in —
`threads.assistantStage`, written by `generateSonaeResponse` as it enters
checking / reading files / searching knowledge / writing, cleared however the
run exits (proven by three tests in `convex/ai.test.ts`) — and the pill
(`AssistantStagePill.tsx`, reading `getPresentableAssistantStage` in
`convex/streamingService.ts`, 4 tests) shows the noted stage or a plain
"Thinking…", never an invention. A stage a crashed run leaves behind is
ignored after the stale window. Conditional honesty holds: no files, no
"Reading your files…".

Also from the same feedback session, 2026-08-11:

- **Composer menus rebuilt honestly and compactly.** "Verified Grid Engines"
  → "Model"; the invented per-model subtitle line ("Active production
  capability") is gone; "Agent Reasoning Effort" → "Thinking" with plain
  labels and truthful descriptions, translated in both locales. The thinking
  menu now renders **only when the selected model acts on the setting** —
  on this path that is Google models; the other adapters ignore
  `thinkingLevel`, so offering "Deep thinking" there was a decorative lie.
  A hidden menu sends `NONE`, so the request matches what the screen offered.
- **The transcript follows the typed reply.** The thread page now watches
  transcript growth (`ResizeObserver`) and keeps the bottom in view while
  the reader is within 120px of it, releasing the moment they scroll up —
  the per-database-write nudge could not follow the continuous reveal and
  left the reader dragging the scrollbar.
- Verified live in Anthony's browser 2026-08-11: reply typing with the page
  following, thinking menu absent on an OpenAI model, stage note confirmed
  cleared in the database after the run. Full gate green after all of it.

**Voice dictation — fixed later the same evening.** The failure was a
hardcoded region: `transcribeAudio` pinned `us-central1` while the project
serves the model in the configured region every other call uses. The pin is
gone, a test in `convex/ai.test.ts` fails if it returns, and the fix was
proven by Anthony's own dictation landing in the composer.

Also fixed in the same session, recorded here as the session's log even
though they sit outside this plan's ownership:

- **Sidebar conversation list paginated** (`chat.getThreads` now pages 25 at
  a time with database-side title search via a new `threads` search index;
  the old version took the newest 100 and made anything older unfindable).
- **Thread titles unbroken on OpenAI reasoning models** — they reject the
  `temperature` parameter; the adapter now retries without it on both the
  single-write and streamed paths, with tests. This was why sidebars filled
  with "New Conversation".

## What this plan deliberately does not do

- **Swarm replies stay single-write.** The swarm path
  (`convex/swarmActions.ts`) narrates per-agent status live already; its
  final text landing at once is a separate, smaller decision.
- **Triggered and scheduled agent runs stay as they are.** A triggered run
  has no thread, so there is nowhere to stream to
  (`convex/agentRuntime.ts` says exactly this); giving observability a live
  transcript is Agent Observability Plan territory.
- **No streaming for structured output** (reports, node-config generation,
  eval grading). Partial JSON is a rendering strategy this platform has not
  chosen, and no phase here depends on choosing it.
- **No transport change.** Convex reactive queries remain the delivery
  mechanism; no SSE endpoint to the browser.

## Noticed in passing, not changed

- An orphaned plain-assistant stream is only ever resolved client-side, by
  the ten-minute stale presentation; the agent loop has a real sweeper cron.
  If a sweeper is ever wanted for the assistant path, it belongs beside
  `agentRunCheckpoints.recoverStalledRuns`, not in this plan.
- Two near-identical flush loops exist (`convex/ai.ts` and
  `convex/agentRuntime.ts`). Consolidation was considered and declined here:
  this plan changes adapters, and a shared-loop refactor would widen the
  blast radius of every phase.

## Sequencing and dependencies

```
Phase 1 (OpenRouter) ──► Phase 2 (OpenAI) ──► Phase 3 (Anthropic) ──► Phase 4 (truth pass)
```

Phases 1–3 are independently releasable; the order above is coverage-first
(OpenRouter fronts the most models) and puts the only phase with extra scope
(the parser adoption) last, after the pattern is twice-proven. Phase 4 waits
for all three.

## Work queue

- [x] **1** OpenRouter assistant adapter streams; four tests; suite green
      (2026-08-11)
- [x] **2** OpenAI assistant adapter streams; four tests; suite green
      (2026-08-11)
- [x] **3** Anthropic assistant adapter streams; shared SSE parser adopted;
      accumulator fixtures green (2026-08-11)
- [ ] **3g** *(decision gate — requires explicit approval; costs money)* one
      live streamed Anthropic call, recorded here
- [x] **4** `PRODUCT.md` truth pass (2026-08-11); browser proofs: OpenAI
      done live 2026-08-11, Vertex previously proven, OpenRouter and
      Anthropic pending as recorded under "As built"

## Reading list before touching this area

- `docs/plans/active/platform-improvement-plan.md` — Phase 3, the Vertex half
  of this work and the origin of the "~1 day each" estimate.
- `convex/streamingService.ts` — the flush contract and its reasoning; the
  file header is the cost argument in full.
- `convex/openrouterAgentProvider.ts` and `convex/anthropicAgentProvider.ts`
  — the working streaming implementations these phases imitate.
- `convex/ai.test.ts`, "assistant reply streaming" — the proof style to copy.
