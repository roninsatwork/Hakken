import type { InsightsRole } from "./agentRoles";

/**
 * The Insights team (docs/plans/active/insights-analyst-plan.md §6, I20):
 * who owns which discipline, which of a website's facts each reads, and the
 * brief each works to. Kept free of Convex functions so the run, the screens
 * and the tests share one list.
 */

export const INSIGHT_SPECIALISTS = [
  "market",
  "technical",
  "search",
  "local",
  "links",
  "aiVisibility",
  "conversion",
  "measurement",
  // The Head of Strategy's own: two specialists' findings joined into one story (§2.4).
  "strategy",
] as const;
export type InsightSpecialist = (typeof INSIGHT_SPECIALISTS)[number];

/** The specialists who look at a website side by side, before the Head of Strategy. */
export const SIDE_BY_SIDE: readonly Exclude<InsightSpecialist, "strategy">[] = [
  "market", "technical", "search", "local", "links", "aiVisibility", "conversion", "measurement",
];

/** Each specialist's role, whose agent gives its step a model, instructions and spend limit. */
export const SPECIALIST_ROLE: Record<InsightSpecialist, InsightsRole> = {
  market: "INSIGHTS_MARKET",
  technical: "INSIGHTS_TECHNICAL",
  search: "INSIGHTS_SEARCH",
  local: "INSIGHTS_LOCAL",
  links: "INSIGHTS_LINKS",
  aiVisibility: "INSIGHTS_AI_VISIBILITY",
  conversion: "INSIGHTS_CONVERSION",
  measurement: "INSIGHTS_MEASUREMENT",
  strategy: "INSIGHTS_HEAD_OF_STRATEGY",
};

/** The specialist's discipline, in the words its brief uses. */
export const DISCIPLINE: Record<InsightSpecialist, string> = {
  market: "the market: the website against its rivals, their moves over time, and its share of the market",
  technical: "technical SEO: the site audit, pages Google can't read well, speed, structured data and internal links",
  search: "search and content: the searches people use, which page should win which search, and demand moving between words",
  local: "local and reputation: Google Business Profiles, reviews and their pace against rivals",
  links: "links and PR: the websites linking to the business and its rivals",
  aiVisibility: "AI visibility: how AI assistants and Google's AI answers name, cite and send people to the business and its rivals",
  conversion: "conversion (CRO): the money pages, how many visitors and Google clicks it takes for one enquiry, and why that changed",
  measurement: "measurement: whether the figures can be trusted — tracking, what counts as a conversion, and comparing like with like",
  strategy: "strategy: the whole picture across every source",
};

/**
 * The facts each specialist is handed, by their keys' start: its own
 * discipline's, and what it needs beside them to test an explanation (the
 * Conversion specialist reads Search Console's pages to tell a page that lost
 * its visitors from one that lost its enquiries).
 */
export const READS: Record<InsightSpecialist, readonly string[]> = {
  market: ["seo.", "ai.", "sc.clicks.", "ga.channel.Organic Search."],
  technical: ["crawl.", "sc.page.", "sc.clicks.", "sc.position."],
  search: ["sc.", "ga.landingSearch.", "ga.channel.Organic Search.", "seo."],
  local: ["local.", "ga.channel.", "seo."],
  links: ["seo.", "ga.channel.Referral."],
  aiVisibility: ["ai.", "ga.channel.AI assistants.", "ga.firstChannel.", "ga.channel.Organic Search.", "seo."],
  conversion: ["ga.", "sc.page.", "sc.clicks."],
  measurement: ["ga.counted.", "ga.event.", "ga.channel.", "ga.visits.", "ga.conversions.", "sc.clicks", "sc.clicksWorld."],
  strategy: [],
};

/** Every brief's ground rules: what makes a finding Hakken's, whoever wrote it. */
export const GROUND_RULES = [
  "You are one of Hakken's specialists. Hakken is the client's SEO and CRO agency: you find what the figures alone don't say, the way the best agency analyst would, and say what to do about it.",
  "Use only the facts you are given. Name a figure by its key in double square brackets, like [[ga.conversions.365.now]], and never type a number yourself: Hakken fills each one in from the source, so every figure is the figure held. Days, months and years may be written as words (\"the last 12 months\").",
  "Compare like with like: the same span of days, the same country, the same kind of figure. Search Console's clicks and Analytics' visits are both the home country's; \"from every country\" facts are never set against one country's.",
  "Every figure needs a comparison: the website's own past, its rivals, or the market. A figure alone is not a finding.",
  "Test each explanation against the facts before you give it, and say what you ruled out. Drop a candidate the facts don't support. Small numbers move by chance: say \"too early to tell\" rather than raise an alarm.",
  "Write for a business owner: plain, warm words, no jargon, no supplier names (never DataForSEO, Firecrawl). Say \"grow it\", never \"push\". Say \"strength in Google's eyes\", never a score's trade name.",
  "Stay in the lane: no advertising spend, no CRM or won deals, no prices of agencies. Don't write page copy, titles or descriptions: say what a page should do and why.",
  "Only claim what the facts show. An explanation the facts can't test (why people behaved as they did) is said as likely, not as fact, or left out. \"HIGH\" sureness is for a finding two sources agree on, on numbers large enough not to be chance; most findings are \"MEDIUM\".",
  "Only name facts by keys you were given, exactly as written. Never make up a key.",
].join("\n");

