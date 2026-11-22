import type { FindingFact } from "../findings";
import { measureWords } from "../measures";
import { isNumber, isRow, named, partWithFacts, rowsOf, type OwnFound, type Row } from "./shared";
import { vsBeside } from "./visibilityMarket";

// ===========================================================================================================================
// Brand radar's Sources, one source website and one question (visibility-16-eyes, 22 November 2026; Anthony: "Yes, build
// them"). Brand radar reads Google's AI answers once a month, so each shows the newest month whatever the dates: its rules
// set what's quoted beside you against what's quoted beside your rivals, and parts against their whole. What each screen
// hands its eye is built in `eyeData/visibilityRadar.ts`; every rule runs on every period in `visibilityRestPeriods.test.ts`.
// ===========================================================================================================================

const partOf = (data: Row, name: string): Row => (isRow(data[name]) ? (data[name] as Row) : {});
const numberIn = (row: Row | undefined, field: string): number | null => (row && isNumber(row[field]) ? (row[field] as number) : null);
function nameIn(data: Row, key: string, fallback: string): string {
  const names = partOf(data, "names");
  return typeof names[key] === "string" && (names[key] as string).trim() ? (names[key] as string).trim() : fallback;
}
const mostFirst = (rows: readonly Row[], field: string) => rows.filter((row) => named(row) && isNumber(row[field])).sort((left, right) => (right[field] as number) - (left[field] as number));
const besideYouFact = (row: Row): FindingFact[] => (isNumber(row.besideYou) ? [{ key: "besideYou", value: row.besideYou as number, unit: "count", label: `${named(row)}: ${measureWords("citedBesideYou")}` }] : []);

/**
 * A website cited beside you against cited beside your rivals: "reddit.com: 35 times cited beside you. Beside your rivals:
 * 101". Its two figures are one website's, so the first says "beside you" in its own measure, and each fact says which
 * answers it counts (the fresh reader, 22 November 2026: the headline never said the 35 was beside you).
 */
