import { couldBeChance } from "../insightEditor";

/**
 * What the figures show, found by code (docs/plans/active/sees-findings-in-code-plan-2026-10-31.md, phase 1;
 * Anthony, 2026-10-31: "do we need AI for a lot of this, could we do this in code better"). General rules, the
 * same for every website, over the Conversions map's views as `agentReads.readMapView` gives them: the drop
 * between a shop's steps; a group far above or below the website's rate; the groups that moved most; the visits
 * it took for one conversion; and a gap between devices too big to be behaviour. Each finding is scored by its
 * size, the share of visits it covers, and whether it could be chance, and the best go forward — to the panel, at
 * once, and to the team, which writes them up. Never a list of anyone's notes: rules only. No database here.
 */

/** One view of the map, as `readMapView` returns it once read. */
export type FindingView = {
  by: "kind" | "channel" | "device" | "country";
  visits: ReadonlyArray<{ column: string; visits: number; visitsBefore?: number | null }>;
  everyConversionTogether: ReadonlyArray<{ column: string; conversionsPerVisit: number | null; conversionsPerVisitBefore?: number | null }>;
  conversions: ReadonlyArray<{
    event: string;
    visitsThatDidIt: number;
    visitsThatDidItBefore?: number | null;
    visitsForOne: number | null;
    visitsForOneBefore?: number | null;
    by: ReadonlyArray<{ column: string; visitsThatDidIt: number; ratePercent: number | null; ratePercentBefore?: number | null }>;
  }>;
  shopSteps?: ReadonlyArray<{ step: string; wentOnPercent: number | null; wentOnPercentBefore?: number | null }>;
};

export type FindingKind = "visitsForOne" | "step" | "groupAbove" | "groupBelow" | "rose" | "fell" | "trackingGap";

/** A figure a finding names, keyed so the team names it and the Editor fills it in. */
export type FindingFact = { key: string; value: number; unit: "count" | "percent" | "ratio" | "score"; label: string };

export type Finding = {
  /** Stable for the same finding on the same figures: what it is about, never its words. */
  id: string;
  kind: FindingKind;
  score: number;
  /** What the words are built from: names (an event's Google name, a group, the view) and figures. */
  params: Record<string, string | number>;
  facts: FindingFact[];
};

/** Findings carried forward at most: the panel's first section and the team's to write up. */
export const MOST_FINDINGS = 6;
/** At most this many from one view, so one view's groups never fill the list. */
const MOST_FROM_A_VIEW = 2;
/** A group needs this share of the website's visits, or this many, before its rate is weighed. */
const TRUSTED_SHARE = 0.02;
const TRUSTED_VISITS = 100;
/** How far from the website's rate a group must be to be called above or below it: half as much again, or two-thirds. */
const ABOVE = 1.5;
const BELOW = 1 / 1.5;
/** A move worth saying: a third or more, and half a point or more. */
const MOVE_SHARE = 1 / 3;
const MOVE_POINTS = 0.5;
/** A gap between devices this many times over is checked as tracking before it is called behaviour. */
const TRACKING_GAP = 3;
/** Columns that are no group a person can act on. */
const NOT_A_GROUP = new Set(["no page recorded", "other kinds of page", "unclassified", "(not set)", "(other)"]);
/** A shop's purchase, as Google names it: the conversion a shop is judged by first. */
const PURCHASE = "purchase";

const round1 = (value: number) => Math.round(value * 10) / 10;
/** How much a group's share of visits counts: full from a twentieth of the website, less below — a small group far off is still worth saying. */
const REACH_FULL = 0.05;
const reach = (share: number) => Math.sqrt(Math.min(1, share / REACH_FULL));
/** A step's weight: the visits it loses, of every visit, against the share that converts — so many times, to at most this. */
const LOST_WEIGHT = 0.6;
const LOST_MOST = 1.5;

/**
 * The best findings in the views, most worth saying first: at most `MOST_FINDINGS`, at most two from one view. The
 * conversion weighed first is a shop's purchase, else the website's busiest conversion; every conversion together
 * comes next; the others after.
 */
