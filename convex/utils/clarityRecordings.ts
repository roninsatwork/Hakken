import { v, type Infer } from "convex/values";

/**
 * Clarity's recordings, read (docs/plans/active/agents-and-clarity-plan.md,
 * CM2): the answer Microsoft's own Clarity connector gets from
 * `clarity.microsoft.com/mcp/recordings/sample` — a list of visits, each with
 * its link to watch it in Clarity, its lengths as words ("16 minutes and 36
 * seconds"), its pages and clicks, and a timeline of the pages it went
 * through, each with its address, its referrer and what happened on it.
 * Plain code, free of any Convex function.
 */

/** The kinds of recording Hakken picks each morning: what each shows. */
export const clarityRecordingKindValidator = v.union(
  v.literal("ERRORS"),
  v.literal("ERROR_CLICKS"),
  v.literal("RAGE"),
  v.literal("DEAD"),
  v.literal("QUICK_BACK"),
  v.literal("LONGEST"),
);
export type ClarityRecordingKind = Infer<typeof clarityRecordingKindValidator>;

/** A recording as Hakken keeps it: what a screen lists and links to. */
export const clarityRecordingValidator = v.object({
  kind: clarityRecordingKindValidator,
  /** Clarity's link to watch it. */
  link: v.string(),
  startedAt: v.number(),
  /** Seconds the visitor was active, and in all. */
  activeSeconds: v.number(),
  totalSeconds: v.number(),
  pages: v.number(),
  clicks: v.number(),
  /** The page it is about — where the error or the click was, or where it began — and the pages it went through, in order. */
  page: v.string(),
  visited: v.array(v.string()),
  /** Where the visit came from, as its first page's referrer names it; null for a direct visit. */
  referrer: v.union(v.string(), v.null()),
});
export type ClarityRecording = Infer<typeof clarityRecordingValidator>;

/** Pages of a visit kept, at most: the rest of a long visit is counted in `pages`, not listed. */
const VISITED_KEPT = 20;

type Info = Record<string, unknown>;
type Step = { url?: unknown; referrerUrl?: unknown; duration?: unknown; timelineEvents?: unknown };

const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

/** A length as Clarity words it — "44 seconds", "05 minutes and 51 seconds", "1 hour and 2 minutes" — in seconds; null when it says none. */
export function secondsOf(words: unknown): number | null {
  if (typeof words !== "string") return null;
  let seconds = 0;
  let found = false;
  for (const [, count, unit] of words.matchAll(/(\d+(?:\.\d+)?)\s*(hour|minute|second)s?/gi)) {
    found = true;
    seconds += Number(count) * (unit.toLowerCase() === "hour" ? 3600 : unit.toLowerCase() === "minute" ? 60 : 1);
  }
  return found ? Math.round(seconds) : null;
}

function pathOf(address: unknown): string | null {
  if (typeof address !== "string" || !address) return null;
  try {
    return new URL(address).pathname || "/";
  } catch {
    return address.split(/[?#]/)[0] || null;
  }
}

function hostOf(address: unknown): string | null {
  if (typeof address !== "string" || !address) return null;
  try {
    return new URL(address).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Clarity's own id for the project, from a recording's link (`/player/{project}/{user}/{session}`). */
export function projectIdOf(link: string): string | null {
  return /\/player\/([^/?#]+)\//.exec(link)?.[1] ?? null;
}

/** What each kind of recording is about, as a page's timeline names it: the first page where it happened. */
const EVENT_OF: Partial<Record<ClarityRecordingKind, RegExp>> = {
  ERRORS: /script|error/i,
  ERROR_CLICKS: /error/i,
  RAGE: /rage/i,
  DEAD: /dead/i,
  QUICK_BACK: /quick|back/i,
};

function pageAbout(kind: ClarityRecordingKind, steps: readonly Step[]): string | null {
  const pattern = EVENT_OF[kind];
  if (pattern) {
    const step = steps.find((entry) => Array.isArray(entry.timelineEvents) && (entry.timelineEvents as Info[]).some((event) => pattern.test(String(event.eventtype ?? event.eventType ?? ""))));
    if (step) return pathOf(step.url);
  }
  if (kind === "LONGEST") {
    const longest = [...steps].sort((a, b) => num(b.duration) - num(a.duration))[0];
    if (longest) return pathOf(longest.url);
  }
  return pathOf(steps[0]?.url);
}

/**
 * Clarity's recordings answer, as Hakken keeps it: each visit's link, when it
 * started (Clarity's UTC time), how long it was active and in all, its pages
 * and clicks, the page it is about, the pages it went through, and where it
 * came from. A visit with no link to watch it is left out: there is nothing
 * to open.
 */
export function clarityRecordingsFrom(json: unknown, kind: ClarityRecordingKind): ClarityRecording[] {
  const list = Array.isArray(json) ? (json as Info[]) : [];
  const out: ClarityRecording[] = [];
  for (const entry of list) {
    const link = typeof entry.link === "string" ? entry.link : "";
    if (!/^https:\/\/clarity\.microsoft\.com\//.test(link)) continue;
    const steps = Array.isArray(entry.timeline) ? (entry.timeline as Step[]) : [];
    const stamp = typeof entry.timestamp === "string" ? Date.parse(`${entry.timestamp.replace(" ", "T")}Z`) : NaN;
    const timelineSeconds = Math.round(steps.reduce((sum, step) => sum + num(step.duration), 0) / 1000);
    const totalSeconds = secondsOf(entry.totalDuration) ?? timelineSeconds;
    const visited = steps.map((step) => pathOf(step.url)).filter((path): path is string => path !== null);
    out.push({
      kind,
      link,
      startedAt: Number.isFinite(stamp) ? stamp : 0,
      activeSeconds: secondsOf(entry.activeDuration) ?? totalSeconds,
      totalSeconds,
      pages: Math.max(num(entry.pagesCount), visited.length),
      clicks: num(entry.sessionClickCount),
      page: pageAbout(kind, steps) ?? "/",
      visited: visited.slice(0, VISITED_KEPT),
      referrer: hostOf(steps[0]?.referrerUrl),
    });
  }
  return out;
}
