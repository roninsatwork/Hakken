import { MOST_SEARCHES, competingFacts, settleGroup, type CompetingGroup, type Decision, type KeptGroup } from "./insightCompeting";
import { readingOf, whyText } from "./insightDecided";
import { factsByKey, fillFacts } from "./insightFacts";
import { typedNumbers } from "./insightEditor";

/**
 * The Keyword cannibalisation specialist (Anthony, 12 October 2026: "it
 * should be routed to the head of strategy then assigned to the
 * cannibalisation agent when appropriate … this way we get consistency"):
 * what it is given of a group, how its answer is read and held to the rule's
 * guards, and when a group keeps last week's decision instead of being asked
 * again. The run's side is `insightCompeting.competingForRun`.
 */

/**
 * Searches of a group the specialist is shown, the most searched first: every
 * one a group keeps, so it decides them all (Anthony, 13 October 2026, on "the
 * specialist alone writes the page": "Go").
 */
export const SEARCHES_SHOWN = MOST_SEARCHES;
/**
 * With the decision model picking every search's page, the specialist only
 * explains and writes, so it reads less (Anthony, 13 October 2026, "go",
 * after a 196-search group took it past three minutes): the most searched,
 * and each search whose page the decision model chose over the rule's.
 */
export const SEARCHES_EXPLAINED = 60;
const CHANGES_EXPLAINED = 40;

/**
 * A group at the cap on its searches reads and writes the most: on 29 October
 * 2026 More Handles' five such groups, asked eight at a time with three minutes
 * each, ran past the limit seven times and two never answered
 * (insights-big-site-reliability-plan-2026-10-26.md, Anthony: "Yes, fix and
 * rerun"). Each is given four and a half minutes, as the Head of Strategy is,
 * and a piece asks no more than two of them together.
 */
export const BIG_GROUP_LIMIT_MS = 4.5 * 60 * 1000;
export const BIG_AT_ONCE = 2;
export const atTheCap = (group: Pick<CompetingGroup, "searches">) => group.searches.length >= MOST_SEARCHES;

/** The groups the next piece asks, in order: up to `most`, with no more than BIG_AT_ONCE at the cap. */
export function nextPiece<Group extends Pick<CompetingGroup, "searches">>(groups: readonly Group[], most: number): Group[] {
  const piece: Group[] = [];
  let big = 0;
  for (const group of groups) {
    if (piece.length >= most || (atTheCap(group) && big >= BIG_AT_ONCE)) break;
    if (atTheCap(group)) big += 1;
    piece.push(group);
  }
  return piece;
}

/** The shape of the specialist's answer, fixed in code so the run can read it (shown read-only on its Instructions page). */
export const COMPETING_ANSWER = [
  "You are given one group of the website's pages that Google shows for the same searches: its pages — each one's path, title, kind, the place it is for, its visits and enquiries, and what the rule says to do with it — and every one of its searches, the most searched first, each with how often it is searched a month, the website's position, how often Google showed each page for it, and the page the rule chose and why. The group's figures are its facts, by key.",
  "Answer in JSON only: {\"owners\": [{\"search\": \"…\", \"page\": \"/…/\", \"why\": \"…\"}], \"pages\": [{\"path\": \"/…/\", \"do\": \"KEEP\" | \"MERGE\" | \"DIFFERENT\" | \"LINK\", \"into\": \"/…/\" or null, \"why\": \"…\"}], \"headline\": \"…\", \"story\": \"…\"}.",
  "owners: you decide every search; list only those you give a different page from the rule's, each with one sentence why — the rest keep the rule's page as your decision. A search's page must be one Google shows for it.",
  "When the group says owners_chosen: true, each search's page is already chosen — by the decision model where it was sure (its rule.why is [\"JEV\"], with rule.rule_page the rule's page where it chose another), else by the rule — and is final. You are then given its most searched searches and those the decision model moved, not every one. In owners, give only a sentence why for a search the decision model chose, with its page as given, never another page.",
  "pages: every page of the group, what to do with it and one sentence why. KEEP is for a page that owns searches. A page that owns none is merged into the page owning most of what it is shown for, with a redirect (MERGE: its enquiries go with it), made clearly different from it (DIFFERENT), or, an article, kept with a link to it (LINK); into names that page.",
  "headline and story open the group's page and its finding. headline: one sentence a business owner reads first. story: two to four sentences on what is happening, why it matters and what to do. Name every figure by its key in double square brackets, never type a number.",
].join("\n");

/**
 * A short, stable reading of the rule's decision for a group: its pages and
 * the page each of its searches went to — and who picks the pages, so turning
 * the decision model on or off reads every group anew (`picker`).
 */
