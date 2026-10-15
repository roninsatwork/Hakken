import { seen, toPage, type Seen, type SeenPhrase, type SeenStep, type SeenTarget } from "../hakkenSees";
import { AI_ASSISTANTS_CHANNEL } from "../aiAssistants";
import { LIKELY_CONVERSIONS, NEVER_TICKED, PURCHASE_EVENT } from "../analyticsEvents";
import { NOT_SORTED_KIND } from "../pageKinds";
import { MOVE_VIEWS, moveCounts, type MoveCounts } from "../pageMoves";

/**
 * What Hakken sees on the Google Analytics screens
 * (docs/plans/active/google-analytics-plan.md §14, §15): the box under each
 * screen's title, saying in two or three sentences what an SEO specialist
 * would say about the screen's figures, then up to three steps, each with its
 * link. Fixed rules over the figures each screen's own query already reads —
 * never an AI model, never a purchase (discovery-detail-and-hakken-sees-plan.md
 * DS5) — most important first, sent as codes with their numbers for the
 * screen's words (`googleAnalytics.seen.<screen>`).
 *
 * Numbers go as they are, money in hundredths (`{aMoney}`), shares as
 * fractions (`{aRate}`). A conversion's own name goes as its event in `text`,
 * several joined by commas, for the screen to name in the reader's words
 * (`{event}`). A page goes as its address, or its shared page number (`~…`)
 * for the query to name (`namedSeen`): the box shows its path.
 *
 * Overview, the lists, and Conversions run their rules in their queries; the
 * screens that read only the website's connection — Your websites, Tracking
 * health, Connection, Choose what counts, Not connected yet — run theirs over
 * the same answer on screen, as Visibility's Websites list does.
 */

type Maybe<T> = T | null | undefined | false;

/** Visits with no channel or no landing page above this share (tracking health's own line, `googleAnalyticsHealth.ts`). */
export const UNKNOWN_SHARE = 0.05;
/** A page with this many visits and no conversion wants a next step (§13's "Not converting" floor). */
export const LEAK_VISITS = 50;
/** Engagement this far under (or over) the one it is weighed against reads as leaving sooner (or staying). */
export const ENGAGEMENT_GAP = 0.05;
/** A change in visits smaller than this reads as steady. */
export const STEADY_SHARE = 0.005;
/** Google's showings clicked less often than this read as rarely clicked. */
export const LOW_CLICK_RATE = 0.01;
/** Google Analytics' own name for a visit it cannot put to a landing page. */
export const NOT_SET = "(not set)";
/** The page group of the pages in none. */
const NOT_SORTED = NOT_SORTED_KIND;

/** The way to choose what counts and what each is worth: the Connection page, changing. */
const CHOOSE: SeenTarget = toPage("connection", { change: "1" });

/** A page's address as the box shows it: its path, the website's own host left off (`analyticsFormat.pathOf`). */
export function pathOfAddress(address: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/[^/]+(\/.*)?$/i.exec(address);
  return match ? match[1] || "/" : address;
}

/** Where a page's own screen is: only a page Hakken has numbered has one. */
function pageTarget(key: string): SeenTarget | null {
  return key.startsWith("~") ? toPage("all-pages/page", { key }) : null;
}

/** The change in one figure: up, down or the same. */
function direction(now: number, before: number): "up" | "down" | "same" {
  return now > before ? "up" : now < before ? "down" : "same";
}

/** A change in visits as a share, steady when small. */
function visitsMove(now: number, before: number): { way: "up" | "down" | "same"; share: number } {
  const share = before > 0 ? (now - before) / before : 0;
  return { way: Math.abs(share) < STEADY_SHARE ? "same" : share > 0 ? "up" : "down", share: Math.abs(share) };
}

const byValue = <Row extends { value: number; visits: number }>(left: Row, right: Row) => right.value - left.value || right.visits - left.visits;
const byVisits = <Row extends { visits: number }>(left: Row, right: Row) => right.visits - left.visits;
const sum = <Row>(rows: readonly Row[], of: (row: Row) => number) => rows.reduce((total, row) => total + of(row), 0);

// ---------------------------------------------------------------------------
// 1 · Your websites
// ---------------------------------------------------------------------------

export type WebsiteFacts = {
  siteId: string;
  host: string;
  status: string;
  visits: number | null;
  conversions: number | null;
  value: number | null;
  /** The 30 days before, when held. */
  visitsBefore: number | null;
  valueBefore: number | null;
  /** Whether anything counts as a conversion. */
  counting: boolean;
  /** Tracking health: checks failing of all, and the unknown share when that check fails. */
  failing: number;
  checks: number;
  unknownShare: number | null;
};

/** Your websites: the website making the most and how it moved, its tracking, and the websites not connected yet. */
export function websitesSees(rows: readonly WebsiteFacts[]): Seen {
  if (rows.length === 0) return seen([{ code: "none" }]);
  const page = (row: WebsiteFacts, segment = "") => ({ url: `/app/analytics/${row.siteId}${segment ? `/${segment}` : ""}` });
  const unconnected = rows.filter((row) => row.status === "NOT_CONNECTED");
  const held = rows.filter((row) => row.visits !== null).sort((left, right) => (right.value ?? 0) - (left.value ?? 0) || (right.visits ?? 0) - (left.visits ?? 0));
  const connect: Maybe<SeenStep> = unconnected[0] && { code: "connect", text: unconnected[0].host, link: "connection", to: page(unconnected[0], "connection") };
  if (held.length === 0) return seen([{ code: "noneConnected", a: rows.length }], [connect]);
  const lead = held[0];
  const fell = lead.valueBefore !== null && (lead.value ?? 0) < lead.valueBefore;
  const leadSays = (): SeenPhrase => {
    const visits = lead.visits ?? 0;
    const value = lead.value ?? 0;
    if (!lead.counting) return { code: "notCounting", text: lead.host, a: visits };
    if (lead.valueBefore === null || lead.visitsBefore === null) return { code: "made", text: lead.host, a: value, b: lead.conversions ?? 0 };
    const visitsWay = visitsMove(visits, lead.visitsBefore);
    const valueWay = direction(value, lead.valueBefore);
    if (valueWay === "down" && visitsWay.way === "up") return { code: "fellVisitsUp", text: lead.host, a: value, b: lead.valueBefore, c: visitsWay.share };
    return { code: `value.${valueWay}`, text: lead.host, a: value, b: lead.valueBefore };
  };
  const shaky = [lead, ...held.slice(1)].find((row) => row.failing > 0) ?? null;
  const says: Array<Maybe<SeenPhrase>> = [
    leadSays(),
    shaky && (shaky.unknownShare !== null
      ? { code: "unknown", text: shaky.host, a: shaky.unknownShare }
      : { code: "tracking", text: shaky.host, a: shaky.failing, b: shaky.checks }),
    unconnected.length > 0 && { code: "notConnected", a: unconnected.length },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    { code: !lead.counting ? "count" : fell ? "whereLost" : "open", text: lead.host, link: lead.counting ? "overview" : "chooseWhatCounts", to: lead.counting ? page(lead) : page(lead, "connection?change=1") },
    shaky && { code: "fixTracking", text: shaky.host, link: "trackingHealth", to: page(shaky, "tracking-health") },
    connect,
  ];
  return seen(says, steps);
}

