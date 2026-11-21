/**
 * The daily check-up's pure half (wiki-daily-checkup-plan.md): the order of
 * the steps, how much of the rota one night covers, which version of a
 * disputed fact wins, how tags are tidied, and how progress is counted.
 *
 * No database and no model here, so every rule the plan promises can be
 * pinned by a plain test — the settling order above all, because it decides
 * what the wiki says without anyone being asked (Anthony, 2026-11-09: "I
 * don't want a person involved").
 */

/** The check-up's steps, in the order they run. */
export const WIKI_CHECKUP_STEPS = [
  { key: "INTAKE", label: "Taking in new and changed material" },
  { key: "RELINK", label: "Re-linking pages" },
  { key: "GAPS", label: "Filling gaps" },
  { key: "REFILE", label: "Fixing page types" },
  { key: "TAGS", label: "Tagging pages" },
  { key: "CORRECT", label: "Checking and correcting facts" },
  { key: "TIDY", label: "Tidying pages" },
] as const;

export type WikiCheckupStepKey = (typeof WIKI_CHECKUP_STEPS)[number]["key"];

export function stepNumber(key: WikiCheckupStepKey): number {
  return WIKI_CHECKUP_STEPS.findIndex((step) => step.key === key) + 1;
}

export function nextStep(key: WikiCheckupStepKey): WikiCheckupStepKey | null {
  const index = WIKI_CHECKUP_STEPS.findIndex((step) => step.key === key);
  return WIKI_CHECKUP_STEPS[index + 1]?.key ?? null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Each rota's nightly share, bounded: `min` keeps a small wiki moving, `max`
 * caps one night's spend. The maxima are sized so a wiki of 2,000 pages is
 * still covered within each cycle (tested in wikiCheckupRules.test.ts).
 */
export const WIKI_ROTA_BOUNDS = {
  links: { min: 50, max: 500 },
  contradictions: { min: 12, max: 300 },
  sources: { min: 3, max: 70 },
  refile: { min: 15, max: 150 },
  tags: { min: 20, max: 200 },
} as const;

/** How often each rota comes round every page, in days. */
export const WIKI_CHECKUP_CYCLE_DAYS = {
  links: 7,
  contradictions: 7,
  sources: 30,
  refile: 14,
  tags: 14,
} as const;

/**
 * A page that has not changed is checked again only after this long
 * (Anthony, 2026-11-12: "why check every day when the data may not change
 * in months"). The rotas used to bring every page round on its cycle
 * whether or not anything about it had changed, paying the model to re-read
 * the same words. Now a page comes round when it has changed since its last
 * check, or as a slow safety pass after this many days.
 */
export const WIKI_UNCHANGED_RECHECK_DAYS = 90;

/** Whether a page is worth checking again: never checked, changed since,
 * or unchanged long enough for the safety pass. */
export function isDueForRecheck(page: { updatedAt: number }, checkedAt: number | undefined, now: number): boolean {
  if (checkedAt === undefined) return true;
  if (page.updatedAt > checkedAt) return true;
  return now - checkedAt >= WIKI_UNCHANGED_RECHECK_DAYS * DAY_MS;
}

/** A website page is re-read once a month (Anthony, 2026-11-09). */
export const WIKI_WEBSITE_REREAD_MS = 30 * DAY_MS;

/** Most website pages one wiki re-reads in a night; the rest wait their turn. */
export const WIKI_WEBSITE_REREADS_PER_NIGHT = 25;

/** Most pages for missing topics one wiki gets written in a night. */
export const WIKI_MISSING_PAGES_PER_NIGHT = 2;

/** Most disputed facts settled per wiki per night; the rest wait for tomorrow. */
export const WIKI_SETTLEMENTS_PER_NIGHT = 10;

/** Most pages moved to their right type per wiki per night. */
export const WIKI_REFILES_PER_NIGHT = 5;

/** Most duplicate pairs merged per wiki per night. */
export const WIKI_MERGES_PER_NIGHT = 3;

/** A page carries at most this many tags. */
export const WIKI_MAX_TAGS_PER_PAGE = 5;

/**
 * How many pages one night must cover so the whole wiki is covered within
 * the cycle. A small wiki finishes its rota in a night; a large one spreads
 * it out. `min` keeps a small wiki moving, `max` bounds one night's spend.
 */
export function rotaShare(args: {
  eligible: number;
  cycleDays: number;
  min: number;
  max: number;
}): number {
  if (args.eligible <= 0) return 0;
  const share = Math.ceil(args.eligible / Math.max(1, args.cycleDays));
  return Math.min(args.eligible, Math.max(args.min, Math.min(args.max, share)));
}

/** Is a rota stamp due — never stamped, or older than its cycle? */
export function isDue(stampedAt: number | undefined, cycleDays: number, now: number): boolean {
  return stampedAt === undefined || now - stampedAt >= cycleDays * DAY_MS;
}

// ---------------------------------------------------------------------------
// Settling a disputed fact (wiki-daily-checkup-plan.md, "How it decides
// which version is right"). The first rule that decides it wins.
// ---------------------------------------------------------------------------

/** One source a claim rests on, as the settling rules see it. */
export type SettlingSource = {
  /** When the source was added or last changed. */
  at: number;
  /** A page found on the web to fill a gap, rather than the company's own. */
  fromWeb: boolean;
};

/** One side of a disagreement. */
export type SettlingSide = {
  /** A pinned correction on the page states this claim. */
  pinned: boolean;
  /** The sources that actually support the claim. Empty means none do. */
  sources: SettlingSource[];
};

export type SettlingRule = "PINNED" | "SOURCED" | "COMPANY_DOCUMENT" | "NEWER" | "UNSETTLED";

export type SettlingVerdict = { winner: "A" | "B" | null; rule: SettlingRule };

function newest(sources: SettlingSource[]): number {
  return sources.reduce((latest, source) => Math.max(latest, source.at), 0);
}

/**
 * The settling order, exactly as the plan states it:
 *
 * 1. A pinned correction wins — the machine never overrules a person's pin.
 * 2. What the sources say beats what they don't.
 * 3. The company's own documents beat pages found on the web.
 * 4. The newer source wins.
 * 5. Nothing settles it: both versions stay, marked "sources disagree".
 *
 * Two pins that disagree, or a tie at every rule, settle nothing — the
 * machine never guesses.
 */
export function settleDisagreement(a: SettlingSide, b: SettlingSide): SettlingVerdict {
  if (a.pinned !== b.pinned) return { winner: a.pinned ? "A" : "B", rule: "PINNED" };
  if (a.pinned && b.pinned) return { winner: null, rule: "UNSETTLED" };

  const aSourced = a.sources.length > 0;
  const bSourced = b.sources.length > 0;
  if (aSourced !== bSourced) return { winner: aSourced ? "A" : "B", rule: "SOURCED" };
  if (!aSourced) return { winner: null, rule: "UNSETTLED" };

  const aCompany = a.sources.filter((source) => !source.fromWeb);
  const bCompany = b.sources.filter((source) => !source.fromWeb);
  if ((aCompany.length > 0) !== (bCompany.length > 0)) {
    return { winner: aCompany.length > 0 ? "A" : "B", rule: "COMPANY_DOCUMENT" };
  }

  // Compared within the standing both sides share: company documents when
  // both have them, otherwise the web pages both rest on.
  const aPool = aCompany.length > 0 ? aCompany : a.sources;
  const bPool = bCompany.length > 0 ? bCompany : b.sources;
  const aNewest = newest(aPool);
  const bNewest = newest(bPool);
  if (aNewest !== bNewest) return { winner: aNewest > bNewest ? "A" : "B", rule: "NEWER" };

  return { winner: null, rule: "UNSETTLED" };
}

/** The rule in plain words, for the page history and the weekly report. */
export function describeSettlingRule(rule: SettlingRule): string {
  switch (rule) {
    case "PINNED":
      return "a pinned correction wins";
    case "SOURCED":
      return "what the sources say wins over what they don't";
    case "COMPANY_DOCUMENT":
      return "the company's own documents win over web pages";
    case "NEWER":
      return "the newer source wins";
    case "UNSETTLED":
      return "nothing settles it, so both versions are kept";
  }
}

/** The marker an unsettled disagreement leaves on a page. */
export const SOURCES_DISAGREE_MARKER = "Sources disagree:";

/**
 * The note both pages carry when nothing settles a disagreement. Plain text
 * built in code, never by the model, so it cannot invent anything.
 */
export function buildSourcesDisagreeNote(args: {
  claimHere: string;
  claimThere: string;
  otherPage: string;
}): string {
  const clean = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 300);
  return `${SOURCES_DISAGREE_MARKER} this page says "${clean(args.claimHere)}", while [[${args.otherPage}]] says "${clean(args.claimThere)}". Neither source is newer or better backed, so both are kept.`;
}

