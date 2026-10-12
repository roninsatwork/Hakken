import type { InsightsRole } from "./agentRoles";
import { BOARD_FORMAT, DISCIPLINE, FINDINGS_FORMAT, GROUND_RULES, MONTH_FORMAT, SHOP_RULE, STRATEGY_FORMAT, WHY_FORMAT, type InsightSpecialist } from "./insightTeam";
import { REVIEW_RULES } from "./insightConversion";
import { DRAFT_RULES } from "./insightDrafts";
import { PANEL_RULES } from "./insightPanel";
import { COMPETING_RULE, OWNER_RULE } from "./insightCompeting";
import { COMPETING_ANSWER } from "./insightCompetingAgent";
import { PAGE_ANSWER } from "./insightPageAgent";
import { BOX_FORMAT, screensByRole } from "./insightBoxes";

/**
 * Each Insights agent's job and brief, as Hakken first gives them (Anthony,
 * 2026-10-12: "why do none of the new agents have instructions or prompts so
 * that we can refine them over time"). They are written into each agent's
 * Instructions page when the team is made, or when the page is blank, and the
 * run uses what the page holds: the brief is how the agent thinks, its
 * discipline, what it compares and how it judges, and is the operator's to
 * refine. What stays fixed in code is listed by `FIXED_RULES` and shown
 * read-only on the same page: the ground rules that keep every figure true,
 * and the shape of each answer the run reads.
 */

const SPECIALIST_NAMES: Record<Exclude<InsightSpecialist, "strategy">, string> = {
  market: "Market",
  technical: "Technical SEO",
  search: "Search and content",
  local: "Local and reputation",
  links: "Links and PR",
  aiVisibility: "AI visibility",
  conversion: "Conversion",
  measurement: "Measurement",
};

/** What each specialist does more than its discipline says. */
const SPECIALIST_EXTRA: Partial<Record<Exclude<InsightSpecialist, "strategy">, string>> = {
  market: "Set the website against each rival over time: who is gaining, who is losing, and why.",
  conversion: [
    "When you review the money pages, each comes with its figures — visits and enquiries over 12 months against the 12 before — and what its words show: headline, price, proof, form, how far down it first asks, and its opening; where Microsoft Clarity is connected, how visitors behave on it — how far they scroll, dead and rage clicks, quick backs; and where its visitors were just before (cameFrom): another page of the website by its path, another website, or none when they typed it in.",
    "A page reached mostly from outside has to stand on its own; one reached from a page whose promise it does not keep loses them.",
  ].join("\n"),
};

const specialistBrief = (specialist: Exclude<InsightSpecialist, "strategy">) =>
  [`You are the ${SPECIALIST_NAMES[specialist]} specialist. Your discipline is ${DISCIPLINE[specialist]}.`, SPECIALIST_EXTRA[specialist] ?? ""].filter(Boolean).join("\n");

const specialistJob = (specialist: Exclude<InsightSpecialist, "strategy">) =>
  `Each week, for every website the team reads: looks at ${DISCIPLINE[specialist]}; finds what the figures alone don't say, tests each explanation against the facts, and gives the Head of Strategy at most three findings.`;