// ---------------------------------------------------------------------------
// 2 · Overview (and 18 · Needs reconnecting, over the figures kept)
// ---------------------------------------------------------------------------

type Figures = { visits: number; engaged: number; conversions: number; value: number };

export type OverviewFacts = {
  /** The website's hold: Search Console's screens for it share the id. */
  siteId: string;
  now: Figures | null;
  before: Figures | null;
  /** Whether anything counts as a conversion. */
  counting: boolean;
  /** What changed most, biggest first: the change, and the conversions now. */
  changedMost: ReadonlyArray<{ kind: "landing" | "channel"; key: string; label: string; conversions: number; value: number; conversionsNow: number }>;
  /** Search Console's last 30 days, when it is connected. */
  searchConsole: { clicks: number; impressions: number } | null;
};

/** What Google's showings say: how often the website's pages are clicked. */
function googleSays(console: OverviewFacts["searchConsole"]): Maybe<SeenPhrase> {
  if (!console || console.impressions <= 0) return null;
  const rate = console.clicks / console.impressions;
  return { code: rate < LOW_CLICK_RATE ? "googleRarely" : "google", a: console.impressions, b: rate };
}

/** Overview: how conversions moved against visits, the channel and page that moved them most, and Google's click rate. */
export function overviewSees(facts: OverviewFacts): Seen {
  const { now, before } = facts;
  if (!now) return seen([]);
  const google = googleSays(facts.searchConsole);
  // Pages shown but rarely clicked move up from Search Console's Almost there: its searches at positions 4 to 20.
  const push: Maybe<SeenStep> = google && google.code === "googleRarely" && { code: "push", link: "pagesToPush", to: { url: `/app/search-console/${facts.siteId}/almost-there` } };
  if (!facts.counting) {
    return seen([{ code: "notCounting", a: now.visits }, google], [{ code: "chooseWhatCounts", link: "chooseWhatCounts", to: CHOOSE }, push]);
  }
  if (!before) return seen([{ code: "made", a: now.conversions, b: now.value }, google], [push]);
  const conversions = direction(now.conversions, before.conversions);
  const visits = visitsMove(now.visits, before.visits);
  const sign = conversions === "down" ? -1 : 1;
  const movers = conversions === "same" ? [] : facts.changedMost.filter((row) => row.conversions * sign > 0);
  const channel = movers.find((row) => row.kind === "channel") ?? null;
  const page = movers.find((row) => row.kind === "landing") ?? null;
  const way = conversions === "down" ? "fell" : "rose";
  const cause: Maybe<SeenPhrase> = channel && page
    ? { code: `cause.${way}Both`, text: channel.label, a: Math.abs(channel.conversions), more: pathOfAddress(page.label), b: Math.abs(page.conversions) }
    : channel ? { code: `cause.${way}Channel`, text: channel.label, a: Math.abs(channel.conversions) }
      : page && { code: `cause.${way}Page`, text: pathOfAddress(page.label), a: Math.abs(page.conversions) };
  const pageTo = page ? pageTarget(page.key) : null;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: `lead.${conversions}.${visits.way}`, a: visits.share, b: before.conversions, c: now.conversions },
    cause,
    google,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    channel && { code: `channel.${way}`, text: channel.label, a: channel.conversionsNow, b: channel.conversionsNow - channel.conversions, link: "channels", to: toPage("channels") },
    page && pageTo && { code: `page.${way}`, text: pathOfAddress(page.label), a: page.conversionsNow, b: page.conversionsNow - page.conversions, link: "seePage", to: pageTo },
    push,
  ];
  return seen(says, steps);
}

// ---------------------------------------------------------------------------
// The lists: 4 · Channels, 5 · a channel's own screen, 6 · Landing pages
// (and 17 · a device asked of Google), 8 · All pages
// ---------------------------------------------------------------------------

/** A row of a list, as the screens show it (`shownRowValidator`). */
export type ListRowFacts = {
  key: string;
  label: string;
  visits: number;
  engagementRate: number | null;
  views: number;
  conversions: number;
  value: number;
  /** Visits against the span before, as a fraction. */
  change: number | null;
  conversionsBefore: number | null;
  /** Page views in the span before: All pages' rows only. */
  viewsBefore?: number | null;
  members?: number;
};

/** A row's visits in the span before, from its change. */
function visitsBeforeOf(row: ListRowFacts): number | null {
  return row.change === null ? null : Math.round(row.visits / (1 + row.change));
}

