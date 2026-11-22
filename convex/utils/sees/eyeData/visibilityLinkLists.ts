/**
 * What Backlinks' lists and records hand the eye (visibility-16-eyes, 22 November 2026): Linking websites, a linking
 * website's own screen, Broken backlinks, All backlinks and an anchor's own screen. Built here once, so each screen, a chat
 * app's question (`chatAppEyes/visibility.ts`) and the every-period test (`convex/utils/sees/visibilityRestPeriods.test.ts`)
 * hand the rules (`own/visibilityLinkLists.ts`) the same figures.
 *
 * A list reaches the eye as its first page, so the counts over the whole list come from the query's own box
 * (`seen.says`): the very counts the screen's What Hakken sees box says, which the eye otherwise drops as plumbing. Link
 * counts are `backlinks` and a record's figures are never under `website` or `links`, both of which the eye drops
 * (`pageData.ts`, `agentTools.ts`): until this, a linking website's screen handed the eye nothing at all.
 */

type Said = { code: string; a?: number; b?: number; c?: number; text?: string };
type Box = { says?: ReadonlyArray<Said> } | null | undefined;
type Totals = { backlinks?: number | null; referringDomains?: number | null; anchors?: number | null } | null | undefined;
type LinkRow = {
  anchor?: string | null; dofollow?: boolean; domainFrom: string; domainRank?: number | null; firstSeen?: string | null; lastSeen?: string | null;
  pageTo?: string | null; status?: string | null; statusCode?: number | null; isBroken?: boolean;
};

const said = (box: Box, code: string) => box?.says?.find((one) => one.code === code);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const present = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

/** Each name counted, the most first: the pages a website's links point at, the words they use. */
function counted(values: ReadonlyArray<string | null | undefined>, most = 5): Array<{ name: string; backlinks: number }> {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([name, backlinks]) => ({ name, backlinks })).sort((left, right) => right.backlinks - left.backlinks).slice(0, most);
}

/**
 * The links a record lists, summed: how many are followed, lost and broken, and what they point at. Where on a page a link
 * sits (`location`: "nav", "footer") stays out, as the app has no words for it yet and a code is never a finding's name.
 */
function heldOf(links: readonly LinkRow[], noAnchor: string) {
  return {
    listed: links.length,
    followed: links.filter((row) => row.dofollow === true).length,
    lost: links.filter((row) => row.status === "LOST").length,
    broken: links.filter((row) => row.isBroken === true).length,
    pages: counted(links.map((row) => row.pageTo)),
    anchors: counted(links.map((row) => (row.anchor === undefined ? null : row.anchor || noAnchor))),
    websites: counted(links.map((row) => row.domainFrom)),
  };
}

/**
 * Backlinks › Linking websites: the websites linking now of every one seen, those that stopped, and the page of websites
 * on screen with their links, strength and spam score, beside every link counted.
 */
export function linkingWebsitesSees(
  page: { rows: ReadonlyArray<{ domain: string; backlinks: number; rank?: number | null; spamScore?: number | null; status?: string | null; nofollowPages?: number | null }>; total: number; seen?: Box } | null | undefined,
  totals: Totals,
  names: { linkingNow: string; stoppedLinking: string },
) {
  if (!page) return undefined;
  const linking = said(page.seen, "domains");
  const stopped = said(page.seen, "lost");
  const fresh = said(page.seen, "new");
  return {
    linking: {
      now: linking?.a ?? null,
      ever: linking?.b ?? page.total,
      stopped: stopped?.a ?? 0,
      ...(stopped?.text ? { strongestStopped: stopped.text } : {}),
      fresh: fresh?.a ?? 0,
      backlinks: totals?.backlinks ?? null,
      referringDomains: totals?.referringDomains ?? null,
    },
    domains: page.rows.map((row) => ({
      name: row.domain, backlinks: row.backlinks, domainRank: row.rank ?? null, spamScore: row.spamScore ?? null, stillLinking: row.status === "LOST" ? 0 : 1,
      nofollowPages: row.nofollowPages ?? null,
    })),
    names,
  };
}

/**
 * Backlinks › a linking website's own screen: its links and strength as the newest summary counts them, beside every link
 * counted, and the links listed on the screen summed: followed, lost, where on the page they sit, what they point at.
 */
export function linkingWebsiteSees(
  record: { domain: string; website: { backlinks?: number | null; referringPages?: number | null; rank?: number | null; spamScore?: number | null; status?: string | null; firstSeen?: string | null } | null; links: readonly LinkRow[] } | null | undefined,
  totals: Totals,
  names: { noAnchor: string; followedHeld: string; lostHeld: string },
) {
  if (!record) return undefined;
  const summary = record.website;
  return {
    linkingSite: {
      name: record.domain,
      backlinks: summary?.backlinks ?? null,
      referringPages: summary?.referringPages ?? null,
      domainRank: summary?.rank ?? null,
      spamScore: summary?.spamScore ?? null,
      stillLinking: summary ? (summary.status === "LOST" ? 0 : 1) : null,
      firstSeen: summary?.firstSeen ?? null,
    },
    held: heldOf(record.links, names.noAnchor),
    whole: { backlinks: totals?.backlinks ?? null, referringDomains: totals?.referringDomains ?? null },
    names: { followedHeld: names.followedHeld, lostHeld: names.lostHeld },
  };
}

