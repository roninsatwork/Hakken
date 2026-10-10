import { seen, toPage, toRecord, type Seen, type SeenPhrase, type SeenStep } from "../hakkenSees";
import { BREAKDOWN_REST } from "../siteShapes";
import { pathOfUrl } from "../urlParts";

/**
 * What Hakken sees on the Backlinks screens (docs/plans/active/discovery-
 * detail-and-hakken-sees-plan.md §6, "Backlinks"): fixed rules over each
 * screen's own rows, most important first. The lists and the two records
 * return their box with their query; the summary, Compared with rivals, Link
 * quality, Where links come from, Referring IPs and New and lost links read
 * queries other screens share, so they run these rules over what they hold.
 */

type Maybe<T> = T | null;
type Status = "LIVE" | "NEW" | "LOST";

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const businessKey = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** The day after a chart's step: where New and lost links' rows narrow All backlinks up to. */
export function stepEnd(day: string, step: "day" | "week" | "month"): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (step === "month") date.setUTCMonth(date.getUTCMonth() + 1);
  else date.setUTCDate(date.getUTCDate() + (step === "week" ? 7 : 1));
  return date.toISOString().slice(0, 10);
}

type Point = { referringDomains?: number; backlinks?: number; brokenBacklinks?: number };

/** Backlinks → Summary: the websites linking here, their change over the dates chosen, and broken links. */
export function backlinksSummarySees(line: { points: readonly Point[]; before: Point | null } | undefined): Seen {
  const held = [...(line?.before ? [line.before] : []), ...(line?.points ?? [])].filter((point) => point.referringDomains !== undefined);
  if (held.length === 0) return seen([{ code: "none" }]);
  const latest = held.at(-1)!;
  const moved = latest.referringDomains! - held[0].referringDomains!;
  const broken = [...held].reverse().find((point) => point.brokenBacklinks !== undefined)?.brokenBacklinks ?? 0;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "linkingWebsites", a: latest.referringDomains!, b: latest.backlinks ?? 0 },
    held.length > 1 ? (moved === 0 ? { code: "steady" } : { code: moved > 0 ? "up" : "down", a: Math.abs(moved) }) : null,
    broken > 0 ? { code: "broken", a: broken } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    { code: moved < 0 ? "seeLost" : "seeNew", link: "newAndLost", to: toPage("backlinks/new-lost") },
    broken > 0 ? { code: "fixBroken", link: "brokenBacklinks", to: toPage("backlinks/broken") } : null,
  ];
  return seen(says, steps);
}

/** Backlinks → Compared with rivals: the websites linking to you against the leader's, and the strongest website. */
export function comparedSees(rows: ReadonlyArray<{ host: string; isYou: boolean; referringDomains: number | null; domainRank: number | null }>): Seen {
  const you = rows.find((row) => row.isYou);
  if (!you || you.referringDomains === null) return seen([{ code: "none" }]);
  // On a tie you lead: being level is not being behind.
  const leader = [...rows].sort((left, right) => (right.referringDomains ?? 0) - (left.referringDomains ?? 0) || Number(right.isYou) - Number(left.isYou))[0];
  const strongest = [...rows].sort((left, right) => (right.domainRank ?? 0) - (left.domainRank ?? 0) || Number(right.isYou) - Number(left.isYou))[0];
  const says: Array<Maybe<SeenPhrase>> = [
    leader.isYou ? { code: "lead", a: you.referringDomains } : { code: "behind", a: you.referringDomains, b: leader.referringDomains ?? 0, text: leader.host },
    !strongest.isYou && strongest.domainRank !== null ? { code: "strongerRank", text: strongest.host, a: strongest.domainRank, b: you.domainRank ?? 0 } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    { code: "getListed", link: "whereToGetListed", to: toPage("mentions/listed") },
    leader.isYou ? null : { code: "seeLeader", text: leader.host, link: "seeBusiness", to: toRecord("business", businessKey(leader.host)) },
  ];
  return seen(says, steps);
}

