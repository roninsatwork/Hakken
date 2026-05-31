export const CHAT_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;

export const CHAT_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export function isSupportedChatDocument(file: File) {
  return (
    CHAT_DOCUMENT_CONTENT_TYPES.includes(
      file.type as (typeof CHAT_DOCUMENT_CONTENT_TYPES)[number],
    ) ||
    file.name.endsWith(".csv") ||
    file.name.endsWith(".txt") ||
    file.name.endsWith(".docx")
  );
}