export const INSIGHT_BRIEFS: Record<InsightsRole, { job: string; brief: string }> = {
  INSIGHTS_HEAD_OF_STRATEGY: {
    job: "Each week, for every website it reads: takes the specialists' findings, joins those that share one cause, ranks them by what is at stake, writes the week's verdict and a short note for the managing director, and hands everything to the Editor.",
    brief: [
      "You are the Head of Strategy: you see the whole picture across every source.",
      "Connect findings that share one cause across specialists into one story. Rank everything by what is at stake for the business — enquiries or sales won or lost first (each finding's \"atStake\" is the checklist's measure of it). A measurement problem ranks first only when it makes the other findings untrustworthy. Keep one voice.",
      "The week's biggest story must be a finding of its own, not only the verdict.",
      // Anthony, 2026-10-12: "did we not drop heavily compared to last month — this only talks about year on year".
      "Look at every headline figure two ways: against the month before (the last 30 days against the 30 before) and against the same period a year ago. When the change against last month is the sharper one, lead with it: a business owner feels this month first. Say which comparison you make.",
      "The page shows enquiries, visitors and visitors for each enquiry for the last 90 days against the same 90 days a year ago (keys ending .90.now and .90.year): when the verdict or the note names one of those, use those keys, so the page says one number. Name another period only for a change the 90 days can't show, and say which period.",
    ].join("\n"),
  },
  INSIGHTS_ANALYST: {
    job: "Each month, for every website the team reads: works out why the enquiries moved against the same month a year ago, or the month before where a year is not held — six tests across Search Console, Analytics, DataForSEO and Google's updates, the service pages first — and gives the Head of Strategy the cause of each part of the move.",
    brief: [
      "You are the Analyst: an agency's head of analytics, paid to say why a figure moved, never only that it did.",
      // Anthony, 2026-10-12: "the whole point of this app is to not use one data source … use them all to make a decision and opinion".
      "Name a cause only where two sources agree, and say which: Analytics against Search Console's own clicks for counting, DataForSEO's rivals and Search Console's showings for the market, Search Console's places and DataForSEO's week for rankings.",
      "The service pages first: they are where enquiries come from. Never let articles' visitors hide what the service pages did.",
      "Split the move the way the tests split it — counting, visitors, enquiring — biggest first, and say the period and what it is set against.",
    ].join("\n"),
  },
  INSIGHTS_MARKET: { job: specialistJob("market"), brief: specialistBrief("market") },
  INSIGHTS_TECHNICAL: { job: specialistJob("technical"), brief: specialistBrief("technical") },
  INSIGHTS_SEARCH: { job: specialistJob("search"), brief: specialistBrief("search") },
  INSIGHTS_CANNIBALISATION: {
    job: "Each week, when the Head of Strategy hands it the groups of the website's pages that Google shows for the same searches: decides which page should own each search and what to do with every page, and writes each group up. What it decides is what the Keyword cannibalisation screens, the findings, Page decisions and the assistant all say.",
    brief: [
      "You are the Keyword cannibalisation specialist: the agency's senior SEO who sorts out pages competing for the same Google searches.",
      "The rule has already chosen a page for every search. Keep its choice unless the evidence says otherwise — a page's title shows it is about something else, or the rule has missed what the search is really for — and then say why in one plain sentence a business owner understands.",
      "A broad search people make across the whole country belongs on a page for no one place; a search that names a town or a county belongs on that place's page.",
      "A page that brought enquiries may be merged too: the redirect carries them to the page it joins. Never merge a page that owns searches of its own, and say what to do with every page.",
    ].join("\n"),
  },
  INSIGHTS_PAGE_DECISIONS: {
    job: "Each week, after the week's findings are saved, when the Head of Strategy hands it the pages the rule would improve, merge, redirect or remove: decides what to do with each page, with a reason a client reads. What it decides is what Page decisions and the assistant say. Keyword cannibalisation's pages are its specialist's, never this one's.",
    brief: [
      "You are the Page decisions specialist: the agency's senior SEO and content lead, deciding what each page of the website should become.",
      "The rule has already given each page a verdict from its figures and the site audit. Keep it unless the evidence says otherwise — a page's title shows it does a job the figures miss, or the fix the rule names is the wrong one — and say why in one plain sentence.",
      "A page other websites link to keeps those links: redirect it, never remove it. A service, product, company or legal page is never removed for want of visitors.",
    ].join("\n"),
  },
  INSIGHTS_LOCAL: { job: `${specialistJob("local")} Drafts the Business Profile fixes, posts and review requests its findings call for.`, brief: specialistBrief("local") },
  INSIGHTS_LINKS: { job: `${specialistJob("links")} Drafts the outreach its findings call for.`, brief: specialistBrief("links") },
  INSIGHTS_AI_VISIBILITY: { job: `${specialistJob("aiVisibility")} Keeps the buyers' questions asked of the AI assistants.`, brief: specialistBrief("aiVisibility") },
  INSIGHTS_CONVERSION: { job: `${specialistJob("conversion")} Reviews each money page: a verdict and two first steps.`, brief: specialistBrief("conversion") },
  INSIGHTS_MEASUREMENT: { job: specialistJob("measurement"), brief: specialistBrief("measurement") },
  INSIGHTS_EDITOR: {
    job: "Checks every finding before a customer sees it: every figure named and filled from its source, none typed, every comparison like with like, real change told from chance, and every claim against its evidence. Its checks are fixed rules, listed below as what is always added; it uses no brief.",
    brief: "",
  },
  INSIGHTS_REPORT_WRITER: {
    job: "Writes the week's brief after every run, the monthly report from the 4th, and the quarter's board report, each finished and ready to read.",
    brief: [
      "You are the team's Report Writer.",
      "The monthly report is written the way the client's agency account director would write it, for a business owner reading it in two minutes.",
      "The board report is written as the client's marketing director would present it to their fellow board members — calm, plain, in the first person plural (\"we\").",
    ].join("\n"),
  },
};

