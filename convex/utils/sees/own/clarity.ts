import type { FindingFact } from "../findings";
import { MEASURES, measureWords } from "../measures";
import { firstOfEachList, isNumber, isRow, named, round1, rowsOf, type OwnFound, type Row } from "./shared";

/**
 * Microsoft Clarity's pages with rules of their own (ask-hakken-every-chart-page-plan-2026-11-03.md, section 8): the
 * Overview, Errors, Pages and a page's own screen. Clarity measures behaviour only — how far down people scroll, who
 * goes straight back, the angry and dead clicks, the errors — so these rules never speak of conversions, enquiries,
 * money or Google, and never of another source's figures (Anthony: source sections show their own data only).
 *
 * Each rule picks the biggest things on the page for whatever dates are chosen, each set against something: the span
 * before, the whole website, the page's own group, computers, or the page itself. Clarity keeps fewer days than Google
 * Analytics (Ronins' begin on 11 October 2026), so on most periods there is no span before: the rules then set groups
 * against the website and never claim a change. Ronins' figures are small — about 1,200 visits a month and a handful of
 * errors — so the bars below keep out only what is too small to trust: a scroll gap inside what two sets of visits give
 * by chance, or a problem's count chance alone could give (`unlikely`). `clarityFindingsPeriods.test.ts` holds them to
 * every period the date menu offers, on Ronins' own figures. No database here.
 */

/** A group, device, source or browser judged on its own from this many visits: twice the screens' "too few to judge". */
const GROUP_LEAST = 20;
/** A page judged on its own from this many visits: the screens' "too few to judge" (`CLARITY_FEW_VISITS`). */
const PAGE_LEAST = 10;
/**
 * A problem's share weighed from this many visits: a problem is rare, so its count's own chance (`unlikely`) is the bar,
 * and a browser on phones where two of six visits hit an error is worth saying (plan section 8).
 */
const PROBLEM_LEAST = 5;
/**
 * How far one visit's scroll differs from the next, in points (scroll runs 0 to 100): Ronins' days put it nearer 40 with
 * the days' own ups and downs in it (22 days to 2 November 2026), so 30. Two averages closer than twice their spread
 * could be chance: two days of 99 visits say almost nothing on their own.
 */
const SCROLL_SPREAD = 30;
/** A scroll gap worth saying however many visits stand behind it: points. */
const SCROLL_LEAST = 3;
/** A problem's count this unlikely by chance, or less, is a pattern: one in a hundred. */
const CHANCE = 0.01;
/** A problem seen on fewer visits than this is never a pattern, however rare elsewhere: one is an incident. */
const EVENTS_LEAST = 2;
/** A problem's move against the span before is said from this many visits with it: three dead clicks after none is not yet news. */
const MOVED_EVENTS_LEAST = 5;
/** A group's problem share this many times its reference's, or more, is "far more". */
const ABOVE = 1.5;
/** A page holding this share of a problem's visits, and twice its share of the visits, with this many in all. */
const HOLDS_SHARE = 1 / 3;
const HOLDS_LEAST = 4;
/** Errors bunched: this share of them in a run of this many days or fewer, the run a third of the days counted or less. */
const BUNCHED_SHARE = 0.7;
const BUNCHED_DAYS = 4;
/** The groups said at most from one list. */
const MOST_FROM_A_LIST = 2;

/** The problems a visit can meet, as Clarity counts them, and their share's name in the measures list. */
const PROBLEMS = { quickBack: "wentBackPercent", errors: "errorPercent", dead: "deadPercent", rage: "ragePercent" } as const;
type Problem = keyof typeof PROBLEMS;
const PROBLEM_KEYS = Object.keys(PROBLEMS) as Problem[];

/**
 * A Clarity measures object as the screens hand it (`clarityMeasuresValidator`): visits, scroll and each problem's
 * visits, and the visits each problem is a share of (`base`). Errors are a share of the visits on the days that counted
 * them (`websiteOf`: days kept before 16 October 2026 held none), as the screens' own box says it, so a rule's figure is
 * the box's: 0.6% of Ronins' visits last month, never 0.5% of every visit.
 */
type Measures = { visits: number; scroll: number | null; quickBack: number; errors: number; dead: number; rage: number; errorClicks: number; base: Record<Problem | "errorClicks", number> };

function measuresIn(value: unknown): Measures | null {
  if (!isRow(value) || !isNumber(value.visits)) return null;
  const count = (field: string) => (isNumber(value[field]) ? (value[field] as number) : 0);
  const shares = isRow(value.shares) ? value.shares : {};
  const visits = value.visits;
  // The visits a share is of, from the screen's own share where it holds one: errors 6, 0.6% of them, 1,000 visits counted.
  const baseOf = (field: string) => {
    const share = shares[field];
    return isNumber(share) && share > 0 && count(field) > 0 ? Math.min(visits, Math.round((100 * count(field)) / share)) : visits;
  };
  return {
    visits, scroll: isNumber(value.scroll) ? value.scroll : null,
    quickBack: count("quickBack"), errors: count("errors"), dead: count("dead"), rage: count("rage"), errorClicks: count("errorClicks"),
    base: { quickBack: visits, dead: visits, rage: visits, errors: baseOf("errors"), errorClicks: baseOf("errorClicks") },
  };
}