/** Backlinks → Link quality: the spam score, links to broken pages, and the share of linking websites not followed. */
export function qualitySees(profile: { spamScore: number | null; brokenBacklinks: number | null; brokenPages: number | null; nofollowReferringDomains: number | null; referringDomains: number | null } | null | undefined): Seen {
  if (!profile) return seen([{ code: "none" }]);
  const broken = profile.brokenBacklinks ?? 0;
  const says: Array<Maybe<SeenPhrase>> = [
    broken > 0 ? { code: "broken", a: broken, b: profile.brokenPages ?? 0 } : { code: "noBroken" },
    profile.spamScore !== null ? { code: "spam", a: profile.spamScore } : null,
    profile.nofollowReferringDomains !== null && (profile.referringDomains ?? 0) > 0 ? { code: "nofollow", a: profile.nofollowReferringDomains, b: profile.referringDomains! } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    broken > 0 ? { code: "fixBroken", link: "brokenBacklinks", to: toPage("backlinks/broken") } : null,
  ];
  return seen(says, steps);
}

/** Backlinks → Where links come from: the largest groups of the breakdown on screen, each a share of the links. */
export function whereLinksSees(view: { breakdown: string; groups: ReadonlyArray<{ key: string; count: number }>; total: number }, nameOf: (key: string) => string): Seen {
  const named = view.groups.filter((group) => group.key !== BREAKDOWN_REST).sort((left, right) => right.count - left.count);
  if (named.length === 0 || view.total === 0) return seen([{ code: "none" }]);
  const [first, second] = named;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "largest", text: nameOf(first.key), a: percent(first.count, view.total), b: first.count },
    second ? { code: "second", text: nameOf(second.key), a: percent(second.count, view.total) } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    { code: "seeGroup", text: nameOf(first.key), link: "seeLinks", to: toPage("backlinks/all", { group: `${view.breakdown}:${first.key}` }) },
  ];
  return seen(says, steps);
}

/** Backlinks → All backlinks: what the links listed have in common — how many, the strongest, followed, lost. */
export function allLinksSees(list: ReadonlyArray<{ domainFrom: string; urlFrom: string; dofollow: boolean; status: Status; domainRank: number }>, narrowed: boolean): Seen {
  if (list.length === 0) return seen([{ code: narrowed ? "noneMatch" : "none" }]);
  const strongest = [...list].sort((left, right) => right.domainRank - left.domainRank)[0];
  const lost = list.filter((row) => row.status === "LOST").length;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "links", a: list.length, b: new Set(list.map((row) => row.domainFrom)).size },
    { code: "strongest", text: strongest.domainFrom, a: strongest.domainRank },
    { code: "followed", a: percent(list.filter((row) => row.dofollow).length, list.length) },
    lost > 0 ? { code: "lost", a: lost } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    { code: "visitStrongest", text: strongest.domainFrom, link: "visitPage", to: { url: strongest.urlFrom } },
    lost > 0 && lost < list.length ? { code: "seeLost", a: lost, link: "lostLinks", to: toPage("backlinks/all", { status: "LOST" }) } : null,
  ];
  return seen(says, steps);
}

/** Backlinks → Referring domains: the websites linking here, the strongest, the newest, and the strongest lost. */
export function domainsSees(list: ReadonlyArray<{ domain: string; rank: number; status: Status }>): Seen {
  if (list.length === 0) return seen([{ code: "none" }]);
  const byRank = [...list].sort((left, right) => right.rank - left.rank);
  const live = byRank.filter((row) => row.status !== "LOST");
  const lost = byRank.filter((row) => row.status === "LOST");
  const fresh = list.filter((row) => row.status === "NEW").length;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "domains", a: live.length, b: list.length },
    live[0] ? { code: "strongest", text: live[0].domain, a: live[0].rank } : null,
    lost[0] ? { code: "lost", a: lost.length, text: lost[0].domain } : null,
    fresh > 0 ? { code: "new", a: fresh } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    lost[0] ? { code: "winBack", text: lost[0].domain, link: "seeDomain", to: toRecord("domain", lost[0].domain) } : null,
    live[0] ? { code: "seeStrongest", text: live[0].domain, link: "seeDomain", to: toRecord("domain", live[0].domain) } : null,
  ];
  return seen(says, steps);
}

