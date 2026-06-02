import { describe, expect, test } from "vitest";
import { getOpenAITextModelCatalogue } from "./aiModelsActions";

describe("ai model actions", () => {
  test("OpenAI catalogue sync keeps curated text models and merges live account models", () => {
    expect(getOpenAITextModelCatalogue([
      "text-embedding-3-small",
      "gpt-account-only",
      "whisper-1",
    ])).toEqual(expect.arrayContaining([
      "gpt-5",
      "gpt-4o-mini",
      "gpt-account-only",
    ]));
  });

  test("OpenAI catalogue sync still exposes text models when the live list is non-text only", () => {
    expect(getOpenAITextModelCatalogue([
      "text-embedding-3-small",
      "tts-1",
      "dall-e-3",
    ])).toEqual(expect.arrayContaining([
      "gpt-5",
      "gpt-4.1",
      "o3",
    ]));
  });
});