/** Channels: the channel making the most, the one converting less than before, and AI assistants' visits. */
export function channelsSees(rows: readonly ListRowFacts[]): Seen {
  if (rows.length === 0) return seen([{ code: "none" }]);
  const visits = sum(rows, (row) => row.visits);
  const engaged = sum(rows, (row) => row.visits * (row.engagementRate ?? 0));
  const siteRate = visits > 0 ? engaged / visits : 0;
  const value = sum(rows, (row) => row.value);
  const lead = [...rows].sort(byValue)[0];
  const moved = rows
    .filter((row) => row.conversionsBefore !== null && row.conversions !== row.conversionsBefore)
    .map((row) => ({ row, by: row.conversions - (row.conversionsBefore ?? 0) }));
  const fell = [...moved].filter((move) => move.by < 0).sort((left, right) => left.by - right.by)[0] ?? null;
  const rose = fell ? null : [...moved].filter((move) => move.by > 0).sort((left, right) => right.by - left.by)[0] ?? null;
  const assistants = rows.find((row) => row.label === AI_ASSISTANTS_CHANNEL && row.visits > 0) ?? null;
  const unassigned = rows.find((row) => row.label === "Unassigned" && row.visits > 0) ?? null;
  const says: Array<Maybe<SeenPhrase>> = [
    value > 0 && lead.value > 0
      ? { code: "lead", text: lead.label, a: lead.visits, b: visits, c: lead.value }
      : { code: "leadVisits", text: [...rows].sort(byVisits)[0].label, a: [...rows].sort(byVisits)[0].visits, b: visits },
    fell ? { code: "fell", text: fell.row.label, a: fell.row.conversions, b: fell.row.conversionsBefore ?? 0 }
      : rose && { code: "rose", text: rose.row.label, a: rose.row.conversions, b: rose.row.conversionsBefore ?? 0 },
    assistants && { code: assistants.conversions > 0 ? "assistantsConverted" : "assistants", a: assistants.visits, b: assistants.engagementRate ?? 0, c: assistants.conversions },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    fell && { code: "whyFell", text: fell.row.label, a: fell.row.conversions, b: fell.row.conversionsBefore ?? 0, link: "landingPages", to: toPage("funnel") },
    assistants && (assistants.engagementRate ?? 0) < siteRate - ENGAGEMENT_GAP
      && { code: "assistantsStay", a: assistants.visits, b: assistants.engagementRate ?? 0, link: "aiAssistants", to: toPage("channels/channel", { key: AI_ASSISTANTS_CHANNEL }) },
    unassigned && { code: "unassigned", a: unassigned.visits, link: "trackingHealth", to: toPage("tracking-health") },
  ];
  return seen(says, steps);
}

/** A channel's figures above its list (§15, screen 5), and the whole website's engagement to weigh them against. */
export type ChannelFigures = {
  visits: number;
  visitsBefore: number | null;
  engaged: number;
  conversions: number;
  conversionsBefore: number | null;
  value: number;
  valueBefore: number | null;
  siteVisits: number;
  siteEngaged: number;
};

/** A channel's own screen: the source sending most, how its visitors engage against the whole website's, and what they converted. */
export function channelSees(channel: string, rows: readonly ListRowFacts[], figures: ChannelFigures | null, siteId: string): Seen {
  if (rows.length === 0 || !figures || figures.visits === 0) return seen([{ code: "none", text: channel }]);
  const top = [...rows].sort(byVisits)[0];
  const before = visitsBeforeOf(top);
  const rate = figures.engaged / figures.visits;
  const siteRate = figures.siteVisits > 0 ? figures.siteEngaged / figures.siteVisits : null;
  const leaves = siteRate !== null && rate < siteRate - ENGAGEMENT_GAP;
  const stays = siteRate !== null && rate > siteRate + ENGAGEMENT_GAP;
  const says: Array<Maybe<SeenPhrase>> = [
    before === null || before === 0
      ? { code: top.change === null && top.conversionsBefore !== null ? "topNew" : "topOnly", text: top.label, a: top.visits }
      : { code: `top.${direction(top.visits, before)}`, text: top.label, a: top.visits, b: before },
    leaves ? { code: "leaveSooner", a: rate, b: siteRate ?? 0 } : stays && { code: "stayLonger", a: rate, b: siteRate ?? 0 },
    figures.conversions > 0 ? { code: "converted", a: figures.conversions, b: figures.value } : { code: "noneConverted" },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    (figures.conversions === 0 || leaves) && { code: "nextStep", text: top.label, link: "landingPages", to: toPage("funnel") },
    channel === AI_ASSISTANTS_CHANNEL && { code: "checkAnswers", text: top.label, link: "aiAnswers", to: { url: `/app/sites/${siteId}/ai/answers` } },
  ];
  return seen(says, steps);
}

export type LandingFacts = {
  /** The page groups rather than the pages. */
  groups: boolean;
  /** The device chosen, or every device (""). */
  device: string;
  /** Every device's rows, when one device's were asked of Google: to weigh the device against. */
  everyDevice: readonly ListRowFacts[] | null;
};

/** Landing pages: the busiest page that converts nothing, the pages that make the money, and the visits with no landing page. */
export function landingSees(rows: readonly ListRowFacts[], facts: LandingFacts): Seen {
  if (rows.length === 0) return seen([{ code: "none" }]);
  if (facts.groups) return groupsSees(rows);
  if (facts.device && facts.everyDevice) return deviceSees(rows, facts.device, facts.everyDevice);
  const visits = sum(rows, (row) => row.visits);
  const value = sum(rows, (row) => row.value);
  const pages = rows.filter((row) => row.key !== NOT_SET);
  const busiest = [...pages].sort(byVisits)[0] ?? null;
  const leak = [...pages].filter((row) => row.conversions === 0 && row.visits >= LEAK_VISITS).sort(byVisits)[0] ?? null;
  const earners = [...pages].filter((row) => row.value > 0).sort(byValue);
  const notSet = rows.find((row) => row.key === NOT_SET) ?? null;
  const unknown = notSet && visits > 0 && notSet.visits / visits > UNKNOWN_SHARE ? notSet : null;
  const leakTo = leak ? pageTarget(leak.key) : null;
  const says: Array<Maybe<SeenPhrase>> = [
    leak && { code: leak === busiest ? "leakTop" : "leak", text: leak.label, a: leak.visits },
    earners.length > 1
      ? { code: "earners", text: earners[0].label, more: earners[1].label, a: earners[0].value + earners[1].value, b: value }
      : earners.length === 1 && { code: "earner", text: earners[0].label, a: earners[0].value, b: value },
    unknown && { code: "notSet", a: unknown.visits, b: unknown.visits / visits },
    !leak && earners.length === 0 && { code: "noConversions", a: visits },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    leak && leakTo && { code: "nextStep", text: leak.label, link: "seePage", to: leakTo },
    unknown && { code: "fixNotSet", a: unknown.visits, link: "trackingHealth", to: toPage("tracking-health") },
  ];
  return seen(says, steps);
}