/** Backlinks → Anchors: the words used most, and how many links use the business's name or address against other words. */
export function anchorsSees(list: ReadonlyArray<{ anchor: string; backlinks: number }>, host: string): Seen {
  const worded = list.filter((row) => row.anchor.trim() !== "").sort((left, right) => right.backlinks - left.backlinks);
  if (worded.length === 0) return seen([{ code: "none" }]);
  // The business's own name, as its website spells it: "acme" of acme.co.uk.
  const brand = host.toLowerCase().replace(/^www\./, "").split(".")[0];
  const total = list.reduce((sum, row) => sum + row.backlinks, 0);
  const named = list.filter((row) => row.anchor.toLowerCase().replace(/\s+/g, "").includes(brand)).reduce((sum, row) => sum + row.backlinks, 0);
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "top", text: worded[0].anchor, a: worded[0].backlinks },
    { code: "brand", a: percent(named, total) },
    { code: "otherWords", a: percent(total - named, total) },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    { code: "seeAnchor", text: worded[0].anchor, link: "seeAnchor", to: toRecord("anchor", worded[0].anchor) },
  ];
  return seen(says, steps);
}

/** Backlinks → Referring IPs: the networks the linking websites sit on, and the one hosting most of them. */
export function ipsSees(
  profile: { referringDomains: number | null; referringSubnets: number | null } | null | undefined,
  subnets: ReadonlyArray<{ subnet: string; referringDomains: number }>,
): Seen {
  const top = [...subnets].sort((left, right) => right.referringDomains - left.referringDomains)[0];
  if (!profile || profile.referringDomains === null || profile.referringSubnets === null || !top) return seen([{ code: "none" }]);
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "spread", a: profile.referringDomains, b: profile.referringSubnets },
    top.referringDomains > 1 ? { code: "crowded", text: top.subnet, a: top.referringDomains } : { code: "oneEach" },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    top.referringDomains > 1 ? { code: "seeNetwork", text: top.subnet, link: "seeNetwork", to: toPage("backlinks/ips", { network: top.subnet }) } : null,
    { code: "checkDomains", link: "referringDomains", to: toPage("backlinks/domains") },
  ];
  return seen(says, steps);
}

/** Backlinks → Broken backlinks: links landing on pages that no longer work, the page most linked, the strongest link. */
export function brokenSees(list: ReadonlyArray<{ pageTo: string; domainFrom: string; domainRank: number }>): Seen {
  if (list.length === 0) return seen([{ code: "none" }]);
  const pages = new Map<string, { links: number; rank: number }>();
  for (const row of list) {
    const page = pages.get(row.pageTo) ?? { links: 0, rank: 0 };
    pages.set(row.pageTo, { links: page.links + 1, rank: Math.max(page.rank, row.domainRank) });
  }
  const [topPage, top] = [...pages.entries()].sort((left, right) => right[1].links - left[1].links || right[1].rank - left[1].rank)[0];
  const strongest = [...list].sort((left, right) => right.domainRank - left.domainRank)[0];
  const path = (page: string) => (page.startsWith("http") ? pathOfUrl(page) : page || "/");
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "broken", a: list.length, b: pages.size },
    pages.size > 1 ? { code: "topPage", text: path(topPage), a: top.links } : null,
    strongest.pageTo !== topPage ? { code: "strongest", text: strongest.domainFrom, more: path(strongest.pageTo), a: strongest.domainRank } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    { code: "putBack", text: path(topPage), link: "seePage", to: toRecord("page", path(topPage)) },
    strongest.pageTo !== topPage ? { code: "putBack", text: path(strongest.pageTo), link: "seePage", to: toRecord("page", path(strongest.pageTo)) } : null,
  ];
  return seen(says, steps);
}

