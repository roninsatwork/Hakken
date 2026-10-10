import { describe, expect, test } from "vitest";
import { AI_ASSISTANTS_CHANNEL, assistantOf, channelOf } from "./aiAssistants";

describe("visitors from AI assistants (google-analytics-plan.md §4.4)", () => {
  test("a source on the list is its assistant, with or without www. or a subdomain", () => {
    expect(assistantOf("chatgpt.com")).toBe("ChatGPT");
    expect(assistantOf("www.perplexity.ai")).toBe("Perplexity");
    expect(assistantOf("gemini.google.com")).toBe("Gemini");
    expect(assistantOf("claude.ai")).toBe("Claude");
    expect(assistantOf("google")).toBeNull();
    expect(assistantOf("news.google.com")).toBeNull();
  });

  test("an assistant named as a bare word is the same assistant, whatever its case", () => {
    // Ronins' AI assistants screen listed "Gemini" (3) and "gemini" (1) on 2026-10-10 (plan §16).
    expect(assistantOf("gemini")).toBe("Gemini");
    expect(assistantOf("Gemini")).toBe("Gemini");
    expect(assistantOf("ChatGPT")).toBe("ChatGPT");
    expect(assistantOf("openai")).toBe("ChatGPT");
    expect(assistantOf("chatgpt / referral")).toBe("ChatGPT");
    expect(assistantOf("bing")).toBeNull();
    expect(assistantOf("(direct)")).toBeNull();
  });

  test("Google's own AI channel and the list both count as AI assistants; the rest keep Google's channel", () => {
    expect(channelOf("AI Assistant", "chatgpt.com")).toBe(AI_ASSISTANTS_CHANNEL);
    expect(channelOf("Referral", "perplexity.ai")).toBe(AI_ASSISTANTS_CHANNEL);
    expect(channelOf("Referral", "example.com")).toBe("Referral");
    expect(channelOf("Organic Search", "google")).toBe("Organic Search");
  });
});
