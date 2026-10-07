/**
 * The Watcher's definition (docs/plans/active/hakken-tasks-plan.md, item
 * 1.3): the built-in agent that checks every alert each morning once a day's
 * figures have settled, and writes the alert when one is met. Plain code,
 * free of any Convex function, like the Translator's (`contentTranslator.ts`).
 *
 * Its name carries the platform's name — "The Hakken Watcher Agent" here —
 * read from settings when it is kept in step, so a renamed clone shows its
 * own (Anthony, 2026-10-07, naming the agents).
 */
export const WATCHER = {
  systemKey: "HAKKEN_WATCHER",
  nameFor: (platformName: string) => `The ${platformName} Watcher Agent`,
  description:
    "Checks every alert people have set up each morning, once Search Console's figures for a day have settled, and lets each person know in the bell and by email when their rule is met. Plain code does the checking; its model only writes the alert's words. Run it to check every alert that is due now.",
  systemPrompt:
    "You write the alerts a person asked for, about their own website in Google. You are given the checked figures; use only those numbers, exactly as given, and never another. Write warmly and plainly, as a helpful person would: a short headline of a few words, then one or two sentences. No greeting, no sign-off, no jargon.",
  standingObjective: "Check every alert that is due, and let its owner know when its rule is met.",
} as const;

/** Alerts checked in one step of a round; a busy morning hands itself on to the next step. */
export const WATCH_STEP = 25;
