import type { Fact, FactSource, FactUnit } from "./insightFacts";

/**
 * The saved data an Insights agent reads for itself (stronger-agents-plan-2026-10-30.md
 * A1; Anthony, 2026-10-30: "you said the agent would talk directly to the data"):
 * a section's screen, read through the very function the screen reads, handed
 * back with every number given its own key. The agent names a figure by its key
 * in double square brackets, exactly as it names the page's own facts, and the
 * Editor fills it in, so an agent that reads for itself still never types a
 * number. Nothing here reads a database or asks a model: `insightsToolAsk.ts`
 * runs the reads and the turns.
 */

/**
 * The reads' model-facing names, chosen here and read from here: their own, never Ask Hakken's connector tools'
 * (`read_google_analytics`, `read_search_console`), which answer with typed figures and take a website to name.
 */
export const ANALYTICS_READ = "read_analytics_screen";
export const SEARCH_CONSOLE_READ = "read_search_console_figures";

/** A screen's answer as an agent reads it, and the figures in it as facts. */
export type KeyedRead = { shown: unknown; facts: Fact[] };

/** Fields a screen's answer carries for its own reader, never a figure an agent says: dropped to keep each read short. */
const DROPPED = new Set(["ok", "rule", "link", "website", "currency", "screen", "period", "figuresTo", "seen"]);
/** The figures one read may carry: a screen's own rows, never thousands. */
export const MOST_READ_FACTS = 400;
/** Items a list in a read keeps: the most first, as the screen opens. */
const MOST_LIST_ITEMS = 25;

/** A number's unit, from the name its screen gives it: money, a percentage, seconds, a position, or a count. */
export function unitOf(name: string): FactUnit {
  const lower = name.toLowerCase();
  if (/(value|revenue|worth|spend|cost)/.test(lower) && !/percent/.test(lower)) return "money";
  if (/(percent|share|rate)/.test(lower)) return "percent";
  if (/seconds|duration|time(on|spent)/.test(lower)) return "seconds";
  if (/position|rank/.test(lower)) return "position";
  // Visits or people for one conversion read as whole numbers; pages or views a visit to one place.
  if (/(forone|perconversion)/.test(lower)) return "ratio";
  if (/(pervisit|avisit)/.test(lower)) return "score";
  return "count";
}

/** A list item's own name, for a key a person can read: its event, channel, page, classification or name. */
function nameOf(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  // Then the names other sections' rows go by (sees-every-page-plan-2026-10-31.md): a search, a website, a domain, a browser…
  for (const field of ["event", "column", "channel", "classification", "page", "name", "came", "went", "source", "product", "kind", "check", "key", "query", "keyword", "host", "domain", "device", "country", "browser", "anchor", "label", "title", "url", "prompt", "engine", "step"]) {
    const value = row[field];
    if (typeof value === "string" && value.trim()) return value.trim().replace(/[\]\s]+/g, "_").slice(0, 60);
  }
  return null;
}

/** Words for a fact's label, from its key's parts: "conversions · kinds · purchase · count". */
const labelOf = (path: readonly string[]) => path.join(" · ");

/**
 * A screen's answer with each number replaced by its words and its key — `"18,344 [[ga1.kinds.add_to_cart.count]]"` —
 * and the facts those keys name. Keys are built from the answer's own field names and each list item's name, so an
 * agent and a reader of the run's log can see what each one is. Lists keep their first rows, as the screen opens.
 */
export function keyedRead(answer: unknown, prefix: string, at: { source: FactSource; from?: string; to?: string; country?: string; currency?: string | null }): KeyedRead {
  const facts: Fact[] = [];
  const used = new Set<string>();
  const keyFor = (path: readonly string[]) => {
    const base = [prefix, ...path].join(".");
    let key = base;
    for (let again = 2; used.has(key); again += 1) key = `${base}.${again}`;
    used.add(key);
    return key;
  };
  const walk = (value: unknown, path: string[], field: string): unknown => {
    if (typeof value === "number") {
      if (!Number.isFinite(value) || facts.length >= MOST_READ_FACTS) return value;
      const unit = unitOf(field);
      const fact: Fact = {
        key: keyFor(path),
        value,
        unit,
        source: at.source,
        label: labelOf(path),
        ...(at.from ? { from: at.from } : {}),
        ...(at.to ? { to: at.to } : {}),
        ...(at.country ? { country: at.country } : {}),
        ...(unit === "money" && at.currency ? { currency: at.currency } : {}),
      };
      facts.push(fact);
      return `${shownValue(fact)} [[${fact.key}]]`;
    }
    if (Array.isArray(value)) {
      return value.slice(0, MOST_LIST_ITEMS).map((item, at) => walk(item, [...path, nameOf(item) ?? String(at)], field));
    }
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [name, inner] of Object.entries(value as Record<string, unknown>)) {
        if (DROPPED.has(name) || inner === null || inner === undefined) continue;
        // A share kept as a fraction (0.4) beside its percentage, or alone: the percentage is what the screen shows.
        if (/(share|rate)$/i.test(name) && typeof inner === "number") continue;
        out[name] = walk(inner, [...path, name], name);
      }
      return out;
    }
    return value;
  };
  return { shown: walk(answer, [], ""), facts };
}

/** A figure as the agent reads it beside its key: the way the reader will see it. */
function shownValue(fact: Fact): string {
  if (fact.unit === "money") return `${fact.currency ?? ""} ${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(fact.value)}`.trim();
  if (fact.unit === "percent") return `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(fact.value)}%`;
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(fact.value);
}

/**
 * Said to a weekly specialist that can read for itself (A1): what the facts it is given don't explain, it reads,
 * and names what it read by key, as it names the facts given. Saved data only: these reads never ask Google.
 */
export const WEEKLY_READS_FORMAT = [
  `You can read this website's Google Analytics screens and its Search Console figures yourself, for any calendar period, with ${ANALYTICS_READ} and ${SEARCH_CONSOLE_READ}. Read when the facts given don't show why something moved, or which page, channel or event is behind it.`,
  "Every number a read gives comes with its key in double square brackets: name it by that key, exactly as you name the facts given, and never type a number. Compare like with like: the same period length, the same country.",
].join("\n");

/** The keys a model's answer names, as it wrote them. */
export function keysNamed(answer: unknown): string[] {
  return [...new Set([...JSON.stringify(answer ?? null).matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1].trim()))];
}

/**
 * The weekly specialist's answer checked before it leaves the conversation: findings as asked, and every figure it
 * names either given or read. Why it goes back, or null. The Editor's full check still runs on every finding after.
 */
export function findingsCheck(answer: unknown, given: ReadonlyMap<string, unknown>, read: ReadonlyMap<string, unknown>): string | null {
  if (!answer || typeof answer !== "object" || !Array.isArray((answer as { findings?: unknown }).findings)) return "It did not reply with the findings asked for.";
  const missing = keysNamed(answer).filter((key) => !given.has(key) && !read.has(key));
  return missing.length > 0 ? `It named figures neither given nor read: ${missing.slice(0, 8).join(", ")}.` : null;
}
