import { seen, toPage, type Seen, type SeenPhrase, type SeenStep, type SeenTarget } from "../hakkenSees";
import { AI_ASSISTANTS_CHANNEL } from "../aiAssistants";
import { UNKNOWN_SHARE } from "./analytics";

/**
 * What Hakken sees on Channels and on a channel's own page
 * (docs/plans/active/ga-channel-pages-plan.md CH12): fixed rules over the
 * Google Analytics figures the pages' own reads hold, the same for any
 * website, each saying nothing when its figures can't support it. Sent as
 * codes with their numbers for the screen's words
 * (`googleAnalytics.seen.channelPage`, `…channelsPage`).
 *
 * A page goes as its shared page number (`~…`), named by the query
 * (`namedSeen`); a page group as its key — a classification's id,
 * `type:SERVICE` for Hakken's own page types, `NOT_SORTED` or `NO_PAGE` —
 * named by the screen. A conversion goes as its event, named by the screen.
 * A count with no number slot of its own goes in `more` as its figure.
 */

type Maybe<T> = T | null | undefined | false;

/** R2: a page that made conversions before, whose visits fell by this share or more. */
export const PAGE_FALL_SHARE = 0.2;
/** R5: Direct's people new to the website at this share or more read as links whose source was lost. */
export const NEW_PEOPLE_SHARE = 0.7;
/** R5: too few people to read a share from below this. */
export const NEW_PEOPLE_FLOOR = 10;
/** R9: a channel starting this many more conversions than it finishes introduces buyers. */
export const STARTS_MORE = 2;
/** R1: a page group gaining or losing fewer visits than this is no shift worth saying. */
export const SHIFT_VISITS = 3;
/** R1's step: a page group gaining this many visits and converting none wants a way on. */
export const ROUTE_VISITS = 10;

/** The key of the visits Google Analytics put to no landing page. */
export const NO_PAGE_KIND = "NO_PAGE";
/** Google Analytics' own word for a visit with no landing page, as its landing lists name it. */
export const NO_PAGE_ADDRESS = "(not set)";
/** The page groups past the columns of Channels' map, as one (CH9). */
export const OTHER_KIND = "OTHER_KINDS";

/** A way a figure moved: up, down, the same, or — conversions only — none either side. */
function way(now: number, before: number): "up" | "down" | "same" {
  return now > before ? "up" : now < before ? "down" : "same";
}
function conversionsWay(now: number, before: number): "up" | "down" | "same" | "none" {
  return now === 0 && before === 0 ? "none" : way(now, before);
}

/** The way to choose what counts and what each is worth: the Connection page, changing. */
const CHOOSE: SeenTarget = toPage("connection", { change: "1" });

/** A landing page's own screen: only a page Hakken has numbered has one. */
function pageTarget(key: string): SeenTarget | null {
  return key.startsWith("~") ? toPage("all-pages/page", { key }) : null;
}

export type KindFacts = { kind: string; visits: number; visitsBefore: number; conversions: number; conversionsBefore: number };
export type PageFacts = { key: string; visits: number; visitsBefore: number | null; conversions: number; conversionsBefore: number | null };
/** A key event not counted that happened, and whether Tracking health reads it as an enquiry (CH12, R3). */
export type UncountedFacts = { eventName: string; count: number; enquiry: boolean };
/** A counted conversion Tracking health finds is really another event (check 10), and how often it happened here. */
export type CopyFacts = { eventName: string; other: string; count: number };

