import { describe, expect, it } from "vitest";
import {
  ADMIN_IMAGE_MAX_BYTES,
  CHAT_DOCUMENT_CONTENT_TYPES,
  CHAT_DOCUMENT_MAX_BYTES,
  KNOWLEDGE_DOCUMENT_CONTENT_TYPES,
  WIDGET_ATTACHMENT_IMAGE_MAX_BYTES,
  isSupportedChatDocument,
  resolveUploadContentType,
  validateUploadFile,
} from "./uploads";
import {
  CHAT_DOCUMENT_CONTENT_TYPES as CONVEX_CHAT_DOCUMENT_CONTENT_TYPES,
  KNOWLEDGE_DOCUMENT_CONTENT_TYPES as CONVEX_KNOWLEDGE_DOCUMENT_CONTENT_TYPES,
} from "@/convex/utils/uploadPolicy";

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

describe("markdown knowledge uploads", () => {
  it("accepts markdown for knowledge but not for chat", () => {
    const labelled = new File(["# Title"], "revenue.md", { type: "text/markdown" });
    expect(validateUploadFile(labelled, "knowledgeDocument").allowed).toBe(true);
    expect(validateUploadFile(labelled, "chatDocument").allowed).toBe(false);
  });

  it("accepts markdown the browser failed to label", () => {
    const unlabelled = new File(["# Title"], "revenue.md", { type: "" });
    expect(validateUploadFile(unlabelled, "knowledgeDocument").allowed).toBe(true);

    const longForm = new File(["# Title"], "playbook.markdown", { type: "" });
    expect(validateUploadFile(longForm, "knowledgeDocument").allowed).toBe(true);
  });

  it("names markdown when it turns a file away", () => {
    const result = validateUploadFile(new File(["a"], "payload.js", { type: "text/javascript" }), "knowledgeDocument");
    expect(result).toEqual({
      allowed: false,
      reason: "Please upload PDF, CSV, Excel, Word, Markdown, or Text files.",
    });
  });

  it("resolves a content type from the extension when the browser sends none", () => {
    expect(resolveUploadContentType(new File(["a"], "revenue.md", { type: "" }))).toBe("text/markdown");
    expect(resolveUploadContentType(new File(["a"], "notes.markdown", { type: "" }))).toBe("text/markdown");
    expect(resolveUploadContentType(new File(["a"], "rows.csv", { type: "" }))).toBe("text/csv");
    expect(resolveUploadContentType(new File(["a"], "brief.pdf", { type: "" }))).toBe("application/pdf");
    expect(resolveUploadContentType(new File(["a"], "mystery.bin", { type: "" }))).toBe("");
  });

  it("prefers the browser's own label when it gives one", () => {
    expect(resolveUploadContentType(new File(["a"], "revenue.md", { type: "text/x-markdown" }))).toBe("text/x-markdown");
    expect(resolveUploadContentType(new File(["a"], "brief.pdf", { type: "application/pdf; charset=utf-8" }))).toBe(
      "application/pdf",
    );
  });
});

describe("upload allow-lists stay in step across the Convex boundary", () => {
  /**
   * Convex functions cannot import from src/, so these lists are duplicated.
   * A drift between them means the browser accepts a file the server then
   * rejects, or the reverse.
   */
  it("matches the duplicated Convex lists exactly", () => {
    expect([...CHAT_DOCUMENT_CONTENT_TYPES]).toEqual([...CONVEX_CHAT_DOCUMENT_CONTENT_TYPES]);
    expect([...KNOWLEDGE_DOCUMENT_CONTENT_TYPES]).toEqual([...CONVEX_KNOWLEDGE_DOCUMENT_CONTENT_TYPES]);
  });

  it("keeps markdown out of the chat list", () => {
    expect(CHAT_DOCUMENT_CONTENT_TYPES).not.toContain("text/markdown");
    expect(KNOWLEDGE_DOCUMENT_CONTENT_TYPES).toContain("text/markdown");
  });
});