/** Landing pages by page group: the group making the most, and the pages in none. */
function groupsSees(rows: readonly ListRowFacts[]): Seen {
  const value = sum(rows, (row) => row.value);
  const lead = [...rows].filter((row) => row.key !== NOT_SORTED && row.value > 0).sort(byValue)[0] ?? null;
  const unsorted = rows.find((row) => row.key === NOT_SORTED && (row.members ?? 0) > 0) ?? null;
  return seen([
    lead ? { code: "groupLead", text: lead.label, a: lead.value, b: value } : { code: "groupsNoValue", a: rows.length },
    unsorted && { code: "unsorted", a: unsorted.members ?? 0, b: unsorted.visits },
  ], [
    unsorted && { code: "seeUnsorted", a: unsorted.members ?? 0, link: "unsortedPages", to: toPage("funnel", { view: "pages", group: NOT_SORTED }) },
  ]);
}

/** Landing pages on one device (§11 board 19): its share of the visits and conversions, and the page its visitors leave soonest. */
function deviceSees(rows: readonly ListRowFacts[], device: string, every: readonly ListRowFacts[]): Seen {
  const visits = sum(rows, (row) => row.visits);
  const conversions = sum(rows, (row) => row.conversions);
  const pages = rows.filter((row) => row.key !== NOT_SET);
  const earner = [...pages].filter((row) => row.conversions > 0).sort(byValue)[0] ?? null;
  const top = [...pages].sort(byVisits)[0] ?? null;
  const everyTop = top ? every.find((row) => row.key === top.key) ?? null : null;
  const less = top && everyTop && top.engagementRate !== null && everyTop.engagementRate !== null && top.engagementRate < everyTop.engagementRate - ENGAGEMENT_GAP;
  const topTo = top ? pageTarget(top.key) : null;
  return seen([
    { code: `device.${device}`, a: visits, b: sum(every, (row) => row.visits), c: conversions },
    earner && { code: earner.conversions === conversions ? "allFrom" : "mostFrom", text: earner.label, a: earner.conversions, b: earner.value },
    less && top && everyTop && { code: "engagesLess", text: top.label, a: top.visits, b: top.engagementRate ?? 0, c: everyTop.engagementRate ?? 0 },
  ], [
    less && top && topTo && { code: `readOn.${device}`, text: top.label, link: "seePage", to: topTo },
  ]);
}

/**
 * All pages (docs/plans/active/all-pages-rethink-plan.md AP6), never in money:
 * how many of the website's pages were viewed and how many had no visits; how
 * many gained, dropped and stayed static; the page that dropped most, with the
 * conversions it still made, or else the page that gained most. Its steps:
 * see why that page dropped, copy the next step of the page making most
 * conversions onto the most viewed page making none, and the pages nobody
 * visited that Google sends most clicks. `moves` is the list read whole
 * (`withQuietPages`); without it the rows are counted as they are.
 */
export function allPagesSees(rows: readonly ListRowFacts[], counting: boolean, moves: { counts: MoveCounts; quiet: readonly string[] } | null = null): Seen {
  const viewed = rows.filter((row) => row.views > 0);
  if (viewed.length === 0) return seen([{ code: "none" }]);
  const counts = moves?.counts ?? moveCounts(rows.map((row) => ({ views: row.views, viewsBefore: row.viewsBefore ?? null })));
  const moved = rows.flatMap((row) => (row.viewsBefore === null || row.viewsBefore === undefined ? [] : [{ row, by: row.views - row.viewsBefore }]));
  const drop = moved.filter((move) => move.by <= -MOVE_VIEWS).sort((left, right) => left.by - right.by || left.row.label.localeCompare(right.row.label))[0] ?? null;
  const gain = moved.filter((move) => move.by >= MOVE_VIEWS).sort((left, right) => right.by - left.by || left.row.label.localeCompare(right.row.label))[0] ?? null;
  const total = sum(rows, (row) => row.conversions);
  const converting = rows.filter((row) => row.conversions > 0);
  const best = [...converting].sort((left, right) => right.conversions - left.conversions || right.views - left.views)[0] ?? null;
  const idle = [...viewed].sort((left, right) => right.views - left.views).find((row) => row.conversions === 0) ?? null;
  // A page of All pages opens its own screen there (GA29).
  const own = (row: ListRowFacts | null) => (row?.key.startsWith("~") ? toPage("all-pages/page", { key: row.key }) : null);
  const dropTo = drop ? own(drop.row) : null;
  const idleTo = own(idle);
  const quiet = moves?.quiet ?? [];
  const noVisits = toPage("all-pages", { move: "none" });
  return seen([
    // The pages viewed and the pages with no visits add up to every page, as the filters do (`moveOf`).
    { code: counts.none > 0 ? "viewedOf" : "viewedAll", a: counts.all - counts.none, b: counts.all, c: counts.none },
    counts.gains + counts.dropped > 0 && { code: "moved", a: counts.gains, b: counts.dropped, c: counts.static },
    drop
      ? { code: counting && drop.row.conversions > 0 ? "droppedMostMade" : "droppedMost", text: drop.row.label, a: -drop.by, b: drop.row.conversions, c: total }
      : gain && { code: "gainedMost", text: gain.row.label, a: gain.by },
  ], [
    !counting && { code: "chooseWhatCounts", link: "chooseWhatCounts", to: CHOOSE },
    drop && dropTo && { code: "whyDropped", text: drop.row.label, a: -drop.by, link: "seePage", to: dropTo },
    counting && best && idle && idleTo && { code: "copy", text: best.label, more: idle.label, link: "seePage", to: idleTo },
    quiet.length > 1
      ? { code: "noVisitsTwo", text: quiet[0], more: quiet[1], link: "noVisits", to: noVisits }
      : quiet.length === 1 && { code: "noVisitsOne", text: quiet[0], link: "noVisits", to: noVisits },
  ]);
}

/** Views with no page before reading as worth a sentence (§18.7): a fifth or more. */
export const NO_PAGE_BEFORE_SHARE = 0.2;

/**
 * Where a page's views came from just before (GA29): a page of the website by
 * its number, another website by its name, none, or the rest past its 20
 * biggest added up (`other`).
 */