export type ChannelPageFacts = {
  channel: string;
  figures: {
    visits: number;
    visitsBefore: number | null;
    engaged: number;
    people: number;
    newPeople: number;
    conversions: number;
    conversionsBefore: number | null;
    /** Conversions by the people this channel first brought (CH3): null when not held. */
    started: number | null;
  };
  /** Its landing visits by page group, now and before (CH5). */
  kinds: readonly KindFacts[];
  /** Its landing pages, now and before (CH6, R2). */
  pages: readonly PageFacts[];
  /** Its visits with no landing page recorded. */
  noPage: { visits: number; engaged: number } | null;
  uncounted: readonly UncountedFacts[];
  copies: readonly CopyFacts[];
  /** AI assistants: their visits, and those Google filed outside its own AI Assistant channel (R6). */
  ai: { visits: number; elsewhere: number } | null;
  /** The channel's 90-day spans and 12 months (R7): null when not held. */
  spans: { last90: number; previous90: number; yearAgo90: number; year: number; yearBefore: number } | null;
};

/** R1: the page group gaining most visits and the one losing most, past the floor. */
function shiftOf(kinds: readonly KindFacts[]): { gained: KindFacts | null; lost: KindFacts | null } {
  const moved = kinds.filter((kind) => kind.kind !== NO_PAGE_KIND).map((kind) => ({ kind, by: kind.visits - kind.visitsBefore }));
  const gained = moved.filter((move) => move.by >= SHIFT_VISITS).sort((left, right) => right.by - left.by)[0]?.kind ?? null;
  const lost = moved.filter((move) => move.by <= -SHIFT_VISITS).sort((left, right) => left.by - right.by)[0]?.kind ?? null;
  return { gained, lost };
}

/** R2: the page that made the most conversions before and lost a fifth or more of its visits. */
function pageFellOf(pages: readonly PageFacts[]): PageFacts | null {
  return pages
    .filter((page) => (page.conversionsBefore ?? 0) > 0 && (page.visitsBefore ?? 0) > 0 && ((page.visitsBefore ?? 0) - page.visits) / (page.visitsBefore ?? 1) >= PAGE_FALL_SHARE)
    .sort((left, right) => (right.conversionsBefore ?? 0) - (left.conversionsBefore ?? 0) || (right.visitsBefore ?? 0) - (left.visitsBefore ?? 0))[0] ?? null;
}

/** R7: growing over the 12 months, but the last 90 days below the 90 before and the same 90 a year ago. */
function fallingNow(spans: ChannelPageFacts["spans"]): boolean {
  return spans !== null && spans.year > spans.yearBefore && spans.last90 < spans.previous90 && spans.last90 < spans.yearAgo90;
}

/**
 * A channel's own page (CH2, CH12): how its visits and conversions moved, the
 * page that made conversions and is losing its visits, where the change went
 * by page group, a key event not counted, a fall the year's total hides, AI
 * visits filed elsewhere, visits with no page, Direct's lost sources, and
 * conversions it starts. Its steps: win that page back, give a growing group
 * that converts nothing a way on, count an enquiry, fix the missing pages,
 * tag the links.
 */
