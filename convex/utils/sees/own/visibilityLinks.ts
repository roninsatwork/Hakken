import type { FindingFact } from "../findings";
import { MEASURES, measureWords } from "../measures";
import { firstOfEachList, isNumber, isRow, moved, named, partOf, round1, rowsOf, type OwnFound, type Row } from "./shared";

// ===========================================================================================================================
// Backlinks and Keywords: the first half of Visibility's pages (ask-hakken-every-chart-page-plan-2026-11-03.md, section 10).
// One builder's block, 2026-11-03: its rules and helpers live inside `linksAndKeywords`, so the two halves of this file
// never share a name. What each page hands its eye is built in one place, beside its screens
// (`backlinks/_components/linkSees.ts`, `keywords/_components/keywordSees.ts`), and every rule is run on every period
// the date menu offers in `visibilityLinksKeywordsPeriods.test.ts`.
// ===========================================================================================================================

/**
 * Visibility's figures come from checks on set days, not a span of days like Google Analytics': a page reads each figure
 * as it stood at the end of the dates, and "before" is the newest check before them, where a check in the dates moved it
 * on. With one check held, nothing moved, so every page also sets yours against your rivals' (a typical rival: the middle
 * of theirs) and parts against their whole, and the rules rank all of it to say the biggest things first. Money is never
 * spoken of (Anthony, 2026-11-03, on every guessed money figure: "Yes, all of it"): no rule reads a cost or a worth.
 * Joined into `VISIBILITY_OWN` (`own/visibility.ts`).
 */