/** The words a page hands for its own names: the whole website, the span before, computers, the page itself. */
type Names = { website: string; before: string | null; computers: string; page: string | null; low: string; otherSources: string; days: Record<string, string>; daysWords: string | null };

function namesOf(data: Row): Names {
  const names = isRow(data.names) ? data.names : {};
  const text = (value: unknown, fallback: string | null) => (typeof value === "string" && value.trim() ? value.trim() : fallback);
  return {
    website: text(names.website, "The whole website")!,
    before: text(names.before, null),
    computers: text(names.computers, "Computers")!,
    page: text(names.page, null),
    low: text(names.low, "Pages scrolled less than a quarter of the way")!,
    otherSources: text(names.otherSources, "Its other sources")!,
    days: isRow(names.days) ? (Object.fromEntries(Object.entries(names.days).filter(([, words]) => typeof words === "string")) as Record<string, string>) : {},
    daysWords: text(names.daysWords, null),
  };
}

/** A problem's share of the visits, in points. */
const shareOf = (count: number, visits: number) => (visits > 0 ? (100 * count) / visits : 0);

/** A list's share of the page's weight, from a twentieth: a group with a twentieth of the visits or more counts in full. */
const reach = (visits: number, total: number) => (total > 0 ? Math.sqrt(Math.min(1, visits / total / 0.05)) : 1);

/** Whether two averages of scroll, over these visits, are further apart than chance would put them. */
function scrollApart(gap: number, visits: number, otherVisits: number): boolean {
  if (visits <= 0 || otherVisits <= 0) return false;
  return Math.abs(gap) >= Math.max(SCROLL_LEAST, 2 * SCROLL_SPREAD * Math.sqrt(1 / visits + 1 / otherVisits));
}

/** The chance of `observed` or more problems (`more`), or of `observed` or fewer, where `expected` were due: Poisson's. */
export function chanceOf(observed: number, expected: number, way: "more" | "fewer"): number {
  if (expected <= 0) return way === "more" ? (observed > 0 ? 0 : 1) : 1;
  const upTo = (count: number) => {
    if (count < 0) return 0;
    let log = -expected;
    let sum = Math.exp(log);
    for (let k = 1; k <= count; k += 1) {
      log += Math.log(expected) - Math.log(k);
      sum += Math.exp(log);
    }
    return Math.min(1, sum);
  };
  return way === "more" ? Math.max(0, 1 - upTo(observed - 1)) : upTo(observed);
}

/**
 * Whether `count` problems on `visits` stand apart from a reference rate (problems over its own visits) by more than
 * chance: half as many again or more, on two visits or more, and one in a hundred by chance or less. A reference with
 * none is read as half a problem, so a page whose every other visit was clean is still weighed. `way` says which.
 */
function unlikely(count: number, visits: number, reference: { count: number; visits: number }): "more" | "fewer" | null {
  if (visits <= 0 || reference.visits <= 0) return null;
  const rate = Math.max(reference.count, 0.5) / reference.visits;
  const expected = rate * visits;
  if (count >= EVENTS_LEAST && count / visits >= ABOVE * rate && chanceOf(count, expected, "more") <= CHANCE) return "more";
  if (expected >= EVENTS_LEAST && count / visits <= rate / ABOVE && chanceOf(count, expected, "fewer") <= CHANCE) return "fewer";
  return null;
}

/** What a figure is set against: the whole website, similar pages, another named group, or the list's own average. */
type Reference = { against: "website" | "group" | "list" } | { against: "other"; other: string };

/** A figure set against its reference, in the kit's words: "Phones: 20.9% of the page scrolled. Computers: 33.7%." */
function against(list: string, name: string, measure: string, value: number, mean: number, score: number, reference: Reference, facts: FindingFact[] = []): OwnFound {
  const kind = value > mean ? "rowAbove" : "rowBelow";
  const words = measureWords(measure);
  const unit = MEASURES[measure]?.kind === "percent" ? "percent" : "count";
  const meanName = reference.against === "other" ? reference.other : reference.against === "website" ? "the whole website" : reference.against === "group" ? "similar pages" : "the list, on average";
  return {
    id: `${kind}:${list}:${measure}:${name}${reference.against === "other" ? `:${reference.other}` : ""}`, kind, list, score,
    params: {
      name, measure, value: round1(value), mean: round1(mean),
      ...(reference.against === "list" ? {} : { against: reference.against }),
      ...(reference.against === "other" ? { other: reference.other } : {}),
      ...(MEASURES[measure]?.lessIsBetter ? { lessIsBetter: 1 } : {}),
    },
    facts: [
      { key: "value", value: round1(value), unit, label: `${name}: ${words}` },
      { key: "mean", value: round1(mean), unit, label: `${meanName}: ${words}` },
      ...facts,
    ],
  };
}

