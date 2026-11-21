import type { VisitorList } from "../../../googleAnalyticsLists";
import { NOT_SORTED_KIND } from "../../pageKinds";
import { eyeWithParts } from "./googleAnalyticsShared";

/**
 * What Google Analytics Visits hands its eye, built in one place for the screen (`visits/page.tsx` and its panels in
 * `VisitsCharts.tsx`) and for a chat app's question (`chatAppEyes/googleAnalytics.ts`), so the two can't disagree
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). The page hands its boxes and its table; its panels hand
 * every list's groups, the days and what people looked at. The reads and the words come in; the figures come out.
 */

type Figures = { visits: number; visitsBefore: number | null; newVisits: number; newVisitsBefore: number | null; returningVisits: number; returningVisitsBefore: number | null; people: number };
type VisitorsRead = { figures: Figures | null } | null | undefined;
type GroupRow = { key: string; visits: number; visitsBefore: number | null; engaged: number };
type GroupsRead = ReadonlyArray<{ list: VisitorList; rows: readonly GroupRow[] }> | null | undefined;
type DayPoint = { day: string; lastDay?: string; new: number; returning: number };
type DaysRead = { points: readonly DayPoint[] } | null | undefined;
type KindsRead = { kinds: ReadonlyArray<{ kind: string; name: string | null; views: number; pages: number }> } | null | undefined;
type ListRead = { preparing?: boolean } | null | undefined;

/** An interest by its last part: Google's "Travel/Travel Buffs" is "Travel Buffs". */
export const shortInterest = (label: string) => label.split("/").at(-1)?.trim() || label;
/** A group as the eye names it: an interest by its last part, an age with its dash; the rest as Google keeps them. */
export const eyeName = (view: VisitorList, key: string) => (view === "interest" ? shortInterest(key) : view === "age" ? key.replace("-", "–") : key);

/** What the eye reads from the page's own read: the boxes as visits now and before, and the table on screen. */
export function visitsSeesData<List>(answer: VisitorsRead, list: List | undefined, names: { new: string; returning: string; website: string }) {
  if (!answer?.figures) return answer === undefined ? undefined : null;
  const { figures } = answer;
  return {
    // Named as the eye says it: "The whole website: visits up 6.8%".
    visits: { name: names.website, visits: figures.visits, visitsBefore: figures.visitsBefore },
    newAndReturning: [
      { name: names.new, visits: figures.newVisits, visitsBefore: figures.newVisitsBefore },
      { name: names.returning, visits: figures.returningVisits, visitsBefore: figures.returningVisitsBefore },
    ],
    visitsAPerson: figures.people > 0 ? Math.round((figures.visits / figures.people) * 10) / 10 : null,
    ...(list ? { table: list } : {}),
  };
}

/**
 * Every list the page can show, each group's visits now and before, so the eye can find what moved in any of them.
 * New, returning, male and female in the reader's words (`visitorWord`, null where it has none), so the eye's findings
 * name them as the page does.
 */
export function visitorGroupsForEye(groups: GroupsRead, visitorWord: (key: string) => string | null) {
  if (!groups) return null;
  return Object.fromEntries(groups.map((one) => [one.list, one.rows.map((row) => ({
    name: (one.list === "visitorType" || one.list === "gender" ? visitorWord(row.key.toLowerCase()) : null) ?? eyeName(one.list, row.key),
    visits: row.visits, visitsBefore: row.visitsBefore, engaged: row.engaged,
  }))]));
}

export type VisitsDayWords = { newName: string; returningName: string; weekendName: string; weekdayName: string };

/**
 * The days, each day's visits by its date, never a day's place in a list (visits-redo-plan-2026-11-03.md, step 2), with
 * the names it says weekends against weekdays in (pageOwnFindings.ts). Days only, and only where every point is a day:
 * past 90 days a point is a week or a month (its `lastDay`), which no weekend rule may read as a Monday.
 */
export function visitsDaysForEye(answer: DaysRead, words: VisitsDayWords) {
  if (!answer) return null;
  return {
    byDay: answer.points.some((point) => point.lastDay) ? {} : Object.fromEntries(answer.points.map((point) => [point.day, { new: point.new, returning: point.returning }])),
    ...words,
  };
}

/** Each page group's views, Not sorted named in the reader's words, as the treemap labels them. */
export function pageKindBoxes<Kind extends { kind: string; name: string | null }>(kinds: readonly Kind[], notSortedName: string) {
  return kinds.map((kind) => ({ ...kind, label: kind.kind === NOT_SORTED_KIND ? notSortedName : kind.name ?? kind.kind }));
}

/** What people looked at: Not sorted marked as such, so the eye can say how much of the treemap tells the reader nothing. */
export function pageKindsForEye(answer: KindsRead, notSortedName: string) {
  if (!answer || answer.kinds.length === 0) return null;
  return { kinds: pageKindBoxes(answer.kinds, notSortedName).map((kind) => ({ name: kind.label, views: kind.views, pages: kind.pages, sorted: kind.kind !== NOT_SORTED_KIND })) };
}

export type VisitsEyeWords = {
  names: { new: string; returning: string; website: string };
  visitorWord: (key: string) => string | null;
  days: VisitsDayWords;
  notSortedName: string;
};

/** The page's reads: its boxes, its table's list as it opens, every list's groups, the days and what people looked at. */
export type VisitsEyeReads = { visitors: VisitorsRead; list: ListRead; groups: GroupsRead; days: DaysRead; kinds: KindsRead };

/** Visits' figures as its eye reads them: the page's own, with its panels' beside them. Null when the page shows none. */
export function visitsEyeData(reads: VisitsEyeReads, words: VisitsEyeWords) {
  // The table's list while it's still being built is not shown (`useSiteListPage`): the page hands no table then.
  const list = reads.list && !reads.list.preparing ? reads.list : undefined;
  return eyeWithParts(visitsSeesData(reads.visitors, list, words.names), {
    visitorGroups: visitorGroupsForEye(reads.groups, words.visitorWord),
    days: visitsDaysForEye(reads.days, words.days),
    whatPeopleLookedAt: pageKindsForEye(reads.kinds, words.notSortedName),
  });
}
