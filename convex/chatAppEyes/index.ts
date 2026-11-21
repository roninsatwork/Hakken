import { BING_EYE_READS, BING_EYES } from "./bing";
import { CLARITY_EYE_READS, CLARITY_EYES } from "./clarity";
import { GOOGLE_ANALYTICS_EYE_READS, GOOGLE_ANALYTICS_EYES, GOOGLE_ANALYTICS_SERVER_FINDINGS } from "./googleAnalytics";
import { SEARCH_CONSOLE_EYE_READS, SEARCH_CONSOLE_EYES } from "./searchConsole";
import { VISIBILITY_EYE_READS, VISIBILITY_EYES } from "./visibility";
import type { EyeAsk, EyeBuilders, EyeReads, EyeRun } from "./types";
import type { Finding } from "../utils/sees/findings";

/**
 * Every screen whose eye figures a chat app's question can build on the server,
 * and the reads they use (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md,
 * Option B). One file a section, joined here; a read's name starts with its
 * section's (ga., sc., bing., clarity., vis.), so two sections never share one.
 */
export const EYE_READS: EyeReads = {
  ...GOOGLE_ANALYTICS_EYE_READS,
  ...SEARCH_CONSOLE_EYE_READS,
  ...BING_EYE_READS,
  ...CLARITY_EYE_READS,
  ...VISIBILITY_EYE_READS,
};

export const EYE_BUILDERS: EyeBuilders = {
  ...GOOGLE_ANALYTICS_EYES,
  ...SEARCH_CONSOLE_EYES,
  ...BING_EYES,
  ...CLARITY_EYES,
  ...VISIBILITY_EYES,
};

/**
 * Screens whose eye takes its findings from a reading of its own rather than the page's rules, where it does:
 * Conversions and a counted event read the Conversions map's findings (`readSeesFindings`). Null where the screen
 * would use its page's rules after all.
 */
export const EYE_OWN_FINDINGS: Record<string, (run: EyeRun, ask: EyeAsk) => Promise<Finding[] | null>> = {
  ...GOOGLE_ANALYTICS_SERVER_FINDINGS,
};