/** A part of a whole, said beside what it is set against (its share of the visits, of the days): "/: 35.3% of every visit that went straight back". */
function holds(list: string, name: string, measure: string, value: number, whole: number, score: number, facts: FindingFact[] = []): OwnFound {
  const share = round1((100 * value) / whole);
  const words = measureWords(measure);
  return {
    id: `holdsMost:${list}:${measure}:${name}`, kind: "holdsMost", list, score,
    params: { name, measure, share, value },
    facts: [
      { key: "value", value, unit: "count", label: `${name}: ${words}` },
      { key: "share", value: share, unit: "percent", label: `${name}'s share of all the ${words}` },
      ...facts,
    ],
  };
}

/** The counts behind a problem's share, for the writer: the visits that met it, of how many. */
const countFacts = (name: string, problem: Problem | "errorClicks", count: number, visits: number): FindingFact[] => [
  { key: "count", value: count, unit: "count", label: `${name}: visits that ${problem === "quickBack" ? "went straight back" : problem === "errors" ? "hit an error" : problem === "dead" ? "had a dead click" : problem === "rage" ? "had an angry click" : "had a click that failed"}` },
  { key: "visits", value: visits, unit: "count", label: `${name}: visits` },
];

// ---------------------------------------------------------------------------
// Shared: against the span before, a list's groups against a reference, two devices
// ---------------------------------------------------------------------------

/**
 * A whole — the website, a page — against the span before: its scroll, past what chance gives two spans of visits, and
 * each problem's share where its count moved further than chance would. Nothing without a span before.
 */
function sinceBefore(list: string, name: string, now: Measures, before: Measures | null, beforeName: string | null, base: number): OwnFound[] {
  if (!before || !beforeName || now.visits < PAGE_LEAST || before.visits < PAGE_LEAST) return [];
  const found: OwnFound[] = [];
  if (now.scroll !== null && before.scroll !== null) {
    const gap = now.scroll - before.scroll;
    if (scrollApart(gap, now.visits, before.visits)) {
      found.push(against(list, name, "scroll", now.scroll, before.scroll, base + Math.min(0.5, Math.abs(gap) / 20), { against: "other", other: beforeName }, [
        { key: "visits", value: now.visits, unit: "count", label: `${name}: visits, this span` },
        { key: "visitsBefore", value: before.visits, unit: "count", label: `${name}: visits, the span before` },
      ]));
    }
  }
  for (const problem of PROBLEM_KEYS) {
    if (Math.max(now[problem], before[problem]) < MOVED_EVENTS_LEAST) continue;
    const way = unlikely(now[problem], now.base[problem], { count: before[problem], visits: before.base[problem] });
    if (!way) continue;
    const value = shareOf(now[problem], now.base[problem]);
    const was = shareOf(before[problem], before.base[problem]);
    found.push(against(`${list}:problems`, name, PROBLEMS[problem], value, was, base - 0.4 + Math.min(0.3, Math.abs(Math.log2(Math.max(value, 0.1) / Math.max(was, 0.1))) / 6), { against: "other", other: beforeName }, [
      ...countFacts(name, problem, now[problem], now.base[problem]),
      { key: "countBefore", value: before[problem], unit: "count", label: `${name}: the same, the span before` },
    ]));
  }
  return found;
}

/** A list's rows, each named in the reader's words and with its measures (`now`), its scroll and visits the span before. */
type Line = { name: string; m: Measures; scrollBefore: number | null; visitsBefore: number | null; row: Row };

function linesOf(rows: readonly Row[], figures = "now"): Line[] {
  return rows.flatMap((row) => {
    const name = named(row);
    const m = measuresIn(row[figures]);
    if (!name || !m) return [];
    return [{ name, m, scrollBefore: isNumber(row.scrollBefore) ? row.scrollBefore : null, visitsBefore: isNumber(row.visitsBefore) ? row.visitsBefore : null, row }];
  });
}

/**
 * A list's groups (page groups, sources) against a reference whole: the scroll furthest from it, past chance, and the
 * problem a group meets far more often. The biggest first, weighed by the visits behind each; `problems` names those
 * weighed (a browser's errors only: its scroll is the market's, never the website's).
 */
