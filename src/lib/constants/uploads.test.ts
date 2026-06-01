import { describe, expect, it } from "vitest";
import {
  ADMIN_IMAGE_MAX_BYTES,
  CHAT_DOCUMENT_MAX_BYTES,
  WIDGET_ATTACHMENT_IMAGE_MAX_BYTES,
  isSupportedChatDocument,
  validateUploadFile,
} from "./uploads";

describe("frontend upload policy", () => {
  it("allows supported chat documents by MIME type or extension", () => {
    expect(isSupportedChatDocument(new File(["a"], "report.pdf", { type: "application/pdf" }))).toBe(true);
    expect(isSupportedChatDocument(new File(["a"], "report.csv", { type: "" }))).toBe(true);
  });

  it("rejects unsupported chat document files", () => {
    const result = validateUploadFile(
      new File(["alert(1)"], "payload.js", { type: "application/javascript" }),
      "chatDocument",
    );

    expect(result).toEqual({
      allowed: false,
      reason: "Please upload PDF, CSV, Excel, Word, or Text files.",
    });
  });

  it("enforces document and image size limits", () => {
    expect(
      validateUploadFile(new File(["a"], "large.pdf", { type: "application/pdf" }), "chatDocument"),
    ).toEqual({ allowed: true, reason: "" });

    const oversizedDocument = new File(["a"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(oversizedDocument, "size", { value: CHAT_DOCUMENT_MAX_BYTES + 1 });
    expect(validateUploadFile(oversizedDocument, "knowledgeDocument").reason).toBe("File must be under 50MB.");

    const oversizedAdminImage = new File(["a"], "avatar.png", { type: "image/png" });
    Object.defineProperty(oversizedAdminImage, "size", { value: ADMIN_IMAGE_MAX_BYTES + 1 });
    expect(validateUploadFile(oversizedAdminImage, "adminImage").reason).toBe("File must be under 2MB.");

    const oversizedWidgetImage = new File(["a"], "widget.png", { type: "image/png" });
    Object.defineProperty(oversizedWidgetImage, "size", { value: WIDGET_ATTACHMENT_IMAGE_MAX_BYTES + 1 });
    expect(validateUploadFile(oversizedWidgetImage, "widgetAttachmentImage").reason).toBe("File must be under 1MB.");
  });
});
