/**
 * Google Analytics' words for a value it does not know — an age, a gender, a
 * browser it could not tell (docs/plans/active/google-analytics-plan.md
 * §18.6.6) — shared by Visitors' read, which reads Google signals from them,
 * and its screen, which shows them as "Unknown".
 */
const UNKNOWN_VALUES: ReadonlySet<string> = new Set(["", "unknown", "(not set)", "(other)"]);

/** Whether a visitor group's name is Google's word for not knowing. */
export function isUnknownValue(name: string): boolean {
  return UNKNOWN_VALUES.has(name.trim().toLowerCase());
}