function apartFromWhole(list: string, lines: readonly Line[], whole: Measures | null, reference: Reference, base: number, options: { problems?: readonly Problem[]; scroll?: boolean; most?: number; nameTwice?: boolean } = {}): OwnFound[] {
  const total = whole?.visits ?? lines.reduce((sum, line) => sum + line.m.visits, 0);
  const candidates: Array<{ found: OwnFound; list: string }> = [];
  if (options.scroll !== false) {
    // The whole's own scroll, else the list's: each group's visits weigh its scroll.
    const scrolled = lines.filter((line) => line.m.scroll !== null);
    const visits = scrolled.reduce((sum, line) => sum + line.m.visits, 0);
    const mean = whole?.scroll ?? (visits > 0 ? scrolled.reduce((sum, line) => sum + line.m.scroll! * line.m.visits, 0) / visits : null);
    if (mean !== null) {
      for (const line of lines.filter((one) => one.m.visits >= GROUP_LEAST)) {
        if (line.m.scroll === null) continue;
        const gap = line.m.scroll - mean;
        if (!scrollApart(gap, line.m.visits, Math.max(1, total - line.m.visits))) continue;
        candidates.push({ list: `${list}:scroll`, found: against(list, line.name, "scroll", line.m.scroll, mean, base + Math.min(0.5, Math.abs(gap) / 20) * reach(line.m.visits, total), reference, [{ key: "visits", value: line.m.visits, unit: "count", label: `${line.name}: visits` }]) });
      }
    }
  }
  if (whole) {
    for (const problem of options.problems ?? PROBLEM_KEYS) {
      for (const line of lines.filter((one) => one.m.visits >= PROBLEM_LEAST)) {
        const rest = { count: Math.max(0, whole[problem] - line.m[problem]), visits: Math.max(1, whole.base[problem] - line.m.base[problem]) };
        if (unlikely(line.m[problem], line.m.base[problem], rest) !== "more") continue;
        const value = shareOf(line.m[problem], line.m.base[problem]);
        const mean = shareOf(whole[problem], whole.base[problem]);
        candidates.push({ list: `${list}:${problem}`, found: against(list, line.name, PROBLEMS[problem], value, mean, base + Math.min(0.5, Math.log2(value / Math.max(mean, 0.1)) / 6) * reach(line.m.visits, total), reference, countFacts(line.name, problem, line.m[problem], line.m.base[problem])) });
      }
    }
  }
  // The biggest first, a measure once and a group once (a page set against the website alone may be named twice).
  const said = new Set<string>();
  const out: OwnFound[] = [];
  for (const one of firstOfEachList([...candidates].sort((a, b) => b.found.score - a.found.score), Number.MAX_SAFE_INTEGER)) {
    const name = String(one.found.params.name);
    if (said.has(name) && !options.nameTwice) continue;
    said.add(name);
    out.push(one.found);
    if (out.length >= (options.most ?? MOST_FROM_A_LIST)) break;
  }
  return out;
}

/**
 * Each group against the rest of its own list, added up (a page's sources): the scroll furthest from theirs, past
 * chance, or a problem met far more often than by the rest. The biggest one only.
 */
function apartFromOthers(list: string, lines: readonly Line[], othersName: string, base: number): OwnFound[] {
  const sum = (rows: readonly Line[], pick: (m: Measures) => number) => rows.reduce((total, line) => total + pick(line.m), 0);
  const total = sum(lines, (m) => m.visits);
  const candidates: OwnFound[] = [];
  for (const line of lines) {
    const others = lines.filter((one) => one !== line);
    const visits = sum(others, (m) => m.visits);
    if (visits < GROUP_LEAST) continue;
    const scrolled = others.filter((one) => one.m.scroll !== null);
    const scrolledVisits = sum(scrolled, (m) => m.visits);
    if (line.m.visits >= GROUP_LEAST && line.m.scroll !== null && scrolledVisits > 0) {
      const mean = scrolled.reduce((acc, one) => acc + one.m.scroll! * one.m.visits, 0) / scrolledVisits;
      const gap = line.m.scroll - mean;
      if (scrollApart(gap, line.m.visits, scrolledVisits)) candidates.push(against(list, line.name, "scroll", line.m.scroll, mean, base + Math.min(0.5, Math.abs(gap) / 20) * reach(line.m.visits, total), { against: "other", other: othersName }, [{ key: "visits", value: line.m.visits, unit: "count", label: `${line.name}: visits` }]));
    }
    for (const problem of ["quickBack", "dead", "rage"] as const) {
      if (line.m.visits < PROBLEM_LEAST) continue;
      const rest = { count: sum(others, (m) => m[problem]), visits };
      if (unlikely(line.m[problem], line.m.visits, rest) !== "more") continue;
      const value = shareOf(line.m[problem], line.m.visits);
      const mean = shareOf(rest.count, rest.visits);
      candidates.push(against(list, line.name, PROBLEMS[problem], value, mean, base + Math.min(0.5, Math.log2(value / Math.max(mean, 0.1)) / 6) * reach(line.m.visits, total), { against: "other", other: othersName }, countFacts(line.name, problem, line.m[problem], line.m.visits)));
    }
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 1);
}

/** A list's groups against their own span before: the scroll that moved most past chance, weighed by the visits behind it. */
function movedSinceBefore(list: string, lines: readonly Line[], beforeName: string | null, base: number, total: number): OwnFound[] {
  if (!beforeName) return [];
  return lines
    .filter((line) => line.m.scroll !== null && line.scrollBefore !== null && line.m.visits >= GROUP_LEAST && (line.visitsBefore ?? 0) >= GROUP_LEAST)
    .map((line) => ({ line, gap: line.m.scroll! - line.scrollBefore! }))
    .filter((one) => scrollApart(one.gap, one.line.m.visits, one.line.visitsBefore!))
    .sort((a, b) => Math.abs(b.gap) * Math.sqrt(b.line.m.visits) - Math.abs(a.gap) * Math.sqrt(a.line.m.visits))
    .slice(0, MOST_FROM_A_LIST)
    .map(({ line, gap }) => against(list, line.name, "scroll", line.m.scroll!, line.scrollBefore!, base + Math.min(0.5, Math.abs(gap) / 20) * reach(line.m.visits, total), { against: "other", other: beforeName }, [
      { key: "visits", value: line.m.visits, unit: "count", label: `${line.name}: visits, this span` },
      { key: "visitsBefore", value: line.visitsBefore!, unit: "count", label: `${line.name}: visits, the span before` },
    ]));
}

