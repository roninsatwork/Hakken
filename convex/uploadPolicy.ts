import type { Infer } from "convex/values";
import { uploadPurpose } from "./uploadSchema";
import { appError } from "./utils/appError";
import { validateAdminImageMetadata, validateChatAttachmentMetadata, validateKnowledgeDocumentMetadata, validateWidgetAttachmentMetadata } from "./utils/uploadPolicy";

export type UploadPurpose = Infer<typeof uploadPurpose>;
export const DOCUMENT_UPLOAD_BYTES = 50 * 1024 * 1024;
export const UPLOAD_TICKET_MS = 10 * 60_000;
export const ABANDONED_UPLOAD_MS = 24 * 60 * 60_000;
export const UPLOAD_TIMEOUT_MS = 120_000;

export function normalizeUploadType(type: string) { return type.split(";")[0].trim().toLowerCase(); }

export function validateUploadForPurpose(purpose: UploadPurpose, size: number, type: string) {
  const metadata = { size, contentType: normalizeUploadType(type) };
  if (!Number.isSafeInteger(size) || size <= 0 || size > DOCUMENT_UPLOAD_BYTES) throw appError("INVALID_INPUT", "Uploads must be between 1 byte and 50 MB.");
  if (purpose === "image") validateAdminImageMetadata(metadata);
  else if (purpose === "widget") validateWidgetAttachmentMetadata(metadata);
  else if (purpose === "chat") validateChatAttachmentMetadata(metadata);
  else if (purpose === "knowledge") validateKnowledgeDocumentMetadata(metadata);
  else if (purpose === "workbook" && !["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"].includes(metadata.contentType)) throw appError("INVALID_INPUT", "Upload an Excel workbook.");
  else if (purpose === "recording" && !["application/json", "application/gzip", "application/x-gzip"].includes(metadata.contentType)) throw appError("INVALID_INPUT", "Invalid recording upload type.");
}

export function uploadByteLimit(purpose: UploadPurpose, contentType?: string) {
  if (purpose === "widget") return 1024 * 1024;
  if (purpose === "image") return 2 * 1024 * 1024;
  if (contentType?.startsWith("image/")) return 5 * 1024 * 1024;
  return DOCUMENT_UPLOAD_BYTES;
}

export async function digestUploadToken(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