/**
 * Backlinks › Broken backlinks: the links pointing at pages that no longer work, over the whole list (the box's count),
 * beside every link and linking website counted, and the page of them on screen.
 */
export function brokenLinksSees(
  page: { rows: readonly LinkRow[]; total: number; seen?: Box } | null | undefined,
  totals: Totals,
  names: { brokenLinks: string; brokenFollowed: string; brokenWebsites: string },
) {
  if (!page) return undefined;
  const broken = said(page.seen, "broken");
  return {
    broken: {
      backlinks: broken?.a ?? page.total,
      pages: broken?.b ?? null,
      // Counted over the page on screen: the list opens strongest first, and is short where it matters.
      followed: page.rows.filter((row) => row.dofollow === true).length,
      websites: new Set(page.rows.map((row) => row.domainFrom)).size,
      listed: page.rows.length,
      everyLink: totals?.backlinks ?? null,
      everyWebsite: totals?.referringDomains ?? null,
    },
    brokenLinks: page.rows.map((row) => ({
      name: row.domainFrom, page: row.pageTo ?? null, domainRank: row.domainRank ?? null, followed: row.dofollow ? 1 : 0, statusCode: row.statusCode ?? null,
      firstSeen: row.firstSeen ?? null, lastSeen: row.lastSeen ?? null,
    })),
    brokenPages: counted(page.rows.map((row) => row.pageTo)),
    names,
  };
}

/**
 * Backlinks › All backlinks: the strongest link from each website, over the whole list (the box's counts: listed, the
 * share followed, lost), and the page of links on screen with what each is: lost, pointing at a page that moves on, not
 * followed.
 */
export function allBacklinksSees(
  page: { rows: readonly LinkRow[]; total: number; seen?: (Box & { steps?: ReadonlyArray<{ code: string; a?: number }> }) | null } | null | undefined,
  totals: Totals,
  names: { lostLinks: string; lostStrongest: string; redirectedLinks: string; notFollowedLinks: string },
) {
  if (!page) return undefined;
  const listed = said(page.seen, "links");
  const followed = said(page.seen, "followed");
  const lost = said(page.seen, "lost")?.a ?? page.seen?.steps?.find((step) => step.code === "seeLost")?.a ?? null;
  return {
    all: {
      listed: listed?.a ?? page.total,
      websites: listed?.b ?? null,
      followedPercent: followed?.a ?? null,
      lost,
      everyLink: totals?.backlinks ?? null,
    },
    strongest: page.rows.map((row) => ({
      name: row.domainFrom, page: row.pageTo ?? null, domainRank: row.domainRank ?? null,
      lost: row.status === "LOST" ? 1 : 0,
      movesOn: isNumber(row.statusCode) && row.statusCode >= 300 && row.statusCode < 400 ? 1 : 0,
      notFollowed: row.dofollow === false ? 1 : 0,
    })),
    names,
  };
}

/**
 * Backlinks › an anchor's own screen: the words' links and linking websites as the newest summary counts them, beside
 * every link and linking website counted, and the links listed on the screen summed.
 */
export function anchorSees(
  record: { anchor: string; summary: { backlinks?: number | null; referringDomains?: number | null; spamScore?: number | null; firstSeen?: string | null; status?: string | null } | null; links: readonly LinkRow[] } | null | undefined,
  totals: Totals,
  names: { noAnchor: string; wholeWebsite: string },
) {
  if (!record) return undefined;
  const summary = record.summary;
  const backlinks = summary?.backlinks ?? null;
  const websites = summary?.referringDomains ?? null;
  const everyLink = totals?.backlinks ?? null;
  const everyWebsite = totals?.referringDomains ?? null;
  return {
    anchorText: {
      name: record.anchor || names.noAnchor,
      backlinks, referringDomains: websites,
      linksPerWebsite: present(backlinks) && present(websites) && websites > 0 ? Math.round((backlinks / websites) * 10) / 10 : null,
      spamScore: summary?.spamScore ?? null,
      firstSeen: summary?.firstSeen ?? null,
    },
    whole: {
      name: names.wholeWebsite,
      backlinks: everyLink, referringDomains: everyWebsite,
      linksPerWebsite: present(everyLink) && present(everyWebsite) && everyWebsite > 0 ? Math.round((everyLink / everyWebsite) * 10) / 10 : null,
    },
    held: heldOf(record.links, names.noAnchor),
  };
}
