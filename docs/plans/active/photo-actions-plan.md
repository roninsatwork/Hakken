# Show Sonae A Photo And It Acts

Status: Drafted 2026-08-13 from verified code research. Phase 4 of the
showcase channels roadmap (`showcase-channels-plan.md`). Not started.
Owner: Anthony

Every claim below carries the file it rests on; verify anchors before editing,
because line numbers drift. Follow the repo's working rules in `AGENTS.md`.

## The decision

A photo of a delivery note, a broken part, or a price ticket goes into
chat or the widget; Sonae reads it, explains it, and — on the user's
say-so — does something with it: raises a task, or answers the question it
contains. The showcase moment is a phone photo of a messy document
becoming a tidy, structured answer and a filed follow-up in seconds.

Recorded decisions:

1. **Acting is human-confirmed.** Sonae proposes the action it read out of
   the photo (a pre-filled task); a person taps to confirm. No photo ever
   writes anything by itself.
2. **Vision rides the provider that supports it.** Today that is Google
   only; a message carrying an image resolves to a vision-capable Google
   model regardless of the thread's usual model, stated to the user rather
   than hidden.
3. **The widget gets photos too** — the dormant, already-guarded upload
   endpoints are wired up, not reinvented.

## What is actually true today (verified 2026-08-13)

The research verdict in one line: **the pipes exist, the taps are off, and
one pipe is quietly cross-threaded.**

**Chat images are server-legal but client-blocked.** The server-side
validator admits images to 5 MB (`validateChatAttachmentMetadata`,
`convex/utils/uploadPolicy.ts:107`; `CHAT_IMAGE_MAX_BYTES`,
`src/lib/constants/uploads.ts`), but both composers validate with the
documents-only `chatDocument` policy
(`ChatInput.tsx:132`, `assistant/page.tsx:107`) and the file input's
`accept` list has no image types (`ChatInput.tsx:320`). So no image can
actually be attached from the UI today.

**Attached images are never shown.** `messages.attachments`
(`convex/schema.ts:1952`) is written but never rendered — no component
reads it (only the purge path and the widget upload counter touch it).

**Vision works on exactly one path.** The plain-chat runtime inlines
attachment bytes to the model (`convex/ai.ts:370-405`) and only the Google
adapter accepts them (`toGoogleParts`,
`convex/googleProviderAdapter.ts:9-22`); Anthropic, OpenAI and OpenRouter
adapters all throw on non-text parts (`assertTextOnlyContents`,
`convex/providerHttpService.ts:85-90`). There is **no vision gate in model
resolution** (`canProviderServeUseCase`, `convex/aiModelService.ts:158`
gates only embedding/transcription/agent/workflow) — an image sent to a
thread on a non-Google model would throw at the provider boundary.

**The agent path silently eats images.** `convex/agentRuntime.ts:682-691`
runs attachments through `parseDocuments`
(`convex/utils/fileParser.ts` — PDF/Excel/Word/text only); an image yields
nothing, with no error. **The widget always routes here** when the widget
has an agent (`convex/chat.ts:304-310`) — the cross-threaded pipe.

**Widget upload endpoints exist, tested, with no caller.**
`generateWidgetUploadUrl` / `finalizeWidgetUpload`
(`convex/widgets.ts:274-334`) validate widget, thread, token, a
10-attachment-message cap per thread, and image-only metadata — and
nothing in the widget UI calls them
(`src/app/w/[widgetId]/page.tsx` has a plain text input, no file control).

**No code anywhere acts on an image.** No OCR, no extraction tool, no
image-aware tool in the 22-handler registry
(`REGISTERED_TOOL_HANDLERS`, `convex/aiToolExecutionService.ts:412`).

**The task door is ready.** `createTask` (tenantMutation,
`convex/tasks.ts:196`) is how a person files a task; a pre-filled,
human-confirmed task needs no new machinery at all.

## Design commitments (binding on every phase)

