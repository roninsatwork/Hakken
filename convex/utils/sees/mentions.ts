import { seen, toPage, toRecord, type Seen, type SeenPhrase, type SeenStep } from "../hakkenSees";

/**
 * What Hakken sees on the Web mentions screens (docs/plans/active/discovery-
 * detail-and-hakken-sees-plan.md §6, "Web mentions"): fixed rules over each
 * screen's own result, most important first.
 */

type Maybe<T> = T | null;

/** A page naming you without a link is worth asking for one from this strength up, as All mentions marks it. */
export const WORTH_ASKING = 100;

/** A mention's tone, as filed: 0 neutral, 1 well, 2 badly. */
const BADLY = 2;

const DAY_MS = 86_400_000;

/** Web mentions → All mentions: new pages naming you, those speaking badly, and those worth asking for a link. */
export function webMentionsSees(
  result: { rows: ReadonlyArray<{ url: string; host: string; day: string; tone: number; strength: number; linked: number }> },
  today: string,
): Seen {
  if (result.rows.length === 0) return seen([{ code: "none" }]);
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * DAY_MS).toISOString().slice(0, 10);
  const recent = result.rows.filter((row) => row.day >= since);
  const badly = recent.filter((row) => row.tone === BADLY).sort((left, right) => right.day.localeCompare(left.day));
  const ask = result.rows.filter((row) => !row.linked && row.tone !== BADLY && row.strength >= WORTH_ASKING).sort((left, right) => right.strength - left.strength);
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "newPages", a: recent.length, b: result.rows.length },
    badly[0] ? { code: "badly", a: badly.length, text: badly[0].host } : null,
    ask[0] ? { code: "noLink", a: ask.length, text: ask[0].host } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    badly[0] ? { code: "reply", text: badly[0].host, link: "visitPage", to: { url: badly[0].url } } : null,
    ask[0] ? { code: "askForLink", text: ask[0].host, link: "visitPage", to: { url: ask[0].url } } : null,
  ];
  return seen(says, steps);
}

/** Web mentions → Against rivals: your share of the pages naming a business, who leads, and the month's change. */
export function mentionsRivalsSees(result: { businesses: ReadonlyArray<{ host: string; you: boolean; mentions: number; before: number }> }): Seen {
  const total = result.businesses.reduce((sum, row) => sum + row.mentions, 0);
  const you = result.businesses.find((row) => row.you);
  if (!you || total === 0) return seen([{ code: "none" }]);
  const share = (mentions: number) => Math.round((mentions / total) * 100);
  // On a tie you lead: being level is not being behind.
  const leader = [...result.businesses].sort((left, right) => right.mentions - left.mentions || Number(right.you) - Number(left.you))[0];
  const moved = you.mentions - you.before;
  const says: Array<Maybe<SeenPhrase>> = [
    leader.you ? { code: "lead", a: share(you.mentions) } : { code: "behind", a: share(you.mentions), b: share(leader.mentions), text: leader.host },
    moved !== 0 ? { code: moved > 0 ? "upMonth" : "downMonth", a: Math.abs(moved) } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    leader.you ? null : { code: "seeLeader", text: leader.host, link: "seeBusiness", to: toRecord("business", leader.host.toLowerCase().replace(/^www\./, "")) },
    { code: "getListed", link: "whereToGetListed", to: toPage("mentions/listed") },
  ];
  return seen(says, steps);
}

/** Web mentions → Where to get listed: the places rivals are and you are not, the strongest, and those every rival is on. */
export function whereListedSees(result: { rows: ReadonlyArray<{ host: string; rivals: readonly string[]; strength: number | null; there: boolean }> }): Seen {
  if (result.rows.length === 0) return seen([{ code: "none" }]);
  const missing = result.rows.filter((row) => !row.there && row.rivals.length > 0)
    .sort((left, right) => right.rivals.length - left.rivals.length || (right.strength ?? 0) - (left.strength ?? 0));
  if (missing.length === 0) return seen([{ code: "everywhere", a: result.rows.length }]);
  const strongest = [...missing].sort((left, right) => (right.strength ?? 0) - (left.strength ?? 0))[0];
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "places", a: missing.length, b: result.rows.length },
    missing[0].rivals.length > 1 ? { code: "mostRivals", text: missing[0].host, a: missing[0].rivals.length } : null,
    strongest.strength !== null && strongest !== missing[0] ? { code: "strongest", text: strongest.host, a: strongest.strength } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    { code: "getOnto", text: missing[0].host, link: "seeWebsite", to: toRecord("website", missing[0].host) },
    strongest !== missing[0] ? { code: "getOnto", text: strongest.host, link: "seeWebsite", to: toRecord("website", strongest.host) } : null,
  ];
  return seen(says, steps);
}
