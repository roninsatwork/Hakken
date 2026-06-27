# Upload And Knowledge Policy

This document records the shared upload and ingestion policy used by Sonae.

## Entry Points

- Chat document uploads: `src/ui/components/chat/ChatInput.tsx` and `src/app/(dashboard)/app/assistant/page.tsx`, enforced again by `convex/chatService.ts`.
- Thread knowledge ingestion: `convex/knowledge.saveChatDocument`.
- Admin knowledge uploads: agent, company, and global knowledge pages, enforced again by `convex/knowledge.saveDocument`.
- Manual text knowledge: `convex/knowledge.saveManualText`.
- Website knowledge ingestion: `convex/knowledge.queueWebsiteUrls` and `convex/knowledgeActions.mapWebsite`, guarded by SSRF checks.
- Admin images: user profile photos, agent avatars, system logos, and widget logos.
- Anonymous widget attachments: `convex/widgets.finalizeWidgetUpload`.
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

## Adding A File Type

1. Add the MIME type to the backend upload policy.
2. Add the same MIME type and extension to the frontend upload policy.
3. Confirm `convex/knowledgeActions.ingestDocument` can extract useful text for that format.
4. Add tests for allowed and rejected files.
5. Update this document with the new file type and any new limit.
