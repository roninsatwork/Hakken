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
 * Mirrors KNOWLEDGE_DOCUMENT_CONTENT_TYPES in convex/utils/uploadPolicy.ts.
 * Convex functions cannot import from src/, so the two lists are duplicated and
 * held in step by a test. Markdown is knowledge-only on purpose — chat
 * attachments keep the narrower list.
 */
export const KNOWLEDGE_DOCUMENT_CONTENT_TYPES = [
  ...CHAT_DOCUMENT_CONTENT_TYPES,
  ...MARKDOWN_CONTENT_TYPES,
] as const;

export type UploadPolicyKey =
  | "chatDocument"
  | "chatImage"
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
  // A photo in chat is inline evidence for that turn, not a document: it is
  // never ingested into knowledge, so it gets its own tighter budget rather
  // than the 50MB a parsed document is allowed.
  chatImage: {
    allowImages: true,
    maxBytes: CHAT_IMAGE_MAX_BYTES,
    rejectedTypeMessage: "Please upload an image file.",
  },
  knowledgeDocument: {
    allowedTypes: KNOWLEDGE_DOCUMENT_CONTENT_TYPES,
    maxBytes: CHAT_DOCUMENT_MAX_BYTES,
    rejectedTypeMessage: "Please upload PDF, CSV, Excel, Word, Markdown, or Text files.",
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

const CHAT_DOCUMENT_EXTENSIONS = [".csv", ".txt", ".docx", ".pdf", ".xls", ".xlsx"] as const;
export const MARKDOWN_EXTENSIONS = [".md", ".markdown"] as const;
const KNOWLEDGE_DOCUMENT_EXTENSIONS = [...CHAT_DOCUMENT_EXTENSIONS, ...MARKDOWN_EXTENSIONS] as const;

function isAllowedByExtension(file: File, policyKey: UploadPolicyKey) {
  const name = file.name.toLowerCase();
  if (policyKey === "chatDocument") {
    return CHAT_DOCUMENT_EXTENSIONS.some((extension) => name.endsWith(extension));
  }
  if (policyKey === "knowledgeDocument") {
    return KNOWLEDGE_DOCUMENT_EXTENSIONS.some((extension) => name.endsWith(extension));
  }
  return false;
}

/**
 * Browsers do not reliably label `.md` files — `file.type` is often the empty
 * string depending on OS registry. Uploading with an empty Content-Type makes
 * Convex storage record nothing, and the server-side check then rejects a valid
 * file with an unexplained "Invalid file type". Resolve from the extension so
 * both the upload header and the stored `format` are honest.
 */
export function resolveUploadContentType(file: File) {
  const declared = normalizeFileType(file);
  if (declared) return declared;

  const name = file.name.toLowerCase();
  if (MARKDOWN_EXTENSIONS.some((extension) => name.endsWith(extension))) return "text/markdown";
  if (name.endsWith(".txt")) return "text/plain";
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (name.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (name.endsWith(".xls")) return "application/vnd.ms-excel";
  return "";
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
