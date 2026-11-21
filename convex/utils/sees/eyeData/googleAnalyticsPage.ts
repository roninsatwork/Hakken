import type { PageBoxes } from "../../../googleAnalyticsPageBoxes";
import type { PageStory } from "../../../googleAnalyticsPageStory";
import { eyeWithParts } from "./googleAnalyticsShared";

/**
 * What a page's own Google Analytics screen hands its eye (`all-pages/page/page.tsx`, page-screen-redo-plan-2026-11-03.md,
 * step 2), built in one place for the screen and for a chat app's question (`chatAppEyes/googleAnalytics.ts`), so the
 * two can't disagree (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B): only what the screen shows, with no
 * money, people, time, page before or links clicked. Rows carry a `name` so code can find figures in them. The boxes
 * (`PageBoxes`) and the visits by channel (`ConversionExplorerCard`) read their own figures and hand them over as parts.
 */

/** The page's two reads side by side (`analyticsPage`, `analyticsPageStory`): its own figures, and its story. */
export type PageAnswerForEye = {
  points: ReadonlyArray<{ day: string; views: number }>;
  row: { views: number } | null;
  viewsBefore?: number | null;
  story: PageStory;
};

/** The two reads as one answer: null when either finds nothing, undefined while either loads. */
export function pageAnswerOf<Main extends object, Told extends object>(main: Main | null | undefined, told: Told | null | undefined): (Main & Told) | null | undefined {
  return main === null || told === null ? null : main && told ? { ...main, ...told } : undefined;
}

// Names as people say them (Anthony, 2026-11-03: a reading age of 14), as the screen names them: Google's own device
// names (Anthony, 2026-11-03: "the words the supplier uses").
const DEVICE_NAMES: Record<string, string> = { mobile: "Mobile", desktop: "Desktop", tablet: "Tablet" };
const GENDER_NAMES: Record<string, string> = { female: "Female", male: "Male" };
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The page's own figures as the eye reads them, with the names its own findings use ("This page", "The whole website"). */
export function pageSeesData(answer: PageAnswerForEye, names: Record<string, string>) {
  const story = answer.story;
  let country: Intl.DisplayNames | null = null;
  try {
    country = new Intl.DisplayNames(["en-GB"], { type: "region" });
  } catch {
    country = null;
  }
  return {
    days: answer.points.map((point) => ({ day: point.day, views: point.views })),
    sources: story.sources.map((row) => ({ name: row.name ?? (row.source === "(direct)" ? "Typed in or a bookmark" : "Not known"), channel: row.channel, visits: row.visits, pagesPerVisit: row.pages, scrolledToBottomRate: row.read, cameBackRate: row.back })),
    devices: story.devices.map((row) => ({ name: DEVICE_NAMES[row.device] ?? row.device, viewsShare: row.share, websiteViewsShare: row.websiteShare })),
    countries: story.countries.map((row) => ({ name: country?.of(row.code) ?? row.code, people: row.people })),
    ages: story.ages.rows.map((row) => ({ name: `Aged ${row.key.replace("-", " to ")}`, peopleShare: row.share, websitePeopleShare: row.websiteShare })),
    genders: story.genders.rows.map((row) => ({ name: GENDER_NAMES[row.key] ?? row.key, peopleShare: row.share, websitePeopleShare: row.websiteShare })),
    weekdays: story.weekdays.map((row) => ({ name: WEEKDAYS[Number(row.day)] ?? row.day, views: row.views })),
    names,
  };
}

/**
 * What the eye reads of the boxes (`PageBoxes`): the same figures, named as the boxes name them; nothing for a page with
 * no views in these dates. A product's page counts its items, any other page its visitors who bought and how far it's read.
 */
export function pageBoxesSeen(answer: PageAnswerForEye, boxes: PageBoxes | undefined) {
  const { row, story } = answer;
  if (!row) return null;
  const started = story.started;
  const product = boxes?.product ?? null;
  const sale = boxes?.sale ?? null;
  return {
    views: row.views, viewsBefore: answer.viewsBefore ?? null,
    visits: started?.visits ?? null, visitsBefore: started?.visitsBefore ?? null, websiteVisits: started?.websiteVisits ?? null,
    ...(product ? { itemsAdded: product.itemsAdded, itemsBought: product.itemsBought, itemsBoughtBefore: product.itemsBoughtBefore, websiteItemsBought: product.websiteItemsBought } : {}),
    ...(!product && sale ? { boughtRate: sale.startedVisits > 0 ? sale.visits / sale.startedVisits : null, websiteBoughtRate: sale.websiteVisits > 0 ? sale.websiteEventVisits / sale.websiteVisits : null } : {}),
    ...(!product ? { scrolledToBottomRate: story.read, groupScrolledToBottomRate: story.groupRead } : {}),
  };
}

/** The explorer's read (`analyticsPageChannelExplorer`): each channel's visits that started on the page, at the grain held. */
type ExplorerForEye = {
  channels: readonly string[];
  now: ReadonlyArray<{ rows: ReadonlyArray<{ channel: string; visits: number }> }>;
  before: ReadonlyArray<{ rows: ReadonlyArray<{ channel: string; visits: number }> }> | null;
};

/** A channel's visits over every point of a span: each point counted whole, as the explorer's steps add up to it. */
function channelVisits(points: ExplorerForEye["now"], channel: string): number {
  let visits = 0;
  for (const point of points) for (const row of point.rows) if (row.channel === channel) visits += row.visits;
  return visits;
}

/**
 * What the eye reads of the visits-by-channel chart (`ConversionExplorerCard`): each channel's visits that started here
 * over the dates, and the span before's, whatever is ticked, whichever step the chart is drawn in.
 */
export function pageChannelsSeen(explorer: ExplorerForEye | null | undefined) {
  if (!explorer) return null;
  const before = explorer.before;
  return {
    channels: explorer.channels.map((channel) => ({ name: channel, visits: channelVisits(explorer.now, channel), visitsBefore: before ? channelVisits(before, channel) : null })),
  };
}

/**
 * Everything the page's eye reads: its own figures, with the boxes' and the chart's beside them as the screen's panels
 * hand them over. Null when the page has nothing to show.
 */
export function pageEyeData(reads: { answer: PageAnswerForEye | null | undefined; boxes: PageBoxes | undefined; explorer: ExplorerForEye | null | undefined }, names: Record<string, string>) {
  const { answer } = reads;
  if (!answer) return null;
  return eyeWithParts(pageSeesData(answer, names), { boxes: pageBoxesSeen(answer, reads.boxes), visitorsByChannel: pageChannelsSeen(reads.explorer) });
}
