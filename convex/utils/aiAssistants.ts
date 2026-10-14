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

/**
 * Every source an assistant's visit can carry, as Google is asked for them
 * exactly (ga-channel-pages-plan.md CH13): each website with and without
 * `www.`, and each assistant's bare name as a tagged link writes it.
 */
export const AI_SOURCE_VALUES: readonly string[] = [...new Set([
  ...AI_ASSISTANT_SOURCES.flatMap((assistant) => assistant.sources.flatMap((source) => [source, `www.${source}`])),
  ...AI_ASSISTANT_SOURCES.map((assistant) => assistant.name.toLowerCase().replace(/[\s.]+/g, "")),
  "openai", "bard",
])];

/** Google's own channel for them, as `sessionDefaultChannelGroup` names it. */
export const GOOGLE_AI_CHANNEL = "AI Assistant";

/** Google's channels whose sources a channel's screen describes in words of its own (google-analytics-plan.md GA22). */
export const DESCRIBED_CHANNELS: readonly string[] = ["Referral", "Organic Search", "Organic Social", "Paid Search", "Email", "Direct"];

/** The channel every assistant's visits are shown under. */
export const AI_ASSISTANTS_CHANNEL = "AI assistants";

const BY_SOURCE = new Map(AI_ASSISTANT_SOURCES.flatMap((assistant) => assistant.sources.map((source) => [source, assistant.name] as const)));

/** A word without its spaces and dots, in lower case: "Meta AI" and "meta.ai" are "metaai". */
const bareWord = (words: string) => words.toLowerCase().replace(/[\s.]+/g, "");

/**
 * An assistant named as a bare word rather than a website — `gemini`,
 * `ChatGPT`, a campaign's `utm_source=openai` — in any case. Google sent
 * Ronins' Gemini visits as both `gemini.google.com` and `gemini`, and the
 * AI assistants screen listed "Gemini" twice (plan §16).
 */
const BY_WORD = new Map<string, string>([
  ...AI_ASSISTANT_SOURCES.map((assistant) => [bareWord(assistant.name), assistant.name] as const),
  ["openai", "ChatGPT"],
  ["bard", "Gemini"],
]);

/** The assistant a visit's source is, when it is one: `chatgpt.com`, `www.perplexity.ai`, `chatgpt.com / referral`, `gemini`. */
export function assistantOf(source: string): string | null {
  const host = source.trim().toLowerCase().split(/[\s/]/)[0].replace(/^www\./, "");
  for (let at = host; at.includes("."); at = at.slice(at.indexOf(".") + 1)) {
    const name = BY_SOURCE.get(at);
    if (name) return name;
  }
  return host.includes(".") ? null : BY_WORD.get(bareWord(host)) ?? null;
}

/** The channel a visit is shown under: AI assistants when Google or the list says so, else Google's own. */
export function channelOf(googleChannel: string, source: string): string {
  if (googleChannel === GOOGLE_AI_CHANNEL || assistantOf(source) !== null) return AI_ASSISTANTS_CHANNEL;
  return googleChannel;
}
