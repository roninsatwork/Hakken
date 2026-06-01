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

export const KNOWLEDGE_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export type UploadPolicyKey =
  | "chatDocument"
  | "knowledgeDocument"
  | "adminImage"
  | "widgetAttachmentImage";

type UploadPolicy = {
  allowedTypes?: readonly string[];
  allowImages?: boolean;
  maxBytes: number;
  rejectedTypeMessage: string;
};

const uploadPolicies: Record<UploadPolicyKey, UploadPolicy> = {
  chatDocument: {
    allowedTypes: CHAT_DOCUMENT_CONTENT_TYPES,
    maxBytes: CHAT_DOCUMENT_MAX_BYTES,
    rejectedTypeMessage: "Please upload PDF, CSV, Excel, Word, or Text files.",
  },
  knowledgeDocument: {
    allowedTypes: KNOWLEDGE_DOCUMENT_CONTENT_TYPES,
    maxBytes: CHAT_DOCUMENT_MAX_BYTES,
    rejectedTypeMessage: "Please upload PDF, CSV, Excel, Word, or Text files.",
  },
  adminImage: {
    allowImages: true,
    maxBytes: ADMIN_IMAGE_MAX_BYTES,
    rejectedTypeMessage: "Please upload an image file.",
  },
  widgetAttachmentImage: {
    allowImages: true,
    maxBytes: WIDGET_ATTACHMENT_IMAGE_MAX_BYTES,
    rejectedTypeMessage: "Please upload an image file.",
  },
};

function normalizeFileType(file: File) {
  return file.type.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isAllowedByExtension(file: File, policyKey: UploadPolicyKey) {
  const name = file.name.toLowerCase();
  if (policyKey === "chatDocument" || policyKey === "knowledgeDocument") {
    return (
      name.endsWith(".csv") ||
      name.endsWith(".txt") ||
      name.endsWith(".docx") ||
      name.endsWith(".pdf") ||
      name.endsWith(".xls") ||
      name.endsWith(".xlsx")
    );
  }
  return false;
}

export function getUploadPolicy(policyKey: UploadPolicyKey) {
  return uploadPolicies[policyKey];
}

export function formatUploadBytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? `${mb}MB` : `${bytes} bytes`;
}

export function validateUploadFile(file: File, policyKey: UploadPolicyKey) {
  const policy = uploadPolicies[policyKey];
  const contentType = normalizeFileType(file);
  const typeAllowed = policy.allowImages
    ? contentType.startsWith("image/")
    : Boolean(policy.allowedTypes?.includes(contentType)) || isAllowedByExtension(file, policyKey);

  if (!typeAllowed) {
    return { allowed: false, reason: policy.rejectedTypeMessage };
  }

  if (file.size > policy.maxBytes) {
    return {
      allowed: false,
      reason: `File must be under ${formatUploadBytes(policy.maxBytes)}.`,
    };
  }

  return { allowed: true, reason: "" };
}

export function isSupportedChatDocument(file: File) {
  return validateUploadFile(file, "chatDocument").allowed;
}
