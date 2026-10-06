/**
 * The assistant's definition (docs/plans/active/assistant-foundation-plan.md,
 * item 4): the built-in agent every door answers through — Ask Hakken first,
 * Telegram later. Plain code, free of any Convex function, like the
 * Translator's (`contentTranslator.ts`), so the server and the screens can
 * both read it.
 *
 * Its own prompt starts empty on purpose. What it says it is comes from the
 * platform's prompt and the company's, exactly as typed Ask Hakken was told,
 * so moving Ask Hakken onto it changes nothing a person is told; an
 * administrator can add to it on the Agents screen like any agent's.
 */
export const HAKKEN_ASSISTANT = {
  // Named for what it is, not the platform: a clone renames the platform in
  // Settings, and every customer-visible word here must survive that.
  systemKey: "ASSISTANT",
  name: "The Assistant",
  description:
    "Answers the people who ask the platform's assistant, from what the platform knows — the company's wiki and documents, the platform's own, its memories and its rules — and, as its tools grow, looks things up and does things with a person's yes. Every door answers through it: typed and spoken today, Telegram next. It answers conversations, so it has no Run of its own; switched off, the assistant says so rather than answering.",
  standingObjective: "Answer the people who ask the platform's assistant, from what the platform knows.",
  /** Its model is the chat job's, from Model Defaults, unless a conversation chooses another. */
  modelUseCase: "chat",
} as const;

/** The connector holding the Assistant's company-figures tools (item 7; `toolConnectorDefinitions.ts`). */
export const COMPANY_FIGURES_CONNECTOR_KEY = "assistant-figures";

export type AgentReasoningEffortLevel = "LOW" | "MEDIUM" | "HIGH";

/**
 * A conversation's thinking level as the agent runtime takes it. Ask Hakken
 * offers None, Low, Medium and High; the runtime's levels are the last three,
 * and none is no extra effort.
 */
export function reasoningEffortFor(thinkingLevel: string | undefined): AgentReasoningEffortLevel | undefined {
  return thinkingLevel === "LOW" || thinkingLevel === "MEDIUM" || thinkingLevel === "HIGH" ? thinkingLevel : undefined;
}