export type BeforeFacts = { kind: "page" | "site" | "none" | "other"; key: string; name: string; views: number };

/** The least share of a page's views another page of the website must send for the link on it to be worth keeping. */
export const KEEP_LINK_SHARE = 0.05;

/** Views a visit at which Google is counting a page again and again, its contents links taken as new views (PS4). */
export const COUNTED_AGAIN = 1.5;

/**
 * A page's story (analytics-page-screen-plan.md §5): the visits that started
 * on it and the conversions they went on to make, where those came from, a
 * page Google counts more than once a visit, and a page of its group that
 * converts better. A source is its name, or `(direct)` for visits typed in.
 */
export type PageStoryFacts = {
  started: { visits: number; websiteVisits: number; conversions: number; madeHere: number } | null;
  /** The source that brought the most of those visits, and the one their conversions came from most. */
  biggest: { name: string; visits: number; conversions: number } | null;
  converter: { name: string; conversions: number } | null;
  viewsPerVisit: number | null;
  /** Different pages a visit, and pages a visit as Google counts them, for visits that started here: as the page shows them. */
  pages: { different: number; counted: number } | null;
  /** A page of its group whose visits converted better, by its number. */
  nearest: { page: string; visits: number; conversions: number } | null;
};

/**
 * A page's own screen from All pages (§18.7): first its story, when Google
 * has answered for it (analytics-page-screen-plan.md §5) — the visits that
 * started on it and the conversions they made, and where; the biggest source
 * that brought none; a page counted more than once a visit; a page of its
 * group that converts better — then the two biggest sources of its views and
 * their shares, views with no page before when a fifth or more, an AI
 * assistant among its sources. Its steps: a next step to the service it
 * supports, the contents links counted as new views, keep the link on the
 * page that sends most (a twentieth of its views or more), and check what
 * that assistant says about the page. The page before a view of itself —
 * reloaded, opened again — is never one of its sources.
 */
export function pageSees(rows: readonly BeforeFacts[], siteId: string, isAssistant: (name: string) => boolean, self: string, story: PageStoryFacts | null = null): Seen {
  const total = sum(rows, (row) => row.views);
  if (total === 0 && !story?.started) return seen([{ code: "none" }]);
  const sources = rows.filter((row) => (row.kind === "page" || row.kind === "site") && row.key !== self && row.views > 0).sort((left, right) => right.views - left.views);
  const none = sum(rows.filter((row) => row.kind === "none"), (row) => row.views);
  const nameOf = (row: BeforeFacts) => (row.kind === "page" ? row.key : row.name);
  const [first, second] = sources;
  const assistant = sources.find((row) => row.kind === "site" && isAssistant(row.name)) ?? null;
  const sender = sources.find((row) => row.kind === "page" && row.views / total >= KEEP_LINK_SHARE) ?? null;
  const started = story?.started && story.started.visits > 0 ? story.started : null;
  const share = started && started.websiteVisits > 0 ? started.visits / started.websiteVisits : 0;
  const biggest = story?.biggest;
  const converter = story?.converter;
  // Counted again: said with the two figures the page shows — different pages a visit, and Google's count — never a third.
  const pages = story?.pages && story.pages.different > 0 && story.pages.counted / story.pages.different >= COUNTED_AGAIN ? story.pages : null;
  const counted = pages ? pages.counted / pages.different : story?.viewsPerVisit !== null && story?.viewsPerVisit !== undefined && story.viewsPerVisit >= COUNTED_AGAIN ? story.viewsPerVisit : null;
  return seen([
    started && (started.conversions === 0
      ? { code: "startedNone", a: started.visits, b: share }
      : started.madeHere === 0
        ? { code: "startedElsewhere", a: started.visits, b: share, c: started.conversions }
        : { code: "startedConverted", a: started.visits, b: share, c: started.conversions }),
    started && started.conversions > 0 && biggest && biggest.conversions === 0 && converter && converter.name !== biggest.name && (converter.name === "(direct)"
      ? { code: "biggestNoneTyped", text: biggest.name, a: biggest.visits }
      : { code: "biggestNone", text: biggest.name, a: biggest.visits, more: converter.name }),
    pages ? { code: "countedAgainPages", a: pages.different, b: pages.counted } : counted !== null && { code: "countedAgain", a: counted },
    story?.nearest && { code: "nearest", text: story.nearest.page, a: story.nearest.conversions, b: story.nearest.visits },
    total > 0 && (second
      ? { code: "twoSources", text: nameOf(first), a: first.views / total, more: nameOf(second), b: second.views / total }
      : first ? { code: "oneSource", text: nameOf(first), a: first.views / total } : { code: "noSources" }),
    total > 0 && none / total >= NO_PAGE_BEFORE_SHARE && sources.length > 0 && { code: "noneBefore", a: none / total },
    assistant && { code: "assistant", text: assistant.name, a: assistant.views },
  ], [
    // A busy page whose visits never convert, or one whose group has a page that converts better.
    started && ((started.visits >= 100 && started.conversions === 0) || story?.nearest)
      ? { code: "nextStep", link: "landingPage", to: toPage("all-pages/page", { key: self }) }
      : null,
    counted !== null && { code: "fixCountedAgain", link: "trackingHealth", to: toPage("tracking-health") },
    sender && { code: "keepLink", text: sender.key, link: "seePage", to: toPage("all-pages/page", { key: sender.key }) },
    assistant && { code: "checkAssistant", text: assistant.name, link: "aiAnswers", to: { url: `/app/sites/${siteId}/ai/answers` } },
  ]);
}

// ---------------------------------------------------------------------------
// 9 · Conversions and 16 · Nothing counted yet
// ---------------------------------------------------------------------------

