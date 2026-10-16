/**
 * The Microsoft Clarity: Collector Agent's definition
 * (docs/plans/active/agents-and-clarity-plan.md, Part 2, CC1–CC6): the
 * built-in agent that collects each connected website's Clarity figures each
 * morning, as Search Console's, Analytics' and Bing's collectors do theirs —
 * a run of its own for each website, its steps and asks in the run's log, a
 * switch, and its schedule on the Schedules page. Made with its schedule the
 * first time a website connects Clarity (`clarityAgentRun.ensureClarityCollector`).
 * Plain code, free of any Convex function.
 */
export const CLARITY_COLLECTOR = {
  systemKey: "MICROSOFT_CLARITY_COLLECTOR",
  name: "Microsoft Clarity: Collector Agent",
  description:
    "Collects each connected website's Microsoft Clarity figures every morning — each page on each device, each device across the website, where visitors came from and which browsers they used — and picks a few recordings worth watching, keeping them since Clarity keeps only three days. Never asks Clarity more than 8 of its 10 times a day, catches up a missed morning while Clarity still has it, and tells the company's admins when Clarity refuses the connection. Plain code; it calls no model.",
  systemPrompt:
    "You collect Microsoft Clarity's figures for each connected website. The platform does this as a fixed job: Clarity's Data Export is asked for the last day by page and device, by device, by source and by browser, a few of Clarity's recordings are picked, and the answers are kept as the day's records.",
  standingObjective: "Keep every connected website's Clarity figures, a day at a time, without missing a day Clarity still holds.",
} as const;

/** Its schedule, made with it: each morning, as the morning job was (05:50 London, 04:50 UTC in summer). Shown and changed on the Schedules screen. */
export const CLARITY_COLLECTOR_SCHEDULE = {
  name: "Microsoft Clarity: each morning",
  intervalStr: JSON.stringify({ version: 2, kind: "recurring", cadence: "daily", timeLocal: "05:50", timezone: "Europe/London" }),
} as const;

/** Clarity's Data Export allows ten asks a project a day; two are always kept in hand, for a person's own look or a retry. */
export const CLARITY_ASKS_A_DAY = 10;
export const CLARITY_ASKS_IN_HAND = 2;
/** Clarity keeps the last three days, so a morning missed is caught up within three. */
export const CLARITY_DAYS_HELD = 3;
/**
 * A day's own figures are two asks — by page and device, by device — and the
 * only ones a missed morning is caught up with. Yesterday's sources and
 * browsers are two asks each, after them: the website's, and by page
 * ("Finishing Parts 3 and 4", decision 1).
 */
export const CLARITY_DAY_ASKS = 2;
export const CLARITY_SPLIT_ASKS = 2;
/**
 * Recording asks a morning at most, with what the export leaves of the eight,
 * and the recordings each asks for. A large website whose pages came back cut
 * spends one more export ask on them first ("Large websites"), leaving one.
 */
export const CLARITY_RECORDING_ASKS = 2;
export const CLARITY_RECORDINGS_A_KIND = 5;
