import type { InsightsRole } from "../agentRoles";
import type { FactSource } from "../insightFacts";
import { BING_SCREENS } from "./screenEntries/bing";
import { CLARITY_SCREENS } from "./screenEntries/clarity";
import { GOOGLE_ANALYTICS_SCREENS } from "./screenEntries/googleAnalytics";
import { INSIGHTS_SCREENS } from "./screenEntries/insights";
import { SEARCH_CONSOLE_SCREENS } from "./screenEntries/searchConsole";
import { VISIBILITY_SCREENS } from "./screenEntries/visibility";

/**
 * Every page's eye, described once (docs/plans/active/sees-every-page-plan-2026-10-31.md, phase 1; Anthony: "extend
 * the eye and side bar to every page … so we can test and refine"). A page's key is its section and its screen
 * ("searchConsole.keywords"); its entry says who writes the words when the eye is pressed (Anthony, 2026-10-31: the
 * writers as proposed, a new specialist where none matches), what the page is for the writer, the parts it should
 * cover before it digs, what it must never talk about, and whether pressing writes anything at all (Insights' weekly
 * boxes are already the team's words). The writer, the Editor's checks and the panel read this list, so a page joins
 * the eye with a few lines here and its own figures handed over, never new code. No database here.
 */

export const SEES_SECTIONS = ["googleAnalytics", "searchConsole", "bing", "clarity", "visibility", "insights"] as const;
export type SeesSection = (typeof SEES_SECTIONS)[number];

export type SeesScreen = {
  section: SeesSection;
  /** The specialist who writes the page's words. */
  writer: InsightsRole;
  /** What the page is, for the writer: "the searches that bring the website visitors from Google". */
  about: string;
  /** The page's parts, top to bottom, for the writer to cover before it digs; none, and it covers what the figures hold. */
  parts?: readonly string[];
  /** Subjects the page never speaks about, said in the brief (money on the Conversions screens). */
  never?: readonly string[];
  /** False where pressing writes nothing: the page's words are already the team's (Insights' weekly boxes). */
  writes?: boolean;
};

/** Each section's writer and the source its figures are filed under, for a page the list does not name yet. */
const SECTION: Record<SeesSection, { writer: InsightsRole; source: FactSource; name: string }> = {
  googleAnalytics: { writer: "INSIGHTS_CONVERSION", source: "analytics", name: "Google Analytics" },
  searchConsole: { writer: "INSIGHTS_SEARCH", source: "searchConsole", name: "Search Console" },
  bing: { writer: "INSIGHTS_SEARCH", source: "searchConsole", name: "Bing Webmaster" },
  clarity: { writer: "INSIGHTS_BEHAVIOUR", source: "analytics", name: "Microsoft Clarity" },
  visibility: { writer: "INSIGHTS_SEARCH", source: "market", name: "Visibility" },
  insights: { writer: "INSIGHTS_ANALYST", source: "analytics", name: "Insights" },
};

/**
 * The pages, by key: the section, then the screen as the section's own words name it (`googleAnalytics.seen.<screen>`,
 * `searchConsole.seen.<screen>`, `sites.seen.<screen>`…). A key ending in ":" is a family (a conversion's own screen,
 * `googleAnalytics.event:purchase`). A page missing here still has an eye, written by its section's specialist. Each
 * section's entries are in a file of their own (`screenEntries/<section>.ts`).
 */
export const SEES_SCREENS: Readonly<Record<string, Partial<SeesScreen> & { about: string }>> = {
  ...GOOGLE_ANALYTICS_SCREENS,
  ...SEARCH_CONSOLE_SCREENS,
  ...BING_SCREENS,
  ...CLARITY_SCREENS,
  ...VISIBILITY_SCREENS,
  ...INSIGHTS_SCREENS,
};

/**
 * Visibility's screens by the start of their name, each part by the specialist whose discipline it is (Anthony,
 * 2026-10-31: the writers as proposed): links, the market, local, AI answers, the audit.
 */
const VISIBILITY_PREFIXES: ReadonlyArray<{ prefix: string; writer: InsightsRole; about: string }> = [
  { prefix: "backlinks", writer: "INSIGHTS_LINKS", about: "the websites linking to this one" },
  { prefix: "competitors", writer: "INSIGHTS_MARKET", about: "the website against its competitors on Google" },
  { prefix: "paid", writer: "INSIGHTS_MARKET", about: "the searches the business and its rivals pay for on Google" },
  { prefix: "local", writer: "INSIGHTS_LOCAL", about: "the business's Google profiles and local rankings" },
  { prefix: "reviews", writer: "INSIGHTS_LOCAL", about: "the business's reviews against its rivals" },
  { prefix: "business", writer: "INSIGHTS_LOCAL", about: "one business in the local market" },
  { prefix: "ai", writer: "INSIGHTS_AI_VISIBILITY", about: "how AI answers name, cite and send people to the business" },
  { prefix: "radar", writer: "INSIGHTS_AI_VISIBILITY", about: "Brand radar: the questions where AI answers name the business" },
  { prefix: "question", writer: "INSIGHTS_AI_VISIBILITY", about: "one question asked of the AI answers, and who they name" },
  { prefix: "website", writer: "INSIGHTS_AI_VISIBILITY", about: "one website the AI answers cite" },
  { prefix: "overviewGaps", writer: "INSIGHTS_AI_VISIBILITY", about: "the questions where AI answers name rivals and not the business" },
  { prefix: "mentions", writer: "INSIGHTS_AI_VISIBILITY", about: "pages across the web naming the business" },
  { prefix: "audit", writer: "INSIGHTS_TECHNICAL", about: "the site audit: problems Google may trip on" },
  { prefix: "assets", writer: "INSIGHTS_TECHNICAL", about: "the business's assets across the web" },
  { prefix: "google", writer: "INSIGHTS_SEARCH", about: "the company's tracked searches on Google" },
];

/** A page's entry: its own, its family's, or its section's defaults; null for a key in no section. */
export function seesScreenFor(key: string): (SeesScreen & { key: string }) | null {
  const section = SEES_SECTIONS.find((one) => key.startsWith(`${one}.`));
  if (!section) return null;
  const family = Object.keys(SEES_SCREENS).find((one) => one.endsWith(":") && key.startsWith(one));
  const screen = key.slice(section.length + 1);
  const byPrefix = section === "visibility" && !SEES_SCREENS[key] ? VISIBILITY_PREFIXES.find((one) => screen.startsWith(one.prefix)) : undefined;
  const own = SEES_SCREENS[key] ?? (family ? SEES_SCREENS[family] : undefined) ?? (byPrefix ? { writer: byPrefix.writer, about: `${byPrefix.about} (${spaced(screen)})` } : undefined);
  return {
    key,
    section,
    writer: own?.writer ?? SECTION[section].writer,
    about: own?.about ?? `the ${spaced(screen)} page of ${SECTION[section].name}`,
    ...(own?.parts ? { parts: own.parts } : {}),
    ...(own?.never ? { never: own.never } : {}),
    writes: own?.writes ?? true,
  };
}

/** A screen's name as words: "keywordsBandsMoved" → "keywords bands moved". */
const spaced = (screen: string) => screen.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

/** The source a section's figures are filed under, for its facts. */
export const sourceOfSection = (section: SeesSection): FactSource => SECTION[section].source;
/** A section's name, as its menu says it. */
export const nameOfSection = (section: SeesSection): string => SECTION[section].name;

/** Whether pressing the eye on this page writes new words: every page of a section, except the weekly boxes'. */
export function seesWrites(key: string): boolean {
  return seesScreenFor(key)?.writes ?? false;
}
