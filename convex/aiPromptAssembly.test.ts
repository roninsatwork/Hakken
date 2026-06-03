import { describe, expect, test } from "vitest";
import {
  FALLBACK_ASSISTANT_SYSTEM_PROMPT,
  buildAssistantSystemInstruction,
  orderAssistantKnowledgeMatches,
} from "./aiPromptAssembly";

describe("assistant prompt assembly", () => {
  test("builds main chat instructions as global platform prompt before company prompt and rules", () => {
    const instruction = buildAssistantSystemInstruction({
      globalSystemPrompt: "GLOBAL PLATFORM GUARDAILS",
      companySystemPrompt: "COMPANY-SPECIFIC GUIDANCE",
      activeRules: [
        {
          priority: "HIGH",
          trigger: "global trigger",
          instruction: "GLOBAL RULE",
        },
        {
          priority: "NORMAL",
          trigger: "company trigger",
          instruction: "COMPANY RULE",
        },
      ],
    });

    expect(instruction.indexOf("GLOBAL PLATFORM GUARDAILS")).toBeLessThan(
      instruction.indexOf("COMPANY-SPECIFIC GUIDANCE")
    );
    expect(instruction.indexOf("COMPANY-SPECIFIC GUIDANCE")).toBeLessThan(
      instruction.indexOf("GLOBAL RULE")
    );
    expect(instruction.indexOf("GLOBAL RULE")).toBeLessThan(
      instruction.indexOf("COMPANY RULE")
    );
  });

  test("uses the platform fallback before company prompt when no global prompt is configured", () => {
    const instruction = buildAssistantSystemInstruction({
      globalSystemPrompt: "   ",
      companySystemPrompt: "COMPANY-SPECIFIC GUIDANCE",
      activeRules: [],
    });

    expect(instruction.startsWith(FALLBACK_ASSISTANT_SYSTEM_PROMPT)).toBe(true);
    expect(instruction.indexOf(FALLBACK_ASSISTANT_SYSTEM_PROMPT)).toBeLessThan(
      instruction.indexOf("COMPANY-SPECIFIC GUIDANCE")
    );
  });

  test("orders main chat knowledge as global, then company, then thread", () => {
    const orderedMatches = orderAssistantKnowledgeMatches({
      globalMatches: ["global knowledge"],
      companyMatches: ["company knowledge"],
      threadMatches: ["thread knowledge"],
    });

    expect(orderedMatches).toEqual([
      "global knowledge",
      "company knowledge",
      "thread knowledge",
    ]);
  });
});