/** Does the page already carry this disagreement? Then nothing is added twice. */
export function hasDisagreeNote(content: string, otherPage: string): boolean {
  return content.includes(SOURCES_DISAGREE_MARKER) && content.includes(`[[${otherPage}]]`);
}

// ---------------------------------------------------------------------------
// Tags (wiki-daily-checkup-plan.md, section 4).
// ---------------------------------------------------------------------------

/** One spelling for a tag: lower case, words joined by hyphens, bounded. */
export function normaliseTag(value: string): string | null {
  const tag = value
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return tag.length >= 2 ? tag : null;
}

/** The singular-ish stem two variants share: "refunds" and "refund". */
function tagStem(tag: string): string {
  if (tag.endsWith("ies") && tag.length > 4) return `${tag.slice(0, -3)}y`;
  if (tag.endsWith("ses") || tag.endsWith("xes") || tag.endsWith("ches") || tag.endsWith("shes")) {
    return tag.slice(0, -2);
  }
  if (tag.endsWith("s") && !tag.endsWith("ss") && tag.length > 3) return tag.slice(0, -1);
  return tag;
}

/**
 * Near-duplicate tags folded onto one spelling: the most used variant wins,
 * and on a tie the shorter one. Returns a map from every variant that must
 * change to the spelling it becomes.
 */
