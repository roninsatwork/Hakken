import type { FindingFact } from "../findings";
import { isNumber, isRow, named, partWithFacts, rowsOf, withRowNames, type OwnFound, type Row } from "./shared";
import { vsBeside } from "./visibilityMarket";

// ===========================================================================================================================
// Backlinks' lists and records (visibility-16-eyes, 22 November 2026; Anthony: "Yes, build them"): Linking websites, a
// linking website's own screen, Broken backlinks, All backlinks and an anchor's own screen. Each shows the newest list
// whatever the dates, so every rule sets a part against its whole (a website's links against every link) or a figure
// against the whole profile's, never a span against the one before. What each screen hands its eye is built in
// `eyeData/visibilityLinkLists.ts`; every rule runs on every period in `visibilityRestPeriods.test.ts`.
// ===========================================================================================================================

const partOf = (data: Row, name: string): Row => (isRow(data[name]) ? (data[name] as Row) : {});
const numberIn = (row: Row, field: string): number | null => (isNumber(row[field]) ? (row[field] as number) : null);
/** A name the screen handed in its own words, or the English it would have said. */
function nameIn(data: Row, key: string, fallback: string): string {
  const names = partOf(data, "names");
  return typeof names[key] === "string" && (names[key] as string).trim() ? (names[key] as string).trim() : fallback;
}
/** The rows of a list with a name and the figure, the most first. */
const mostFirst = (rows: readonly Row[], field: string) => rows.filter((row) => named(row) && isNumber(row[field])).sort((left, right) => (right[field] as number) - (left[field] as number));
const rankFact = (row: Row): FindingFact[] => (isNumber(row.domainRank) ? [{ key: "domainRank", value: row.domainRank as number, unit: "score", label: `${named(row)}: domain rank` }] : []);
/** Up to three names joined, as a finding names a few rows of a list: the brief keeps each one (`findingNames`). */
const fewNames = (rows: readonly Row[]) => rows.slice(0, 3).map((row) => named(row)!).join(", ");

/** A share too small to be news on a screen's first page: under this. */
const LEAST_SHARE = 0.05;

// ---------------------------------------------------------------------------------------------------------------------------
// Linking websites (`backlinks/domains`).
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * The websites linking now of every one seen (the headline); those that stopped; the website giving the most links and
 * the three giving the most, each against every link; and the strongest website where it isn't the one giving most.
 */
