import { describe, expect, test } from "vitest";
import { groupWebsiteDocuments } from "./knowledgeManagerUtils";

describe("knowledge manager utils", () => {
  test("groups url documents by origin and ignores non-url documents", () => {
    const groups = groupWebsiteDocuments([
      { format: "url", sourceUrl: "https://example.com/a" },
      { format: "url", sourceUrl: "https://example.com/b?x=1" },
      { format: "url", sourceUrl: "https://docs.example.com/start" },
      { format: "application/pdf", sourceUrl: "https://example.com/file.pdf" },
    ]);

    expect(Object.keys(groups)).toEqual(["https://example.com", "https://docs.example.com"]);
    expect(groups["https://example.com"]).toHaveLength(2);
    expect(groups["https://docs.example.com"]).toHaveLength(1);
  });

  test("keeps malformed source urls in an Other group", () => {
    const groups = groupWebsiteDocuments([
      { format: "url", sourceUrl: "not a url" },
      { format: "url", sourceUrl: "https://example.com/a" },
    ]);

    expect(groups.Other).toHaveLength(1);
    expect(groups["https://example.com"]).toHaveLength(1);
  });
});
