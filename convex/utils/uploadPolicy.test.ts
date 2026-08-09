import { describe, expect, test } from "vitest";
import {
  ADMIN_IMAGE_MAX_BYTES,
  CHAT_DOCUMENT_MAX_BYTES,
  CHAT_IMAGE_MAX_BYTES,
  WIDGET_ATTACHMENT_IMAGE_MAX_BYTES,
  validateAdminImageMetadata,
  validateChatAttachmentMetadata,
  validateKnowledgeDocumentMetadata,
  validateWidgetAttachmentMetadata,
} from "./uploadPolicy";

describe("upload policy validators", () => {
  test("allows supported chat images and documents", () => {
    expect(validateChatAttachmentMetadata({ size: 128, contentType: "image/png" })).toBe("image");
    expect(validateChatAttachmentMetadata({ size: 128, contentType: "application/pdf" })).toBe("document");
  });

  test("rejects unsupported chat attachment types", () => {
    expect(() =>
      validateChatAttachmentMetadata({ size: 128, contentType: "application/javascript" }),
    ).toThrow("Invalid file type");
  });

  test("enforces separate chat image and document limits", () => {
    expect(() =>
      validateChatAttachmentMetadata({ size: CHAT_IMAGE_MAX_BYTES + 1, contentType: "image/jpeg" }),
    ).toThrow("5MB for images");

    expect(() =>
      validateChatAttachmentMetadata({ size: CHAT_DOCUMENT_MAX_BYTES + 1, contentType: "text/plain" }),
    ).toThrow("50MB for documents");
  });

  test("allows knowledge documents but rejects images", () => {
    expect(validateKnowledgeDocumentMetadata({ size: 128, contentType: "text/csv" })).toBe("document");
    expect(() =>
      validateKnowledgeDocumentMetadata({ size: 128, contentType: "image/png" }),
    ).toThrow("Invalid file type");
  });

  test("accepts markdown for knowledge and refuses it for chat", () => {
    expect(validateKnowledgeDocumentMetadata({ size: 128, contentType: "text/markdown" })).toBe("document");
    expect(validateKnowledgeDocumentMetadata({ size: 128, contentType: "text/x-markdown" })).toBe("document");
    expect(validateKnowledgeDocumentMetadata({ size: 128, contentType: "text/markdown; charset=utf-8" })).toBe(
      "document",
    );

    expect(() =>
      validateChatAttachmentMetadata({ size: 128, contentType: "text/markdown" }),
    ).toThrow("Invalid file type");
  });

  test("names markdown in the knowledge refusal but not the chat one", () => {
    expect(() =>
      validateKnowledgeDocumentMetadata({ size: 128, contentType: "application/javascript" }),
    ).toThrow("PDF, CSV, Excel, Word, Markdown, or text documents");

    expect(() =>
      validateChatAttachmentMetadata({ size: 128, contentType: "application/javascript" }, { allowDocuments: true }),
    ).toThrow("PDF, CSV, Excel, Word, or text documents");
  });

  test("still holds markdown to the document size limit", () => {
    expect(() =>
      validateKnowledgeDocumentMetadata({ size: CHAT_DOCUMENT_MAX_BYTES + 1, contentType: "text/markdown" }),
    ).toThrow("50MB for documents");
  });

  test("enforces admin and widget image policies", () => {
    expect(validateAdminImageMetadata({ size: ADMIN_IMAGE_MAX_BYTES, contentType: "image/webp" })).toBe("image");
    expect(() =>
      validateAdminImageMetadata({ size: ADMIN_IMAGE_MAX_BYTES + 1, contentType: "image/webp" }),
    ).toThrow("2MB for images");

    expect(validateWidgetAttachmentMetadata({ size: WIDGET_ATTACHMENT_IMAGE_MAX_BYTES, contentType: "image/png" })).toBe("image");
    expect(() =>
      validateWidgetAttachmentMetadata({ size: WIDGET_ATTACHMENT_IMAGE_MAX_BYTES + 1, contentType: "image/png" }),
    ).toThrow("1MB for images");
  });
});
