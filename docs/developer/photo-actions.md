# Photo Actions Developer Guide

Photo actions cover image-bearing chat turns, widget image attachments, model
vision routing, structured follow-up proposals, and human-confirmed task
creation. The current implementation delivers Phases A-C of
[Show Sonae A Photo And It Acts](../plans/active/photo-actions-plan.md). The
remaining plan proof is Anthony's own phone demo against a reachable widget.

## Implementation Surface

Core files:

- `src/app/(dashboard)/app/assistant/page.tsx` uploads pending files from the
  welcome composer. Non-image files are saved as thread knowledge; images are
  attached to the message only.
- `src/app/(dashboard)/app/assistant/_components/AssistantComposer.tsx` accepts
  documents and `image/*` in the file picker.
- `src/ui/components/chat/ChatMessage.tsx` renders image thumbnails for
  messages and renders `PhotoActionChip` when an assistant reply carries a
  proposal.
- `src/ui/components/chat/PhotoActionChip.tsx` shows the proposed task,
  reasoning, confirm button, filing state, filed state, and failure state.
- `src/app/w/[widgetId]/WidgetIframeClient.tsx` stages, uploads, previews, sends,
  and clears widget photos.
- `convex/chat.ts` validates attachments, attaches viewable image URLs to
  message rows, extracts photo-action proposals on assistant save/finish, and
  exposes stored attachment content types to model routing.
- `convex/ai.ts` handles plain assistant image routing through the `vision` use
  case and appends the photo-action proposal instruction on image turns.
- `convex/agentRuntime.ts` handles the agent path used by widgets. It inlines
  image bytes for Google models and writes a deterministic unread-photo notice
  when the agent model cannot inspect images.
- `convex/photoActionService.ts` owns the platform instruction and extraction
  of fenced `photo-action` JSON blocks.
- `convex/tasks.ts` owns `confirmPhotoAction`, the only mutation that turns a
  proposal into a task.
- `src/lib/constants/uploads.ts` and `convex/utils/uploadPolicy.ts` own the
  matching frontend/backend upload policies.

## Upload And Storage Contract

Photos are inline evidence for one turn, not knowledge documents.

Signed-in Assistant chat:

- accepts image files up to `CHAT_IMAGE_MAX_BYTES` (5 MB)
- stores the uploaded file id on the user message
- does not call `saveChatDocument` for images
- renders image attachments from Convex storage URLs

Widget chat:

- accepts image files up to `WIDGET_ATTACHMENT_IMAGE_MAX_BYTES` (1 MB)
- uses `generateWidgetUploadUrl` and `finalizeWidgetUpload`
- requires an active widget, matching widget thread, and valid widget access
  token
- enforces the widget attachment-message quota before finalizing

Do not route image files through document parsing or persistent knowledge
ingestion. If a future product flow needs OCR or knowledge filing from photos,
add a deliberate save/ingest action rather than changing the current attachment
meaning.

## Vision Routing

Plain Assistant chat routes an image-bearing turn through the model default for
use case `vision`. The current executable vision path is Google Vertex, because
the Google adapter accepts inline media parts. If no compatible Google vision
model is configured, `convex/ai.ts` writes a platform notice that the image was
not processed.

The widget path normally uses `convex/agentRuntime.ts`. That runtime checks the
agent model provider before inlining images:

- Google models receive image bytes as `inlineData`.
- Non-Google models receive no image bytes, and the assistant reply includes the
  deterministic statement that the attached photo could not be read.

Keep this behavior honest when adding providers. A model row with an image or
vision capability tag is not enough; the provider adapter must support inline
image content and have tests proving the bytes reach the provider request.

## Proposal Extraction

`PHOTO_ACTION_PROPOSAL_INSTRUCTION` is appended only to turns that actually
carry an image. The model is asked to end its answer with a fenced
`photo-action` block containing JSON:

```json
{
  "title": "short imperative task title",
  "detail": "what needs doing, drawn from the photo",
  "reasoning": "one sentence naming what in the photo led to this"
}
```

`extractPhotoActionProposal` removes the block from visible assistant text,
validates the three required fields, bounds their lengths, and stores the result
on `messages.photoActionProposal`. Malformed blocks are removed without failing
the answer. A proposal without reasoning is discarded.

Proposal extraction is gated by `photoTurn` when assistant messages are saved or
streaming replies are finished. A normal text turn cannot smuggle a
`photo-action` block into a task chip.

## Confirmation And Task Creation

`tasks.confirmPhotoAction` is the only writer from proposal to task.

The mutation:

- accepts a message id and optional widget access token
- requires the message to be an assistant message in an accessible thread
- reads the stored proposal from the message rather than trusting client-sent
  title/detail text
- refuses messages without a proposal
- returns the existing `photoActionTaskId` on repeat taps
- requires a company-scoped thread
- files signed-in confirmations as a person task assigned to the confirming user
- files anonymous widget confirmations through the shared inbound assignee used
  by telephony
- patches `messages.photoActionTaskId` after the task is created

The widget path remains anonymous but not unauthenticated: access is gated by
the widget thread token just like anonymous widget reads and sends.

## Data Model

Relevant schema fields:

- `messages.attachments`: Convex storage ids attached to the message.
- `messages.photoActionProposal`: structured title, detail, and reasoning.
- `messages.photoActionTaskId`: idempotency and UI filed-state marker.
- `threads.widgetAccessTokenHash`: anonymous widget thread credential.
- `tasks`: confirmed follow-up records.

Image URLs are resolved for readers rather than stored on the message. Keep
storage ids as the durable attachment reference.

## Tests And Verification

Focused coverage includes:

- `convex/photoActionService.test.ts` for proposal extraction and malformed
  blocks.
- `convex/agentRuntime.test.ts` for agent-path image inlining and the
  unread-photo fallback.
- `convex/chat.test.ts` for attachment and photo-turn message behavior.
- `convex/widgets.test.ts` for widget upload guards, quota, and validation.
- `convex/tasks.test.ts` where photo confirmation task behavior is covered.
- `src/lib/constants/uploads.test.ts` and `convex/utils/uploadPolicy.test.ts`
  for frontend/backend upload-policy parity.
- `src/ui/components/chat/PhotoActionChip` and chat/widget component tests when
  the chip presentation changes.

For documentation-only edits, run `git diff --check`. For code changes, also
run the focused tests above and at least one manual browser pass for signed-in
chat and one widget photo send when UI behavior changes.
