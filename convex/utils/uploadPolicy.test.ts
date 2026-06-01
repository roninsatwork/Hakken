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