export type ConversionsFacts = {
  /** Null before anything is collected. */
  from: string | null;
  visits: number;
  visitsBefore: number | null;
  kinds: ReadonlyArray<{ eventName: string; count: number; countBefore: number | null; setIn: string | null }>;
  /** The key events not counted that happened, most first. */
  fired: ReadonlyArray<{ eventName: string; count: number }>;
  /**
   * How visits reached a conversion (ga-conversions-visitors-plan.md CV3): each channel's and classification's visits
   * and conversions, the busiest first; null before landing pages by channel are kept.
   */
  flow?: {
    visits: number;
    channels: ReadonlyArray<{ key: string; visits: number; conversions: number }>;
    kinds: ReadonlyArray<{ kind: string; visits: number; conversions: number }>;
  } | null;
  /** What people did before converting, over 12 months (CV4); null with nothing counted. */
  before?: { siteRate: number | null; few: number; rows: ReadonlyArray<{ eventName: string; did: number; then: number }> } | null;
};

/** The flow's and grid's boxes past the busiest: never named as a channel or a classification. */
const FOLDED = new Set(["~more", "OTHER_KINDS"]);

const names = (events: ReadonlyArray<{ eventName: string }>) => events.map((event) => event.eventName).join(",");

/** Conversions: which kinds happened, the kinds counted that never do, and the share of visits converting against before. */
export function conversionsSees(facts: ConversionsFacts): Seen {
  if (!facts.from) return seen([]);
  if (facts.kinds.length === 0) {
    const likely = facts.fired.filter((event) => !NEVER_TICKED.has(event.eventName)).sort((left, right) => Number(LIKELY_CONVERSIONS.has(right.eventName)) - Number(LIKELY_CONVERSIONS.has(left.eventName)) || right.count - left.count)[0] ?? null;
    return seen([
      { code: "nothingCounted", a: facts.visits },
      likely && { code: "fired", text: likely.eventName, a: likely.count },
    ], [
      likely ? { code: "tick", text: likely.eventName, link: "chooseWhatCounts", to: CHOOSE } : { code: "chooseWhatCounts", link: "chooseWhatCounts", to: CHOOSE },
    ]);
  }
  const happened = [...facts.kinds].filter((kind) => kind.count > 0).sort((left, right) => right.count - left.count);
  const silent = facts.kinds.filter((kind) => kind.count === 0);
  const unvalued = happened.filter((kind) => kind.setIn === null);
  const total = sum(happened, (kind) => kind.count);
  const before = facts.kinds.every((kind) => kind.countBefore !== null) ? sum(facts.kinds, (kind) => kind.countBefore ?? 0) : null;
  const rate = facts.visits > 0 ? total / facts.visits : null;
  const rateBefore = before !== null && facts.visitsBefore ? before / facts.visitsBefore : null;
  // Where the conversions came from: the channel and the kind of page that made the most (CV6).
  const shown = <Row extends { visits: number; conversions: number }>(rows: ReadonlyArray<Row & { key?: string; kind?: string }>) => rows.filter((row) => !FOLDED.has(row.key ?? row.kind ?? ""));
  const flow = facts.flow ?? null;
  const fromChannel = flow && total > 0 ? [...shown(flow.channels)].sort((left, right) => right.conversions - left.conversions)[0] ?? null : null;
  const fromKind = flow && total > 0 ? [...shown(flow.kinds)].sort((left, right) => right.conversions - left.conversions)[0] ?? null : null;
  const came = fromChannel && fromKind && fromChannel.conversions > 0 && fromKind.conversions > 0
    ? fromChannel.conversions === total && fromKind.conversions === total
      ? { code: "cameAll", a: total, text: fromChannel.key, more: fromKind.kind }
      : { code: "cameMost", a: fromChannel.conversions, b: total, text: fromChannel.key, more: fromKind.kind }
    : null;
  // The channel bringing the most visits, when it made none and others did.
  const biggest = flow && total > 0 ? shown(flow.channels)[0] ?? null : null;
  const biggestNone = biggest && biggest.conversions === 0 && flow ? { code: "biggestNone", text: biggest.key, a: biggest.visits, b: flow.visits } : null;
  // The action whose people go on to convert most, above the website's own, on enough people to judge (CV4).
  const actions = facts.before ?? null;
  const siteRate = actions?.siteRate ?? null;
  const best = actions && siteRate !== null
    ? [...actions.rows].filter((row) => row.did >= actions.few && row.then / row.did > siteRate).sort((left, right) => right.then / right.did - left.then / left.did)[0] ?? null
    : null;
  const fired = facts.fired;
  const says: Array<Maybe<SeenPhrase>> = [
    total === 0 ? { code: "noneHappened", a: facts.kinds.length }
      : happened.length === 1 ? { code: "allOne", text: happened[0].eventName, a: total }
        : { code: "topKind", text: happened[0].eventName, a: happened[0].count, b: total },
    came,
    biggestNone,
    best && siteRate !== null && { code: "beforeBest", text: best.eventName, a: best.then / best.did, b: siteRate },
    fired.length > 0 && { code: "uncounted", text: names(fired), a: sum(fired, (event) => event.count) },
    total > 0 && silent.length > 0 && { code: "silent", text: names(silent), a: silent.length },
    !came && rate !== null && rateBefore !== null && rate !== rateBefore && { code: rate < rateBefore ? "rateDown" : "rateUp", a: rateBefore, b: rate },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    biggestNone && { code: "openChannel", text: biggestNone.text, link: "channel", to: toPage("channels/channel", { key: biggestNone.text }) },
    fired.length > 0 && { code: "countUncounted", text: names(fired), a: fired.length, link: "changeWhatCounts", to: CHOOSE },
    silent.length > 0 && { code: "trySilent", text: names(silent), a: silent.length, link: "trackingHealth", to: toPage("tracking-health") },
    unvalued.length > 0 && { code: "setValue", text: names(unvalued), a: unvalued.length, link: "changeWhatCounts", to: CHOOSE },
  ];
  return seen(says, steps);
}

// ---------------------------------------------------------------------------
// The website's connection: 10 · Tracking health, 11 · Connection,
// 12 · Not connected yet, 14 · Choose what counts
// ---------------------------------------------------------------------------

type Check = { check: string; passing: boolean; names?: string[]; others?: string[]; count?: number; share?: number };

/**
 * The checks, the one that costs most first: no figures at all, then none of
 * them right (a conversion that is really something else), then some missing
 * or wrong.
 */
const CHECK_ORDER = [
  "TRACKING_STOPPED", "NOTHING_COUNTED", "SOMETHING_ELSE", "TOO_MUCH_UNKNOWN", "ENQUIRY_UNCOUNTED", "NEVER_HAPPENS", "SUDDEN_FALL",
  "NO_VALUE", "PAYMENT_REFERRALS", "SELF_REFERRAL", "STRANGERS", "COUNTED_AGAIN",
];

