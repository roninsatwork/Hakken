/**
 * Custom dates' period key in Google Analytics (sees-header-and-rolling-dates-plan.md, part two, rule 4): a screen
 * asks by it as it asks by a menu period, so every read, slot and list key works unchanged. Underscores, no pipe,
 * since a list's key is split on pipes. The lists are asked of Google when a screen first asks for them
 * (`googleAnalyticsLive.prepareAnalyticsCustom`) and cleared a day later. Shared with the screens.
 */
export type CustomPeriod = `custom_${string}`;
export const customPeriodKey = (span: { from: string; to: string }): CustomPeriod => `custom_${span.from}_${span.to}`;
/** The dates a custom key names, or null for any other period. */
export function customRangeOf(period: string): { from: string; to: string } | null {
  const match = /^custom_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(period);
  return match && match[1] <= match[2] ? { from: match[1], to: match[2] } : null;
}