export function findingsFrom(views: readonly FindingView[]): Finding[] {
  if (views.length === 0) return [];
  const found: Array<Finding & { view?: string }> = [];
  const first = views[0];
  const main = first.conversions.find((one) => one.event === PURCHASE) ?? [...first.conversions].sort((a, b) => b.visitsThatDidIt - a.visitsThatDidIt)[0];
  const weightOf = (event: string) => (event === main?.event ? 1 : event === "*" ? 0.9 : 0.6);

  // The visits it took for one, as the page's chart counts them: always worth a line when it moved.
  if (main && main.visitsForOne !== null) {
    const before = main.visitsForOneBefore ?? null;
    const moved = before ? Math.abs(main.visitsForOne - before) / before : 0;
    found.push({
      id: `visitsForOne:${main.event}`,
      kind: "visitsForOne",
      score: 0.5 + Math.min(1, moved) * 0.5,
      params: { event: main.event, visits: main.visitsForOne, ...(before !== null ? { visitsBefore: before } : {}) },
      facts: [
        { key: "visits", value: main.visitsForOne, unit: "ratio", label: `visits for one ${main.event}` },
        ...(before !== null ? [{ key: "visitsBefore", value: before, unit: "ratio" as const, label: `visits for one ${main.event}, the span before` }] : []),
      ],
    });
  }

  // A shop's steps, each into the next, weighed by the visits lost there — of every visit to the website, against
  // the share that ends up converting: a step losing more visits than ever convert matters most. Worse than before,
  // more still. Said as people read the map down a column: "14.3% of visits add to basket, 6.3% start checkout".
  const stepView = views.find((view) => view.shopSteps && view.shopSteps.length > 0);
  const stepVisits = stepView ? stepView.visits.reduce((sum, column) => sum + column.visits, 0) : 0;
  const shareOf = (event: string) => {
    const did = stepView?.conversions.find((one) => one.event === event)?.visitsThatDidIt;
    return did !== undefined && stepVisits > 0 ? (did / stepVisits) * 100 : null;
  };
  const mainShare = main ? shareOf(main.event) : null;
  for (const step of stepView?.shopSteps ?? []) {
    if (step.wentOnPercent === null) continue;
    const [from, to] = step.step.split(" to ");
    const before = step.wentOnPercentBefore ?? null;
    const worse = before !== null && step.wentOnPercent < before;
    const fromShare = shareOf(from);
    const toShare = shareOf(to);
    const shares = fromShare !== null && toShare !== null && fromShare >= toShare ? { fromShare: round1(fromShare), toShare: round1(toShare), lost: round1(fromShare - toShare) } : null;
    const weight = shares && mainShare ? Math.min(LOST_MOST, ((fromShare! - toShare!) / mainShare) * LOST_WEIGHT) : (1 - step.wentOnPercent / 100) * 0.9;
    found.push({
      id: `step:${step.step}`,
      kind: "step",
      score: weight + (worse ? 0.2 : 0),
      params: { from, to, wentOn: step.wentOnPercent, ...(before !== null ? { wentOnBefore: before } : {}), ...(shares ?? {}) },
      facts: [
        ...(shares
          ? [
              { key: "fromShare", value: shares.fromShare, unit: "percent" as const, label: `of every visit to the website, the share that did ${from}` },
              { key: "toShare", value: shares.toShare, unit: "percent" as const, label: `of every visit to the website, the share that did ${to}` },
              { key: "lost", value: shares.lost, unit: "count" as const, label: `visits in every 100 lost between ${from} and ${to}` },
            ]
          : []),
        { key: "wentOn", value: step.wentOnPercent, unit: "percent", label: `of visits that did ${from}, the share that went on to ${to}` },
        ...(before !== null ? [{ key: "wentOnBefore", value: before, unit: "percent" as const, label: `the same, the span before` }] : []),
      ],
    });
  }

  for (const view of views) {
    const visitsOf = new Map(view.visits.map((column) => [column.column, column.visits]));
    const visitsBeforeOf = new Map(view.visits.map((column) => [column.column, column.visitsBefore ?? null]));
    const siteVisits = view.visits.reduce((sum, column) => sum + column.visits, 0);
    if (siteVisits <= 0) continue;
    const trusted = Math.max(TRUSTED_VISITS, Math.round(siteVisits * TRUSTED_SHARE));
    const fair = (column: string) => !NOT_A_GROUP.has(column.toLowerCase()) && (visitsOf.get(column) ?? 0) >= trusted;

    // Each conversion's groups against the website's own rate, and against their own span before.
    const rows = view.conversions.map((conversion) => ({
      event: conversion.event,
      siteRate: (conversion.visitsThatDidIt / siteVisits) * 100,
      cells: conversion.by.map((cell) => ({ column: cell.column, did: cell.visitsThatDidIt, rate: cell.ratePercent, rateBefore: cell.ratePercentBefore ?? null })),
    }));
    // Every conversion together, a visit: the same weighing, its unit conversions a visit.
    const togetherSite = view.everyConversionTogether.reduce((sum, one) => sum + (one.conversionsPerVisit ?? 0) * (visitsOf.get(one.column) ?? 0), 0) / siteVisits;

    for (const row of rows) {
      if (row.siteRate <= 0) continue;
      for (const cell of row.cells) {
        if (!fair(cell.column) || cell.rate === null) continue;
        const visits = visitsOf.get(cell.column) ?? 0;
        const share = visits / siteVisits;
        const ratio = cell.rate / row.siteRate;
        // Chance: the visits that did it against what the website's rate would give the group.
        const expected = (row.siteRate / 100) * visits;
        if ((ratio >= ABOVE || ratio <= BELOW) && cell.rate > 0 && !couldBeChance(cell.did, expected)) {
          const above = ratio >= ABOVE;
          found.push({
            id: `${above ? "above" : "below"}:${view.by}:${row.event}:${cell.column}`,
            kind: above ? "groupAbove" : "groupBelow",
            score: Math.abs(Math.log2(ratio)) * reach(share) * weightOf(row.event),
            params: { by: view.by, group: cell.column, event: row.event, rate: cell.rate, siteRate: round1(row.siteRate) },
            facts: [
              { key: "rate", value: cell.rate, unit: "percent", label: `${cell.column}: share of its visits that did ${row.event}` },
              { key: "siteRate", value: round1(row.siteRate), unit: "percent", label: `the website: share of its visits that did ${row.event}` },
            ],
            view: view.by,
          });
        }
        // A move: a third or more, half a point or more, and more than chance between the two spans' counts.
        const visitsBefore = visitsBeforeOf.get(cell.column) ?? null;
        if (cell.rateBefore !== null && cell.rateBefore > 0 && visitsBefore) {
          const change = cell.rate - cell.rateBefore;
          const didBefore = (cell.rateBefore / 100) * visitsBefore;
          const scaledBefore = visitsBefore > 0 ? didBefore * (visits / visitsBefore) : didBefore;
          if (Math.abs(change) / cell.rateBefore >= MOVE_SHARE && Math.abs(change) >= MOVE_POINTS && !couldBeChance(cell.did, scaledBefore)) {
            const rose = change > 0;
            found.push({
              id: `${rose ? "rose" : "fell"}:${view.by}:${row.event}:${cell.column}`,
              kind: rose ? "rose" : "fell",
              score: (Math.abs(change) / cell.rateBefore) * reach(share) * weightOf(row.event) * 0.8,
              params: { by: view.by, group: cell.column, event: row.event, rate: cell.rate, rateBefore: cell.rateBefore },
              facts: [
                { key: "rate", value: cell.rate, unit: "percent", label: `${cell.column}: share of its visits that did ${row.event}` },
                { key: "rateBefore", value: cell.rateBefore, unit: "percent", label: `the same, the span before` },
              ],
              view: view.by,
            });
          }
        }
      }
      // Devices far apart on one conversion: tracking is checked before the gap is called behaviour.
      if (view.by === "device") {
        const rated = row.cells.filter((cell) => fair(cell.column) && cell.rate !== null && cell.rate > 0) as Array<{ column: string; did: number; rate: number }>;
        if (rated.length >= 2) {
          const sorted = [...rated].sort((a, b) => b.rate - a.rate);
          const high = sorted[0], low = sorted[sorted.length - 1];
          if (high.rate / low.rate >= TRACKING_GAP) {
            found.push({
              id: `trackingGap:${row.event}:${high.column}:${low.column}`,
              kind: "trackingGap",
              score: 0.7 * weightOf(row.event) + 0.1,
              params: { event: row.event, high: high.column, highRate: high.rate, low: low.column, lowRate: low.rate },
              facts: [
                { key: "highRate", value: high.rate, unit: "percent", label: `${high.column}: share of its visits that did ${row.event}` },
                { key: "lowRate", value: low.rate, unit: "percent", label: `${low.column}: share of its visits that did ${row.event}` },
              ],
              view: view.by,
            });
          }
        }
      }
    }

    // Every conversion together, a visit: the groups far above or below the website.
    if (togetherSite > 0) {
      for (const one of view.everyConversionTogether) {
        if (!fair(one.column) || one.conversionsPerVisit === null) continue;
        const ratio = one.conversionsPerVisit / togetherSite;
        if (ratio < ABOVE && ratio > BELOW) continue;
        const share = (visitsOf.get(one.column) ?? 0) / siteVisits;
        const above = ratio >= ABOVE;
        found.push({
          id: `${above ? "above" : "below"}:${view.by}:*:${one.column}`,
          kind: above ? "groupAbove" : "groupBelow",
          score: Math.abs(Math.log2(ratio)) * reach(share) * weightOf("*"),
          params: { by: view.by, group: one.column, event: "*", perVisit: one.conversionsPerVisit, sitePerVisit: Math.round(togetherSite * 100) / 100 },
          facts: [
            { key: "perVisit", value: one.conversionsPerVisit, unit: "score", label: `${one.column}: conversions a visit` },
            { key: "sitePerVisit", value: Math.round(togetherSite * 100) / 100, unit: "score", label: "the website: conversions a visit" },
          ],
          view: view.by,
        });
      }
    }
  }

  // A device gap checked as tracking says it once: the same devices' above and below for that conversion go.
  const gaps = new Set(found.filter((one) => one.kind === "trackingGap").map((one) => String(one.params.event)));
  for (let at = found.length - 1; at >= 0; at -= 1) {
    const one = found[at];
    if (one.view === "device" && (one.kind === "groupAbove" || one.kind === "groupBelow") && gaps.has(String(one.params.event))) found.splice(at, 1);
  }

  // The best first; never more than two from one view, never the same group twice. The visits it took for one is the
  // page's own headline, so it always keeps a place.
  const chosen: Finding[] = [];
  const headline = found.find((one) => one.kind === "visitsForOne");
  const fromView = new Map<string, number>();
  const groups = new Set<string>();
  for (const finding of found.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))) {
    // Room for the rest leaves the headline's place free, wherever it ranks.
    if (finding !== headline && chosen.filter((one) => one.kind !== "visitsForOne").length >= MOST_FINDINGS - (headline ? 1 : 0)) continue;
    const group = typeof finding.params.group === "string" ? `${finding.view}:${finding.params.group}` : null;
    if (finding.view && (fromView.get(finding.view) ?? 0) >= MOST_FROM_A_VIEW) continue;
    if (group && groups.has(group)) continue;
    if (finding.view) fromView.set(finding.view, (fromView.get(finding.view) ?? 0) + 1);
    if (group) groups.add(group);
    const { view: _view, ...kept } = finding;
    void _view;
    chosen.push({ ...kept, score: Math.round(kept.score * 1000) / 1000 });
  }
  // Their facts keyed in order, so the team names "f1.rate" and the Editor fills it in.
  return chosen.map((finding, at) => ({ ...finding, facts: finding.facts.map((fact) => ({ ...fact, key: `f${at + 1}.${fact.key}` })) }));
}

