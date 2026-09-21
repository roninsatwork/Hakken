# Upload And Knowledge Policy

This document records the shared upload and ingestion policy used by Hakken.

## Entry Points

- Chat document uploads: `src/ui/components/chat/ChatInput.tsx` and `src/app/(dashboard)/app/assistant/page.tsx`, with upload URL generation in `convex/chat.ts` and backend attachment validation in `convex/chatService.ts`.
- Agent chat attachments: `convex/agentRuntime.runAgentObjective` receives validated chat `fileIds`, parses supported documents with `convex/utils/fileParser.ts`, and appends extracted text as untrusted prompt context for that agent turn.
- Thread knowledge ingestion: `convex/knowledge.saveChatDocument`, which verifies thread ownership before saving thread-scoped knowledge.
- Admin knowledge uploads: agent, company, and global knowledge pages, including Markdown and bounded multi-file/folder upload, enforced again by `convex/knowledge.saveDocument`.
- Manual text knowledge: `convex/knowledge.saveManualText`.
- Website knowledge ingestion: `convex/knowledge.queueWebsiteUrls` and `convex/knowledgeActions.mapWebsite`, guarded by SSRF checks.
- Admin images: user profile photos, agent avatars, system logos, company widget logos, and global widget logos.
- Anonymous widget attachments: `convex/widgets.generateWidgetUploadUrl` and `convex/widgets.finalizeWidgetUpload`.
- Movement demo uploads are intentionally frozen and excluded from this policy until the demo is retired.

## Policy Source

Backend enforcement lives in `convex/utils/uploadPolicy.ts`.

Frontend preflight checks live in `src/lib/constants/uploads.ts` so the UI rejects bad files before upload. Backend validation remains authoritative.

Current limits:

- Chat images: 5MB.
- Chat and knowledge documents: 50MB.
- Admin images, including avatars and logos: 2MB.
- Anonymous widget image attachments: 1MB.

Current document types:

- PDF
- CSV
- plain text
- Excel
- Word `.docx`

The frontend document preflight accepts the configured MIME types and also falls back to common file extensions for documents: `.csv`, `.txt`, `.docx`, `.pdf`, `.xls`, and `.xlsx`. Knowledge upload has a deliberate wider policy that also accepts `.md` and `.markdown`; assistant chat does not accept Markdown as a separate file type. The backend validation uses stored metadata content type and remains the final gate after upload.

Agent runtime document parsing uses the stored blob MIME type after the chat attachment has passed backend validation. PDF, Excel, Word, CSV, and text files are parsed through `convex/utils/fileParser.ts`. Each parsed document is capped to 50,000 characters before joining, and `runAgentObjective` caps the final user prompt plus attached document context to 10,000 characters before provider execution. The attached text is wrapped as untrusted context, not as system instructions.

Persisted admin and thread knowledge ingestion uses a narrower extraction path in `convex/knowledgeActions.ts`: PDF and Word `.docx` files have dedicated parsers, while CSV, Markdown, plain text, and other accepted document MIME types fall back to UTF-8 decoding. Markdown then has YAML frontmatter removed and can use its frontmatter title. Excel uploads pass the shared validation policy today, but spreadsheet-specific extraction is not implemented for persisted knowledge. Either add an Excel parser to knowledge ingestion or narrow the accepted knowledge upload policy before documenting spreadsheets as reliable knowledge sources.

The admin knowledge UI accepts up to 500 files per batch and uploads at concurrency four. Folder uploads retain relative paths after the common root and omit reserved OKF `index.md` and `log.md` files; direct uploads of those filenames remain allowed. Backend ingestion drains pending file records through a transactionally claimed queue so one failed document does not stop the rest of the batch.

## Storage Metadata Validation

`validateStoredUpload` is the shared backend gate for stored uploads. It reads Convex storage metadata with `ctx.storage.getMetadata`, then applies the caller-specific validator:

- `validateChatAttachmentMetadata` for chat attachments.
- `validateKnowledgeDocumentMetadata` for admin and thread knowledge documents.
- `validateAdminImageMetadata` for profile photos, agent avatars, system logos, and widget logos.
- `validateWidgetAttachmentMetadata` for anonymous widget attachments.

Rejected uploads are deleted from Convex storage before the validation error is rethrown. This keeps oversized or disallowed files from remaining attached after a failed mutation.

The `mockStorageMetadata` schema table exists only to support upload validation tests. Some Convex test storage shims can store blobs but cannot return metadata through `ctx.storage.getMetadata`. In test mode, `convex/utils/uploadPolicy.ts` falls back to `mockStorageMetadata` for size and content type, and deletes the mock row when a rejected upload is cleaned up. Do not use this table as a product metadata source.

## Tenant Scope

Knowledge document records and chunk records must be created through `buildKnowledgeDocumentRecord` and `buildKnowledgeChunkRecords` in `convex/knowledgeService.ts`. These helpers preserve sparse scope fields for:

- global knowledge
- company knowledge
- agent knowledge
- thread knowledge

Frontend scope choice is not trusted. Mutations must continue to call `assertCanAccessKnowledgeScope` or thread ownership checks before creating, reading, or deleting knowledge records.

Anonymous widget uploads are scoped differently from signed-in knowledge uploads. `generateWidgetUploadUrl` requires an active widget, a valid widget thread, the matching widget access token, and fewer than 10 prior uploads for that widget/thread pair. `finalizeWidgetUpload` repeats the active widget/thread/session-token checks before validating the image metadata. Do not turn widget upload URLs into unauthenticated generic storage URLs. Widget photos can also feed the human-confirmed task flow documented in [Photo Actions](./photo-actions.md), but they remain message attachments rather than knowledge documents.

Admin image upload URLs are generated by existing user/settings/widget mutation paths, but the storage id is not trusted until the saving mutation validates metadata and resolves the storage-backed URL where needed.

## Adding A File Type

1. Add the MIME type to the backend upload policy.
2. Add the same MIME type and extension to the frontend upload policy.
3. Confirm `convex/knowledgeActions.ingestDocument` can extract useful text for persisted knowledge and, when relevant, that `convex/utils/fileParser.ts` can parse the same type for agent runtime attachments.
4. Add tests for allowed and rejected files.
5. Update this document with the new file type and any new limit.

## Verification

Focused tests include:

- `convex/uploads.test.ts` for backend upload metadata validation, rejected upload cleanup, and mock metadata fallback.
- `src/lib/constants/uploads.test.ts` for frontend upload policy and extension fallback behavior.
- `convex/knowledge.test.ts` and `convex/knowledgeActions.test.ts` for knowledge ingestion, scope, repair, deletion, and website queue behavior.
- `convex/widgets.test.ts` for widget session upload guards, upload quota, and attachment validation.
- User, settings, agent settings, and widget page tests where admin image upload UI is exercised.

For implementation changes, run the relevant focused tests plus the repo gate from `AGENTS.md`. For documentation-only changes, this automation runs Markdown link validation and `git diff --check`.
