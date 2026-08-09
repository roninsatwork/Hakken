import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;
export const ADMIN_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const WIDGET_ATTACHMENT_IMAGE_MAX_BYTES = 1024 * 1024;

export const CHAT_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const MARKDOWN_CONTENT_TYPES = ["text/markdown", "text/x-markdown"] as const;

/**
 * Knowledge ingestion accepts everything chat does, plus markdown. Markdown is
 * deliberately not added to the chat list: OKF bundles and `.md` libraries are
 * knowledge-base material, and widening chat attachments is a separate
 * decision. See docs/plans/active/knowledge-markdown-and-bulk-upload-plan.md.
 */
export const KNOWLEDGE_DOCUMENT_CONTENT_TYPES = [
  ...CHAT_DOCUMENT_CONTENT_TYPES,
  ...MARKDOWN_CONTENT_TYPES,
] as const;

type StorageMetadata = {
  size: number;
  contentType?: string | null;
};

type AttachmentPolicy = {
  allowDocuments?: boolean;
  allowImages?: boolean;
};

type UploadPolicy = AttachmentPolicy & {
  documentContentTypes?: readonly string[];
  documentMaxBytes?: number;
  imageMaxBytes?: number;
  invalidTypeMessage?: string;
};

type StorageValidationCtx = Pick<MutationCtx, "db" | "storage">;

function normalizeContentType(contentType?: string | null) {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isTestEnvironment() {
  return process.env.IS_TEST === "true" || process.env.VITEST === "true" || process.env.NODE_ENV === "test";
}

async function getStoredUploadMetadata(ctx: StorageValidationCtx, storageId: Id<"_storage">) {
  let metadata: StorageMetadata | null = null;
  try {
    metadata = await ctx.storage.getMetadata(storageId);
  } catch {
    // Some test storage shims do not implement getMetadata.
  }

  if (!metadata && isTestEnvironment()) {
    const mock = await ctx.db
      .query("mockStorageMetadata")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .first();
    metadata = mock ? { size: mock.size, contentType: mock.contentType } : null;
  }

  return metadata;
}

async function deleteRejectedUpload(ctx: StorageValidationCtx, storageId: Id<"_storage">) {
  try {
    await ctx.storage.delete(storageId);
  } catch {
    // Test environments may not implement storage deletion.
  }

  if (!isTestEnvironment()) return;

  const mock = await ctx.db
    .query("mockStorageMetadata")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
  if (mock) {
    await ctx.db.delete(mock._id);
  }
}

export function isChatDocumentContentType(contentType?: string | null) {
  return CHAT_DOCUMENT_CONTENT_TYPES.includes(
    normalizeContentType(contentType) as (typeof CHAT_DOCUMENT_CONTENT_TYPES)[number],
  );
}

export function isKnowledgeDocumentContentType(contentType?: string | null) {
  return KNOWLEDGE_DOCUMENT_CONTENT_TYPES.includes(
    normalizeContentType(contentType) as (typeof KNOWLEDGE_DOCUMENT_CONTENT_TYPES)[number],
  );
}

export function isChatImageContentType(contentType?: string | null) {
  return normalizeContentType(contentType).startsWith("image/");
}

export function validateChatAttachmentMetadata(
  metadata: StorageMetadata,
  policy: AttachmentPolicy = { allowDocuments: true, allowImages: true },
) {
  return validateUploadMetadata(metadata, {
    ...policy,
    documentMaxBytes: CHAT_DOCUMENT_MAX_BYTES,
    imageMaxBytes: CHAT_IMAGE_MAX_BYTES,
  });
}

export function validateUploadMetadata(metadata: StorageMetadata, policy: UploadPolicy) {
  if (policy.allowImages && isChatImageContentType(metadata.contentType)) {
    const maxBytes = policy.imageMaxBytes ?? CHAT_IMAGE_MAX_BYTES;
    if (metadata.size > maxBytes) {
      throw new Error(`File exceeds the maximum size limit of ${formatBytes(maxBytes)} for images`);
    }
    return "image";
  }

  const documentContentTypes = policy.documentContentTypes ?? CHAT_DOCUMENT_CONTENT_TYPES;

  if (policy.allowDocuments && documentContentTypes.includes(normalizeContentType(metadata.contentType))) {
    const maxBytes = policy.documentMaxBytes ?? CHAT_DOCUMENT_MAX_BYTES;
    if (metadata.size > maxBytes) {
      throw new Error(`File exceeds the maximum size limit of ${formatBytes(maxBytes)} for documents`);
    }
    return "document";
  }

  if (policy.invalidTypeMessage) {
    throw new Error(policy.invalidTypeMessage);
  }

  const allowsMarkdown = MARKDOWN_CONTENT_TYPES.every((type) => documentContentTypes.includes(type));
  const allowedKinds = [
    policy.allowImages ? "images" : null,
    policy.allowDocuments
      ? allowsMarkdown
        ? "PDF, CSV, Excel, Word, Markdown, or text documents"
        : "PDF, CSV, Excel, Word, or text documents"
      : null,
  ].filter(Boolean);

  throw new Error(`Invalid file type: only ${allowedKinds.join(" and ")} are allowed`);
}

function formatBytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? `${mb}MB` : `${bytes} bytes`;
}

export function validateKnowledgeDocumentMetadata(metadata: StorageMetadata) {
  return validateUploadMetadata(metadata, {
    allowDocuments: true,
    documentContentTypes: KNOWLEDGE_DOCUMENT_CONTENT_TYPES,
    documentMaxBytes: CHAT_DOCUMENT_MAX_BYTES,
  });
}

export function validateAdminImageMetadata(metadata: StorageMetadata) {
  return validateUploadMetadata(metadata, {
    allowImages: true,
    imageMaxBytes: ADMIN_IMAGE_MAX_BYTES,
    invalidTypeMessage: "Invalid file type: only images are allowed",
  });
}

export function validateWidgetAttachmentMetadata(metadata: StorageMetadata) {
  return validateUploadMetadata(metadata, {
    allowImages: true,
    imageMaxBytes: WIDGET_ATTACHMENT_IMAGE_MAX_BYTES,
    invalidTypeMessage: "Invalid file type: strictly images only are allowed",
  });
}

export async function validateStoredUpload(
  ctx: StorageValidationCtx,
  storageId: Id<"_storage">,
  validator: (metadata: StorageMetadata) => "image" | "document",
) {
  const metadata = await getStoredUploadMetadata(ctx, storageId);
  if (!metadata) {
    throw new Error("Attached file not found in storage");
  }

  try {
    return validator(metadata);
  } catch (error) {
    await deleteRejectedUpload(ctx, storageId);
    if (error instanceof Error) throw error;
    throw new Error("Invalid attachment");
  }
}
