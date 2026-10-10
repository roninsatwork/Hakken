import { seen, toPage, toRecord, type Seen, type SeenPhrase, type SeenStep } from "../utils/hakkenSees";

/**
 * What Hakken sees on the Competitors screens (docs/plans/active/discovery-
 * detail-and-hakken-sees-plan.md §6, "Competitors"): fixed rules over each
 * screen's own rows, most important first. Side by side, Organic competitors,
 * Market map and Suggested competitors read plain lists, so their screens run
 * these rules over the rows they hold; One rival and Content gap return theirs.
 */

type Maybe<T> = T | null;

const businessKey = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** Competitors → Side by side: the rival beating you on most searches, and how many you lead. */
export function sideBySideSees(
  rivals: ReadonlyArray<{ host: string; beatsYouOn: number; youBeatOn: number; comparedOn: number }>,
  rivalKey: (host: string) => string | null,
): Seen {
  if (rivals.length === 0) return seen([{ code: "noRivals" }], [{ code: "findRivals", link: "suggestedCompetitors", to: toPage("competitors/suggested") }]);
  const compared = rivals.filter((rival) => rival.comparedOn > 0);
  if (compared.length === 0) return seen([{ code: "notCompared", a: rivals.length }]);
  const trailing = [...compared].sort((left, right) => right.beatsYouOn - right.youBeatOn - (left.beatsYouOn - left.youBeatOn))[0];
  const leading = compared.filter((rival) => rival.youBeatOn > rival.beatsYouOn).length;
  const key = rivalKey(trailing.host);
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "leadOver", a: leading, b: compared.length },
    trailing.beatsYouOn > trailing.youBeatOn ? { code: "trailMost", text: trailing.host, a: trailing.beatsYouOn, b: trailing.youBeatOn } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    trailing.beatsYouOn > trailing.youBeatOn && key ? { code: "seeRival", text: trailing.host, link: "seeRival", to: toRecord("rival", key) } : null,
    { code: "seeGap", link: "contentGap", to: toPage("competitors/gap") },
  ];
  return seen(says, steps);
}

/** Competitors → one rival: the searches it beats you on, and the biggest of them. */
export function rivalSees(shared: ReadonlyArray<{ keyword: string; theirPosition: number; yourPosition: number; volume: number | null }>): Seen {
  if (shared.length === 0) return seen([{ code: "noneShared" }], [{ code: "seeGap", link: "contentGap", to: toPage("competitors/gap") }]);
  const beaten = shared.filter((row) => row.theirPosition < row.yourPosition).sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0));
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "shared", a: shared.length, b: beaten.length },
    beaten[0] ? { code: "biggest", text: beaten[0].keyword, a: beaten[0].theirPosition, b: beaten[0].yourPosition } : { code: "aheadOnAll" },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    beaten[0] ? { code: "seeSearch", text: beaten[0].keyword, link: "seeSearch", to: toRecord("keyword", beaten[0].keyword) } : null,
    { code: "seeGap", link: "contentGap", to: toPage("competitors/gap") },
  ];
  return seen(says, steps);
}

/** Competitors → Organic competitors: the websites sharing most of your searches that you do not watch. */
export function organicCompetitorsSees(rows: ReadonlyArray<{ host: string; intersections: number; tracked: boolean }>): Seen {
  if (rows.length === 0) return seen([{ code: "none" }]);
  const unwatched = rows.filter((row) => !row.tracked).sort((left, right) => right.intersections - left.intersections);
  const top = [...rows].sort((left, right) => right.intersections - left.intersections)[0];
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "sharing", a: rows.length, text: top.host, b: top.intersections },
    unwatched[0] ? { code: "unwatched", a: unwatched.length, text: unwatched[0].host } : { code: "allWatched" },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    unwatched[0] ? { code: "lookAt", text: unwatched[0].host, link: "seeBusiness", to: toRecord("business", businessKey(unwatched[0].host)) } : null,
  ];
  return seen(says, steps);
}

/** Competitors → Content gap: the searches rivals rank for and you do not, the biggest, and those every rival has. */
export function contentGapSees(rows: ReadonlyArray<{ keyword: string; volume: number | null; rivals: readonly unknown[] }>, rivals: number): Seen {
  if (rows.length === 0) return seen([{ code: "none" }]);
  const biggest = [...rows].sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0))[0];
  const everyRival = rivals > 1 ? rows.filter((row) => row.rivals.length >= rivals).length : 0;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "gap", a: rows.length },
    { code: "biggest", text: biggest.keyword, a: biggest.volume ?? 0 },
    everyRival > 0 ? { code: "everyRival", a: everyRival, b: rivals } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    { code: "seeSearch", text: biggest.keyword, link: "seeSearch", to: toRecord("keyword", biggest.keyword) },
  ];
  return seen(says, steps);
}

/** Competitors → Market map: your place by visits, and the website just above you. */
export function marketMapSees(rows: ReadonlyArray<{ host: string; role: "YOU" | "RIVAL" | "FOUND"; traffic: number | null }>): Seen {
  const you = rows.find((row) => row.role === "YOU");
  if (!you || you.traffic === null) return seen([{ code: "none" }]);
  const byTraffic = rows.filter((row) => row.traffic !== null).sort((left, right) => right.traffic! - left.traffic! || Number(right.role === "YOU") - Number(left.role === "YOU"));
  const place = byTraffic.indexOf(you) + 1;
  const above = place > 1 ? byTraffic[place - 2] : null;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "place", a: place, b: byTraffic.length },
    above ? { code: "justAbove", text: above.host, a: above.traffic!, b: you.traffic } : { code: "top" },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    above ? { code: "lookAt", text: above.host, link: "seeBusiness", to: toRecord("business", businessKey(above.host)) } : null,
  ];
  return seen(says, steps);
}

/** Competitors → Suggested competitors: why each is suggested, and the strongest of them. */
export function suggestedSees(rows: ReadonlyArray<{ host: string; reason: "NAMED_BY_AI" | "RANKS_FOR_YOUR_SEARCHES"; times: number | null; intersections: number | null }>): Seen {
  if (rows.length === 0) return seen([{ code: "none" }]);
  const byAi = rows.filter((row) => row.reason === "NAMED_BY_AI").sort((left, right) => (right.times ?? 0) - (left.times ?? 0));
  const bySearch = rows.filter((row) => row.reason === "RANKS_FOR_YOUR_SEARCHES").sort((left, right) => (right.intersections ?? 0) - (left.intersections ?? 0));
  const lead = byAi[0] ?? bySearch[0];
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "reasons", a: byAi.length, b: bySearch.length },
    byAi[0] ? { code: "strongestAi", text: byAi[0].host, a: byAi[0].times ?? 0 } : null,
    bySearch[0] ? { code: "strongestSearch", text: bySearch[0].host, a: bySearch[0].intersections ?? 0 } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    { code: "lookAt", text: lead.host, link: "seeWebsite", to: toRecord("website", lead.host) },
  ];
  return seen(says, steps);
}