export function channelPageSees(facts: ChannelPageFacts): Seen {
  const { channel, figures } = facts;
  if (figures.visits === 0) return seen([{ code: "none", text: channel }]);
  const lead: SeenPhrase = figures.visitsBefore === null || figures.conversionsBefore === null
    ? { code: "leadNew", text: channel, a: figures.visits, c: figures.conversions }
    : {
      code: `lead.${way(figures.visits, figures.visitsBefore)}.${conversionsWay(figures.conversions, figures.conversionsBefore)}`,
      text: channel, a: figures.visits, b: figures.visitsBefore, c: figures.conversions, more: String(figures.conversionsBefore),
    };
  const fell = pageFellOf(facts.pages);
  const { gained, lost } = shiftOf(facts.kinds);
  const shift: Maybe<SeenPhrase> = gained && lost
    ? { code: "shift", text: gained.kind, a: gained.visitsBefore, b: gained.visits, more: lost.kind, c: lost.visits }
    : gained ? { code: "shiftGain", text: gained.kind, a: gained.visitsBefore, b: gained.visits }
      : lost && { code: "shiftLoss", text: lost.kind, a: lost.visitsBefore, b: lost.visits };
  const uncounted = [...facts.uncounted].filter((event) => event.count > 0).sort((left, right) => Number(right.enquiry) - Number(left.enquiry) || right.count - left.count)[0] ?? null;
  const copy = [...facts.copies].filter((event) => event.count > 0).sort((left, right) => right.count - left.count)[0] ?? null;
  const noPage = facts.noPage && facts.noPage.visits / figures.visits > UNKNOWN_SHARE && figures.visits > facts.noPage.visits ? facts.noPage : null;
  const lostSources = channel === "Direct" && figures.people >= NEW_PEOPLE_FLOOR && figures.newPeople / figures.people >= NEW_PEOPLE_SHARE;
  const starts = figures.started !== null && figures.started >= figures.conversions + STARTS_MORE;
  const routeOn = gained && gained.conversions === 0 && gained.visits >= ROUTE_VISITS && facts.kinds.some((kind) => kind.conversions + kind.conversionsBefore > 0) ? gained : null;
  const fellTo = fell ? pageTarget(fell.key) : null;
  // The box keeps three: what is particular to this channel and what wants doing first, then where the change went,
  // then the rest (Direct's lost sources were crowded out by the shift, 2026-10-13).
  const events: Maybe<SeenPhrase> = copy ? { code: "copy", text: copy.eventName, more: copy.other, a: copy.count }
    : uncounted && { code: uncounted.enquiry ? "uncountedEnquiry" : "uncounted", text: uncounted.eventName, a: uncounted.count };
  const urgent = copy !== null || uncounted?.enquiry === true;
  const says: Array<Maybe<SeenPhrase>> = [
    lead,
    fell && { code: "pageFell", text: fell.key, a: fell.visitsBefore ?? 0, b: fell.visits, c: fell.conversionsBefore ?? 0 },
    lostSources && { code: "lostSources", a: figures.newPeople, b: figures.people },
    fallingNow(facts.spans) && facts.spans && { code: "fallingNow", a: facts.spans.last90, b: facts.spans.previous90, c: facts.spans.yearAgo90 },
    facts.ai && facts.ai.elsewhere > 0 && { code: "filedElsewhere", a: facts.ai.elsewhere, b: facts.ai.visits },
    urgent && events,
    shift,
    noPage && { code: "noPage", a: noPage.visits, b: (figures.engaged - noPage.engaged) / (figures.visits - noPage.visits), c: figures.engaged / figures.visits },
    starts && { code: "starts", a: figures.started ?? 0, b: figures.conversions },
    !urgent && events,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    fell && fellTo && { code: "winBack", text: fell.key, a: fell.visits, b: fell.visitsBefore ?? 0, link: "seePage", to: fellTo },
    routeOn && { code: "routeOn", text: routeOn.kind, a: routeOn.visits, link: "classifications", to: toPage("channels/channel", { key: channel, view: "groups" }) },
    copy ? { code: "checkCopy", text: copy.eventName, more: copy.other, link: "trackingHealth", to: toPage("tracking-health") }
      : uncounted?.enquiry && { code: "countIt", text: uncounted.eventName, a: uncounted.count, link: "chooseWhatCounts", to: CHOOSE },
    noPage && { code: "fixNoPage", a: noPage.visits, link: "trackingHealth", to: toPage("tracking-health") },
    lostSources && { code: "tagLinks", link: "campaigns", to: toPage("campaigns") },
  ];
  return seen(says, steps);
}

export type ChannelRowFacts = { channel: string; visits: number; visitsBefore: number | null; conversions: number; conversionsBefore: number | null };

export type ChannelsPageFacts = {
  rows: readonly ChannelRowFacts[];
  /** The channel converting best over 12 months among those with enough visits (R8): its rate and the website's. */
  best: { channel: string; rate: number; siteRate: number } | null;
  /** Key events not counted that happened, each with the channel that brought it most. */
  uncounted: ReadonlyArray<UncountedFacts & { channel: string }>;
  /** Visits with no landing page recorded, across the channels. */
  noPage: number;
  ai: { visits: number; elsewhere: number } | null;
};