/** A device row's own code ("PC", "Mobile", "Tablet"), kept beside its words by the page (`device`), else its name. */
const codeOf = (line: Line) => (typeof line.row.device === "string" ? line.row.device : line.name);

/**
 * Phones and tablets against computers (Anthony's plan: "Phones go straight back far more than computers"): each one's
 * scroll and problems, the biggest gaps past chance, at most two and each a different measure. `websiteDevices`, on a
 * page's own screen: the website's own gap on the same measure, so a gap the whole website shares counts for less.
 */
function devicesApart(list: string, rows: readonly Row[], names: Names, base: number, websiteDevices: readonly Row[] = []): OwnFound[] {
  const lines = linesOf(rows);
  const computers = lines.find((line) => codeOf(line) === "PC");
  if (!computers || computers.m.visits < GROUP_LEAST) return [];
  const site = linesOf(websiteDevices);
  const siteOf = (code: string) => site.find((line) => codeOf(line) === code)?.m ?? null;
  const total = lines.reduce((sum, line) => sum + line.m.visits, 0);
  const candidates: Array<{ found: OwnFound; list: string }> = [];
  for (const other of lines.filter((line) => codeOf(line) !== "PC" && line.m.visits >= GROUP_LEAST)) {
    const siteOther = siteOf(codeOf(other));
    const siteComputers = siteOf("PC");
    if (other.m.scroll !== null && computers.m.scroll !== null) {
      const gap = other.m.scroll - computers.m.scroll;
      if (scrollApart(gap, other.m.visits, computers.m.visits)) {
        const siteGap = siteOther?.scroll != null && siteComputers?.scroll != null ? siteOther.scroll - siteComputers.scroll : null;
        // A gap the whole website shows as much counts for less: it is the device's, not the page's.
        const shared = siteGap !== null && Math.sign(siteGap) === Math.sign(gap) && Math.abs(siteGap) >= Math.abs(gap) * (2 / 3) ? 0.6 : 1;
        candidates.push({
          list: "scroll",
          found: against(list, other.name, "scroll", other.m.scroll, computers.m.scroll, (base + Math.min(0.5, Math.abs(gap) / 20) * reach(other.m.visits, total)) * shared, { against: "other", other: computers.name }, [
            { key: "visits", value: other.m.visits, unit: "count", label: `${other.name}: visits` },
            { key: "otherVisits", value: computers.m.visits, unit: "count", label: `${computers.name}: visits` },
            ...(siteGap !== null && siteOther?.scroll != null && siteComputers?.scroll != null ? [
              { key: "websiteValue", value: round1(siteOther.scroll), unit: "percent" as const, label: `${other.name}, across the whole website: how far people scroll` },
              { key: "websiteMean", value: round1(siteComputers.scroll), unit: "percent" as const, label: `${computers.name}, across the whole website: how far people scroll` },
            ] : []),
          ]),
        });
      }
    }
    for (const problem of PROBLEM_KEYS) {
      // Whichever of the two meets it far more often is the one said: phones going straight back, or computers.
      const pairs: Array<[Line, Line]> = [[other, computers], [computers, other]];
      for (const [subject, reference] of pairs) {
        if (unlikely(subject.m[problem], subject.m.base[problem], { count: reference.m[problem], visits: reference.m.base[problem] }) !== "more") continue;
        const value = shareOf(subject.m[problem], subject.m.base[problem]);
        const mean = shareOf(reference.m[problem], reference.m.base[problem]);
        candidates.push({
          list: problem,
          found: against(list, subject.name, PROBLEMS[problem], value, mean, base + Math.min(0.5, Math.log2(value / Math.max(mean, 0.1)) / 6) * reach(subject.m.visits, total), { against: "other", other: reference.name }, countFacts(subject.name, problem, subject.m[problem], subject.m.base[problem])),
        });
      }
    }
  }
  return firstOfEachList([...candidates].sort((a, b) => b.found.score - a.found.score), MOST_FROM_A_LIST).map((one) => one.found);
}

/**
 * A page holding a problem's visits far beyond its share of the visits: a third of them or more, and twice its share. Of
 * the website's own count, as its box says it ("3 of the website's 6 visits with an error were on /"); a page's own
 * count can pass it, as a visit meeting a problem on two pages counts on both.
 */
