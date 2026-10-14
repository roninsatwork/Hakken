import { seen, toPage, type Seen, type SeenPhrase, type SeenStep } from "../hakkenSees";
import type { ProblemKind } from "../heroes";

/**
 * What Hakken sees on a landing page's own screen
 * (docs/plans/active/google-analytics-plan.md §13, §14): fixed rules over the
 * figures the screen already reads — Search Console's showings and clicks
 * joined to Analytics' visits and money — most important first. Money is sent
 * in hundredths (`{aMoney}`), a share as a fraction (`{aRate}`), a page by its
 * path (`text`).
 */

type Maybe<T> = T | null | false;

/** One page's four stages and problems, as `analyticsHeroPage` answers them. */
export type PageJourney = {
  page: string;
  consoleAddress: string | null;
  google: { shown: number; clicks: number; position: number } | null;
  visits: { visits: number; engaged: number; conversions: number; value: number } | null;
  visitsBefore: { visits: number; engaged: number; conversions: number; value: number } | null;
  hero: boolean;
  problems: ReadonlyArray<{ kind: ProblemKind | "hero"; worth: number | null; gain: number | null }>;
  website: { value: number };
};

/** The channels of the visits that started on the page, when Google has answered for them. */
type Channel = { label: string; visits: number; conversions: number };

/** What each problem asks to be done, and where. */
const FIX_STEP: Record<ProblemKind, { code: string; link: string; where: "console" | "page" | "conversions" }> = {
  push: { code: "fixPush", link: "itsSearches", where: "console" },
  click: { code: "fixClick", link: "itsSearches", where: "console" },
  convert: { code: "fixConvert", link: "openPage", where: "page" },
  leave: { code: "fixLeave", link: "itsSearches", where: "console" },
  fall: { code: "fixFall", link: "itsSearches", where: "console" },
};

/**
 * A landing page's own screen: what it makes and its share of the website's,
 * where its conversions came from, where it sits in Google, how its
 * conversions moved, and what to do first.
 */
export function landingPageSees(page: PageJourney, channels: readonly Channel[] | null, links: { console: string | null; page: string }): Seen {
  const visits = page.visits;
  const value = visits?.value ?? 0;
  const conversions = visits?.conversions ?? 0;
  const google = channels?.find((channel) => channel.label === "Organic Search") ?? null;
  const before = page.visitsBefore?.conversions ?? null;
  const says: Array<Maybe<SeenPhrase>> = [
    value > 0
      ? { code: "makes", text: page.page, a: value, b: page.website.value > 0 ? value / page.website.value : 0 }
      : visits && visits.visits > 0 ? { code: "makesNothing", text: page.page, a: visits.visits } : { code: "noVisits", text: page.page },
    conversions > 0 && google && google.visits > 0 && google.conversions === 0 && { code: "noneFromGoogle", a: conversions, b: google.visits },
    page.google && { code: "inGoogle", a: page.google.position, b: page.google.clicks, c: page.google.shown },
    before !== null && before !== conversions && { code: conversions < before ? "conversionsFell" : "conversionsRose", a: before, b: conversions },
  ];
  const main = page.problems.find((problem) => problem.kind !== "hero") as { kind: ProblemKind; worth: number | null } | undefined;
  const fix = main ? FIX_STEP[main.kind] : null;
  const where = (kind: "console" | "page" | "conversions") =>
    kind === "console" && links.console ? { url: links.console } : kind === "page" ? { url: links.page } : toPage("conversions");
  const steps: Array<Maybe<SeenStep>> = [
    main && fix && (fix.where !== "console" || links.console) ? { code: fix.code, a: main.worth ?? 0, link: fix.link, to: where(fix.where) } : null,
    before !== null && conversions < before && { code: "whatChanged", a: before - conversions, link: "conversions", to: toPage("conversions") },
    page.hero && { code: "hero", link: "landingPages", to: toPage("funnel") },
  ];
  return seen(says, steps);
}
