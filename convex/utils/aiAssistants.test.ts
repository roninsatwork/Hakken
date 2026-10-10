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

  test("Google's own AI channel and the list both count as AI assistants; the rest keep Google's channel", () => {
    expect(channelOf("AI Assistant", "chatgpt.com")).toBe(AI_ASSISTANTS_CHANNEL);
    expect(channelOf("Referral", "perplexity.ai")).toBe(AI_ASSISTANTS_CHANNEL);
    expect(channelOf("Referral", "example.com")).toBe("Referral");
    expect(channelOf("Organic Search", "google")).toBe("Organic Search");
  });
});