function holdsProblem(list: string, page: string, measure: string, count: number, siteCount: number, pageVisits: number, siteVisits: number, base: number, facts: FindingFact[] = []): OwnFound | null {
  const all = Math.max(siteCount, count);
  if (all < HOLDS_LEAST || count < EVENTS_LEAST || siteVisits <= 0) return null;
  const share = count / all;
  const visitsShare = pageVisits / siteVisits;
  if (share < HOLDS_SHARE || share < 2 * visitsShare) return null;
  return holds(list, page, measure, count, all, base + Math.min(0.5, share - HOLDS_SHARE), [
    { key: "visitsShare", value: round1(100 * visitsShare), unit: "percent", label: `${page}'s share of all the visits` },
    ...facts,
  ]);
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function overviewFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const site = measuresIn(data.now);
  const before = measuresIn(data.before);
  const found: OwnFound[] = [];
  // The headline: the website's scroll and problems against the span before, where Clarity holds one.
  if (site) found.push(...sinceBefore("website", names.website, site, before, names.before, 1.5));
  // Page groups: the scroll that moved most against the span before; then the group furthest from the whole website
  // (or, handed no website's figure, from the groups' own average). Pages not sorted yet carry no name and are never said.
  const groups = linesOf(rowsOf(data.groups));
  const moved = movedSinceBefore("groups", groups, names.before, 1.1, site?.visits ?? 0);
  found.push(...moved);
  found.push(...apartFromWhole("groupsWebsite", groups, site, site ? { against: "website" } : { against: "list" }, 1.0, { most: moved.length > 0 ? 1 : MOST_FROM_A_LIST }));
  // Phones and tablets against computers.
  found.push(...devicesApart("devices", rowsOf(data.devices), names, 1.05));
  // A source far from the website: its scroll, or its visits going straight back. Visits between the website's own
  // pages are no source a person chose (`own`), and are left out.
  const sources = linesOf(rowsOf(data.sources)).filter((line) => line.row.own !== true);
  found.push(...apartFromWhole("sources", sources, site, { against: "website" }, 0.85, { problems: ["quickBack", "dead", "rage"], most: 1 }));
  // A browser where far more visits hit an error than across the website: errors only, never a browser's scroll.
  found.push(...apartFromWhole("browsers", linesOf(rowsOf(data.browsers)), site, { against: "website" }, 0.95, { problems: ["errors"], scroll: false, most: 1 }));
  // The page holding the website's quick backs, and its errors, far beyond its share of the visits.
  const stuck = isRow(data.stuck) ? data.stuck : {};
  const backPage = isRow(stuck.quickBackPage) ? stuck.quickBackPage : null;
  if (site && backPage && typeof backPage.page === "string" && isNumber(backPage.visits) && isNumber(backPage.pageVisits)) {
    const one = holdsProblem("wentBack", backPage.page, "wentBack", backPage.visits, site.quickBack, backPage.pageVisits, site.visits, 0.9);
    if (one) found.push(one);
  }
  const errors = isRow(data.errors) ? data.errors : {};
  if (site) found.push(...errorPageHolds("errorPages", rowsOf(errors.pages), site, 0.9).slice(0, 1));
  return found;
}

/** The error page holding most of the website's visits with an error against its share of the visits; the best first. */
function errorPageHolds(list: string, entries: readonly Row[], site: Measures, base: number): OwnFound[] {
  return entries
    .flatMap((entry) => {
      const line = isRow(entry.line) ? entry.line : entry;
      const m = measuresIn(line.now);
      if (typeof line.page !== "string" || !m) return [];
      const where = typeof entry.mostlyName === "string" ? entry.mostlyName : null;
      const one = holdsProblem(list, line.page, "errorVisits", m.errors, site.errors, m.visits, site.visits, base, [
        ...countFacts(line.page, "errors", m.errors, m.visits),
        ...(where ? [{ key: "mostlyOn", value: m.errors, unit: "count" as const, label: `${line.page}: its errors mostly on ${where}` }] : []),
      ]);
      return one ? [{ one, ratio: m.errors / Math.max(0.001, m.visits) }] : [];
    })
    .sort((a, b) => b.ratio - a.ratio)
    .map(({ one }) => one);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

function errorsFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const site = measuresIn(data.now);
  const before = measuresIn(data.before);
  const found: OwnFound[] = [];
  if (!site) return found;
  // The headline: the share of visits with an error, and with a click that failed, against the span before — as the
  // page's first boxes do, wherever either span had one.
  if (before && names.before) {
    for (const [problem, measure] of [["errors", "errorPercent"], ["errorClicks", "errorClicksPercent"]] as const) {
      if (!MEASURES[measure] || site[problem] + before[problem] === 0) continue;
      const value = shareOf(site[problem], site.base[problem]);
      const was = shareOf(before[problem], before.base[problem]);
      if (Math.abs(value - was) < 0.1) continue;
      found.push(against("website", names.website, measure, value, was, 1.6, { against: "other", other: names.before }, [
        ...countFacts(names.website, problem, site[problem], site.visits),
        { key: "countBefore", value: before[problem], unit: "count", label: `${names.website}: the same, the span before` },
      ]));
    }
  }
  // Pages with an error new to them, and those clear of it now.
  const pages = isRow(data.errorPages) ? data.errorPages : null;
  if (pages && isNumber(pages.gained) && isNumber(pages.lost) && pages.gained + pages.lost > 0) {
    found.push({
      id: "newLost:errorPages", kind: "newLost", list: "errorPages", score: 1.0 + Math.min(0.3, (pages.gained as number) / 10),
      params: { measure: "errorPages", gained: pages.gained as number, lost: pages.lost as number },
      facts: [
        { key: "gained", value: pages.gained as number, unit: "count", label: "pages with an error this span and none the span before" },
        { key: "lost", value: pages.lost as number, unit: "count", label: "pages with an error the span before and none this span" },
      ],
    });
  }
  // A browser far above the website.
  const browsers = isRow(data.browsers) ? rowsOf(data.browsers.rows) : [];
  found.push(...apartFromWhole("browsers", linesOf(browsers), site, { against: "website" }, 1.1, { problems: ["errors"], scroll: false, most: 2 }));
  // Errors bunched on a few days.
  const bunched = bunchedDays(rowsOf(data.byDay), names);
  if (bunched) found.push(bunched);
  // The page holding most of them, then a page far above the website (another page, never the same twice).
  const lines = rowsOf(data.pages);
  const holding = errorPageHolds("errorPagesHold", lines, site, 1.0).slice(0, 1);
  found.push(...holding);
  const held = new Set(holding.map((one) => String(one.params.name)));
  const pageLines = linesOf(lines.map((entry) => (isRow(entry.line) ? { ...entry.line, name: entry.line.page } : entry))).filter((line) => !held.has(line.name));
  found.push(...apartFromWhole("errorPages", pageLines.map((line) => ({ ...line })), site, { against: "website" }, 0.9, { problems: ["errors"], scroll: false, most: 1 }).filter((one) => !held.has(String(one.params.name))));
  return found;
}

