/**
 * Visitors from AI assistants, as Google Analytics' channels show them
 * (docs/plans/active/google-analytics-plan.md GA10, §4.4). Google added its
 * own "AI Assistant" channel on 13 May 2026, but it does not cover visits
 * before then, and some assistants still land in "Referral". So a visit
 * counts as AI assistants when Google says so or its source is on this list —
 * one list, in one place, applied when the figures are read, so a name added
 * here re-sorts every visit already kept.
 */

/** Each assistant's websites, as Analytics names a visit's source, and the name a screen gives it. */
export const AI_ASSISTANT_SOURCES: ReadonlyArray<{ name: string; sources: readonly string[] }> = [
  { name: "ChatGPT", sources: ["chatgpt.com", "chat.openai.com", "openai.com"] },
  { name: "Perplexity", sources: ["perplexity.ai"] },
  { name: "Gemini", sources: ["gemini.google.com", "bard.google.com"] },
  { name: "Copilot", sources: ["copilot.microsoft.com", "copilot.cloud.microsoft"] },
  { name: "Claude", sources: ["claude.ai"] },
  { name: "DeepSeek", sources: ["chat.deepseek.com", "deepseek.com"] },
  { name: "Grok", sources: ["grok.com"] },
  { name: "Meta AI", sources: ["meta.ai"] },
  { name: "Mistral", sources: ["chat.mistral.ai"] },
  { name: "You.com", sources: ["you.com"] },
  { name: "Phind", sources: ["phind.com"] },
  { name: "Poe", sources: ["poe.com"] },
];

/** Google's own channel for them, as `sessionDefaultChannelGroup` names it. */
export const GOOGLE_AI_CHANNEL = "AI Assistant";

/** The channel every assistant's visits are shown under. */
export const AI_ASSISTANTS_CHANNEL = "AI assistants";

const BY_SOURCE = new Map(AI_ASSISTANT_SOURCES.flatMap((assistant) => assistant.sources.map((source) => [source, assistant.name] as const)));

/** The assistant a visit's source is, when it is one: `chatgpt.com`, `www.perplexity.ai`, `chatgpt.com / referral`. */
export function assistantOf(source: string): string | null {
  const host = source.trim().toLowerCase().split(/[\s/]/)[0].replace(/^www\./, "");
  for (let at = host; at.includes("."); at = at.slice(at.indexOf(".") + 1)) {
    const name = BY_SOURCE.get(at);
    if (name) return name;
  }
  return null;
}

/** The channel a visit is shown under: AI assistants when Google or the list says so, else Google's own. */
export function channelOf(googleChannel: string, source: string): string {
  if (googleChannel === GOOGLE_AI_CHANNEL || assistantOf(source) !== null) return AI_ASSISTANTS_CHANNEL;
  return googleChannel;
}
