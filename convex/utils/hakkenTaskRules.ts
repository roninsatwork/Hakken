/**
 * The rules a Hakken alert is judged by (docs/plans/active/hakken-tasks-plan.md,
 * "Code checks, the model writes"): whether a day counts, how many in a row,
 * a figure's usual day, and the task in plain words. Plain code, free of any
 * Convex function, so the proposal, the Watcher and the screens agree.
 */

export type TaskMeasure = "visitors" | "impressions";
export type TaskCondition = { op: "below" | "above" | "dropBy" | "riseBy"; value: number; days: number };

/** Search Console figures for a day settle over two to three days: a day is judged three days on. */
export const SETTLE_DAYS = 2;

/** Days read to know a figure's usual day, and to try a rule before it starts. */
export const TRIAL_DAYS = 28;

/** A figure's usual day: the rounded mean of the days read, null with none. */
export function usualOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Whether one day's figure meets the rule. A share is of the figure's usual day. */
export function dayMet(value: number, condition: TaskCondition, usual: number | null): boolean {
  switch (condition.op) {
    case "below":
      return value < condition.value;
    case "above":
      return value > condition.value;
    case "dropBy":
      return usual !== null && usual > 0 && value <= usual * (1 - condition.value / 100);
    case "riseBy":
      return usual !== null && usual > 0 && value >= usual * (1 + condition.value / 100);
  }
}

export type JudgedDay = { day: string; value: number; met: boolean; streak: number; tells: boolean };

/**
 * Each day in order, with the days in a row the rule has been met and
 * whether its owner is told. An alert tells every day its rule is met for
 * the days asked, until it is stopped (Anthony, 2026-10-07: "until they are
 * stopped").
 */
export function judgeDays(days: ReadonlyArray<{ day: string; value: number }>, condition: TaskCondition, usual: number | null, streakBefore = 0): JudgedDay[] {
  let streak = streakBefore;
  return [...days]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map(({ day, value }) => {
      const met = dayMet(value, condition, usual);
      streak = met ? streak + 1 : 0;
      return { day, value, met, streak, tells: met && streak >= Math.max(1, condition.days) };
    });
}

/** How often the rule would have told its owner over the days read: what a person sees before saying yes. */
export function trialOf(days: ReadonlyArray<{ day: string; value: number }>, condition: TaskCondition, usual: number | null): { tells: number; of: number } {
  const judged = judgeDays(days, condition, usual);
  return { tells: judged.filter((day) => day.tells).length, of: judged.length };
}

const MEASURE_WORDS: Record<TaskMeasure, { one: string; many: string }> = {
  visitors: { one: "visitor", many: "visitors" },
  impressions: { one: "time it shows up in Google", many: "times it shows up in Google" },
};

/** "fewer than 10 visitors", "more than 1,000 visitors", "drops by half" — for the title and the alert. */
export function conditionWords(measure: TaskMeasure, condition: TaskCondition): string {
  const words = MEASURE_WORDS[measure];
  const count = (n: number) => `${n.toLocaleString("en-GB")} ${n === 1 ? words.one : words.many}`;
  switch (condition.op) {
    case "below":
      return measure === "visitors" ? `gets fewer than ${count(condition.value)}` : `shows up in Google fewer than ${condition.value.toLocaleString("en-GB")} times`;
    case "above":
      return measure === "visitors" ? `gets more than ${count(condition.value)}` : `shows up in Google more than ${condition.value.toLocaleString("en-GB")} times`;
    case "dropBy": {
      const share = condition.value === 50 ? "half" : `${condition.value}% fewer`;
      if (measure === "visitors") return condition.value === 50 ? "gets half its usual visitors" : `gets ${share} visitors than usual`;
      return condition.value === 50 ? "shows up in Google half as often as usual" : `shows up in Google ${condition.value}% less often than usual`;
    }
    case "riseBy":
      return measure === "visitors" ? `gets ${condition.value}% more visitors than usual` : `shows up in Google ${condition.value}% more often than usual`;
  }
}

/** How long, in words: "a day", "3 days in a row". */
export function spanWords(days: number): string {
  return days <= 1 ? "a day" : `${days} days in a row`;
}

/** The task in its owner's words, as Hakken tasks lists it: "Tell me if /web-design-london/ gets fewer than 10 visitors a day". */
export function taskTitle(args: { website: string; page?: string; measure: TaskMeasure; condition: TaskCondition }): string {
  const what = args.page ? pathOf(args.page) : args.website;
  const rule = conditionWords(args.measure, args.condition);
  const span = args.condition.op === "below" || args.condition.op === "above"
    ? (args.condition.days <= 1 ? " a day" : ` a day for ${args.condition.days} days in a row`)
    : (args.condition.days <= 1 ? " in a day" : ` for ${args.condition.days} days in a row`);
  return `Tell me if ${what} ${rule}${span}`;
}

/** A page's path, as people say it: https://example.co.uk/web-design-london/ → /web-design-london/. */
export function pathOf(page: string): string {
  try {
    const url = new URL(page);
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return page;
  }
}