/**
 * Channels (CH9, CH12): how the website's visits and conversions moved, the
 * channel bringing the most visits and whether it converts, a key event not
 * counted and the channel bringing it, the channel converting best over 12
 * months. Its steps: see why a channel stopped converting, count an enquiry,
 * fix the missing pages.
 */
export function channelsPageSees(facts: ChannelsPageFacts): Seen {
  const rows = facts.rows.filter((row) => row.visits > 0);
  if (rows.length === 0) return seen([{ code: "none" }]);
  const visits = rows.reduce((sum, row) => sum + row.visits, 0);
  const conversions = rows.reduce((sum, row) => sum + row.conversions, 0);
  const held = rows.every((row) => row.visitsBefore !== null && row.conversionsBefore !== null);
  const visitsBefore = facts.rows.reduce((sum, row) => sum + (row.visitsBefore ?? 0), 0);
  const conversionsBefore = facts.rows.reduce((sum, row) => sum + (row.conversionsBefore ?? 0), 0);
  const lead: SeenPhrase = held
    ? { code: `lead.${way(visits, visitsBefore)}.${conversionsWay(conversions, conversionsBefore)}`, a: visits, b: visitsBefore, c: conversions, more: String(conversionsBefore) }
    : { code: "leadNew", a: visits, c: conversions };
  const top = [...rows].sort((left, right) => right.visits - left.visits)[0];
  const converter = [...rows].filter((row) => row.conversions > 0).sort((left, right) => right.conversions - left.conversions || right.visits - left.visits)[0] ?? null;
  const topSays: SeenPhrase = top.conversions === 0 && converter
    ? { code: "topNone", text: top.channel, a: top.visits / visits, more: converter.channel, b: converter.visits, c: converter.conversions }
    : { code: "top", text: top.channel, a: top.visits / visits, b: top.conversions, c: conversions };
  const stopped = [...facts.rows]
    .filter((row) => row.conversionsBefore !== null && row.conversionsBefore >= STARTS_MORE && row.conversions === 0)
    .sort((left, right) => (right.conversionsBefore ?? 0) - (left.conversionsBefore ?? 0))[0] ?? null;
  const uncounted = [...facts.uncounted].filter((event) => event.count > 0).sort((left, right) => Number(right.enquiry) - Number(left.enquiry) || right.count - left.count)[0] ?? null;
  const noPage = visits > 0 && facts.noPage / visits > UNKNOWN_SHARE ? facts.noPage : 0;
  const says: Array<Maybe<SeenPhrase>> = [
    lead,
    topSays,
    uncounted && { code: uncounted.enquiry ? "uncountedEnquiry" : "uncounted", text: uncounted.eventName, a: uncounted.count, more: uncounted.channel },
    facts.best && { code: "best", text: facts.best.channel, a: facts.best.rate, b: facts.best.siteRate },
    facts.ai && facts.ai.elsewhere > 0 && { code: "filedElsewhere", a: facts.ai.elsewhere, b: facts.ai.visits },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    stopped && { code: "whyStopped", text: stopped.channel, a: stopped.conversionsBefore ?? 0, link: "channel", to: toPage("channels/channel", { key: stopped.channel }) },
    uncounted?.enquiry && { code: "countIt", text: uncounted.eventName, a: uncounted.count, link: "chooseWhatCounts", to: CHOOSE },
    noPage > 0 && { code: "fixNoPage", a: noPage, link: "trackingHealth", to: toPage("tracking-health") },
    facts.ai && facts.ai.elsewhere > 0 && !stopped && { code: "seeAssistants", a: facts.ai.visits, link: "aiAssistants", to: toPage("channels/channel", { key: AI_ASSISTANTS_CHANNEL }) },
  ];
  return seen(says, steps);
}
