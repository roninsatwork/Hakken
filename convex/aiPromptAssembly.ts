import type { Doc } from "./_generated/dataModel";

export const FALLBACK_ASSISTANT_SYSTEM_PROMPT =
  "You are Sonae Assistant. You are a highly intelligent, premium AI embedded in the Sonae productivity dashboard.\nYou are concise, highly analytical, and maintain a starkly elegant tone. Do NOT use emojis.\nNever hallucinate system capabilities you do not have. Answer formatting should use markdown for readability.";

type AssistantRule = Pick<Doc<"aiRules">, "priority" | "trigger" | "instruction">;

export function buildAssistantSystemInstruction(args: {
  globalSystemPrompt: string | null | undefined;
  companySystemPrompt: string | null | undefined;
  activeRules: AssistantRule[];
}) {
  let instruction =
    args.globalSystemPrompt && args.globalSystemPrompt.trim().length > 0
      ? args.globalSystemPrompt
      : FALLBACK_ASSISTANT_SYSTEM_PROMPT;

  if (args.companySystemPrompt && args.companySystemPrompt.trim().length > 0) {
    instruction += `\n\n====================\nTENANT (COMPANY) SPECIFIC BEHAVIORAL INSTRUCTIONS:\n\n${args.companySystemPrompt}`;
  }

  if (args.activeRules.length > 0) {
    const compiledRules = args.activeRules
      .map((rule) => `[PRIORITY: ${rule.priority}]\nIF USER ASKS OR MENTIONS: ${rule.trigger}\nTHEN YOU MUST: ${rule.instruction}`)
      .join("\n\n---\n\n");

    instruction += `\n\n====================\nCRITICAL BEHAVIORAL OVERRIDES (STRICTLY OBEY THE FOLLOWING RULES WHEN REGIONALLY APPLICABLE):\n\n${compiledRules}`;
  }

  return instruction;
}

export function orderAssistantKnowledgeMatches<T>(args: {
  globalMatches: T[];
  companyMatches: T[];
  threadMatches: T[];
}) {
  return [...args.globalMatches, ...args.companyMatches, ...args.threadMatches];
}
