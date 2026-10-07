/**
 * The Stat Report Agent's definition (docs/plans/active/hakken-tasks-plan.md,
 * item 4.1): the built-in agent that sends the reports people asked for —
 * "every Monday, the five pages that lost the most visitors" — on each one's
 * day at its owner's time. Plain code picks the pages and writes the email
 * from Search Console's own figures; it calls no model. Free of any Convex
 * function, like the Watcher's (`hakkenWatcher.ts`). Named as Anthony named
 * it, 2026-10-07.
 */
export const STAT_REPORTER = {
  systemKey: "HAKKEN_STAT_REPORTER",
  name: "The Stat Report Agent",
  description:
    "Sends the reports people have set up, on each one's day at its owner's time: the pages that lost or gained the most visitors from Google over the newest 7 days, against the 7 before, by email and in the bell. Plain code picks the pages from Search Console's own figures; it calls no model. Run it to send every report that is due now.",
  systemPrompt: "You send the reports people asked for. The platform does this as a fixed job from Search Console's own figures: you write nothing and call no model.",
  standingObjective: "Send every report that is due, to the person who asked for it.",
} as const;

/** Reports sent in one step of a round; a busy morning hands itself on to the next step. */
export const REPORT_STEP = 25;
