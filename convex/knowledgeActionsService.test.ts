import { describe, expect, test } from "vitest";
import {
  buildKnowledgeLeadLine,
  chunkKnowledgeText,
  isMarkdownFormat,
  parseOkfMarkdown,
  prepareKnowledgeMarkdown,
} from "./utils/knowledgeActionsService";

describe("knowledge action helpers", () => {
  test("chunks short text once without looping", () => {
    expect(chunkKnowledgeText("Short source text.", 1000, 200)).toEqual(["Short source text."]);
  });

  test("chunks long text with bounded overlap and forward progress", () => {
    const chunks = chunkKnowledgeText("abcdefghij".repeat(30), 50, 10);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 50)).toBe(true);
    expect(chunks.at(-1)).toBeTruthy();
  });
});

describe("OKF frontmatter", () => {
  test("reads the fields we use and drops the block from the body", () => {
    const raw = [
      "---",
      "type: metric",
      "title: Quarterly Revenue",
      "description: Total booked revenue for the quarter.",
      "tags:",
      "  - finance",
      "  - board",
      "generated:",
      "  by: process:finance-nightly",
      "  at: 2026-06-13T00:00:00Z",
      "---",
      "",
      "# Quarterly Revenue",
      "",
      "Booked revenue, excluding refunds.",
    ].join("\n");

    const { frontmatter, body } = parseOkfMarkdown(raw);

    expect(frontmatter).toEqual({
      type: "metric",
      title: "Quarterly Revenue",
      description: "Total booked revenue for the quarter.",
    });
    expect(body).not.toContain("generated:");
    expect(body).not.toContain("tags:");
    expect(body).toContain("Booked revenue, excluding refunds.");
  });

  test("keeps colons and hashes inside quoted values", () => {
    const raw = ['---', 'title: "Revenue: the money in"', "description: 'Tagged #finance in the ledger'", '---', 'Body.'].join("\n");

    const { frontmatter } = parseOkfMarkdown(raw);

    expect(frontmatter.title).toBe("Revenue: the money in");
    expect(frontmatter.description).toBe("Tagged #finance in the ledger");
  });

  test("reads folded and literal block values", () => {
    const raw = [
      "---",
      "type: runbook",
      "description: >",
      "  Restores the nightly load",
      "  after a failed run.",
      "---",
      "Body.",
    ].join("\n");

    expect(parseOkfMarkdown(raw).frontmatter.description).toBe("Restores the nightly load after a failed run.");
  });

  test("leaves a document untouched when there is no frontmatter", () => {
    const raw = "# Plain markdown\n\nNo header here.";
    expect(parseOkfMarkdown(raw)).toEqual({ frontmatter: {}, body: raw });
  });

  test("treats an unterminated block as body rather than losing the file", () => {
    const raw = "---\ntype: metric\ntitle: Never closed\n\nThe rest of the document.";
    const { frontmatter, body } = parseOkfMarkdown(raw);

    expect(frontmatter).toEqual({});
    expect(body).toBe(raw);
  });

  test("is not fooled by a horizontal rule further down the page", () => {
    const raw = "# Heading\n\nSome prose.\n\n---\n\nMore prose.";
    expect(parseOkfMarkdown(raw)).toEqual({ frontmatter: {}, body: raw });
  });

  test("builds a lead line from whichever fields are present", () => {
    expect(buildKnowledgeLeadLine({ type: "metric", title: "Revenue", description: "Money in." })).toBe(
      "Revenue (metric): Money in.",
    );
    expect(buildKnowledgeLeadLine({ title: "Revenue" })).toBe("Revenue");
    expect(buildKnowledgeLeadLine({ description: "Money in." })).toBe("Money in.");
    expect(buildKnowledgeLeadLine({})).toBe("");
  });

  test("replaces the block with its lead line before chunking", () => {
    const raw = ["---", "type: metric", "title: Revenue", "description: Money in.", "---", "", "Detail."].join("\n");

    const prepared = prepareKnowledgeMarkdown(raw);

    expect(prepared.text).toBe("Revenue (metric): Money in.\n\nDetail.");
    expect(prepared.text).not.toContain("---");
    expect(chunkKnowledgeText(prepared.text).join(" ")).not.toContain("type:");
  });

  test("recognises the markdown content types and nothing else", () => {
    expect(isMarkdownFormat("text/markdown")).toBe(true);
    expect(isMarkdownFormat("text/x-markdown")).toBe(true);
    expect(isMarkdownFormat("text/markdown; charset=utf-8")).toBe(true);
    expect(isMarkdownFormat("text/plain")).toBe(false);
    expect(isMarkdownFormat("application/pdf")).toBe(false);
    expect(isMarkdownFormat(undefined)).toBe(false);
  });
});
