import { describe, expect, test } from "vitest";
import { chunkKnowledgeText } from "./utils/knowledgeActionsService";

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