1. **Images are inline evidence, not knowledge.** A photo attaches to its
   message and goes to the model for that turn; it is never ingested into
   company knowledge, never embedded, never retrievable later by other
   questions. (Documents keep their existing ingestion path.)
2. **Size and type limits hold at every door.** 5 MB chat / 1 MB widget,
   images only where images are meant, validated client-side for the
   user's sake and server-side for truth — the existing two-sided policy
   pattern (`src/lib/constants/uploads.ts` + `convex/utils/uploadPolicy.ts`,
   held in step by test).
3. **No silent drops.** If a runtime cannot use an attached image (wrong
   provider, agent path before Phase C), the user is told in the reply —
   the current silent-eat behaviour is a defect this plan removes.
4. **A photo's proposed action shows its reasoning.** The pre-filled task
   states what in the image led to it, so the human confirming can judge
   it.

## Phase A — Photos into chat, honestly

**Goal:** attach a photo in Ask Sonae, see it in the thread, get an answer
about it.

- New `chatImage` upload policy client-side beside `chatDocument`; the
  composer accepts images (input `accept`, drag-drop, and paste), routing
  image files to the image policy and documents to the document flow
  unchanged.
- `ChatMessage` renders image attachments (thumbnail, tap to view) — the
  first reader of `messages.attachments`.
- Vision-aware model routing: a send carrying image attachments resolves
  to a vision-capable Google model (a `vision` gate added the same way
  `transcription` gates in `convex/aiModelService.ts`), with a quiet
  notice in the thread when this overrode the thread's usual model
  (commitment on decision 2). A deployment with no vision-capable model
  configured refuses the attach with a plain sentence instead of throwing
  at the provider boundary.
- Tests: policy split, render, routing override, no-vision-model refusal.

## Phase B — The widget takes photos

**Goal:** a visitor photographs something and sends it from the embedded
widget.

- Wire the dormant endpoints: a camera/attach control in the widget UI
  calling `generateWidgetUploadUrl` → POST → `finalizeWidgetUpload`,
  honouring the existing 1 MB/images-only policy and 10-message cap.
- Fix the cross-threaded pipe: the agent runtime learns to inline image
  attachments for vision-capable Google models (the same `inlineData`
  shape the plain path uses at `convex/ai.ts:370-405`), because the widget
  always routes to the agent path; where the model cannot take images the
  reply says so (commitment 3), never silence.
- Tests: widget attach end-to-end, agent-path image inlining, the
  told-not-silent fallback.

## Phase C — It acts

**Goal:** the photo becomes a filed follow-up on one confirming tap.

- After a reply to an image-bearing message, Sonae proposes an action
  chip: "Raise this as a task" pre-filled with title and detail drawn from
  what it read (and the reasoning line, commitment 4). Confirming calls
  the existing `createTask` (`convex/tasks.ts:196`) as the signed-in user
  — audited, notified, no new write machinery. In the anonymous widget,
  the chip instead offers "Ask the team to follow up", which files the
  task to the per-company assignee the telephone plan's "calls go to"
  setting names (shared setting, one owner).
- The proposal is generated in the same reply turn (structured suggestion
  in the response), so it costs no extra model call.
- Tests: chip only appears with image-bearing turns, pre-fill fidelity,
  anonymous path files to the configured assignee, nothing writes without
  the tap.

## Phase D — Proof

- Live on dev: phone photo of a handwritten note → attach in widget →
  correct reading in the reply → one tap → task lands with the bell, with
  the photo viewable from the thread.
- Done when the whole loop runs from a phone against dev with no developer
  present.

## Out of scope, recorded

- OCR ingestion of photos into knowledge (commitment 1 forbids it; a
  future decision could add a deliberate "save this document" flow).
- Image generation of any kind.
- Acting without confirmation (decision 1 is binding).
- Non-Google vision providers — when a second adapter gains vision, the
  gate from Phase A already routes correctly; nothing here blocks it.