export function planTagMerges(usage: Array<{ tag: string; count: number }>): Map<string, string> {
  const groups = new Map<string, Array<{ tag: string; count: number }>>();
  for (const entry of usage) {
    const stem = tagStem(entry.tag);
    groups.set(stem, [...(groups.get(stem) ?? []), entry]);
  }
  const merges = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const winner = [...group].sort(
      (left, right) => right.count - left.count || left.tag.length - right.tag.length || left.tag.localeCompare(right.tag)
    )[0];
    for (const entry of group) {
      if (entry.tag !== winner.tag) merges.set(entry.tag, winner.tag);
    }
  }
  return merges;
}

/**
 * The machine's tags for a page, made safe: normalised, de-duplicated,
 * bounded, and never more than leaves room beside the person's own tags.
 */
export function cleanMachineTags(raw: unknown, humanTags: string[]): string[] {
  if (!Array.isArray(raw)) return [];
  const room = Math.max(0, WIKI_MAX_TAGS_PER_PAGE - humanTags.length);
  const tags: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const tag = normaliseTag(value);
    if (!tag || tags.includes(tag) || humanTags.includes(tag)) continue;
    tags.push(tag);
    if (tags.length >= room) break;
  }
  return tags;
}

// ---------------------------------------------------------------------------
// Duplicates.
// ---------------------------------------------------------------------------

function slugWords(slug: string): Set<string> {
  return new Set(slug.split("-").filter((word) => word.length > 1).map(tagStem));
}

/**
 * How alike two page names are, 0 to 1, by their words. Only a candidate
 * test — the model still confirms two pages cover the same subject before
 * anything is merged.
 */