function besideYouAndRivals(list: string, name: string, besideYou: number, besideRivals: number, rivalsName: string, score: number): OwnFound {
  const one = vsBeside(list, name, "citedBesideYou", besideYou, besideRivals, rivalsName, score);
  return {
    ...one,
    facts: [
      { key: "value", value: besideYou, unit: "count", label: `${name}: ${measureWords("citedBesideYou")}` },
      { key: "mean", value: besideRivals, unit: "count", label: `${name}: ${measureWords("quotes")} beside your rivals` },
    ],
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// One question (`radar/question`).
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * The business the answer names first, of every business it names, with its place and how often the question is asked
 * (the headline); you, where you aren't named; your pages among those quoted; the kind of website quoted most; and your
 * rivals' pages among those quoted.
 */
function questionFindings(data: Row): OwnFound[] {
  const question = partOf(data, "question");
  const name = named(question);
  if (!name) return [];
  const found: OwnFound[] = [];
  const namedRows = rowsOf(data.named).filter((row) => named(row));
  const quoted = numberIn(question, "quotedPages") ?? 0;
  const volume = numberIn(question, "volume");
  const volumeFact: FindingFact[] = volume !== null ? [{ key: "volume", value: volume, unit: "count", label: `${name}: monthly searches` }] : [];
  const you = typeof question.you === "string" ? question.you : null;
  const first = namedRows[0];
  if (first) {
    const placeFact: FindingFact[] = isNumber(first.place) ? [{ key: "place", value: first.place as number, unit: "score", label: `${named(first)}: place among the businesses the answer names` }] : [];
    found.push(partWithFacts("named", named(first)!, "businessesNamed", 1, namedRows.length, 2, { extra: [...placeFact, ...volumeFact] }));
  }
  if (you && !namedRows.some((row) => row.you === 1) && namedRows.length > 0) found.push(partWithFacts("notNamed", you, "businessesNamed", 0, namedRows.length, 1.8, { extra: first ? [] : volumeFact }));
  const yourPages = numberIn(question, "yourPages") ?? 0;
  const yourHost = namedRows.find((row) => row.you === 1);
  if (quoted > 0) {
    found.push(partWithFacts("yourPages", yourHost ? named(yourHost)! : you ?? "Your website", "quotedPages", yourPages, quoted, yourPages > 0 ? 1.4 : 1.6, { extra: first ? [] : volumeFact }));
    const kind = mostFirst(rowsOf(data.quotedKinds).filter((row) => row.yours !== 1), "quotedPages")[0];
    if (kind) found.push(partWithFacts("kind", named(kind)!, "quotedPages", kind.quotedPages as number, quoted, 1.2));
    const rivalPages = numberIn(question, "rivalPages") ?? 0;
    if (rivalPages > 0 || yourPages > 0) found.push(partWithFacts("rivalPages", nameIn(data, "yourRivals", "Your rivals"), "quotedPages", rivalPages, quoted, rivalPages > yourPages ? 1.5 : 1));
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Sources (`radar/sources`).
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * The websites quoted in answers that name you, of every website quoted (the headline); those quoted beside your rivals
 * and never beside you, and the one quoted most so; the website quoted most of all, your own and your rivals' most quoted
 * own site, each against every quote, with its quotes beside you; and the kind of website quoted most.
 */
function sourcesFindings(data: Row): OwnFound[] {
  const sources = partOf(data, "sources");
  const websites = numberIn(sources, "websites");
  if (websites === null || websites === 0) return [];
  const found: OwnFound[] = [];
  const namingYou = numberIn(sources, "namingYou");
  if (namingYou !== null) found.push(partWithFacts("namingYou", nameIn(data, "namingYou", "Websites quoted in answers that name you"), "websites", namingYou, websites, 2));
  const never = numberIn(sources, "neverBesideYou");
  if (never !== null && never > 0) found.push(partWithFacts("never", nameIn(data, "neverBesideYou", "Websites quoted beside your rivals but never beside you"), "websites", never, websites, 1.5 + Math.min(0.3, never / websites / 2)));
  const missing = mostFirst(rowsOf(data.missing), "besideRivals")[0];
  if (missing) found.push(besideYouAndRivals("missingTop", named(missing)!, 0, missing.besideRivals as number, nameIn(data, "besideRivals", "Beside your rivals"), 1.4));
  const quotes = numberIn(sources, "quotes");
  if (quotes !== null && quotes > 0) {
    const top = mostFirst(rowsOf(data.mostQuoted), "quotes")[0];
    if (top) found.push(partWithFacts("top", named(top)!, "quotes", top.quotes as number, quotes, 1.3, { extra: besideYouFact(top) }));
    const yours = partOf(data, "yours");
    if (named(yours) && isNumber(yours.quotes)) found.push(partWithFacts("yours", named(yours)!, "quotes", yours.quotes as number, quotes, 1.2, { extra: besideYouFact(yours) }));
    const rival = mostFirst(rowsOf(data.rivalSites), "quotes")[0];
    if (rival) found.push(partWithFacts("rival", named(rival)!, "quotes", rival.quotes as number, quotes, 1.1, { extra: besideYouFact(rival) }));
    const kind = mostFirst(rowsOf(data.kinds).filter((row) => row.yours !== 1), "quotes")[0];
    if (kind) found.push(partWithFacts("kind", named(kind)!, "quotes", kind.quotes as number, quotes, 0.9));
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------------
// One source website (`radar/sources/website`).
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Its quotes beside you against its quotes beside your rivals (the headline); the rival quoted beside it most, beside
 * you; its pages that name you, of all its pages quoted; its most quoted page; and the most asked question it's quoted for.
 */
function sourceWebsiteFindings(data: Row): OwnFound[] {
  const source = partOf(data, "source");
  const name = named(source);
  const besideYou = numberIn(source, "besideYou");
  const besideRivals = numberIn(source, "besideRivals");
  if (!name || besideYou === null || besideRivals === null) return [];
  const found: OwnFound[] = [besideYouAndRivals("beside", name, besideYou, besideRivals, nameIn(data, "besideRivals", "Beside your rivals"), 2)];
  const businesses = rowsOf(data.businesses).filter((row) => named(row) && isNumber(row.quotedBeside));
  const you = businesses.find((row) => row.you === 1);
  const rival = mostFirst(businesses.filter((row) => row.you !== 1), "quotedBeside")[0];
  if (rival && you) found.push(vsBeside("business", named(rival)!, "quotedBeside", rival.quotedBeside as number, you.quotedBeside as number, named(you)!, 1.4 + ((rival.quotedBeside as number) > (you.quotedBeside as number) ? 0.2 : 0)));
  const pages = numberIn(source, "pages");
  const namesYou = numberIn(source, "pagesNamingYou");
  if (pages !== null && pages > 0 && namesYou !== null) found.push(partWithFacts("namesYou", nameIn(data, "pagesNamingYou", "Its pages that name you"), "pages", namesYou, pages, namesYou === 0 ? 1.4 : 1.1));
  const quotes = numberIn(source, "quotes");
  const page = mostFirst(rowsOf(data.quotedPages), "quotes")[0];
  if (page && quotes !== null && quotes > 0) {
    found.push(partWithFacts("page", named(page)!, "quotes", page.quotes as number, quotes, 1.2, {
      extra: [...besideYouFact(page), ...(isNumber(page.besideRivals) ? [{ key: "besideRivals", value: page.besideRivals as number, unit: "count" as const, label: `${named(page)}: ${measureWords("quotes")} beside your rivals` }] : [])],
    }));
  }
  const questions = rowsOf(data.questions).filter((row) => named(row) && isNumber(row.volume));
  const asked = numberIn(source, "questionsVolume");
  const question = mostFirst(questions, "volume")[0];
  if (question && asked !== null && asked > 0) {
    found.push(partWithFacts("question", named(question)!, "citedVolume", question.volume as number, asked, 1.1, {
      of: `the monthly searches of the ${numberIn(source, "questions") ?? questions.length} questions it's cited for`,
    }));
  }
  return found;
}

/** Joined into `VISIBILITY_OWN` (`own/visibility.ts`). */
export const VISIBILITY_RADAR_OWN: Readonly<Record<string, { general: boolean; find: (data: Row) => OwnFound[] }>> = {
  "visibility.question": { general: false, find: questionFindings },
  "visibility.radarSources": { general: false, find: sourcesFindings },
  "visibility.website": { general: false, find: sourceWebsiteFindings },
};
