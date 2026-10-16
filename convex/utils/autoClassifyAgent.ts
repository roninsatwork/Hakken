/**
 * The Auto Classify agent's definition (docs/plans/active/auto-classify-plan.md,
 * AC6, AC10): the built-in agent that sorts each owned website's pages into
 * its own page groups — the ones no person or address line has set — and
 * writes a description for each group that has none. Each website it works on
 * is a run of its own, so its steps, logs, costs and Jev's answers show in
 * Agents and the run observatory like any collector's. Plain code, free of
 * any Convex function.
 */
export const AUTO_CLASSIFIER = {
  systemKey: "AUTO_CLASSIFIER",
  name: "Auto Classify",
  description:
    "Sorts each owned website's pages into its own page groups — the pages no person or address line has put in one — from the words in each page's address and the search that brings it visitors, and writes a description for each group that has none. Each website is a run of its own. A person's choice and an address line always win.",
  systemPrompt:
    "You sort a website's pages into its own page groups. The platform does this as a fixed job: each page is asked of the \"Which group is this page in?\" Decision, and each group without a description gets one written from its name, its pages and what the business does.",
  standingObjective: "Sort every owned website's pages that no person or rule has put in a group, and describe each group that has no description.",
} as const;

/** Its schedule, made with it: each night after Search Console's collection has found the day's new pages. Shown and changed on the Schedules screen. */
export const AUTO_CLASSIFY_SCHEDULE = {
  name: "Auto Classify: new pages each night",
  intervalStr: JSON.stringify({ version: 2, kind: "recurring", cadence: "daily", timeLocal: "05:30", timezone: "Europe/London" }),
} as const;

/** Pages one step asks about, eight at a time, before handing on to the next step. */
export const PAGES_PER_STEP = 100;

/** Asks in flight at once, as "What kind of page is this?" asks. */
export const ASKS_AT_ONCE = 8;

/** A run whose last step is older than this has lost it: the watch carries it on from where it was. */
export const AUTO_CLASSIFY_STALL_MS = 10 * 60 * 1000;

/** After a group changes, the website's pages are sorted again this long after, so a few edits in a row start one run. */
export const AFTER_CHANGE_MS = 2 * 60 * 1000;

/** Groups described in one step: each is one call to the writing model. */
export const DESCRIPTIONS_PER_STEP = 10;
