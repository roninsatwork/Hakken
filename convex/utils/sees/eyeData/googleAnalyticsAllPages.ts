import { NOT_SORTED_KIND } from "../../pageKinds";
import { SHOP_PAGES_KIND } from "../../shopPages";
import { pathOfAddress } from "../analytics";

/**
 * What Google Analytics All pages hands its eye, built in one place for the screen (`AllPagesSees`, `PagesMapCard`,
 * `PagesLinesCard`, `useClassificationChoice`) and for a chat app's question (`chatAppEyes/googleAnalytics.ts`), so
 * the two can't disagree (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). The reads and the words come in;
 * the figures `pageFindings` reads come out.
 */

/** The pages the eye is handed from each end of the whole list: those that gained and lost most. */
export const EYE_MOVERS = 10;

type Movers = { bands: unknown; concentration: unknown; shop: unknown };
export type ClassificationForEye = { name: string; views: number; viewsBefore: number; pages: number; shop: boolean; sorted: boolean };

/**
 * The page's own figures: the table's page as shown, the whole website's views (`website`), and from every page, as the
 * server sorts them, those that gained and lost most views and lost most conversions (`pagesGained`, `pagesLost`,
 * `pagesConversionsLost`), so its rules speak of the whole website, never only the page of the table on screen. These
 * always leave out the shop's search, basket and account pages, whatever the menus say: the eye speaks of those only
 * together (`shop`). `bands` and `concentration` come from the same read, for the same reason. Nothing while the
 * table's page isn't read.
 */
export function allPagesEyeData<Answer extends object, Ends extends Movers>(reads: {
  answer: Answer | null | undefined;
  names: Record<string, string>;
  website: object | undefined;
  gained: Ends | null | undefined;
  lost: Ends | null | undefined;
  conversionsLost: Ends | null | undefined;
  classifications: readonly ClassificationForEye[] | undefined;
}) {
  const { answer, names, website, gained, lost, conversionsLost, classifications } = reads;
  if (!answer) return answer;
  return {
    ...answer, names, ...(website ? { website } : {}),
    ...(gained ? { pagesGained: gained, bands: gained.bands, concentration: gained.concentration, shop: gained.shop } : {}),
    ...(lost ? { pagesLost: lost } : {}), ...(conversionsLost ? { pagesConversionsLost: conversionsLost } : {}),
    ...(classifications ? { classifications } : {}),
  };
}

/** A Classification's name on All pages: the shop's own pages and pages not sorted by the page's words, any other by its own. */
export function classificationName(kind: { kind: string; name: string | null }, words: { shop: string; notSorted: string }): string {
  return kind.kind === SHOP_PAGES_KIND ? words.shop : kind.kind === NOT_SORTED_KIND ? words.notSorted : kind.name ?? kind.kind;
}

/** Each Classification's views now and before, as the eye reads them, from the views by Classification set against the dates before. */
export function classificationsForEye(
  found: ReadonlyArray<{ kind: string; name: string | null; views: number; viewsBefore?: number; pages: number }> | undefined,
  nameOf: (kind: { kind: string; name: string | null }) => string,
): ClassificationForEye[] | undefined {
  return found?.map((kind) => ({
    name: nameOf(kind), views: kind.views, viewsBefore: kind.viewsBefore ?? 0, pages: kind.pages, shop: kind.kind === SHOP_PAGES_KIND, sorted: kind.kind !== NOT_SORTED_KIND,
  }));
}

/** A page as the map and the lines name it: "Home page", its title, or its address. */
export function pageNameWith(home: string): (address: string, title: string | undefined) => string {
  return (address, title) => (pathOfAddress(address) === "/" ? home : title ?? pathOfAddress(address));
}

/** What the map counts by. It opens on views. */
export type MapCount = "views" | "visits";
type MapRow = { key: string; label: string; title?: string; views: number; viewsBefore: number | null; visits: number; visitsBefore?: number | null; conversions: number; conversionsBefore: number | null };

/** The map's pages: those Hakken has numbered, with something to count. */
export function pageMapRows<Row extends MapRow>(rows: readonly Row[] | undefined, count: MapCount): Row[] {
  return (rows ?? []).filter((row) => row.key.startsWith("~") && row[count] > 0);
}

/** The map as the eye reads it (`pageMap`): the boxes on screen, for whichever Count is chosen. Never money. */
export function pageMapForEye(list: object | null | undefined, rows: readonly MapRow[], count: MapCount, pageName: (address: string, title: string | undefined) => string) {
  if (!list) return undefined;
  return {
    count,
    pages: rows.map((row) => ({
      name: pageName(row.label, row.title), page: pathOfAddress(row.label),
      views: row.views, viewsBefore: row.viewsBefore, visits: row.visits, visitsBefore: row.visitsBefore ?? null, conversions: row.conversions, conversionsBefore: row.conversionsBefore,
    })),
  };
}

/** What Views each day shows. It opens on views. */
export type LinesShow = "views" | "visits" | "conversions";
type LinePoint = { day: string; views: number; visits: number; conversions: number };
type DailyPages = { pages: ReadonlyArray<{ ref: string; address: string; title?: string; points?: readonly LinePoint[] | null }> };

/** Views each day as the eye reads it (`viewsADay`): every line drawn, each point by its day, the pages in the order ticked. */
export function viewsADayForEye(
  website: { points: readonly LinePoint[] } | null | undefined,
  daily: DailyPages | null | undefined,
  ticked: readonly string[],
  show: LinesShow,
  pageName: (address: string, title: string | undefined) => string,
) {
  if (!website && !daily) return undefined;
  return {
    show,
    ...(website ? { website: website.points.map((point) => ({ day: point.day, views: point.views, visits: point.visits, conversions: point.conversions })) } : {}),
    pages: ticked.flatMap((ref) => {
      const page = daily?.pages.find((one) => one.ref === ref);
      return page?.points ? [{ name: pageName(page.address, page.title), days: page.points }] : [];
    }),
  };
}