/** Checks the costliest first, as What Hakken sees names them and the Tracking health page lists them (Anthony, 2026-10-13). */
export function inCheckOrder<T extends { check: string }>(checks: readonly T[]): T[] {
  const rank = (check: string) => (CHECK_ORDER.includes(check) ? CHECK_ORDER.indexOf(check) : CHECK_ORDER.length);
  return [...checks].sort((left, right) => rank(left.check) - rank(right.check));
}

/** Where each check is fixed. */
const CHECK_FIX: Record<string, { link: string; to: SeenTarget }> = {
  TRACKING_STOPPED: { link: "overview", to: toPage("") },
  NOTHING_COUNTED: { link: "chooseWhatCounts", to: CHOOSE },
  SOMETHING_ELSE: { link: "conversions", to: toPage("conversions") },
  TOO_MUCH_UNKNOWN: { link: "landingPages", to: toPage("funnel") },
  ENQUIRY_UNCOUNTED: { link: "chooseWhatCounts", to: CHOOSE },
  NEVER_HAPPENS: { link: "conversions", to: toPage("conversions") },
  SUDDEN_FALL: { link: "conversions", to: toPage("conversions") },
  NO_VALUE: { link: "changeWhatCounts", to: CHOOSE },
  PAYMENT_REFERRALS: { link: "referrals", to: toPage("channels/channel", { key: "Referral" }) },
  SELF_REFERRAL: { link: "referrals", to: toPage("channels/channel", { key: "Referral" }) },
  STRANGERS: { link: "connection", to: toPage("connection") },
  COUNTED_AGAIN: { link: "allPages", to: toPage("all-pages") },
};

/** The checks whose names are conversions or events, named in the reader's words (`{event}`). */
const NAMES_EVENTS = new Set(["NO_VALUE", "ENQUIRY_UNCOUNTED", "NEVER_HAPPENS"]);

/**
 * One failing check in a sentence: its share (or count) and count, which way
 * a sudden fall went, and the events it names by their own names — for a
 * conversion that is really something else, the first and what it really is.
 */
function checkSays(check: Check): SeenPhrase {
  const fell = check.check === "SUDDEN_FALL" ? `.${check.names?.[0] === "conversions" ? "conversions" : "visits"}` : "";
  const named = check.check === "SOMETHING_ELSE" && check.names?.length
    ? { text: [check.names[0], check.others?.[0] ?? ""].filter(Boolean).join(","), c: check.names.length }
    : NAMES_EVENTS.has(check.check) && check.names?.length ? { text: check.names.join(","), c: check.names.length } : {};
  return {
    code: `check.${check.check}${fell}`,
    a: check.share ?? check.count ?? 0,
    b: check.count ?? 0,
    ...named,
  };
}

/** Tracking health: how many checks need a look, the costliest two, and how to fix each. */
export function trackingHealthSees(health: { checks: readonly Check[] } | null): Seen {
  if (!health || health.checks.length === 0) return seen([]);
  const failing = inCheckOrder(health.checks.filter((check) => !check.passing));
  if (failing.length === 0) return seen([{ code: "allPassing", a: health.checks.length }]);
  return seen(
    [{ code: "failing", a: failing.length, b: health.checks.length }, ...failing.slice(0, 2).map(checkSays)],
    failing.map((check): SeenStep => ({ code: `fix.${check.check}`, ...CHECK_FIX[check.check] })),
  );
}

/** Google Analytics itself, where most fixes are made. */
const GOOGLE_ANALYTICS: SeenTarget = { url: "https://analytics.google.com/" };
const theWebsite = (host: string): SeenTarget => ({ url: `https://${host}/` });

/**
 * Where each step of a check's fix is done (ga-tracking-health-plan.md TH2),
 * in the order of its steps' words (`step.<check>.s1`, `s2`, …): a page of
 * this section, the website itself, or Google Analytics.
 */
const CHECK_STEPS: Record<string, (host: string) => Array<{ link: string; to: SeenTarget }>> = {
  TRACKING_STOPPED: (host) => [{ link: "yourWebsite", to: theWebsite(host) }, { link: "googleAnalytics", to: GOOGLE_ANALYTICS }],
  NOTHING_COUNTED: () => [{ link: "chooseWhatCounts", to: CHOOSE }],
  SOMETHING_ELSE: () => [{ link: "googleAnalytics", to: GOOGLE_ANALYTICS }, { link: "conversions", to: toPage("conversions") }],
  TOO_MUCH_UNKNOWN: () => [{ link: "campaigns", to: toPage("campaigns") }, { link: "landingPages", to: toPage("funnel") }],
  ENQUIRY_UNCOUNTED: () => [{ link: "chooseWhatCounts", to: CHOOSE }],
  NEVER_HAPPENS: (host) => [
    { link: "yourWebsite", to: theWebsite(host) }, { link: "googleAnalytics", to: GOOGLE_ANALYTICS }, { link: "conversions", to: toPage("conversions") },
  ],
  SUDDEN_FALL: (host) => [{ link: "yourWebsite", to: theWebsite(host) }, { link: "conversions", to: toPage("conversions") }],
  NO_VALUE: () => [{ link: "changeWhatCounts", to: CHOOSE }],
  PAYMENT_REFERRALS: () => [{ link: "googleAnalytics", to: GOOGLE_ANALYTICS }, { link: "referrals", to: toPage("channels/channel", { key: "Referral" }) }],
  SELF_REFERRAL: (host) => [{ link: "googleAnalytics", to: GOOGLE_ANALYTICS }, { link: "yourWebsite", to: theWebsite(host) }],
  STRANGERS: () => [{ link: "googleAnalytics", to: GOOGLE_ANALYTICS }],
  COUNTED_AGAIN: () => [{ link: "googleAnalytics", to: GOOGLE_ANALYTICS }, { link: "allPages", to: toPage("all-pages") }],
};

/** The checks a check's own screen knows, each with its steps. */
export const HEALTH_CHECKS_WITH_STEPS = Object.keys(CHECK_STEPS);

