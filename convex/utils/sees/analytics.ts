import { seen, toPage, type Seen, type SeenPhrase, type SeenStep, type SeenTarget } from "../hakkenSees";
import { AI_ASSISTANTS_CHANNEL } from "../aiAssistants";
import { LIKELY_CONVERSIONS, NEVER_TICKED, PURCHASE_EVENT } from "../analyticsEvents";
import { NOT_SORTED_KIND } from "../pageKinds";

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
  return key.startsWith("~") ? toPage("landing-pages/page", { key }) : null;
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
  const push: Maybe<SeenStep> = google && google.code === "googleRarely" && { code: "push", link: "pagesToPush", to: toPage("heroes", { tab: "push" }) };
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
    fell && { code: "whyFell", text: fell.row.label, a: fell.row.conversions, b: fell.row.conversionsBefore ?? 0, link: "landingPages", to: toPage("landing-pages") },
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
    (figures.conversions === 0 || leaves) && { code: "nextStep", text: top.label, link: "landingPages", to: toPage("landing-pages") },
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
    unsorted && { code: "seeUnsorted", a: unsorted.members ?? 0, link: "unsortedPages", to: toPage("landing-pages", { view: "pages", group: NOT_SORTED }) },
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

/** All pages: how few pages make the conversions, the one making the most, and the most viewed making none. */
export function allPagesSees(rows: readonly ListRowFacts[], counting: boolean): Seen {
  if (rows.length === 0) return seen([{ code: "none" }]);
  if (!counting) return seen([{ code: "notCounting", a: rows.length }], [{ code: "chooseWhatCounts", link: "chooseWhatCounts", to: CHOOSE }]);
  const converting = rows.filter((row) => row.conversions > 0);
  const total = sum(converting, (row) => row.conversions);
  if (total === 0) return seen([{ code: "noConversions", a: rows.length }]);
  const best = [...converting].sort((left, right) => right.conversions - left.conversions || right.value - left.value)[0];
  const viewed = [...rows].sort((left, right) => right.views - left.views);
  const idle = viewed.find((row) => row.conversions === 0 && row.views > 0) ?? null;
  const idleTo = idle ? pageTarget(idle.key) : null;
  return seen([
    { code: "madeOn", a: total, b: converting.length },
    { code: "best", text: best.label, a: best.conversions, b: best.views },
    idle && { code: idle === viewed[0] ? "idleMostViewed" : "idle", text: idle.label, a: idle.views },
  ], [
    idle && idleTo && { code: "copy", text: best.label, more: idle.label, link: "seePage", to: idleTo },
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
};

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
  const says: Array<Maybe<SeenPhrase>> = [
    total === 0 ? { code: "noneHappened", a: facts.kinds.length }
      : happened.length === 1 ? { code: "allOne", text: happened[0].eventName, a: total }
        : { code: "topKind", text: happened[0].eventName, a: happened[0].count, b: total },
    total > 0 && silent.length > 0 && { code: "silent", text: names(silent), a: silent.length },
    rate !== null && rateBefore !== null && rate !== rateBefore && { code: rate < rateBefore ? "rateDown" : "rateUp", a: rateBefore, b: rate },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    silent.length > 0 && { code: "trySilent", text: names(silent), a: silent.length, link: "trackingHealth", to: toPage("tracking-health") },
    unvalued.length > 0 && { code: "setValue", text: names(unvalued), a: unvalued.length, link: "changeWhatCounts", to: CHOOSE },
  ];
  return seen(says, steps);
}

// ---------------------------------------------------------------------------
// The website's connection: 10 · Tracking health, 11 · Connection,
// 12 · Not connected yet, 14 · Choose what counts
// ---------------------------------------------------------------------------

type Check = { check: string; passing: boolean; names?: string[]; count?: number; share?: number };

/** The checks, the one that costs most first: no figures at all, then none of them right, then some wrong. */
const CHECK_ORDER = ["TRACKING_STOPPED", "NOTHING_COUNTED", "TOO_MUCH_UNKNOWN", "SUDDEN_FALL", "NO_VALUE", "PAYMENT_REFERRALS", "SELF_REFERRAL", "STRANGERS"];

/** Where each check is fixed. */
const CHECK_FIX: Record<string, { link: string; to: SeenTarget }> = {
  TRACKING_STOPPED: { link: "overview", to: toPage("") },
  NOTHING_COUNTED: { link: "chooseWhatCounts", to: CHOOSE },
  TOO_MUCH_UNKNOWN: { link: "landingPages", to: toPage("landing-pages") },
  SUDDEN_FALL: { link: "conversions", to: toPage("conversions") },
  NO_VALUE: { link: "changeWhatCounts", to: CHOOSE },
  PAYMENT_REFERRALS: { link: "referrals", to: toPage("channels/channel", { key: "Referral" }) },
  SELF_REFERRAL: { link: "referrals", to: toPage("channels/channel", { key: "Referral" }) },
  STRANGERS: { link: "connection", to: toPage("connection") },
};

/**
 * One failing check in a sentence: its share (or count) and count, which way
 * a sudden fall went, and the conversions with no value by their own names.
 */
function checkSays(check: Check): SeenPhrase {
  const fell = check.check === "SUDDEN_FALL" ? `.${check.names?.[0] === "conversions" ? "conversions" : "visits"}` : "";
  return {
    code: `check.${check.check}${fell}`,
    a: check.share ?? check.count ?? 0,
    b: check.count ?? 0,
    ...(check.check === "NO_VALUE" && check.names?.length ? { text: check.names.join(","), c: check.names.length } : {}),
  };
}

/** Tracking health: how many checks need a look, the costliest two, and how to fix each. */
export function trackingHealthSees(health: { checks: readonly Check[] } | null): Seen {
  if (!health || health.checks.length === 0) return seen([]);
  const failing = health.checks.filter((check) => !check.passing)
    .sort((left, right) => CHECK_ORDER.indexOf(left.check) - CHECK_ORDER.indexOf(right.check));
  if (failing.length === 0) return seen([{ code: "allPassing", a: health.checks.length }]);
  return seen(
    [{ code: "failing", a: failing.length, b: health.checks.length }, ...failing.slice(0, 2).map(checkSays)],
    failing.map((check): SeenStep => ({ code: `fix.${check.check}`, ...CHECK_FIX[check.check] })),
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

/** Choose what counts: which key events happened, Purchase ticked on a website that sold nothing, and those that never fire. */
export function chooseEventsSees(host: string, events: readonly CountedEvent[] | null): Seen {
  if (!events) return seen([]);
  if (events.length === 0) return seen([{ code: "noKeyEvents" }]);
  // A scroll or a video play is never a conversion (GA5): never named as one, never offered to tick.
  const fired = events
    .filter((event) => event.lastThirtyDays > 0 && !NEVER_TICKED.has(event.eventName))
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
