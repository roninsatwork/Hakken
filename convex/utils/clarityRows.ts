import { v, type Infer } from "convex/values";

/**
 * Microsoft Clarity's data export, read (docs/plans/active/insights-analyst-plan.md
 * §7b, I24, phase 15): the dashboard's figures for the last day, split by page
 * or by device, as Clarity's "project-live-insights" answer gives them — a list
 * of metrics, each with its rows. Kept as one row a page (or device) a day,
 * since Clarity keeps only three days.
 */

export const clarityRowValidator = v.object({
  /** A page's path, or a device's name. */
  key: v.string(),
  sessions: v.number(),
  /** Average share of the page scrolled, 0 to 100. */
  scroll: v.union(v.number(), v.null()),
  /** Average active seconds a session. */
  activeSeconds: v.union(v.number(), v.null()),
  /** Shares of sessions, 0 to 100, with a dead click, a rage click, a quick back, an excessive scroll. */
  dead: v.union(v.number(), v.null()),
  rage: v.union(v.number(), v.null()),
  quickBack: v.union(v.number(), v.null()),
  excessiveScroll: v.union(v.number(), v.null()),
});
export type ClarityRow = Infer<typeof clarityRowValidator>;

type Info = Record<string, unknown>;
const num = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** The path of a page Clarity names by its full address. */
function pathOf(address: string): string {
  try {
    return new URL(address).pathname || "/";
  } catch {
    return address || "/";
  }
}

/** Clarity's answer, as rows by the dimension asked: "URL" by page path, "Device" by device. */
export function clarityRowsFrom(json: unknown, dimension: "URL" | "Device"): ClarityRow[] {
  const metrics = Array.isArray(json) ? (json as Array<{ metricName?: string; information?: Info[] }>) : [];
  const rows = new Map<string, ClarityRow>();
  const keyOf = (info: Info) => {
    const raw = typeof info[dimension] === "string" ? (info[dimension] as string) : "";
    return dimension === "URL" ? pathOf(raw) : raw || "Other";
  };
  const row = (key: string) => {
    const held = rows.get(key) ?? { key, sessions: 0, scroll: null, activeSeconds: null, dead: null, rage: null, quickBack: null, excessiveScroll: null };
    rows.set(key, held);
    return held;
  };
  for (const metric of metrics) {
    for (const info of metric.information ?? []) {
      const held = row(keyOf(info));
      switch (metric.metricName) {
        case "Traffic":
          held.sessions += num(info.totalSessionCount) ?? 0;
          break;
        case "ScrollDepth":
          held.scroll = num(info.averageScrollDepth);
          break;
        case "EngagementTime":
          held.activeSeconds = num(info.activeTime);
          break;
        case "DeadClickCount":
          held.dead = num(info.sessionsWithMetricPercentage);
          break;
        case "RageClickCount":
          held.rage = num(info.sessionsWithMetricPercentage);
          break;
        case "QuickbackClick":
          held.quickBack = num(info.sessionsWithMetricPercentage);
          break;
        case "ExcessiveScroll":
          held.excessiveScroll = num(info.sessionsWithMetricPercentage);
          break;
        default:
          break;
      }
    }
  }
  return [...rows.values()].filter((entry) => entry.sessions > 0).sort((a, b) => b.sessions - a.sessions);
}

/** Days of rows added up: sessions summed, each share and average weighted by sessions. */
export function addUpClarity(days: ReadonlyArray<readonly ClarityRow[]>): ClarityRow[] {
  const sums = new Map<string, { sessions: number; weights: Record<string, { sum: number; weight: number }> }>();
  const fields = ["scroll", "activeSeconds", "dead", "rage", "quickBack", "excessiveScroll"] as const;
  for (const rows of days) {
    for (const row of rows) {
      const held = sums.get(row.key) ?? { sessions: 0, weights: {} };
      held.sessions += row.sessions;
      for (const field of fields) {
        const value = row[field];
        if (value === null) continue;
        const entry = held.weights[field] ?? { sum: 0, weight: 0 };
        entry.sum += value * row.sessions;
        entry.weight += row.sessions;
        held.weights[field] = entry;
      }
      sums.set(row.key, held);
    }
  }
  return [...sums.entries()].map(([key, held]) => {
    const average = (field: (typeof fields)[number]) => {
      const entry = held.weights[field];
      return entry && entry.weight > 0 ? Math.round((entry.sum / entry.weight) * 10) / 10 : null;
    };
    return { key, sessions: held.sessions, scroll: average("scroll"), activeSeconds: average("activeSeconds"), dead: average("dead"), rage: average("rage"), quickBack: average("quickBack"), excessiveScroll: average("excessiveScroll") };
  }).sort((a, b) => b.sessions - a.sessions);
}
