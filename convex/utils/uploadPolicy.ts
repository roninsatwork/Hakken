export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;

export const CHAT_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

type StorageMetadata = {
  size: number;
  contentType?: string | null;
};

type AttachmentPolicy = {
  allowDocuments?: boolean;
  allowImages?: boolean;
};

function normalizeContentType(contentType?: string | null) {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isChatDocumentContentType(contentType?: string | null) {
  return CHAT_DOCUMENT_CONTENT_TYPES.includes(
    normalizeContentType(contentType) as (typeof CHAT_DOCUMENT_CONTENT_TYPES)[number],
  );
}

export function isChatImageContentType(contentType?: string | null) {
  return normalizeContentType(contentType).startsWith("image/");
}

export function validateChatAttachmentMetadata(
  metadata: StorageMetadata,
  policy: AttachmentPolicy = { allowDocuments: true, allowImages: true },
) {
  if (policy.allowImages && isChatImageContentType(metadata.contentType)) {
    if (metadata.size > CHAT_IMAGE_MAX_BYTES) {
      throw new Error("File exceeds the maximum size limit of 5MB for images");
    }
    return "image";
  }

  if (policy.allowDocuments && isChatDocumentContentType(metadata.contentType)) {
    if (metadata.size > CHAT_DOCUMENT_MAX_BYTES) {
      throw new Error("File exceeds the maximum size limit of 50MB for documents");
    }
    return "document";
  }

  const allowedKinds = [
    policy.allowImages ? "images" : null,
    policy.allowDocuments ? "PDF, CSV, Excel, Word, or text documents" : null,
  ].filter(Boolean);

  throw new Error(`Invalid file type: only ${allowedKinds.join(" and ")} are allowed`);
}