export function signatureOf(group: CompetingGroup | KeptGroup, picker?: "JEV"): string {
  return readingOf([...[...group.pages.map((page) => page.path)].sort(), ...shownFirst(group).map((search) => `${search.search}>${search.owner ?? ""}`), ...(picker ? [picker] : [])]);
}

/** A group's searches the specialist is shown: the most searched first, then the most shown. */
function shownFirst(group: CompetingGroup | KeptGroup) {
  return [...group.searches].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || b.shown - a.shown || a.search.localeCompare(b.search)).slice(0, SEARCHES_SHOWN);
}

/** What the specialist reads of one group: its pages with their titles, its searches with the rule's choice — or the decision model's, final (`ownersChosen`). */
export function agentInputOf(group: CompetingGroup | KeptGroup, titles: ReadonlyMap<string, string>, ownersChosen = false) {
  return {
    group: group.name,
    ...(ownersChosen ? { owners_chosen: true } : {}),
    pages: group.pages.map((page) => ({
      path: page.path,
      title: titles.get(page.path) ?? null,
      kind: page.kind,
      sells: page.type !== "INFORMATIONAL",
      place: page.place ?? null,
      visits_12_months: page.visits,
      enquiries_12_months: page.enquiries,
      enquiries_from_google: page.googleEnquiries ?? 0,
      rule: { do: wordOf(page.decision), into: page.into ?? null, owns: page.owns ?? 0 },
    })),
    searches: (ownersChosen ? explained(group) : shownFirst(group)).map((search) => ({
      search: search.search,
      searched_a_month: search.volume,
      // How hard it is to reach Google's first page for, 0–100: what a top-three place would cost, never who owns it.
      difficulty: search.difficulty ?? null,
      position: search.position === null ? null : Math.round(search.position * 10) / 10,
      shown: Object.fromEntries(search.pages.map((page) => [page.path, page.shown])),
      names_place: search.place ?? null,
      rule: { page: search.owner ?? search.top, why: search.why ?? [], ...(search.rulePage ? { rule_page: search.rulePage } : {}) },
    })),
  };
}

/** The searches the specialist explains when the decision model picked the pages: the most searched, then those it changed. */
function explained(group: CompetingGroup | KeptGroup) {
  const most = shownFirst(group).slice(0, SEARCHES_EXPLAINED);
  const changed = shownFirst(group).filter((search) => search.rulePage && !most.includes(search)).slice(0, CHANGES_EXPLAINED);
  return [...most, ...changed];
}

const WORD_OF: Record<Decision, string> = { OWNER: "KEEP", MERGE: "MERGE", DIFFERENTIATE: "DIFFERENT", LINK: "LINK" };
const DECISION_OF: Record<string, Decision> = { KEEP: "OWNER", MERGE: "MERGE", DIFFERENT: "DIFFERENTIATE", LINK: "LINK" };
const wordOf = (decision: Decision) => WORD_OF[decision];
/** The specialist's words as kept, whole: never cut (Anthony, 13 October 2026, on a 900-character cap nobody asked for). */
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * The specialist's answer put on a group, each part only where the rule's
 * guards hold — a search's page is one Google shows for it; a page is merged
 * or made different only when it owns none of the searches, linked only when
 * it is an article — and the pages settled again from the owners
 * it gave (`settleGroup`). What it couldn't use is counted, never guessed.
 */
export function applyAnswer<Group extends CompetingGroup | KeptGroup>(group: Group, answer: unknown, websiteRate: number | null, week: string, options: { ownersChosen?: boolean } = {}) {
  const raw = (answer && typeof answer === "object" ? answer : {}) as { owners?: unknown; pages?: unknown; headline?: unknown; story?: unknown };
  let owners = 0, refused = 0;
  for (const entry of Array.isArray(raw.owners) ? raw.owners : []) {
    const { search: name, page, why } = (entry ?? {}) as { search?: unknown; page?: unknown; why?: unknown };
    const search = group.searches.find((held) => held.search === name);
    if (!search || typeof page !== "string" || !search.pages.some((shown) => shown.path === page)) {
      refused += 1;
      continue;
    }
    // With the decision model picking the pages, the specialist only says why it chose each; it never picks one.
    if (options.ownersChosen) {
      const reason = whyText(why);
      if (page !== search.owner || !search.why?.includes("JEV") || !reason) refused += 1;
      else search.reason = reason;
      continue;
    }
    if (search.owner === page) continue;
    Object.assign(search, { owner: page, why: ["AGENT"], reason: whyText(why) });
    owners += 1;
  }
  settleGroup(group, websiteRate);
  const pages = applyPages(group, raw.pages);
  refused += pages.refused;
  group.decidedBy = "AGENT";
  group.decidedWeek = week;
  const headline = text(raw.headline), story = text(raw.story);
  return { owners, pages: pages.changed, refused, words: headline && story ? { headline, story } : null };
}