/**
 * Errors bunched on a few days (plan section 8: "Errors bunched on three days, pointing to a release"): the shortest run
 * of days, four at most, holding seven in ten of the period's errors, on a run a third of the days counted or less.
 * Said as the days and their share; why is for the reader, never guessed. Days kept before errors were read are left out.
 */
function bunchedDays(days: readonly Row[], names: Names): OwnFound | null {
  const counted = days.filter((day) => typeof day.day === "string" && isNumber(day.errors)).map((day) => ({ day: day.day as string, errors: day.errors as number }));
  const total = counted.reduce((sum, day) => sum + day.errors, 0);
  if (total < HOLDS_LEAST || counted.length < 3 * BUNCHED_DAYS) return null;
  let best: { from: number; to: number; errors: number } | null = null;
  for (let length = 1; length <= BUNCHED_DAYS && !best; length += 1) {
    for (let from = 0; from + length <= counted.length; from += 1) {
      const errors = counted.slice(from, from + length).reduce((sum, day) => sum + day.errors, 0);
      if (errors / total >= BUNCHED_SHARE && (!best || errors > best.errors)) best = { from, to: from + length - 1, errors };
    }
  }
  if (!best) return null;
  const first = counted[best.from].day;
  const last = counted[best.to].day;
  const words = (day: string) => names.days[day] ?? day;
  const name = first === last ? words(first) : (names.daysWords ?? "{from} to {to}").replace("{from}", words(first)).replace("{to}", words(last));
  return holds("days", name, "errorVisits", best.errors, total, 1.2 + Math.min(0.3, best.errors / total - BUNCHED_SHARE), [
    { key: "days", value: best.to - best.from + 1, unit: "count", label: `days from ${first} to ${last}` },
    { key: "daysCounted", value: counted.length, unit: "count", label: "days whose errors Clarity counted" },
  ]);
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function pagesFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const site = measuresIn(data.website);
  const summary = isRow(data.summary) ? data.summary : {};
  const found: OwnFound[] = [];
  // Of every visit to a page, the share on pages scrolled less than a quarter of the way: against the span before where
  // Clarity holds one, else of the whole.
  if (isNumber(summary.lowVisits) && isNumber(summary.allVisits) && summary.allVisits > 0 && summary.lowVisits > 0) {
    const share = round1((100 * summary.lowVisits) / summary.allVisits);
    const before = isNumber(summary.lowVisitsBefore) && isNumber(summary.allVisitsBefore) && summary.allVisitsBefore > 0 ? round1((100 * summary.lowVisitsBefore) / summary.allVisitsBefore) : null;
    const facts: FindingFact[] = [
      { key: "value", value: summary.lowVisits, unit: "count", label: `${names.low}: visits` },
      { key: "share", value: share, unit: "percent", label: `${names.low}: share of all the visits to pages` },
    ];
    if (before !== null && names.before && Math.abs(share - before) >= 1) {
      found.push({
        id: `shareMoved:low:visits:${names.low}`, kind: "shareMoved", list: "low", score: 1.2 + Math.min(0.4, Math.abs(share - before) / 20),
        params: { name: names.low, measure: "visits", share, shareBefore: before },
        facts: [...facts, { key: "shareBefore", value: before, unit: "percent", label: `${names.low}: the same, the span before` }],
      });
    } else {
      found.push({ id: `holdsMost:low:visits:${names.low}`, kind: "holdsMost", list: "low", score: 0.7 + Math.min(0.5, share / 40), params: { name: names.low, measure: "visits", share, value: summary.lowVisits }, facts });
    }
  }
  // The busy pages whose scroll fell and rose most against the span before, over every page.
  for (const [field, base] of [["fell", 1.4], ["rose", 1.0]] as const) {
    const line = isRow(summary[field]) ? (summary[field] as Row) : null;
    const m = line ? measuresIn(line.now) : null;
    if (!line || !m || m.scroll === null || typeof line.page !== "string" || !isNumber(line.scrollBefore) || !isNumber(line.visitsBefore) || !names.before) continue;
    const gap = m.scroll - line.scrollBefore;
    if (!scrollApart(gap, m.visits, line.visitsBefore)) continue;
    found.push(against("pagesMoved", line.page, "scroll", m.scroll, line.scrollBefore, base + Math.min(0.5, Math.abs(gap) / 20), { against: "other", other: names.before }, [
      { key: "visits", value: m.visits, unit: "count", label: `${line.page}: visits, this span` },
      { key: "visitsBefore", value: line.visitsBefore, unit: "count", label: `${line.page}: visits, the span before` },
    ]));
  }
  // A busy page whose visits meet a problem far more often than the website's: the chart's busiest pages.
  const busiest = linesOf(rowsOf(data.busiest), "figures");
  if (site) found.push(...apartFromWhole("busiest", busiest, site, { against: "website" }, 0.95, { scroll: false, most: 2 }));
  // Each page group against the whole website (kept under `figures`, so the general rules never read a group's visits
  // as news: "Content hub: 45% of all the visits" is no finding).
  found.push(...apartFromWhole("groups", linesOf(rowsOf(data.groupAverages), "figures"), site, site ? { against: "website" } : { against: "list" }, 0.85, { most: 1 }));
  return found;
}