export function linksAndKeywords(): Record<string, { general: boolean; find: (data: Row) => OwnFound[] }> {
  /** A change too small to be news: under this share of where it stood before. */
  const LEAST_MOVE = 0.01;
  /** Yours this many times a typical rival's, or as little as its inverse, is worth saying. */
  const APART = 1.5;
  /** A percentage this many points from a typical rival's, or from its own reference, is worth saying. */
  const APART_POINTS = 3;
  /** A group of links this many points from rivals', where it or theirs holds this share of the links. */
  const GROUP_POINTS = 10;
  const GROUP_LEAST = 10;
  /** A rival's move on the figure worth saying: this share and this many. */
  const RIVAL_MOVE = 0.03;
  const RIVAL_LEAST = 5;
  /** A step losing or gaining this many times the other steps' average, and this many links, is worth saying. */
  const STEP_TIMES = 2.5;
  const STEP_LEAST = 50;
  /** A part of a whole too small to be news: under this share. */
  const PART_LEAST = 0.02;

  const text = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value.trim() : fallback);
  const namesIn = (data: Row): Row => (isRow(data.names) ? data.names : {});
  const numberIn = (row: Row | null | undefined, field: string): number | null => (row && isNumber(row[field]) ? (row[field] as number) : null);
  const beforeIn = (row: Row | null | undefined, field: string): number | null => (row && isRow(row.before) ? numberIn(row.before, field) : null);
  const middle = (values: readonly number[]): number | null => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const at = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[at] : (sorted[at - 1] + sorted[at]) / 2;
  };
  const unitOf = (measure: string): FindingFact["unit"] => {
    const kind = MEASURES[measure]?.kind;
    return kind === "percent" ? "percent" : kind === "place" || kind === "score" ? "score" : "count";
  };
  const shown = (measure: string, value: number) => (unitOf(measure) === "count" ? Math.round(value) : round1(value));
  const ratioOf = (value: number, mean: number) => (mean > 0 ? Math.max(value, 0.01) / mean : value > 0 ? 99 : 1);
  const farApart = (measure: string, value: number, mean: number) =>
    (unitOf(measure) === "percent" ? Math.abs(value - mean) >= APART_POINTS : ratioOf(value, mean) >= APART || ratioOf(value, mean) <= 1 / APART);

  /** Yours, or a group's, set against another figure on the same measure: a rival's, a typical rival's, another group's. */
  function versus(list: string, name: string, measure: string, value: number, mean: number, other: string, score: number, extra: FindingFact[] = []): OwnFound {
    const kind = value > mean ? "rowAbove" : "rowBelow";
    const words = measureWords(measure);
    const unit = unitOf(measure);
    return {
      id: `${kind}:${list}:${measure}:${name}`, kind, list, score,
      params: { name, measure, value: shown(measure, value), mean: shown(measure, mean), against: "other", other, ...(MEASURES[measure]?.lessIsBetter ? { lessIsBetter: 1 } : {}) },
      facts: [
        { key: "value", value: shown(measure, value), unit, label: `${name}: ${words}` },
        { key: "mean", value: shown(measure, mean), unit, label: `${other}: ${words}` },
        ...extra,
      ],
    };
  }

  /** New against lost on a figure, beside the span before's where it is held. */
  function newAgainstLost(list: string, measure: string, gained: number, lost: number, score: number, before?: { gained: number; lost: number }): OwnFound {
    const words = measureWords(measure);
    return {
      id: `newLost:${list}:${measure}`, kind: "newLost", list, score,
      params: { measure, gained, lost, ...(before ? { gainedBefore: before.gained, lostBefore: before.lost } : {}) },
      facts: [
        { key: "gained", value: gained, unit: "count", label: `${words}: new` },
        { key: "lost", value: lost, unit: "count", label: `${words}: lost` },
        ...(before ? [{ key: "gainedBefore", value: before.gained, unit: "count" as const, label: `${words}: new, the span before` }, { key: "lostBefore", value: before.lost, unit: "count" as const, label: `${words}: lost, the span before` }] : []),
      ],
    };
  }

  /** A search's place that moved: 12th to 4th on Google. */
  function placeMoved(list: string, name: string, now: number, before: number, score: number, extra: FindingFact[] = []): OwnFound {
    const kind = now < before ? "placeUp" : "placeDown";
    const words = measureWords("position");
    return {
      id: `${kind}:${list}:position:${name}`, kind, list, score,
      params: { name, measure: "position", now: round1(now), before: round1(before), moved: round1(Math.abs(before - now)) },
      facts: [
        { key: "now", value: round1(now), unit: "score", label: `${name}: ${words}, this span` },
        { key: "before", value: round1(before), unit: "score", label: `${name}: ${words}, the span before` },
        ...extra,
      ],
    };
  }

  /** A rival's figure that moved over the dates, said beside yours. */
  function rivalMoved(list: string, rival: Row, you: Row, measure: string, score: number): OwnFound | null {
    const now = numberIn(rival, measure);
    const before = beforeIn(rival, measure);
    const mine = numberIn(you, measure);
    if (now === null || before === null || mine === null || before <= 0) return null;
    const mineBefore = beforeIn(you, measure) ?? mine;
    const kind = now >= before ? "rivalUp" : "rivalDown";
    const name = named(rival)!;
    const words = measureWords(measure);
    return {
      id: `${kind}:${list}:${measure}:${name}`, kind, list, score,
      params: { name, measure, now, before, you: mine, youBefore: mineBefore },
      facts: [
        { key: "now", value: now, unit: unitOf(measure), label: `${name}: ${words}, this span` },
        { key: "before", value: before, unit: unitOf(measure), label: `${name}: ${words}, the span before` },
        { key: "you", value: mine, unit: unitOf(measure), label: `You: ${words}, this span` },
        { key: "youBefore", value: mineBefore, unit: unitOf(measure), label: `You: ${words}, the span before` },
      ],
    };
  }

  /** The websites a page hands, yours first found, then your rivals with the figure. */
  function websitesIn(data: Row): { you: Row | null; rivals: Row[] } {
    const rows = rowsOf(data.websites).filter((row) => named(row) !== null);
    return { you: rows.find((row) => row.you === true) ?? null, rivals: rows.filter((row) => row.you !== true) };
  }

  /** Yours against a typical rival's on one figure: always for a page's headline, else only where far enough apart. */
  function againstRivals(data: Row, list: string, measure: string, score: (value: number, mean: number) => number, always = false): OwnFound | null {
    const { you, rivals } = websitesIn(data);
    const mine = numberIn(you, measure);
    const typical = middle(rivals.flatMap((row) => (isNumber(row[measure]) ? [row[measure] as number] : [])));
    if (!you || mine === null || typical === null || rivals.length < 2) return null;
    if (!always && !farApart(measure, mine, typical)) return null;
    const placed = 1 + rivals.filter((row) => isNumber(row[measure]) && (MEASURES[measure]?.lessIsBetter ? (row[measure] as number) < mine : (row[measure] as number) > mine)).length;
    const counted = 1 + rivals.filter((row) => isNumber(row[measure])).length;
    return versus(list, named(you)!, measure, mine, typical, text(namesIn(data).rivals, "A typical rival"), score(mine, typical), [
      { key: "place", value: placed, unit: "count", label: `Your place among ${counted} websites on ${measureWords(measure)}, best first` },
    ]);
  }

  /** Yours moved over the dates, beside the rival that moved most on the same figure. */
  function youMoved(data: Row, list: string, measure: string, score: number): OwnFound | null {
    const { you, rivals } = websitesIn(data);
    const now = numberIn(you, measure);
    const before = beforeIn(you, measure);
    if (!you || now === null || before === null || before <= 0 || Math.abs(now - before) / before < LEAST_MOVE) return null;
    const changeOf = (row: Row) => (numberIn(row, measure)! - beforeIn(row, measure)!) / beforeIn(row, measure)!;
    const leader = rivals
      .filter((row) => numberIn(row, measure) !== null && (beforeIn(row, measure) ?? 0) > 0)
      .sort((left, right) => Math.abs(changeOf(right)) - Math.abs(changeOf(left)))[0];
    return moved(list, named(you)!, measure, now, before, score + Math.min(0.5, Math.abs(now - before) / before), leader ? { name: named(leader)!, change: changeOf(leader) } : undefined);
  }

  /** The rival whose figure moved most over the dates, where it moved enough to say. */
  function rivalMovedMost(data: Row, list: string, measure: string, score: number): OwnFound | null {
    const { you, rivals } = websitesIn(data);
    if (!you) return null;
    const best = rivals
      .map((row) => ({ row, now: numberIn(row, measure), before: beforeIn(row, measure) }))
      .filter((one): one is { row: Row; now: number; before: number } => one.now !== null && one.before !== null && one.before > 0)
      .filter((one) => Math.abs(one.now - one.before) >= RIVAL_LEAST && Math.abs(one.now - one.before) / one.before >= RIVAL_MOVE)
      .sort((left, right) => Math.abs(right.now - right.before) - Math.abs(left.now - left.before))[0];
    return best ? rivalMoved(list, best.row, you, measure, score) : null;
  }

  /** A part of a whole with an extra fact or two: "delivery page: 82% of all the links", from 2 linking websites. */
  function partWith(list: string, name: string, measure: string, value: number, whole: number, score: number, extra: FindingFact[] = []): OwnFound {
    const one = partOf(list, name, measure, value, whole, score);
    return { ...one, facts: [...one.facts, ...extra] };
  }
  const websitesFact = (count: number, name: string): FindingFact => ({ key: "websites", value: count, unit: "count", label: `${name}: linking websites` });
  const pushed = (found: OwnFound[], one: OwnFound | null) => {
    if (one) found.push(one);
  };
  const apartScore = (base: number) => (value: number, mean: number) => base + Math.min(0.5, Math.abs(Math.log(ratioOf(value, mean))) / 3);
  const pointsScore = (base: number) => (value: number, mean: number) => base + Math.min(0.5, Math.abs(value - mean) / 40);

  /** Your domain rank against the strongest rival's: above you, or, where you are the strongest, the next one down. */
  function strongestAgainst(data: Row, list: string, base: number): OwnFound | null {
    const { you, rivals } = websitesIn(data);
    const mine = numberIn(you, "domainRank");
    const ranked = rivals.filter((row) => isNumber(row.domainRank)).sort((left, right) => (right.domainRank as number) - (left.domainRank as number));
    if (!you || mine === null || ranked.length === 0) return null;
    const other = ranked[0];
    const gap = Math.abs((other.domainRank as number) - mine);
    if (gap < 3) return null;
    return versus(list, named(you)!, "domainRank", mine, other.domainRank as number, named(other)!, base + Math.min(0.5, gap / 200), [
      { key: "place", value: 1 + ranked.filter((row) => (row.domainRank as number) > mine).length, unit: "count", label: `Your place among ${ranked.length + 1} websites on domain rank, strongest first` },
    ]);
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // Backlinks › Summary: linking websites, links, domain rank and broken links, yours beside your rivals'.
  // -------------------------------------------------------------------------------------------------------------------------
  function summaryFindings(data: Row): OwnFound[] {
    const found: OwnFound[] = [];
    // The headline: linking websites moved over the dates, beside the rival that moved most; else against a typical rival.
    pushed(found, youMoved(data, "websites", "referringDomains", 1.4) ?? againstRivals(data, "websites", "referringDomains", apartScore(1.3), true));
    pushed(found, rivalMovedMost(data, "rivalMoves", "referringDomains", 1.1));
    pushed(found, youMoved(data, "rankMoved", "domainRank", 1.0));
    pushed(found, youMoved(data, "linksMoved", "backlinks", 0.9));
    pushed(found, strongestAgainst(data, "rank", 0.9));
    // Many links from few websites: one website's links across every page (a footer, a "delivery page" link).
    pushed(found, againstRivals(data, "perWebsite", "linksPerWebsite", apartScore(0.8)));
    pushed(found, againstRivals(data, "broken", "brokenBacklinks", apartScore(0.6)));
    pushed(found, againstRivals(data, "backlinks", "backlinks", apartScore(0.5)));
    return found;
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // Backlinks › Compared with rivals: each website's links at its newest check, side by side.
  // -------------------------------------------------------------------------------------------------------------------------
  function comparedFindings(data: Row): OwnFound[] {
    const found: OwnFound[] = [];
    const { you, rivals } = websitesIn(data);
    const mine = numberIn(you, "referringDomains");
    const others = rivals.filter((row) => isNumber(row.referringDomains)).sort((left, right) => (right.referringDomains as number) - (left.referringDomains as number));
    // The headline: your linking websites against the leader's, or, where you lead, the next one's.
    if (you && mine !== null && others.length > 0) {
      const leader = others[0];
      const place = 1 + others.filter((row) => (row.referringDomains as number) > mine).length;
      found.push(versus("leader", named(you)!, "referringDomains", mine, leader.referringDomains as number, named(leader)!, 1.5, [
        { key: "place", value: place, unit: "count", label: `Your place among ${others.length + 1} websites on linking websites, most first` },
      ]));
    }
    pushed(found, againstRivals(data, "typical", "referringDomains", apartScore(0.9)));
    pushed(found, strongestAgainst(data, "rank", 1.0));
    pushed(found, againstRivals(data, "perWebsite", "linksPerWebsite", apartScore(0.8)));
    pushed(found, againstRivals(data, "backlinks", "backlinks", apartScore(0.6)));
    return found;
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // Backlinks › Link quality: spam score, broken links, broken pages and nofollow websites, yours beside your rivals'.
  // -------------------------------------------------------------------------------------------------------------------------
  function qualityFindings(data: Row): OwnFound[] {
    const found: OwnFound[] = [];
    pushed(found, youMoved(data, "spam", "spamScore", 1.4) ?? againstRivals(data, "spam", "spamScore", apartScore(1.3), true));
    pushed(found, rivalMovedMost(data, "rivalSpam", "spamScore", 1.0));
    pushed(found, youMoved(data, "brokenMoved", "brokenBacklinks", 1.0) ?? againstRivals(data, "broken", "brokenBacklinks", apartScore(0.9)));
    pushed(found, youMoved(data, "brokenPagesMoved", "brokenPages", 0.9) ?? againstRivals(data, "brokenPages", "brokenPages", apartScore(0.8)));
    pushed(found, againstRivals(data, "nofollow", "nofollowWebsitesPercent", pointsScore(0.7)));
    return found;
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // Backlinks › Where links come from: each breakdown's groups, your share of your links beside a typical rival's.
  // -------------------------------------------------------------------------------------------------------------------------
  function whereFindings(data: Row): OwnFound[] {
    const found: OwnFound[] = [];
    const rivals = text(namesIn(data).rivals, "A typical rival");
    const breakdowns = rowsOf(data.breakdowns).filter((row) => named(row) !== null);
    const gaps: Array<{ list: string; row: Row; mine: number; theirs: number; gap: number }> = [];
    breakdowns.forEach((breakdown, at) => {
      const list = named(breakdown)!;
      const groups = rowsOf(breakdown.groups).filter((row) => named(row) !== null && isNumber(row.linksSharePercent) && isNumber(row.rivalsSharePercent));
      if (groups.length === 0 || !isNumber(breakdown.rivals) || (breakdown.rivals as number) < 2) return;
      // The headline: the first breakdown's biggest group (the country most links come from) against rivals'.
      if (at === 0) {
        const top = groups[0];
        found.push(versus(list, named(top)!, "linksSharePercent", top.linksSharePercent as number, top.rivalsSharePercent as number, rivals, 1.3 + Math.min(0.4, Math.abs((top.linksSharePercent as number) - (top.rivalsSharePercent as number)) / 100)));
      }
      for (const row of groups.slice(at === 0 ? 1 : 0)) {
        const mine = row.linksSharePercent as number;
        const theirs = row.rivalsSharePercent as number;
        if (Math.abs(mine - theirs) >= GROUP_POINTS && Math.max(mine, theirs) >= GROUP_LEAST) gaps.push({ list, row, mine, theirs, gap: Math.abs(mine - theirs) });
      }
    });
    for (const one of firstOfEachList(gaps.sort((left, right) => right.gap - left.gap), 3)) {
      found.push(versus(one.list, named(one.row)!, "linksSharePercent", one.mine, one.theirs, rivals, 0.8 + Math.min(0.5, one.gap / 100)));
    }
    return found;
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // Backlinks › Anchors: the words links use, over the whole list as summed on the server.
  // -------------------------------------------------------------------------------------------------------------------------
  function anchorsFindings(data: Row): OwnFound[] {
    const found: OwnFound[] = [];
    const whole = isRow(data.whole) ? data.whole : null;
    const all = numberIn(whole, "backlinks");
    if (!whole || all === null || all <= 0) return found;
    const names = namesIn(data);
    // The headline: the words used most, and their share of every link, with how few websites they come from.
    const top = isRow(whole.top) ? whole.top : null;
    if (top && named(top) && isNumber(top.backlinks)) {
      found.push(partWith("top", named(top)!, "backlinks", top.backlinks as number, all, 1.2 + Math.min(0.5, (top.backlinks as number) / all), isNumber(top.referringDomains) ? [websitesFact(top.referringDomains as number, named(top)!)] : []));
    }
    const part = (key: string, name: string, score: (share: number) => number, least: number, enough: (row: Row) => boolean = () => true) => {
      const row = isRow(whole[key]) ? (whole[key] as Row) : null;
      const links = numberIn(row, "backlinks");
      if (!row || links === null || links / all < least || !enough(row)) return;
      found.push(partWith(key, name, "backlinks", links, all, score(links / all), isNumber(row.referringDomains) ? [websitesFact(row.referringDomains as number, name)] : []));
    };
    // The business's own name: said whatever its share, as the share every link profile is judged by.
    part("brand", text(names.brand, "Links with your business's name"), (share) => 0.9 + Math.min(0.3, Math.abs(0.3 - share)), 0);
    // Words that read as spam, from enough websites to be a campaign rather than one stray link.
    part("spammy", text(names.spammy, "Words that read as spam"), () => 1.0, 0, (row) => (numberIn(row, "anchors") ?? 0) >= 3 && (numberIn(row, "referringDomains") ?? 0) >= 5);
    part("noWords", text(names.noWords, "Links with no words"), (share) => 0.6 + Math.min(0.3, share), PART_LEAST);
    part("fresh", text(names.fresh, "Words first seen in the last 3 months"), (share) => 0.5 + Math.min(0.3, share), 0, (row) => (numberIn(row, "anchors") ?? 0) >= 3);
    return found;
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // Backlinks › Referring IPs: the servers and networks links come from, over every server.
  // -------------------------------------------------------------------------------------------------------------------------
  function ipsFindings(data: Row): OwnFound[] {
    const found: OwnFound[] = [];
    const whole = isRow(data.whole) ? data.whole : null;
    if (!whole) return found;
    const names = namesIn(data);
    const websites = numberIn(whole, "referringDomains");
    const links = numberIn(whole, "backlinks");
    // The headline: the network holding the most linking websites, of every linking website.
    const network = isRow(whole.topNetwork) ? whole.topNetwork : null;
    if (network && named(network) && isNumber(network.referringDomains) && websites) {
      found.push(partWith("network", named(network)!, "referringDomains", network.referringDomains as number, websites, 1.2 + Math.min(0.5, (network.referringDomains as number) / websites), isNumber(network.linkServers) ? [{ key: "servers", value: network.linkServers as number, unit: "count", label: `${named(network)}: servers` }] : []));
    }
    // The server carrying the most links, where it carries a tenth or more of them.
    const server = isRow(whole.topServer) ? whole.topServer : null;
    if (server && named(server) && isNumber(server.backlinks) && links && (server.backlinks as number) / links >= 0.1) {
      found.push(partWith("server", named(server)!, "backlinks", server.backlinks as number, links, 1.0 + Math.min(0.5, (server.backlinks as number) / links), isNumber(server.referringDomains) ? [websitesFact(server.referringDomains as number, named(server)!)] : []));
    }
    // The three busiest networks together, of every linking website.
    const networks = rowsOf(data.networks).filter((row) => isNumber(row.referringDomains));
    if (networks.length >= 3 && websites) {
      const three = networks.slice(0, 3).reduce((sum, row) => sum + (row.referringDomains as number), 0);
      found.push(partOf("busiest", text(names.busiestThree, "The 3 busiest networks"), "referringDomains", three, websites, 0.8 + Math.min(0.4, three / websites)));
    }
    // Servers carrying one linking website each: how spread out the links are.
    const one = numberIn(whole, "oneWebsiteServers");
    const held = numberIn(whole, "serversHeld");
    if (one !== null && held) found.push(partOf("oneWebsite", text(names.oneWebsite, "Servers with one linking website"), "linkServers", one, held, 0.6));
    return found;
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // Backlinks › New and lost links: gained against lost in the dates, against the span before, and the step that lost most.
  // -------------------------------------------------------------------------------------------------------------------------
  function linkChangesFindings(data: Row): OwnFound[] {
    const found: OwnFound[] = [];
    const totals = isRow(data.totals) ? data.totals : null;
    const before = isRow(data.before) ? data.before : null;
    const pair = (row: Row | null, gained: string, lost: string) => (row && isNumber(row[gained]) && isNumber(row[lost]) ? { gained: row[gained] as number, lost: row[lost] as number } : null);
    const links = pair(totals, "linksGained", "linksLost");
    if (links && links.gained + links.lost > 0) found.push(newAgainstLost("links", "backlinks", links.gained, links.lost, 1.5, pair(before, "linksGained", "linksLost") ?? undefined));
    const websites = pair(totals, "websitesGained", "websitesLost");
    if (websites && websites.gained + websites.lost > 0) found.push(newAgainstLost("websites", "referringDomains", websites.gained, websites.lost, 1.3, pair(before, "websitesGained", "websitesLost") ?? undefined));
    // The step that lost, and the one that gained, far more links than the others did on average.
    const steps = rowsOf(data.steps).filter((row) => named(row) !== null);
    const other = text(namesIn(data).otherSteps, "The others, on average");
    for (const [field, base] of [["linksLost", 1.0], ["linksGained", 0.8]] as const) {
      if (steps.length < 3) break;
      const top = [...steps].filter((row) => isNumber(row[field])).sort((left, right) => (right[field] as number) - (left[field] as number))[0];
      if (!top) continue;
      const rest = steps.filter((row) => row !== top && isNumber(row[field]));
      const mean = rest.reduce((sum, row) => sum + (row[field] as number), 0) / Math.max(1, rest.length);
      const value = top[field] as number;
      if (value >= STEP_LEAST && value >= mean * STEP_TIMES) found.push(versus(`step:${field}`, named(top)!, field, value, mean, other, base + Math.min(0.5, Math.log(ratioOf(value, mean)) / 6)));
    }
    return found;
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // Keywords: what rose and fell, onto and off page one, and each website's searches beside yours.
  // -------------------------------------------------------------------------------------------------------------------------
  function keywordsFindings(data: Row): OwnFound[] {
    const found: OwnFound[] = [];
    const names = namesIn(data);
    const rose = text(names.rose, "Searches that rose");
    const fell = text(names.fell, "Searches that fell");
    const whole = isRow(data.whole) ? data.whole : null;
    const { you } = websitesIn(data);
    // The headline: the visitors the searches that fell bring, against those that rose, over the whole list; else, where the
    // list holds no moves, the supplier's own count of searches that rose and fell at the newest check.
    const up = whole && isRow(whole.rose) ? whole.rose : null;
    const down = whole && isRow(whole.fell) ? whole.fell : null;
    const upCount = numberIn(up, "searches") ?? 0;
    const downCount = numberIn(down, "searches") ?? 0;
    if (up && down && upCount + downCount > 0 && (numberIn(up, "traffic") ?? 0) + (numberIn(down, "traffic") ?? 0) > 0) {
      found.push(versus("moves", fell, "traffic", numberIn(down, "traffic")!, numberIn(up, "traffic")!, rose, 1.5, [
        { key: "fell", value: downCount, unit: "count", label: `${fell}: searches` },
        { key: "rose", value: upCount, unit: "count", label: `${rose}: searches` },
      ]));
    } else {
      pushed(found, upAgainstDown(you, rose, fell, 1.5));
    }
    // Onto Google's first page against off it, at the newest check.
    const into = whole && isRow(whole.intoPageOne) ? numberIn(whole.intoPageOne, "searches") : null;
    const outOf = whole && isRow(whole.outOfPageOne) ? numberIn(whole.outOfPageOne, "searches") : null;
    if (into !== null && outOf !== null && into + outOf >= 3) found.push(newAgainstLost("pageOne", "pageOneSearches", into, outOf, 1.2 + Math.min(0.3, Math.abs(into - outOf) / Math.max(1, into + outOf))));
    pushed(found, youMoved(data, "pageOneMoved", "pageOneSearches", 1.3));
    // The biggest climb and drop, weighed by how often the search is made (worked out on the server).
    for (const [key, base] of [["climbs", 1.0], ["drops", 1.1]] as const) {
      const one = whole ? rowsOf(whole[key])[0] : undefined;
      if (one && named(one) && isNumber(one.position) && isNumber(one.positionBefore) && one.position !== one.positionBefore) {
        found.push(placeMoved(key, named(one)!, one.position as number, one.positionBefore as number, base + Math.min(0.4, Math.abs((one.positionBefore as number) - (one.position as number)) / 25), isNumber(one.volume) ? [{ key: "volume", value: one.volume as number, unit: "count", label: `${named(one)}: monthly searches` }] : []));
      }
    }
    pushed(found, againstRivals(data, "pageOne", "pageOnePercent", pointsScore(1.0)));
    pushed(found, againstRivals(data, "top3", "top3Percent", pointsScore(0.9)));
    // How much of every visitor rests on one search: the search bringing most, where it brings a twentieth or more.
    const topSearch = whole && isRow(whole.topSearch) ? whole.topSearch : null;
    const traffic = numberIn(whole, "traffic");
    if (topSearch && named(topSearch) && isNumber(topSearch.traffic) && traffic && (topSearch.traffic as number) / traffic >= 0.05) {
      found.push(partWith("topSearch", named(topSearch)!, "traffic", topSearch.traffic as number, traffic, 0.8 + Math.min(0.5, (topSearch.traffic as number) / traffic), isNumber(topSearch.position) ? [{ key: "position", value: topSearch.position as number, unit: "score", label: `${named(topSearch)}: place in search results` }] : []));
    }
    // New against lost across every search, as the supplier counts them at the newest check.
    const fresh = numberIn(you, "keywordsNew");
    const lost = numberIn(you, "keywordsLost");
    if (fresh !== null && lost !== null && fresh + lost > 0) found.push(newAgainstLost("searches", "keywords", fresh, lost, 0.8));
    return found;
  }

  /** The searches that fell against those that rose at the newest check, as the supplier counts them for a website. */
  function upAgainstDown(row: Row | null, rose: string, fell: string, score: number): OwnFound | null {
    const up = numberIn(row, "keywordsUp");
    const down = numberIn(row, "keywordsDown");
    if (up === null || down === null || up + down <= 0) return null;
    return versus("moves", fell, "searches", down, up, rose, score + Math.min(0.3, Math.abs(down - up) / Math.max(1, down + up)));
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // Keywords › Position bands: page one, the top three, page two and further down, yours beside your rivals'.
  // -------------------------------------------------------------------------------------------------------------------------
  function bandsFindings(data: Row): OwnFound[] {
    const found: OwnFound[] = [];
    const names = namesIn(data);
    const { you } = websitesIn(data);
    pushed(found, youMoved(data, "pageOneMoved", "pageOneSearches", 1.4) ?? againstRivals(data, "pageOne", "pageOnePercent", pointsScore(1.3), true));
    const moved = isRow(data.moved) ? data.moved : null;
    const into = numberIn(moved, "intoPageOne");
    const outOf = numberIn(moved, "outOfPageOne");
    if (into !== null && outOf !== null && into + outOf >= 3) found.push(newAgainstLost("pageOne", "pageOneSearches", into, outOf, 1.2 + Math.min(0.3, Math.abs(into - outOf) / Math.max(1, into + outOf))));
    pushed(found, rivalMovedMost(data, "rivalPageOne", "pageOneSearches", 1.0));
    pushed(found, againstRivals(data, "top3", "top3Percent", pointsScore(1.0)));
    // Page two against page one: searches just off the first page, as many or more than on it.
    const one = numberIn(you, "pageOneSearches");
    const two = numberIn(you, "pageTwoSearches");
    if (one !== null && two !== null && one > 0 && two >= one * 0.8) {
      found.push(versus("pageTwo", text(names.pageTwo, "Page two"), "searches", two, one, text(names.pageOne, "Page one"), 0.9 + Math.min(0.4, two / one - 0.8)));
    }
    pushed(found, againstRivals(data, "pageTwoShare", "pageTwoPercent", pointsScore(0.8)));
    pushed(found, againstRivals(data, "further", "furtherPercent", pointsScore(0.7)));
    // The search just off page one searched far more than the others there: the one climb worth most.
    const closest = isRow(data.closest) ? rowsOf(data.closest).filter((row) => named(row) && isNumber(row.volume)) : [];
    if (closest.length >= 3) {
      const [top, ...rest] = [...closest].sort((left, right) => (right.volume as number) - (left.volume as number));
      const typical = middle(rest.map((row) => row.volume as number));
      if (typical !== null && typical > 0 && (top.volume as number) >= typical * 2) {
        found.push(versus("closest", named(top)!, "volume", top.volume as number, typical, text(names.closestOthers, "The other searches just off page one"), 0.9 + Math.min(0.5, Math.log(ratioOf(top.volume as number, typical)) / 5), isNumber(top.position) ? [{ key: "position", value: top.position as number, unit: "score", label: `${named(top)}: place in search results` }] : []));
      }
    }
    return found;
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // Keywords › a search: your place on it, beside the rivals you watch on the same search.
  // -------------------------------------------------------------------------------------------------------------------------
  function searchFindings(data: Row): OwnFound[] {
    const found: OwnFound[] = [];
    const names = namesIn(data);
    const search = isRow(data.search) ? data.search : null;
    const { you, rivals } = websitesIn(data);
    const mine = numberIn(you, "placeOnGoogle");
    const ranking = rivals.filter((row) => isNumber(row.placeOnGoogle)).sort((left, right) => (left.placeOnGoogle as number) - (right.placeOnGoogle as number));
    const above = mine === null ? ranking : ranking.filter((row) => (row.placeOnGoogle as number) < mine);
    const best = ranking[0];
    // The headline: your place moved over the dates, beside the best-placed rival; else your place against the best rival's.
    if (search && named(search) && isNumber(search.positionAtEnd) && isNumber(search.positionBefore) && search.positionAtEnd !== search.positionBefore) {
      found.push(placeMoved("you", named(search)!, search.positionAtEnd as number, search.positionBefore as number, 1.5, best ? [{ key: "rival", value: best.placeOnGoogle as number, unit: "score", label: `${named(best)}: place in search results` }] : []));
    }
    if (you && mine !== null && best) {
      const other = (best.placeOnGoogle as number) < mine ? best : ranking.find((row) => (row.placeOnGoogle as number) > mine) ?? best;
      if (other.placeOnGoogle !== mine) found.push(versus("best", named(you)!, "placeOnGoogle", mine, other.placeOnGoogle as number, named(other)!, found.length > 0 ? 1.1 : 1.5));
      const typical = middle(ranking.map((row) => row.placeOnGoogle as number));
      if (typical !== null && ranking.length >= 3 && Math.abs(typical - mine) >= 3) found.push(versus("typical", named(you)!, "placeOnGoogle", mine, typical, text(names.rivals, "A typical rival"), 0.9));
    }
    // Rivals placed above you on it, of every rival you watch.
    if (rivals.length >= 2) found.push(partOf("above", text(names.rivalsAbove, "Rivals ranking above you"), "rivalsWatched", above.length, rivals.length, 1.0 + Math.min(0.3, above.length / rivals.length)));
    // Rivals you watch who are not in the results for it at all.
    const missing = rivals.length - ranking.length;
    if (rivals.length >= 2 && missing > 0) found.push(partOf("missing", text(names.rivalsMissing, "Rivals not in the results"), "rivalsWatched", missing, rivals.length, 0.6));
    return found;
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // Keywords › New and lost: searches new and lost at each check, up against down, and beside each rival's.
  // -------------------------------------------------------------------------------------------------------------------------
  function newLostFindings(data: Row): OwnFound[] {
    const found: OwnFound[] = [];
    const names = namesIn(data);
    const rose = text(names.rose, "Searches that rose");
    const fell = text(names.fell, "Searches that fell");
    const totals = isRow(data.totals) ? data.totals : null;
    const every = isRow(data.everySearch) ? data.everySearch : null;
    const before = isRow(data.before) ? data.before : null;
    // The headline: new against lost over the checks in the dates (beside the span before's); a check with nothing before
    // it counts no moves, so then the supplier's own count across every search at the newest check stands in.
    const source = totals && (numberIn(totals, "searchesNew") ?? 0) + (numberIn(totals, "searchesLost") ?? 0) > 0 ? totals : every;
    if (source && isNumber(source.searchesNew) && isNumber(source.searchesLost) && (source.searchesNew as number) + (source.searchesLost as number) > 0) {
      const then = source === totals && before && isNumber(before.searchesNew) && isNumber(before.searchesLost) ? { gained: before.searchesNew as number, lost: before.searchesLost as number } : undefined;
      found.push(newAgainstLost("checks", "keywords", source.searchesNew as number, source.searchesLost as number, 1.5, then));
    }
    if (source && isNumber(source.searchesUp) && isNumber(source.searchesDown) && (source.searchesUp as number) + (source.searchesDown as number) > 0) {
      found.push(versus("upDown", fell, "searches", source.searchesDown as number, source.searchesUp as number, rose, 1.3));
    }
    // The biggest move on the newest check's list, weighed by how often the search is made.
    const weight = (row: Row) => Math.min(10, Math.abs((row.positionBefore as number) - (row.position as number))) * Math.sqrt(numberIn(row, "volume") ?? 0);
    const biggest = rowsOf(data.moves)
      .filter((row) => named(row) && isNumber(row.position) && isNumber(row.positionBefore) && row.position !== row.positionBefore && (row.position as number) <= 100 && (row.positionBefore as number) <= 100)
      .sort((left, right) => weight(right) - weight(left))[0];
    if (biggest) found.push(placeMoved("moves", named(biggest)!, biggest.position as number, biggest.positionBefore as number, 1.0));
    // Each website's share of its searches that fell, and that were new, at its newest check: yours beside a typical rival's.
    const shares = {
      ...data,
      websites: rowsOf(data.websites).map((row) => {
        const all = numberIn(row, "rankedKeywordsTotal");
        if (!all) return row;
        return {
          ...row,
          ...(isNumber(row.keywordsDown) ? { fellPercent: round1((100 * (row.keywordsDown as number)) / all) } : {}),
          ...(isNumber(row.keywordsNew) ? { newPercent: round1((100 * (row.keywordsNew as number)) / all) } : {}),
        };
      }),
    };
    // The share that fell is said even where it is a typical rival's: how much of the list fell is the news beside the count.
    pushed(found, againstRivals(shares, "fell", "fellPercent", pointsScore(1.0), true));
    pushed(found, againstRivals(shares, "new", "newPercent", pointsScore(0.8)));
    return found;
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // Keywords › Top pages: the page bringing most visitors, kinds of page by their share of searches and of visitors.
  // -------------------------------------------------------------------------------------------------------------------------
  function pagesFindings(data: Row): OwnFound[] {
    const found: OwnFound[] = [];
    const names = namesIn(data);
    const whole = isRow(data.whole) ? data.whole : null;
    const traffic = numberIn(whole, "traffic");
    const top = whole && isRow(whole.top) ? whole.top : null;
    // The headline: the page bringing the most visitors, of every visitor the ranking pages bring.
    if (top && named(top) && isNumber(top.traffic) && traffic) {
      found.push(partWith("top", named(top)!, "traffic", top.traffic as number, traffic, 1.3 + Math.min(0.4, (top.traffic as number) / traffic), isNumber(top.keywords) ? [{ key: "searches", value: top.keywords as number, unit: "count", label: `${named(top)}: searches ranked for` }] : []));
    }
    // Ranking pages and their visitors over the dates, where the chart holds two checks or more.
    const chart = rowsOf(data.chart);
    for (const [field, base] of [["pages", 1.2], ["estimatedTraffic", 1.1]] as const) {
      const held = chart.filter((row) => isNumber(row[field]));
      if (held.length < 2) continue;
      const [first, last] = [held[0][field] as number, held.at(-1)![field] as number];
      if (first > 0 && Math.abs(last - first) / first >= LEAST_MOVE) found.push(moved(`chart:${field}`, text(names.website, "The whole website"), field, last, first, base + Math.min(0.4, Math.abs(last - first) / first)));
    }
    // Kinds of page that bring far more, or far less, of the visitors than their share of the searches.
    const kinds = rowsOf(data.kinds).filter((row) => named(row) && row.sorted !== false && isNumber(row.trafficPercent) && isNumber(row.searchesPercent) && (numberIn(row, "pages") ?? 0) >= 3);
    const ranked = kinds.map((row) => ({ row, gap: (row.trafficPercent as number) - (row.searchesPercent as number) })).filter((one) => Math.abs(one.gap) >= 5);
    const itsSearches = text(names.itsSearches, "Its share of the searches");
    for (const way of [1, -1]) {
      const one = ranked.filter((entry) => entry.gap * way > 0).sort((left, right) => Math.abs(right.gap) - Math.abs(left.gap))[0];
      if (one) found.push(versus(`kinds:${way}`, named(one.row)!, "trafficPercent", one.row.trafficPercent as number, one.row.searchesPercent as number, itsSearches, 1.0 + Math.min(0.5, Math.abs(one.gap) / 40)));
    }
    // How much of every visitor the five busiest pages bring together, and the pages ranking for one search only.
    const topFive = numberIn(whole, "topFiveTraffic");
    if (topFive !== null && traffic && (numberIn(whole, "pages") ?? 0) >= 10) found.push(partOf("topFive", text(names.topFive, "The 5 busiest pages"), "traffic", topFive, traffic, 0.8 + Math.min(0.4, topFive / traffic / 2)));
    const oneSearch = numberIn(whole, "oneSearchPages");
    if (oneSearch !== null && (numberIn(whole, "pages") ?? 0) >= 10 && oneSearch / numberIn(whole, "pages")! >= 0.2) found.push(partOf("oneSearch", text(names.oneSearch, "Pages ranking for one search only"), "pages", oneSearch, numberIn(whole, "pages")!, 0.6 + Math.min(0.3, oneSearch / numberIn(whole, "pages")!)));
    // Pages that rank yet bring next to no one, of every ranking page.
    const quiet = numberIn(whole, "quietPages");
    const pages = numberIn(whole, "pages");
    if (quiet !== null && pages && quiet / pages >= 0.1) found.push(partOf("quiet", text(names.quietPages, "Pages bringing almost no one"), "pages", quiet, pages, 0.7 + Math.min(0.3, quiet / pages)));
    return found;
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // Keywords › Site structure: sections by their share of searches, visitors and top-three places.
  // -------------------------------------------------------------------------------------------------------------------------
  function structureFindings(data: Row): OwnFound[] {
    const found: OwnFound[] = [];
    const names = namesIn(data);
    const whole = isRow(data.whole) ? data.whole : null;
    const traffic = numberIn(whole, "traffic");
    const sections = rowsOf(data.sections).filter((row) => named(row) !== null);
    // The headline: the section bringing the most visitors, of all the website's.
    const top = sections.filter((row) => isNumber(row.traffic)).sort((left, right) => (right.traffic as number) - (left.traffic as number))[0];
    if (top && traffic) found.push(partWith("top", named(top)!, "traffic", top.traffic as number, traffic, 1.3 + Math.min(0.4, (top.traffic as number) / traffic), isNumber(top.searchesPercent) ? [{ key: "searches", value: top.searchesPercent as number, unit: "percent", label: `${named(top)}: share of the searches ranked for` }] : []));
    // Sections that bring far more, or far less, of the visitors than their share of the searches.
    const itsSearches = text(names.itsSearches, "Its share of the searches");
    const gaps = sections.filter((row) => isNumber(row.trafficPercent) && isNumber(row.searchesPercent) && (row.searchesPercent as number) >= 2)
      .map((row) => ({ row, gap: (row.trafficPercent as number) - (row.searchesPercent as number) }))
      .filter((one) => Math.abs(one.gap) >= 4);
    for (const way of [1, -1]) {
      const one = gaps.filter((entry) => entry.gap * way > 0 && entry.row !== top).sort((left, right) => Math.abs(right.gap) - Math.abs(left.gap))[0];
      if (one) found.push(versus(`gap:${way}`, named(one.row)!, "trafficPercent", one.row.trafficPercent as number, one.row.searchesPercent as number, itsSearches, 1.0 + Math.min(0.5, Math.abs(one.gap) / 30)));
    }
    // Sections far above or below the whole website in the share of their searches in Google's top three.
    const site = numberIn(whole, "top3Percent");
    if (site !== null) {
      const apart = sections.filter((row) => isNumber(row.top3Percent) && (numberIn(row, "keywords") ?? 0) >= 20)
        .map((row) => ({ row, gap: (row.top3Percent as number) - site, weight: Math.sqrt(numberIn(row, "keywords") ?? 0) }))
        .filter((one) => Math.abs(one.gap) >= 10);
      for (const way of [1, -1]) {
        const one = apart.filter((entry) => entry.gap * way > 0).sort((left, right) => Math.abs(right.gap) * right.weight - Math.abs(left.gap) * left.weight)[0];
        if (one) found.push(versus(`top3:${way}`, named(one.row)!, "top3Percent", one.row.top3Percent as number, site, text(names.wholeWebsite, "The whole website"), 0.8 + Math.min(0.4, Math.abs(one.gap) / 60)));
      }
    }
    return found;
  }

  return {
    "visibility.backlinks": { general: false, find: summaryFindings },
    "visibility.backlinksCompared": { general: false, find: comparedFindings },
    "visibility.backlinksQuality": { general: false, find: qualityFindings },
    "visibility.backlinksWhere": { general: false, find: whereFindings },
    "visibility.backlinksAnchors": { general: false, find: anchorsFindings },
    "visibility.backlinksIps": { general: false, find: ipsFindings },
    "visibility.backlinksNewLost": { general: false, find: linkChangesFindings },
    "visibility.keywords": { general: false, find: keywordsFindings },
    "visibility.keywordsBands": { general: false, find: bandsFindings },
    "visibility.keywordRecord": { general: false, find: searchFindings },
    "visibility.keywordsNewLost": { general: false, find: newLostFindings },
    "visibility.keywordsPages": { general: false, find: pagesFindings },
    "visibility.keywordsStructure": { general: false, find: structureFindings },
  };
}

// ===========================================================================================================================
// End of Backlinks and Keywords.
// ===========================================================================================================================