/** What to do with each page and why, as the specialist said it, within the guards. */
function applyPages(group: CompetingGroup | KeptGroup, raw: unknown) {
  let changed = 0, refused = 0;
  const byPath = new Map(group.pages.map((page) => [page.path, page]));
  for (const entry of Array.isArray(raw) ? raw : []) {
    const { path, do: said, into, why } = (entry ?? {}) as { path?: unknown; do?: unknown; into?: unknown; why?: unknown };
    const page = typeof path === "string" ? byPath.get(path) : undefined;
    const decision = typeof said === "string" ? DECISION_OF[said] : undefined;
    if (!page || !decision) {
      refused += 1;
      continue;
    }
    const target = typeof into === "string" && into !== page.path ? byPath.get(into) : undefined;
    const owns = (page.owns ?? 0) > 0;
    const allowed = decision === "OWNER" ? owns
      : owns ? false
        : decision === "LINK" ? page.type === "INFORMATIONAL"
          : true;
    if (!allowed) {
      refused += 1;
      continue;
    }
    if (decision !== page.decision) changed += 1;
    page.decision = decision;
    if (decision !== "OWNER" && target && (target.owns ?? 0) > 0) page.into = target.path;
    const reason = whyText(why);
    if (reason) page.reason = reason;
  }
  return { changed, refused };
}

/**
 * Last week's decision kept for a group the rule reads just as it did then
 * (the same pages, the same page for each of its most searched searches): the
 * specialist's pages for its searches and its reasons, so the advice doesn't
 * change from week to week on nothing, and nothing is asked twice.
 */
export function carryOver<Group extends CompetingGroup | KeptGroup>(group: Group, last: KeptGroup, websiteRate: number | null): boolean {
  if (last.decidedBy !== "AGENT" || !group.signature || last.signature !== group.signature) return false;
  // A write-up kept cut short, before nothing was cut (13 October 2026), is asked for again.
  if (last.words && !endsWhole(last.words.story)) return false;
  for (const before of last.searches) {
    if (!(before.why?.includes("AGENT") || before.why?.includes("JEV")) || !before.owner) continue;
    const search = group.searches.find((held) => held.search === before.search);
    if (search && search.pages.some((page) => page.path === before.owner)) Object.assign(search, { owner: before.owner, why: before.why, reason: before.reason ?? "", ...(before.rulePage ? { rulePage: before.rulePage } : {}) });
  }
  settleGroup(group, websiteRate);
  applyPages(group, last.pages.map((page) => ({ path: page.path, do: wordOf(page.decision), into: page.into ?? null, why: page.reason ?? "" })));
  group.decidedBy = "AGENT";
  group.decidedWeek = last.decidedWeek;
  if (last.words) group.words = last.words;
  return true;
}

/** Whether words end on a whole sentence. */
const endsWhole = (text: string) => /[.!?]["'’”)]?$/.test(text.trim());
/** Words up to their last whole sentence: a write-up kept cut short reads to where it was whole. */
const toWholeSentence = (text: string) => {
  if (endsWhole(text)) return text;
  const ends = [...text.matchAll(/[.!?]["'’”)]?(?=\s)/g)];
  const last = ends.at(-1);
  return last?.index !== undefined ? text.slice(0, last.index + last[0].length) : text;
};

/** The specialist's words, kept only when every figure they name is the group's own and none is typed. */
export function usableWords(group: CompetingGroup | KeptGroup, words: { headline: string; story: string } | null, span: { from: string; to: string }) {
  if (!words) return null;
  const held = factsByKey(competingFacts(group, span));
  return [words.headline, words.story].every((text) => typedNumbers(text).length === 0 && fillFacts(text, held).missing.length === 0) ? words : null;
}

/**
 * What opens a group's page, as the specialist wrote it: its headline and
 * story, filled from the group's own figures as they are now. Null for a
 * group it hasn't decided, which shows the rule's sentences, said to be the
 * rule's — never a blank page.
 */
export function summaryOf(group: KeptGroup, span: { from: string; to: string }): string[] | null {
  if (group.decidedBy !== "AGENT" || !usableWords(group, group.words ?? null, span)) return null;
  const held = factsByKey(competingFacts(group, span));
  return [fillFacts(group.words!.headline, held).text, toWholeSentence(fillFacts(group.words!.story, held).text)];
}
