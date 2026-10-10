import { seen, toPage, type Seen, type SeenPhrase, type SeenStep } from "../hakkenSees";
import type { HeroPage, ProblemKind } from "../heroes";

/**
 * What Hakken sees on Heroes and attention and on a landing page's own screen
 * (docs/plans/active/google-analytics-plan.md §13, §14): fixed rules over the
 * figures those screens already read — Search Console's showings and clicks
 * joined to Analytics' visits and money — most important first. Money is sent
 * in hundredths (`{aMoney}`), a share as a fraction (`{aRate}`), a page by its
 * path (`text`, `more`).
 */

type Maybe<T> = T | null | false;

type Stages = {
  shown: number | null;
  clickRate: number | null;
  websiteValue: number;
  heroes: number;
  heroesValue: number;
  gainInGoogle: number;
  gainOnPages: number;
};

const worthOf = (page: HeroPage, kind: ProblemKind) => page.problems.find((problem) => problem.kind === kind)?.worth ?? null;

/** The pages with one problem, worth most first. */
function worst(pages: readonly HeroPage[], kind: ProblemKind): HeroPage[] {
  return pages
    .filter((page) => worthOf(page, kind) !== null)
    .sort((one, two) => (worthOf(two, kind) ?? 0) - (worthOf(one, kind) ?? 0));
}


/**
 * Heroes and attention: where the money to gain is, the heroes' share, and
 * the first fixes. A page's step opens its own view with what it is read by
 * (`linkOf`: its path, Analytics' number and Search Console's address).
 */
export function heroesSees(input: {
  stages: Stages;
  totalGain: number;
  pages: readonly HeroPage[];
  consoleConnected: boolean;
  linkOf: (path: string) => Record<string, string>;
}): Seen {
  const { stages, totalGain, pages, consoleConnected, linkOf } = input;
  const pageStep = (path: string) => toPage("heroes/page", linkOf(path));
  const heroes = pages.filter((page) => page.hero).sort((one, two) => (two.visits?.value ?? 0) - (one.visits?.value ?? 0));
  const says: Array<Maybe<SeenPhrase>> = [
    totalGain <= 0
      ? { code: "nothingToGain" }
      : consoleConnected && stages.gainInGoogle >= stages.gainOnPages && stages.shown !== null
        ? { code: "mostInGoogle", a: stages.shown, b: stages.clickRate ?? 0, c: totalGain }
        : { code: "mostOnPages", a: totalGain, b: stages.gainOnPages },
    heroes.length > 0 && stages.websiteValue > 0 && { code: "heroes", a: heroes.length, b: stages.heroesValue, c: stages.websiteValue },
    !consoleConnected && { code: "noConsole" },
  ];

  const push = worst(pages, "push");
  const click = worst(pages, "click");
  const onPage = worst(pages, "convert")[0] ?? null;
  const leave = worst(pages, "leave")[0] ?? null;
  const fall = worst(pages, "fall")[0] ?? null;
  const pushWorth = push.slice(0, 2).reduce((sum, page) => sum + (worthOf(page, "push") ?? 0), 0);
  const steps: Array<Maybe<SeenStep>> = [
    push.length > 1
      ? { code: "pushTwo", text: push[0].page, more: push[1].page, a: pushWorth, link: "pagesToPush", to: toPage("heroes", { tab: "push" }) }
      : push.length === 1 && { code: "pushOne", text: push[0].page, a: pushWorth, link: "pagesToPush", to: toPage("heroes", { tab: "push" }) },
    click.length > 0 && { code: "rewrite", text: click[0].page, a: worthOf(click[0], "click") ?? 0, link: "seePage", to: pageStep(click[0].page) },
    onPage
      ? { code: "nextStep", text: onPage.page, a: onPage.visits?.visits ?? 0, b: onPage.visits?.conversions ?? 0, link: "seePage", to: pageStep(onPage.page) }
      : leave
        ? { code: "answerSearch", text: leave.page, a: leave.visits?.visits ?? 0, link: "seePage", to: pageStep(leave.page) }
        : fall && { code: "whyFell", text: fall.page, a: fall.visitsBefore?.visits ?? 0, b: fall.visits?.visits ?? 0, link: "seePage", to: pageStep(fall.page) },
    heroes.length > 1
      ? { code: "leaveHeroesTwo", text: heroes[0].page, more: heroes[1].page, a: (heroes[0].visits?.value ?? 0) + (heroes[1].visits?.value ?? 0), link: "theHeroes", to: toPage("heroes", { tab: "hero" }) }
      : heroes.length === 1 && { code: "leaveHeroesOne", text: heroes[0].page, a: heroes[0].visits?.value ?? 0, link: "theHeroes", to: toPage("heroes", { tab: "hero" }) },
  ];
  return seen(says, steps);
}

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
    page.hero && { code: "hero", link: "theHeroes", to: toPage("heroes", { tab: "hero" }) },
  ];
  return seen(says, steps);
}