/** Backlinks → New and lost links: linking websites gained against lost, and the step that lost (or gained) most. */
export function newLostSees(
  rows: ReadonlyArray<{ day: string; newReferringDomains: number; lostReferringDomains: number }>,
  step: "day" | "week" | "month",
  dayName: (day: string) => string,
): Seen {
  const gained = rows.reduce((sum, row) => sum + row.newReferringDomains, 0);
  const lost = rows.reduce((sum, row) => sum + row.lostReferringDomains, 0);
  if (gained === 0 && lost === 0) return seen([{ code: "none" }]);
  const worst = [...rows].sort((left, right) => right.lostReferringDomains - left.lostReferringDomains)[0];
  const best = [...rows].sort((left, right) => right.newReferringDomains - left.newReferringDomains)[0];
  const lead = lost > 0 ? worst : best;
  // Each sentence names the stretch as the chart steps it: a day, a week, a month.
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "gainedLost", a: gained, b: lost },
    lost > 0 ? { code: `mostLost.${step}`, text: dayName(worst.day), a: worst.lostReferringDomains } : null,
    gained > 0 ? { code: `mostGained.${step}`, text: dayName(best.day), a: best.newReferringDomains } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    { code: `${lost > 0 ? "seeLostThen" : "seeGainedThen"}.${step}`, text: dayName(lead.day), link: "seeLinks", to: toPage("backlinks/all", { changedFrom: lead.day, changedUntil: stepEnd(lead.day, step) }) },
  ];
  return seen(says, steps);
}

type Link = { urlFrom: string; pageTo: string; dofollow: boolean; domainRank: number; pageRank: number | null; status: Status };

/** The link a record leads with: the strongest page, then the strongest website. */
const strongestLink = (links: readonly Link[]) => [...links].sort((left, right) => (right.pageRank ?? 0) - (left.pageRank ?? 0) || right.domainRank - left.domainRank)[0] ?? null;

/** Backlinks → one linking website: its links here, how many are followed, and whether it has gone. */
export function domainRecordSees(record: { domain: string; website: { backlinks: number; status: Status; spamScore: number | null } | null; links: readonly Link[] }): Seen {
  if (!record.website) return seen([{ code: "notHeld", text: record.domain }]);
  const best = strongestLink(record.links);
  const says: Array<Maybe<SeenPhrase>> = [
    record.website.status === "LOST" ? { code: "lost", text: record.domain } : null,
    { code: record.website.status === "LOST" ? "linked" : "links", text: record.domain, a: record.website.backlinks, b: record.links.filter((link) => link.dofollow).length },
    record.website.spamScore !== null ? { code: "spam", a: record.website.spamScore } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    best ? { code: record.website.status === "LOST" ? "askBack" : "seeLink", text: record.domain, link: "visitPage", to: { url: best.urlFrom } } : null,
  ];
  return seen(says, steps);
}

/** Backlinks → one anchor: the links using the words, the websites, and the page they point at most. */
export function anchorRecordSees(record: { anchor: string; summary: { backlinks: number; referringDomains: number } | null; links: readonly Link[] }): Seen {
  if (!record.summary) return seen([{ code: "notHeld", text: record.anchor }]);
  const pages = new Map<string, number>();
  for (const link of record.links) pages.set(link.pageTo, (pages.get(link.pageTo) ?? 0) + 1);
  const top = [...pages.entries()].sort((left, right) => right[1] - left[1])[0];
  const best = strongestLink(record.links);
  const path = (page: string) => (page.startsWith("http") ? pathOfUrl(page) : page || "/");
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "links", text: record.anchor, a: record.summary.backlinks, b: record.summary.referringDomains },
    top ? { code: "page", text: path(top[0]), a: top[1] } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    best ? { code: "seeLink", link: "visitPage", to: { url: best.urlFrom } } : null,
  ];
  return seen(says, steps);
}