function linkingWebsitesFindings(data: Row): OwnFound[] {
  const linking = partOf(data, "linking");
  const rows = rowsOf(data.domains).filter((row) => named(row));
  const found: OwnFound[] = [];
  const now = numberIn(linking, "now");
  const ever = numberIn(linking, "ever");
  if (now !== null && ever !== null && ever > 0) found.push(partWithFacts("linking", nameIn(data, "linkingNow", "Websites linking to you now"), "referringDomains", now, ever, 2));
  const stopped = numberIn(linking, "stopped") ?? 0;
  if (stopped > 0 && ever !== null && ever > 0) found.push(partWithFacts("stopped", nameIn(data, "stoppedLinking", "Websites that stopped linking"), "referringDomains", stopped, ever, 1.3 + Math.min(0.4, stopped / ever)));
  const every = numberIn(linking, "backlinks");
  const byLinks = mostFirst(rows, "backlinks");
  if (every !== null && every > 0 && byLinks.length > 0) {
    const top = byLinks[0];
    const share = (top.backlinks as number) / every;
    if (share >= LEAST_SHARE) found.push(partWithFacts("biggest", named(top)!, "backlinks", top.backlinks as number, every, 1.4 + Math.min(0.5, share), { extra: rankFact(top) }));
    // A few websites giving most of the links: a footer credit on every page of theirs, not many websites vouching.
    const three = byLinks.slice(0, 3);
    const sum = three.reduce((total, row) => total + (row.backlinks as number), 0);
    if (three.length === 3 && sum / every >= 3 * LEAST_SHARE) found.push(partWithFacts("topThree", fewNames(three), "backlinks", sum, every, 1.1 + Math.min(0.5, sum / every)));
  }
  // The strongest linking website, beside the one giving most links, where they're two websites: strength isn't links.
  const strongest = mostFirst(rows, "domainRank")[0];
  if (strongest && byLinks[0] && named(strongest) !== named(byLinks[0]) && isNumber(byLinks[0].domainRank)) {
    found.push(vsBeside("strongest", named(strongest)!, "domainRank", strongest.domainRank as number, byLinks[0].domainRank as number, named(byLinks[0])!, 1));
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------------
// A linking website's own screen (`backlinks/domains/domain`).
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Its links against every link (the headline), with its domain rank; then, of the links listed on the screen, those
 * followed, those lost, the page they point at most and the words they use most.
 */
function linkingWebsiteFindings(data: Row): OwnFound[] {
  const site = partOf(data, "linkingSite");
  const held = partOf(data, "held");
  const whole = partOf(data, "whole");
  const name = named(site);
  if (!name) return [];
  const found: OwnFound[] = [];
  const backlinks = numberIn(site, "backlinks");
  const every = numberIn(whole, "backlinks");
  if (backlinks !== null && every !== null && every > 0) found.push(partWithFacts("share", name, "backlinks", backlinks, every, 2, { extra: rankFact(site) }));
  const listed = numberIn(held, "listed") ?? 0;
  if (listed > 0) {
    const of = `the ${listed} links listed`;
    const followed = numberIn(held, "followed") ?? 0;
    found.push(partWithFacts("followed", nameIn(data, "followedHeld", "Its links search engines follow"), "linksListed", followed, listed, 1.1, { of }));
    const lost = numberIn(held, "lost") ?? 0;
    if (lost > 0) found.push(partWithFacts("lost", nameIn(data, "lostHeld", "Its links now lost"), "linksListed", lost, listed, 1.3 + Math.min(0.4, lost / listed), { of }));
    const page = mostFirst(rowsOf(held.pages), "backlinks")[0];
    if (page) found.push(partWithFacts("page", named(page)!, "linksListed", page.backlinks as number, listed, 1.2, { of }));
    const anchor = mostFirst(rowsOf(held.anchors), "backlinks")[0];
    if (anchor) found.push(partWithFacts("anchor", named(anchor)!, "linksListed", anchor.backlinks as number, listed, 1, { of }));
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Broken backlinks (`backlinks/broken`).
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * The links pointing at pages that no longer work, against every link (the headline), with the strongest website among
 * them; the page with the most; those listed that search engines follow; and the websites linking to them, against every
 * linking website.
 */
function brokenLinksFindings(data: Row): OwnFound[] {
  const broken = partOf(data, "broken");
  const rows = rowsOf(data.brokenLinks).filter((row) => named(row));
  const found: OwnFound[] = [];
  const count = numberIn(broken, "backlinks");
  const every = numberIn(broken, "everyLink");
  const strongest = mostFirst(rows, "domainRank")[0];
  const strongestFact: FindingFact[] = strongest ? [{ key: "strongest", value: strongest.domainRank as number, unit: "score", label: `${named(strongest)}: domain rank, the strongest website linking to a page that no longer works` }] : [];
  // Counted, "1 of the 6,972 links", never a share too small to read (0.01%).
  if (count !== null && every !== null && every > 0) found.push(partWithFacts("broken", nameIn(data, "brokenLinks", "Broken links"), "backlinks", count, every, 2, { of: `all ${every} links`, extra: strongestFact }));
  if (count === null || count === 0) return found;
  const page = mostFirst(rowsOf(data.brokenPages), "backlinks")[0];
  if (page) found.push(partWithFacts("page", named(page)!, "brokenBacklinks", page.backlinks as number, count, 1.4));
  const listed = numberIn(broken, "listed") ?? 0;
  if (listed > 0) found.push(partWithFacts("followed", nameIn(data, "brokenFollowed", "Broken links search engines follow"), "linksListed", numberIn(broken, "followed") ?? 0, listed, 1.2, { of: `the ${listed} broken links listed` }));
  const websites = numberIn(broken, "websites");
  const everyWebsite = numberIn(broken, "everyWebsite");
  if (websites !== null && everyWebsite !== null && everyWebsite > 0) found.push(partWithFacts("websites", nameIn(data, "brokenWebsites", "Websites linking to pages that no longer work"), "referringDomains", websites, everyWebsite, 1.1));
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------------
// All backlinks (`backlinks/all`).
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * The links lost of every one listed (the headline), with the share followed; then, among the strongest listed, those
 * lost (the strongest of all among them, where it is), those pointing at a page that now redirects, and those search
 * engines don't follow.
 */
function allBacklinksFindings(data: Row): OwnFound[] {
  const all = partOf(data, "all");
  const rows = rowsOf(data.strongest).filter((row) => named(row));
  const found: OwnFound[] = [];
  const listed = numberIn(all, "listed");
  const followed = numberIn(all, "followedPercent");
  const followedFact: FindingFact[] = followed !== null ? [{ key: "followed", value: followed, unit: "percent", label: "the links listed that search engines follow" }] : [];
  if (listed !== null && listed > 0) found.push(partWithFacts("lost", nameIn(data, "lostLinks", "Links now lost"), "backlinks", numberIn(all, "lost") ?? 0, listed, 2, { extra: followedFact }));
  if (rows.length === 0) return found;
  const of = `the ${rows.length} strongest links listed`;
  const strongest = mostFirst(rows, "domainRank")[0];
  const flagged = (field: string) => mostFirst(rows.filter((row) => row[field] === 1), "domainRank");
  const lost = flagged("lost");
  if (lost.length > 0) {
    const strongestLost = strongest !== undefined && strongest.lost === 1;
    const extra: FindingFact[] = strongestLost ? [{ key: "strongest", value: strongest.domainRank as number, unit: "score", label: `${named(strongest)}: domain rank, the strongest link of all, now lost` }] : [];
    found.push(withRows(partWithFacts("strongestLost", nameIn(data, "lostStrongest", "Lost links among your strongest"), "linksListed", lost.length, rows.length, 1.4 + (strongestLost ? 0.3 : 0), { of, extra }), lost));
  }
  const movesOn = flagged("movesOn");
  if (movesOn.length > 0) found.push(withRows(partWithFacts("movesOn", nameIn(data, "redirectedLinks", "Links to pages that now redirect"), "linksListed", movesOn.length, rows.length, 1.2, { of }), movesOn));
  const notFollowed = flagged("notFollowed");
  if (notFollowed.length / rows.length >= LEAST_SHARE) found.push(withRows(partWithFacts("notFollowed", nameIn(data, "notFollowedLinks", "Links search engines don't follow"), "linksListed", notFollowed.length, rows.length, 1, { of }), notFollowed));
  return found;
}

const withRows = (found: OwnFound, rows: readonly Row[]) => withRowNames(found, rows.map((row) => named(row)!));

// ---------------------------------------------------------------------------------------------------------------------------
// An anchor's own screen (`backlinks/anchors/anchor`).
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * The words' links against every link (the headline) and their linking websites against every one; their links from each
 * website against the whole profile's (a footer credit gives hundreds from one website); and, of the links listed, the
 * page they point at most and the website giving most.
 */
function anchorFindings(data: Row): OwnFound[] {
  const anchor = partOf(data, "anchorText");
  const whole = partOf(data, "whole");
  const held = partOf(data, "held");
  const name = named(anchor);
  if (!name) return [];
  const found: OwnFound[] = [];
  const backlinks = numberIn(anchor, "backlinks");
  const every = numberIn(whole, "backlinks");
  if (backlinks !== null && every !== null && every > 0) found.push(partWithFacts("share", name, "backlinks", backlinks, every, 2));
  const websites = numberIn(anchor, "referringDomains");
  const everyWebsite = numberIn(whole, "referringDomains");
  if (websites !== null && everyWebsite !== null && everyWebsite > 0) found.push(partWithFacts("websites", name, "referringDomains", websites, everyWebsite, 1.4));
  const perWebsite = numberIn(anchor, "linksPerWebsite");
  const wholePerWebsite = numberIn(whole, "linksPerWebsite");
  if (perWebsite !== null && wholePerWebsite !== null && wholePerWebsite > 0 && (perWebsite / wholePerWebsite >= 1.5 || perWebsite / wholePerWebsite <= 1 / 1.5)) {
    found.push(vsBeside("perWebsite", name, "linksPerWebsite", perWebsite, wholePerWebsite, named(whole) ?? "The whole website", 1.3 + Math.min(0.5, Math.abs(Math.log(perWebsite / wholePerWebsite)) / 6)));
  }
  const listed = numberIn(held, "listed") ?? 0;
  if (listed > 0) {
    const of = `the ${listed} links listed`;
    const page = mostFirst(rowsOf(held.pages), "backlinks")[0];
    if (page) found.push(partWithFacts("page", named(page)!, "linksListed", page.backlinks as number, listed, 1, { of }));
    const site = mostFirst(rowsOf(held.websites), "backlinks")[0];
    if (site) found.push(partWithFacts("website", named(site)!, "linksListed", site.backlinks as number, listed, 0.9, { of }));
  }
  return found;
}

/** Joined into `VISIBILITY_OWN` (`own/visibility.ts`). */
export const VISIBILITY_LINK_LISTS_OWN: Readonly<Record<string, { general: boolean; find: (data: Row) => OwnFound[] }>> = {
  "visibility.backlinksDomains": { general: false, find: linkingWebsitesFindings },
  "visibility.backlinksDomain": { general: false, find: linkingWebsiteFindings },
  "visibility.backlinksBroken": { general: false, find: brokenLinksFindings },
  "visibility.backlinksAll": { general: false, find: allBacklinksFindings },
  "visibility.backlinksAnchor": { general: false, find: anchorFindings },
};