/**
 * A check's own screen (ga-tracking-health-plan.md TH2): what it found and
 * why that matters, then its fix as numbered steps, each with where it is
 * done; a passing check says so in a sentence.
 */
export function trackingCheckSees(check: Check | null, host: string): Seen {
  if (!check || !CHECK_STEPS[check.check]) return seen([]);
  if (check.passing) return seen([{ code: `passing.${check.check}` }]);
  const found = checkSays(check);
  // The steps that name its events say them as its sentence does.
  const named = found.text !== undefined ? { text: found.text, ...(found.c !== undefined ? { c: found.c } : {}) } : {};
  return seen(
    [found, { code: `why.${check.check}` }],
    CHECK_STEPS[check.check](host).map((step, at): SeenStep => ({ code: `step.${check.check}.s${at + 1}`, ...named, ...step })),
  );
}

type CountedEvent = { eventName: string; counted: boolean; analyticsValue: number | null; hakkenValue: number | null; lastThirtyDays: number };

/** Connection: whether it is collecting, what counts and what each is worth, and the kinds that never happen. */
export function connectionSees(host: string, status: string, events: readonly CountedEvent[] | null): Seen {
  if (status !== "CONNECTED" && status !== "NEEDS_RECONNECT" && status !== "DISCONNECTED") return seen([]);
  const state: SeenPhrase = { code: status === "CONNECTED" ? "collected" : "stopped", text: host };
  const counted = (events ?? []).filter((event) => event.counted);
  if (counted.length === 0) return seen([state, { code: "nothingCounted" }], [{ code: "chooseWhatCounts", link: "chooseWhatCounts", to: CHOOSE }]);
  // A purchase is worth its own revenue: only the others are priced.
  const priced = counted.filter((event) => event.eventName !== PURCHASE_EVENT);
  const each = priced.map((event) => event.analyticsValue ?? event.hakkenValue);
  const oneValue = priced.length > 0 && priced.every((event) => event.analyticsValue === null && event.hakkenValue !== null) && new Set(each).size === 1
    ? Math.round((each[0] ?? 0) * 100) : null;
  const happened = counted.filter((event) => event.lastThirtyDays > 0).sort((left, right) => right.lastThirtyDays - left.lastThirtyDays);
  const silent = counted.filter((event) => event.lastThirtyDays === 0);
  const unvalued = priced.filter((event) => event.analyticsValue === null && event.hakkenValue === null);
  const says: Array<Maybe<SeenPhrase>> = [
    state,
    counted.length === 1 ? { code: oneValue !== null ? "oneKindValued" : "oneKind", text: counted[0].eventName, a: oneValue ?? 0 }
      : oneValue !== null ? { code: "kindsValued", a: counted.length, b: oneValue } : { code: "kinds", a: counted.length },
    happened.length === 0 ? { code: "noneHappened" } : silent.length > 0 && { code: "onlyHappened", text: names(happened), a: happened.length },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    unvalued.length > 0 && { code: "setMissing", text: names(unvalued), a: unvalued.length, link: "changeWhatCounts", to: CHOOSE },
    oneValue !== null && { code: "setWorth", text: (happened[0] ?? priced[0]).eventName, a: oneValue, link: "changeWhatCounts", to: CHOOSE },
    silent.length > 0 && happened.length > 0 && { code: "checkSilent", text: names(silent), a: silent.length, link: "trackingHealth", to: toPage("tracking-health") },
  ];
  return seen(says, steps);
}

/** Not connected yet, with Search Console connected: its clicks, which cannot say which visits made money. */
export function connectSees(host: string, searchConsole: { clicks: number; impressions: number } | null): Seen {
  if (!searchConsole || searchConsole.impressions <= 0) return seen([]);
  return seen(
    [{ code: "searchConsole", text: host, a: searchConsole.clicks, b: searchConsole.impressions }, { code: "cantSay" }],
    [{ code: "add", link: "addGoogleAnalytics", to: toPage("connection") }],
  );
}

/**
 * Choose what counts: which key events happened, Purchase ticked on a website that sold nothing, and those that never fire.
 * `lookalikes` are the events Tracking health found copying one never an enquiry, day for day (Ronins' "Form sent", its
 * link clicks): never named as an enquiry, never offered to tick.
 */
export function chooseEventsSees(host: string, events: readonly CountedEvent[] | null, lookalikes: ReadonlySet<string> = new Set()): Seen {
  if (!events) return seen([]);
  if (events.length === 0) return seen([{ code: "noKeyEvents" }]);
  // A scroll or a video play is never a conversion (GA5): never named as one, never offered to tick.
  const fired = events
    .filter((event) => event.lastThirtyDays > 0 && !NEVER_TICKED.has(event.eventName) && !lookalikes.has(event.eventName))
    .sort((left, right) => right.lastThirtyDays - left.lastThirtyDays);
  const purchase = events.find((event) => event.eventName === PURCHASE_EVENT && event.counted && event.lastThirtyDays === 0) ?? null;
  const silent = events.filter((event) => event.lastThirtyDays === 0 && event.eventName !== PURCHASE_EVENT && LIKELY_CONVERSIONS.has(event.eventName));
  const unticked = fired.filter((event) => !event.counted);
  const says: Array<Maybe<SeenPhrase>> = [
    fired.length === 0 ? { code: "noneFired", a: events.length }
      : fired.length === 1 ? { code: "onlyFired", text: fired[0].eventName, a: fired[0].lastThirtyDays, b: events.length }
        : { code: "fired", text: fired[0].eventName, a: fired.length, b: events.length, c: fired[0].lastThirtyDays },
    purchase && { code: "purchaseSilent", text: host },
    silent.length > 0 && { code: fired.length > 0 ? "silentToo" : "silent", text: names(silent), a: silent.length },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    unticked.length > 0
      ? { code: purchase ? "tickUntickPurchase" : "tick", text: names(unticked), a: unticked.length, link: "chooseWhatCounts", to: CHOOSE }
      : purchase && { code: "untickPurchase", link: "chooseWhatCounts", to: CHOOSE },
    silent.length > 0 && { code: "checkSilent", text: names(silent), a: silent.length, link: "trackingHealth", to: toPage("tracking-health") },
  ];
  return seen(says, steps);
}