/** What a specialist answers with. */
export const FINDINGS_FORMAT = [
  "Reply with only JSON: {\"findings\": [ ... ]}, at most three, the most at stake first, or an empty list when nothing holds. Candidates come with what is at stake (\"atStake\"): never leave out the one most at stake unless the facts disprove it. Each finding:",
  "{\"candidate\": the candidate's number it comes from,",
  " \"pattern\": the candidate's pattern,",
  " \"headline\": one sentence, at most 18 words, naming its key figure,",
  " \"story\": two to four sentences joining the facts into what is happening and why,",
  " \"ruledOut\": each an explanation you checked, written as \"The explanation: why it doesn't hold\" — a few words, a colon, then one sentence naming its facts,",
  " \"sure\": \"HIGH\", \"MEDIUM\" or \"LOW\",",
  " \"action\": one sentence, what to do first,",
  " \"howWeKnow\": one sentence naming the figure to watch in words (not its value) and when to look again,",
  " \"watch\": {\"key\": the fact to read again, \"direction\": \"UP\" or \"DOWN\"},",
  " \"checkInDays\": whole days until it can be judged, 14 to 120,",
  " \"comparisons\": [[\"one fact key\", \"the fact key it is compared with\"], ...] for every comparison the words make}.",
].join("\n");

/** The Head of Strategy's answer: the week's verdict, the order, and any stories joined across specialists. */
export const STRATEGY_FORMAT = [
  "Reply with only JSON: {\"verdict\": one sentence for a managing director, naming the week's most important figure with its key,",
  " \"order\": the findings' numbers, the most at stake first, leaving out any that repeat another,",
  " \"joined\": [ ... ] for two or more specialists' findings that share one cause — each as a finding in the specialists' format, with \"from\": the numbers it joins instead of \"candidate\"]}.",
].join("\n");

/**
 * The team's agents as first made (`insightsTeam.ensureTeamInternal`): names,
 * what each does, and the Head of Strategy's weekly schedule. Each agent's
 * model, instructions and spend limit are then changed in Admin → Agents.
 */
export const TEAM_AGENTS: Record<InsightsRole, { name: string; description: string }> = {
  INSIGHTS_HEAD_OF_STRATEGY: {
    name: "Insights: Head of Strategy",
    description: "Runs the Insights team each week: reads every owned website's sources with its rivals, has each specialist look at its own discipline, connects what they find into stories across sources, ranks them by what is at stake, and has the Editor check every figure before the week's findings are saved.",
  },
  INSIGHTS_MARKET: { name: "Insights: Market specialist", description: "The website against its rivals: their moves over time, the leagues and the website's share of the market." },
  INSIGHTS_TECHNICAL: { name: "Insights: Technical SEO specialist", description: "The site audit, pages Google can't read well, speed, structured data and internal links." },
  INSIGHTS_SEARCH: { name: "Insights: Search and content specialist", description: "The searches people use, which page should win which search, and demand moving between words." },
  INSIGHTS_LOCAL: { name: "Insights: Local and reputation specialist", description: "Google Business Profiles and reviews against rivals." },
  INSIGHTS_LINKS: { name: "Insights: Links and PR specialist", description: "The websites that link to the business and its rivals." },
  INSIGHTS_AI_VISIBILITY: { name: "Insights: AI visibility specialist", description: "How AI assistants and Google's AI answers name, cite and send people to the business and its rivals." },
  INSIGHTS_CONVERSION: { name: "Insights: Conversion specialist", description: "The money pages: how many visitors and Google clicks it takes for one enquiry, and why that changed." },
  INSIGHTS_MEASUREMENT: { name: "Insights: Measurement specialist", description: "Whether the figures can be trusted: tracking, what counts as a conversion, and comparing like with like." },
  INSIGHTS_EDITOR: { name: "Insights: Editor", description: "Checks every figure, comparison and claim before a customer sees it, and tells real change from chance." },
  INSIGHTS_REPORT_WRITER: { name: "Insights: Report Writer", description: "Writes the weekly brief, the monthly report and the quarterly board report from the week's findings." },
};

/**
 * The Head of Strategy's schedule: every morning, once the collectors have
 * run, it reads each client whose own Insights schedule has come due
 * (`DEFAULT_CLIENT_SCHEDULE` unless set on the company's Schedules page).
 * Shown and changed on the Schedules screen.
 */
export const TEAM_SCHEDULE = {
  name: "Insights: the team's run",
  intervalStr: JSON.stringify({ version: 2, kind: "recurring", cadence: "daily", timeLocal: "07:00", timezone: "Europe/London" }),
} as const;

/** The schedule as first made, weekly: moved to daily where nobody has changed it. */
export const FIRST_TEAM_SCHEDULE = JSON.stringify({ version: 2, kind: "recurring", cadence: "weekly", dayOfWeek: 1, timeLocal: "07:00", timezone: "Europe/London" });

/** A client's Insights schedule until one is set: every Monday at 07:00 (I5's weekly rhythm). */
export const DEFAULT_CLIENT_SCHEDULE = FIRST_TEAM_SCHEDULE;

/** Due a little early still counts: the team's own run lands a few minutes either side of the hour. */
export const DUE_SLACK_MS = 2 * 60 * 60 * 1000;

/** The Head of Strategy's spend limit for one website's run, as first made: changed in Admin → Agents (I18). */
export const LEAD_LIMIT_USD = 2;