export function nameSimilarity(left: string, right: string): number {
  const a = slugWords(left);
  const b = slugWords(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Pairs of same-kind pages whose names are alike enough to ask about. */
export function findDuplicateCandidates(
  pages: Array<{ kind: string; subjectKey: string }>,
  threshold = 0.75
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < pages.length; i += 1) {
    for (let j = i + 1; j < pages.length; j += 1) {
      const left = pages[i];
      const right = pages[j];
      if (left.kind !== right.kind) continue;
      if (nameSimilarity(left.subjectKey, right.subjectKey) >= threshold) {
        pairs.push([`${left.kind}:${left.subjectKey}`, `${right.kind}:${right.subjectKey}`]);
      }
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Progress and reporting.
// ---------------------------------------------------------------------------

/** What a run has done, counted as it goes. */
export type WikiCheckupFound = {
  documentsRead: number;
  sourcesFollowed: number;
  websitePagesQueued: number;
  linksFixed: number;
  linksAdded: number;
  pagesWritten: number;
  pagesRefiled: number;
  tagsChanged: number;
  factsSettled: number;
  disagreementsKept: number;
  claimsCorrected: number;
  questionsRaised: number;
  pagesTidied: number;
  pagesMerged: number;
};

export const EMPTY_FOUND: WikiCheckupFound = {
  documentsRead: 0,
  sourcesFollowed: 0,
  websitePagesQueued: 0,
  linksFixed: 0,
  linksAdded: 0,
  pagesWritten: 0,
  pagesRefiled: 0,
  tagsChanged: 0,
  factsSettled: 0,
  disagreementsKept: 0,
  claimsCorrected: 0,
  questionsRaised: 0,
  pagesTidied: 0,
  pagesMerged: 0,
};

export function parseFound(json: string | undefined): WikiCheckupFound {
  if (!json) return { ...EMPTY_FOUND };
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const found = { ...EMPTY_FOUND };
    for (const key of Object.keys(found) as Array<keyof WikiCheckupFound>) {
      const value = parsed[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) found[key] = value;
    }
    return found;
  } catch {
    return { ...EMPTY_FOUND };
  }
}

export function addFound(base: WikiCheckupFound, extra: Partial<WikiCheckupFound>): WikiCheckupFound {
  const next = { ...base };
  for (const key of Object.keys(extra) as Array<keyof WikiCheckupFound>) {
    next[key] = (next[key] ?? 0) + Math.max(0, extra[key] ?? 0);
  }
  return next;
}

/**
 * The bar's position. It only ever moves forward: a step that finds more
 * work than it expected grows the total, which would pull a plain fraction
 * backwards, so the previous position is a floor. It stops at 99 until the
 * run has actually finished; only finishing makes it 100.
 */
export function nextPercent(args: { previous: number; done: number; total: number }): number {
  const fraction = args.total > 0 ? Math.min(1, args.done / args.total) : 0;
  const computed = Math.floor(fraction * 100);
  return Math.max(args.previous, Math.min(99, computed));
}

/** The one-line result, in plain words, naming only what happened. */
export function summariseFound(found: WikiCheckupFound): string {
  const parts: string[] = [];
  const say = (count: number, one: string, many: string) => {
    if (count > 0) parts.push(`${count} ${count === 1 ? one : many}`);
  };
  say(found.documentsRead, "document read", "documents read");
  say(found.sourcesFollowed, "changed or removed file followed", "changed or removed files followed");
  say(found.linksFixed + found.linksAdded, "link fixed or added", "links fixed or added");
  say(found.pagesWritten, "missing page written", "missing pages written");
  say(found.pagesRefiled, "page kind fixed", "page kinds fixed");
  say(found.tagsChanged, "tag changed", "tags changed");
  say(found.factsSettled, "disagreement settled", "disagreements settled");
  say(found.claimsCorrected, "old fact updated", "old facts updated");
  say(found.disagreementsKept, "disagreement kept with both sources", "disagreements kept with both sources");
  say(found.pagesTidied, "page tidied", "pages tidied");
  say(found.pagesMerged, "duplicate merged", "duplicates merged");
  say(found.websitePagesQueued, "website page re-read", "website pages re-read");
  say(found.questionsRaised, "question raised", "questions raised");
  if (parts.length === 0) return "Everything was already in order.";
  const sentence = parts.join(", ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

/** Strict JSON out of a model reply, or null — every reply is distrusted. */
export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
