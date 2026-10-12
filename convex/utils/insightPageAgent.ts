import { COMPETING_REASONS, VERDICTS, type PageDecision, type Reason, type Verdict } from "./insightDecisions";
import { readingOf, stillDecided, whyText } from "./insightDecided";

/**
 * The Page decisions specialist (insights-one-voice-plan.md phase 2; Anthony,
 * 12 October 2026: "we can create new agents if we need to"): the rule's
 * verdict for every page is its first pick; the Head of Strategy hands it the
 * pages the rule doesn't simply keep and Keyword cannibalisation hasn't
 * decided, and it keeps or changes each with a sentence why. What it can't do
 * is held by guards: remove a page other websites link to, remove a page a
 * website needs, or merge or redirect a page anywhere but another of its own.
 * The run's side is `insightDecisions.buildDecisions`.
 */

export const PAGE_DECISIONS_ROLE = "INSIGHTS_PAGE_DECISIONS";

/** Pages it is handed at most a run, the most used first: the rest keep the rule's verdict, said so. */
export const PAGES_HANDED = 40;

/** Kinds of page a website needs whoever visits them (`NEEDED_TYPES` in insightDecisions.ts): never removed by the specialist. */
const NEEDED = new Set(["SERVICE", "COMPANY", "LEGAL", "PRODUCT"]);

/** Each reason as the specialist and Ask Hakken read it (the screens word it from `insights.decisions.reasons`). */
export const REASON_WORDS: Record<Reason, string> = {
  REBUILD: "its enquiries fell away: rebuild it around the searches it should win",
  RESTORE: "it lost what the page it replaced brought: restore it",
  STRENGTHEN: "it converts well where it nearly wins on Google: strengthen it",
  REFRESH: "it turns fewer visitors into enquiries than it did: refresh it",
  REFRESH_OR_RETIRE: "it stopped bringing work: refresh it, or retire it",
  KEEP_ROUTE: "many read it and few enquire: give its readers a route to enquire",
  COMPETING: "it competes with another page for the same searches: make it clearly different",
  COMPETING_LINK: "an article beside the page that owns its searches: keep it and link to that page",
  REVIEW: "its page review asks for a change",
  DUPLICATE: "the site audit found its content repeated on another page: make it its own",
  THIN: "the site audit found it thin: add to it",
  ORPHAN: "no page on the website links to it: link to it",
  NOT_INDEXABLE: "Google is told not to show it, though people use it: let Google show it",
  COMPETING_MERGE: "it lives off the searches another page should own: merge it into that page, with a redirect",
  BROKEN_LINKED: "it's broken and other pages link to it: redirect it to the nearest working page",
  UNUSED_LINKED: "nobody visits it and Google doesn't show it, but other websites link to it: redirect it",
  BROKEN: "it's broken and nothing links to it: take it out of the sitemap",
  UNUSED: "nobody visits it, Google doesn't show it and no website links to it: remove it",
  WORKING: "it brings visits or enquiries as it is",
  QUIET: "few use it, but a website needs it",
  SPECIALIST: "the Page decisions specialist's call",
};

/** The shape of its answer, fixed in code so the run can read it (shown read-only on its Instructions page). */
export const PAGE_ANSWER = [
  "You are given pages of one website, each with the rule's verdict and reason: its path, title, kind of page, its visits and enquiries over 12 months, Google's showings and clicks over 90 days, how many other websites link to it, the site audit's flags, and the page the rule would merge or redirect it into.",
  "Answer in JSON only: {\"pages\": [{\"path\": \"/…/\", \"verdict\": \"KEEP\" | \"IMPROVE\" | \"MERGE\" | \"REDIRECT\" | \"REMOVE\", \"into\": \"/…/\" or null, \"why\": \"…\"}]}.",
  "Give every page you are handed, keeping the rule's verdict unless the evidence says otherwise, and always one sentence why that a business owner understands.",
  "Never remove a page other websites link to: redirect it. Never remove a service, product, company or legal page. Merge or redirect a page only into another page of the same website, named in into.",
].join("\n");

/** The reading a page's verdict is made on: the same rule's verdict on the same footing, the same reading. */
export function pageReading(decision: PageDecision): string {
  return readingOf([decision.verdict, decision.reason, decision.into, decision.enquiries > 0, (decision.domains ?? 0) > 0, decision.type, decision.flags.join(",")]);
}

/**
 * Last week's specialist verdicts kept where the rule reads a page just as it
 * did then; returns how many were kept. Keyword cannibalisation's pages are
 * its own and never carried here.
 */
export function carryPages(decisions: PageDecision[], before: ReadonlyMap<string, PageDecision>): number {
  let kept = 0;
  for (const decision of decisions) {
    if (COMPETING_REASONS.has(decision.reason)) continue;
    const last = before.get(decision.path);
    if (!last || !stillDecided(decision, last)) continue;
    Object.assign(decision, { verdict: last.verdict, reason: last.reason, into: last.into, why: last.why, decidedBy: "AGENT", decidedWeek: last.decidedWeek });
    kept += 1;
  }
  return kept;
}

