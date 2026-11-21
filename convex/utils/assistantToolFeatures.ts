/**
 * Which menu feature each of Ask Hakken's tools reads from, by its
 * `handlerMapping` (`toolConnectorDefinitions.ts`). A company with that feature
 * switched off isn't offered the tool (features-switches-plan-2026-11-21.md,
 * FS9). A tool not listed here reads across sections, like a chart, and is
 * always offered.
 */
import { MENU_FEATURES, type MenuFeature } from "./coreModules";

const TOOL_FEATURES: Readonly<Record<string, MenuFeature>> = {
  "assistant.searchConsole": MENU_FEATURES.searchConsole,
  "assistant.googleAnalytics": MENU_FEATURES.googleAnalytics,
  "assistant.googleAnalytics.live": MENU_FEATURES.googleAnalytics,
  "assistant.bingWebmaster": MENU_FEATURES.bingWebmaster,
  "assistant.insights.read": MENU_FEATURES.insights,
  "assistant.site.overview": MENU_FEATURES.visibility,
  "assistant.ai.mentions": MENU_FEATURES.visibility,
  "assistant.tasks.propose": MENU_FEATURES.hakkenTasks,
  "assistant.tasks.proposeReport": MENU_FEATURES.hakkenTasks,
  "assistant.tasks.proposeChartReport": MENU_FEATURES.hakkenTasks,
  "assistant.tasks.proposeAnswerAlert": MENU_FEATURES.hakkenTasks,
  "assistant.tasks.proposeRankingAlert": MENU_FEATURES.hakkenTasks,
  "assistant.tasks.proposeResearch": MENU_FEATURES.hakkenTasks,
  "assistant.tasks.list": MENU_FEATURES.hakkenTasks,
  "assistant.tasks.change": MENU_FEATURES.hakkenTasks,
};

/** The feature a tool reads from, or undefined for one that reads across sections. */
export function toolFeature(handlerMapping: string | undefined): MenuFeature | undefined {
  return handlerMapping ? TOOL_FEATURES[handlerMapping] : undefined;
}

/** Whether a company with these features on is offered the tool. */
export function toolOfferedWith(handlerMapping: string | undefined, featuresOn: readonly string[]): boolean {
  const feature = toolFeature(handlerMapping);
  return feature === undefined || featuresOn.includes(feature);
}
