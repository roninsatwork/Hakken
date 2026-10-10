import { seen, toPage, toRecord, type Seen, type SeenPhrase, type SeenStep } from "../utils/hakkenSees";

/**
 * What Hakken sees on Brand radar's screens (docs/plans/active/discovery-
 * detail-and-hakken-sees-plan.md §6, "Brand radar"): fixed rules over each
 * screen's own result, most important first.
 */

type Maybe<T> = T | null;

/** Brand radar → Overview: your share of Google's AI answers against the leader, and the biggest question you are missing from. */
export function radarOverviewSees(result: {
  businesses: ReadonlyArray<{ host: string; you: boolean; mentions: number | null; before: number | null }>;
  questions: ReadonlyArray<{ question: string; volume: number; you: number | null; rivals: readonly string[] }>;
}): Seen {
  const you = result.businesses.find((row) => row.you);
  if (!you || you.mentions === null) return seen([{ code: "noReading" }]);
  const total = result.businesses.reduce((sum, row) => sum + (row.mentions ?? 0), 0);
  // On a tie you lead: being level is not being behind.
  const leader = [...result.businesses].sort((left, right) => (right.mentions ?? 0) - (left.mentions ?? 0) || Number(right.you) - Number(left.you))[0];
  const share = (row: { mentions: number | null }) => (total > 0 ? Math.round(((row.mentions ?? 0) / total) * 100) : 0);
  const missing = result.questions.filter((row) => row.you === null && row.rivals.length > 0).sort((left, right) => right.volume - left.volume)[0];
  const moved = you.before === null ? 0 : you.mentions - you.before;
  const says: Array<Maybe<SeenPhrase>> = [
    leader && !leader.you
      ? { code: "behindLeader", a: you.mentions, b: share(you), c: share(leader), text: leader.host }
      : { code: "youLead", a: you.mentions, b: share(you) },
    moved !== 0 ? { code: moved > 0 ? "upMonth" : "downMonth", a: Math.abs(moved) } : null,
    missing ? { code: "missingQuestion", text: missing.question, a: missing.volume } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    missing ? { code: "answerQuestion", text: missing.question, link: "seeQuestion", to: toRecord("question", missing.question) } : null,
    leader && !leader.you ? { code: "seeLeader", text: leader.host, link: "seeBusiness", to: toRecord("business", leader.host) } : null,
  ];
  return seen(says, steps);
}

const PLACE_KINDS = new Set(["DIRECTORY", "REVIEWS", "NEWS", "FORUM", "VIDEO", "WEBSITE", "REFERENCE"]);

/** Brand radar → Websites AI cites: the websites quoted, the places your rivals are and you are not, and your own pages. */
export function radarSourcesSees(result: {
  websites: ReadonlyArray<{ host: string; kind: string; besideYou: number; besideRivals: number }>;
  yourTimes: number;
}): Seen {
  if (result.websites.length === 0) return seen([{ code: "noReading" }]);
  const places = result.websites.filter((row) => PLACE_KINDS.has(row.kind));
  const missing = places.filter((row) => row.besideYou === 0 && row.besideRivals > 0).sort((left, right) => right.besideRivals - left.besideRivals);
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "websitesQuoted", a: result.websites.length, b: result.websites.filter((row) => row.besideYou > 0).length },
    missing[0] ? { code: "placesMissing", a: missing.length, text: missing[0].host } : null,
    result.yourTimes > 0 ? { code: "ownPages", a: result.yourTimes } : { code: "ownPagesNone" },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    missing[0] ? { code: "getOnto", text: missing[0].host, link: "seeWebsite", to: toRecord("website", missing[0].host) } : null,
    missing.length > 1 ? { code: "workThrough", link: "whereToGetListed", to: toPage("mentions/listed") } : null,
  ];
  return seen(says, steps);
}

/** Brand radar → AI Overview gaps: searches showing an overview, how many quote you, and where you rank but are left out. */
export function overviewGapsSees(result: {
  quotedBefore: number | null;
  rows: ReadonlyArray<{ keyword: string; volume: number | null; position: number | null; overview: boolean; quotesYou: boolean }>;
}): Seen {
  if (result.rows.length === 0) return seen([{ code: "noChecks" }]);
  const withOverview = result.rows.filter((row) => row.overview);
  const quoted = withOverview.filter((row) => row.quotesYou).length;
  const gaps = withOverview.filter((row) => !row.quotesYou && row.position !== null && row.position <= 10).sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0));
  const gapVolume = gaps.reduce((sum, row) => sum + (row.volume ?? 0), 0);
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "overviews", a: withOverview.length, b: result.rows.length, c: quoted },
    gaps.length > 0 ? { code: "gaps", a: gaps.length, b: gapVolume } : withOverview.length > 0 ? { code: "noGaps" } : null,
    result.quotedBefore !== null && result.quotedBefore !== quoted ? { code: quoted > result.quotedBefore ? "quotedUp" : "quotedDown", a: Math.abs(quoted - result.quotedBefore) } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    gaps[0] ? { code: "fixGap", text: gaps[0].keyword, link: "seeSearch", to: toRecord("keyword", gaps[0].keyword) } : null,
  ];
  return seen(says, steps);
}