/** The pages the specialist is handed: not simply kept, not Keyword cannibalisation's, not decided already, the most used first. */
export function pagesToHand(decisions: readonly PageDecision[]): PageDecision[] {
  return decisions
    .filter((decision) => decision.verdict !== "KEEP" && !COMPETING_REASONS.has(decision.reason) && decision.decidedBy !== "AGENT")
    .sort((a, b) => b.enquiries - a.enquiries || b.visits - a.visits || b.shown - a.shown || a.path.localeCompare(b.path))
    .slice(0, PAGES_HANDED);
}

/** What the specialist reads of each page handed it. */
export function pagesInputOf(pages: readonly PageDecision[], titles: ReadonlyMap<string, string>) {
  return pages.map((page) => ({
    path: page.path,
    title: titles.get(page.path) ?? null,
    kind: page.kind,
    type: page.type,
    rule: { verdict: page.verdict, into: page.into, reason: REASON_WORDS[page.reason] },
    visits_12_months: page.visits,
    enquiries_12_months: page.enquiries,
    google_shown_90_days: page.shown,
    google_clicks_90_days: page.clicks,
    websites_linking: page.domains,
    site_audit_flags: page.flags,
  }));
}

/**
 * The specialist's answer put on the pages it was handed, each within the
 * guards; every page it answered is the specialist's from then on, its
 * sentence kept. What it couldn't use is counted, never guessed.
 */
export function applyPageAnswer(handed: readonly PageDecision[], answer: unknown, paths: ReadonlySet<string>, week: string) {
  const raw = (answer && typeof answer === "object" ? answer : {}) as { pages?: unknown };
  const byPath = new Map(handed.map((page) => [page.path, page]));
  let changed = 0, kept = 0, refused = 0;
  for (const entry of Array.isArray(raw.pages) ? raw.pages : []) {
    const { path, verdict: said, into, why } = (entry ?? {}) as { path?: unknown; verdict?: unknown; into?: unknown; why?: unknown };
    const page = typeof path === "string" ? byPath.get(path) : undefined;
    const verdict = typeof said === "string" && (VERDICTS as readonly string[]).includes(said) ? (said as Verdict) : undefined;
    const target = typeof into === "string" && into !== page?.path && paths.has(into) ? into : null;
    const reason = whyText(why);
    if (!page || !verdict || !reason) {
      refused += 1;
      continue;
    }
    const linked = (page.domains ?? 0) > 0;
    const allowed = verdict === "REMOVE" ? !linked && !NEEDED.has(page.type)
      : verdict === "MERGE" || verdict === "REDIRECT" ? target !== null || (verdict === page.verdict && page.into === null)
        : true;
    if (!allowed) {
      refused += 1;
      continue;
    }
    if (verdict === page.verdict && (target ?? page.into) === page.into) {
      kept += 1;
    } else {
      changed += 1;
      Object.assign(page, { verdict, reason: "SPECIALIST" as const, into: verdict === "MERGE" || verdict === "REDIRECT" ? target ?? page.into : null });
    }
    Object.assign(page, { why: reason, decidedBy: "AGENT" as const, decidedWeek: week });
  }
  return { changed, kept, refused };
}

/** Page decisions Ask Hakken reads at most: those to act on, the most used first. */
const PAGES_FOR_ASSISTANT = 60;

/**
 * Page decisions for Ask Hakken (Anthony, 12 October 2026: "its important the
 * info is consistent here and in ask hakken"): every page to act on, as kept —
 * its verdict, the page it goes into, why and who decided — so Ask Hakken
 * repeats the decision and never makes its own. A page not here is kept.
 */
export function pageDecisionsForAssistant(decisions: readonly PageDecision[]) {
  const acting = decisions.filter((decision) => decision.verdict !== "KEEP");
  return {
    rule: "Page decisions as kept: what to do with each page of the website. Give them as written. A page not listed here is to keep as it is; never advise removing, merging or redirecting a page this doesn't say to.",
    link: "/app/insights/page-plan",
    pages: acting.length,
    kept: decisions.length - acting.length,
    toActOn: [...acting].sort((a, b) => b.enquiries - a.enquiries || b.visits - a.visits).slice(0, PAGES_FOR_ASSISTANT).map((decision) => ({
      page: decision.path,
      do: decision.verdict.toLowerCase(),
      ...(decision.into ? { into: decision.into } : {}),
      why: decision.why || REASON_WORDS[decision.reason],
      decided_by: COMPETING_REASONS.has(decision.reason) ? "the Keyword cannibalisation specialist" : decision.decidedBy === "AGENT" ? `the Page decisions specialist${decision.decidedWeek ? `, on ${decision.decidedWeek}` : ""}` : "the rule",
    })),
  };
}