/** An event's Google name in plain words, for a model to read: "add_to_cart" → "add to cart"; every conversion together named so. */
const eventWords = (event: string | number) => (event === "*" ? "every conversion together" : String(event).replace(/_/g, " "));
const viewWords: Record<string, string> = { channel: "channel", kind: "kind of page", device: "device", country: "country" };

/**
 * A finding as one plain English sentence, for Jev to judge and the team to read beside its keys. Never shown to a
 * client: the panel builds its words from the catalogue (`googleAnalytics.findings`), in the reader's language.
 */
export function findingWords(finding: Pick<Finding, "kind" | "params">): string {
  const p = finding.params;
  const by = viewWords[String(p.by)] ?? String(p.by);
  switch (finding.kind) {
    case "visitsForOne":
      return `It took ${p.visits} visits for one ${eventWords(p.event)}${p.visitsBefore !== undefined ? `, against ${p.visitsBefore} the span before` : ""}.`;
    case "step":
      return `${p.fromShare !== undefined ? `${p.fromShare}% of all visits did ${eventWords(p.from)} and ${p.toShare}% did ${eventWords(p.to)}: ${p.lost} visits in every 100 lost at this step. ` : ""}Of the visits that did ${eventWords(p.from)}, ${p.wentOn}% went on to ${eventWords(p.to)}${p.wentOnBefore !== undefined ? `, against ${p.wentOnBefore}% the span before` : ""}.`;
    case "groupAbove":
    case "groupBelow": {
      const direction = finding.kind === "groupAbove" ? "above" : "below";
      return p.event === "*"
        ? `The ${by} ${p.group} makes ${p.perVisit} conversions a visit, ${direction} the website's ${p.sitePerVisit}.`
        : `${p.rate}% of the ${by} ${p.group}'s visits did ${eventWords(p.event)}, ${direction} the website's ${p.siteRate}%.`;
    }
    case "rose":
    case "fell":
      return `${p.rate}% of the ${by} ${p.group}'s visits did ${eventWords(p.event)}, ${finding.kind === "rose" ? "up" : "down"} from ${p.rateBefore}% the span before.`;
    case "trackingGap":
      return `${p.highRate}% of ${p.high} visits did ${eventWords(p.event)}, against ${p.lowRate}% of ${p.low} visits.`;
  }
}