// ---------------------------------------------------------------------------
// A page's own screen
// ---------------------------------------------------------------------------

function pageFindingsOf(data: Row): OwnFound[] {
  const names = namesOf(data);
  const page = measuresIn(data.now);
  const site = measuresIn(data.website);
  const name = names.page ?? "This page";
  // Too few visits to judge the page on its own: the screen says so, and the eye says nothing it cannot stand behind.
  if (!page || page.visits < PAGE_LEAST) return [];
  const found: OwnFound[] = [];
  // The headline: its scroll and problems against the span before, where Clarity holds one.
  found.push(...sinceBefore("page", name, page, measuresIn(data.before), names.before, 1.5));
  // Its scroll against similar pages (its group), else the whole website.
  const group = measuresIn(data.group);
  if (page.scroll !== null) {
    const reference = group && group.visits >= GROUP_LEAST && group.scroll !== null ? { m: group, ref: { against: "group" } as Reference } : site && site.scroll !== null ? { m: site, ref: { against: "website" } as Reference } : null;
    if (reference && scrollApart(page.scroll - reference.m.scroll!, page.visits, Math.max(1, reference.m.visits))) {
      found.push(against("pageScroll", name, "scroll", page.scroll, reference.m.scroll!, 1.25 + Math.min(0.4, Math.abs(page.scroll - reference.m.scroll!) / 25), reference.ref, [
        { key: "visits", value: page.visits, unit: "count", label: `${name}: visits` },
      ]));
    }
  }
  // Its problems against the whole website's.
  if (site) {
    const self: Line = { name, m: page, scrollBefore: null, visitsBefore: null, row: {} };
    found.push(...apartFromWhole("pageProblems", [self], site, { against: "website" }, 1.1, { scroll: false, most: 2, nameTwice: true }));
  }
  // A browser and device where far more of its visits hit an error than its others (plan section 8).
  const where = linesOf(rowsOf(data.errors));
  found.push(...apartFromWhole("pageBrowsers", where, page, { against: "other", other: name }, 1.15, { problems: ["errors"], scroll: false, most: 1 }));
  // Phones against computers on it, beside the website's own gap.
  found.push(...devicesApart("pageDevices", rowsOf(data.devices), names, 1.0, rowsOf(data.websiteDevices)));
  // A source its visitors scroll far less from, or go straight back from far more often, against its other sources. Never
  // against the page's own figures: Clarity's figures by page and source disagree with its figures by page (Ronins' home
  // page, October 2026: 6 visits went straight back on the page, 16 across its sources), so a source is set only beside
  // the others of the same split.
  found.push(...apartFromOthers("pageSources", linesOf(rowsOf(data.sources)).filter((line) => line.row.own !== true), names.otherSources, 0.85));
  return found;
}

/** Microsoft Clarity's pages with their own rules, by the eye's key for them (plan section 8, decision 5: side by side). */
export const CLARITY_OWN: Readonly<Record<string, { general: boolean; find: (data: Row) => OwnFound[] }>> = {
  "clarity.overview": { general: false, find: overviewFindings },
  "clarity.errors": { general: false, find: errorsFindings },
  // Pages keeps the general rules: its table's pages moving and scrolled far from the rest of the list are said by them.
  "clarity.pages": { general: true, find: pagesFindings },
  "clarity.page": { general: false, find: pageFindingsOf },
};