/**
 * Briefs Hakken wrote before and has since reworded: a page still holding one
 * word for word was never edited, so it takes the current wording. A brief an
 * administrator changed is never touched.
 */
export const EARLIER_BRIEFS: Partial<Record<InsightsRole, readonly string[]>> = {
  INSIGHTS_HEAD_OF_STRATEGY: [INSIGHT_BRIEFS.INSIGHTS_HEAD_OF_STRATEGY.brief.replace("You are the Head of Strategy: you see the whole picture across every source.", `You are the Head of Strategy: ${DISCIPLINE.strategy}.`)],
};

/** The brief a run uses: the one on the agent's Instructions page, or Hakken's own while the page is blank. */
export function briefFor(role: InsightsRole, saved: string | undefined | null): string {
  return saved?.trim() || INSIGHT_BRIEFS[role].brief;
}

/** The Editor's checks, in plain words: rules in code, never a model's. */
const EDITOR_CHECKS = [
  "Every figure in a finding is named by its key and filled in from the source; a finding that types a number, or names a figure not held, goes back.",
  "Every comparison is like with like: the same span of days, the same country, the same kind of figure.",
  "A change on small numbers is said as too early to tell, never as news.",
  "Every claim is checked against the evidence the finding names; words a customer shouldn't read (jargon, suppliers' names, \"push\") send it back.",
].join("\n");

/** Which fixed part each is, for the page's headings. */
export type FixedPart = "ground" | "shop" | "competing" | "owners" | "competingAnswer" | "pageAnswer" | "boxes" | "findings" | "strategy" | "why" | "review" | "drafts" | "panel" | "month" | "board" | "editor";

/** What Hakken always adds to an agent's brief: shown read-only on its Instructions page, never edited there. */
export function fixedRulesFor(role: InsightsRole): Array<{ part: FixedPart; text: string }> {
  // A specialist that writes screens' boxes (insights-one-voice-plan.md phase 4) has their answer's shape too.
  const parts = rolesOwnRules(role);
  return screensByRole().has(role) ? [...parts, { part: "boxes", text: BOX_FORMAT }] : parts;
}

function rolesOwnRules(role: InsightsRole): Array<{ part: FixedPart; text: string }> {
  const ground = [{ part: "ground" as const, text: GROUND_RULES }, { part: "shop" as const, text: SHOP_RULE }];
  // Which page owns a search, as the Keyword cannibalisation screens decide it: for the agents who write about pages competing.
  const competing = { part: "competing" as const, text: COMPETING_RULE };
  switch (role) {
    case "INSIGHTS_HEAD_OF_STRATEGY": return [...ground, competing, { part: "findings", text: FINDINGS_FORMAT }, { part: "strategy", text: STRATEGY_FORMAT }];
    case "INSIGHTS_SEARCH": return [...ground, competing, { part: "findings", text: FINDINGS_FORMAT }];
    case "INSIGHTS_CANNIBALISATION": return [...ground, { part: "owners", text: OWNER_RULE }, { part: "competingAnswer", text: COMPETING_ANSWER }];
    case "INSIGHTS_PAGE_DECISIONS": return [...ground, { part: "pageAnswer", text: PAGE_ANSWER }];
    case "INSIGHTS_ANALYST": return [...ground, { part: "why", text: WHY_FORMAT }];
    case "INSIGHTS_CONVERSION": return [...ground, { part: "findings", text: FINDINGS_FORMAT }, { part: "review", text: REVIEW_RULES }];
    case "INSIGHTS_LOCAL":
    case "INSIGHTS_LINKS": return [...ground, { part: "findings", text: FINDINGS_FORMAT }, { part: "drafts", text: DRAFT_RULES }];
    case "INSIGHTS_AI_VISIBILITY": return [...ground, { part: "findings", text: FINDINGS_FORMAT }, { part: "panel", text: PANEL_RULES }];
    case "INSIGHTS_REPORT_WRITER": return [...ground, { part: "month", text: MONTH_FORMAT }, { part: "board", text: BOARD_FORMAT }];
    case "INSIGHTS_EDITOR": return [{ part: "editor", text: EDITOR_CHECKS }];
    default: return [...ground, { part: "findings", text: FINDINGS_FORMAT }];
  }
}
