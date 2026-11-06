import { v } from "convex/values";

/**
 * Live's figures worked out one way, for the screen, the eye and Ask Hakken alike (docs/plans/active/live-new-page-plan-2026-11-06.md):
 * the map by Classification from Google's pages, and what "usual" means for each row of the last half hour against usual. Plain
 * workings, no database.
 */

export const livePageValidator = v.object({
  title: v.string(),
  /** The saved page with this title, the busiest of them; null with none saved under it. */
  address: v.union(v.string(), v.null()),
  kind: v.string(),
  /** The Classification's name; null for a kind with none of its own (Not sorted, Search and basket). */
  kindName: v.union(v.string(), v.null()),
});
export type LivePage = typeof livePageValidator.type;

export const liveKindValidator = v.object({ kind: v.string(), name: v.union(v.string(), v.null()), views: v.number(), pages: v.number() });
export type LiveKind = typeof liveKindValidator.type;

/** Google's pages added up by Classification: the views in the last 30 minutes, most first. Views, as one visit sees many pages of a kind. */
export function liveKinds(rows: ReadonlyArray<{ name: string; views: number }>, pages: readonly LivePage[]): LiveKind[] {
  const known = new Map(pages.map((page) => [page.title, page]));
  const by = new Map<string, LiveKind>();
  for (const row of rows) {
    if (row.views <= 0) continue;
    const page = known.get(row.name);
    const kind = page?.kind ?? "NOT_SORTED";
    const one = by.get(kind) ?? { kind, name: page?.kindName ?? null, views: 0, pages: 0 };
    one.views += row.views;
    one.pages += 1;
    by.set(kind, one);
  }
  return [...by.values()].sort((left, right) => right.views - left.views);
}

export type LiveUsualFigures = {
  people: number;
  views: number;
  conversions: number;
  peopleThisTime?: number | null;
  viewsThisTime?: number | null;
  conversionsThisTime?: number | null;
};

/** What the last half hour is set against for each row: this time of the week where the hours are kept, otherwise the month's even spread. */
export function usualNow(usual: LiveUsualFigures): { people: number; peopleThisTime: boolean; views: number; viewsThisTime: boolean; conversions: number; conversionsThisTime: boolean } {
  const pick = (thisTime: number | null | undefined, even: number) => (typeof thisTime === "number" ? { value: thisTime, held: true } : { value: even, held: false });
  const people = pick(usual.peopleThisTime, usual.people);
  const views = pick(usual.viewsThisTime, usual.views);
  const conversions = pick(usual.conversionsThisTime, usual.conversions);
  return { people: people.value, peopleThisTime: people.held, views: views.value, viewsThisTime: views.held, conversions: conversions.value, conversionsThisTime: conversions.held };
}

/** A usual under this says nothing about a half hour: one person swings it, so the bars stay and no verdict is said (Ronins has 245 visits a month). */
export const LEAST_USUAL_FOR_A_VERDICT = 5;

export type LiveVerdict = { people: "more" | "fewer"; conversions: "more" | "fewer" | null };

/** More or fewer people than usual and, where a website counts them, more or fewer conversions; null on a usual too small to trust. */
export function liveVerdict(now: { people: number; conversions: number | null }, usual: LiveUsualFigures): LiveVerdict | null {
  const against = usualNow(usual);
  if (against.people < LEAST_USUAL_FOR_A_VERDICT) return null;
  const conversions = now.conversions !== null && against.conversions >= LEAST_USUAL_FOR_A_VERDICT
    ? (now.conversions >= against.conversions ? "more" as const : "fewer" as const)
    : null;
  return { people: now.people >= against.people ? "more" : "fewer", conversions };
}
