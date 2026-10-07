/**
 * The Caretaker Agent's definition (docs/plans/active/hakken-tasks-plan.md,
 * Phase 5): the built-in agent that pauses, once a day, any task that can no
 * longer work, and tells its owner what happened and what to do. Plain code,
 * free of any Convex function. Its name carries the platform's name — "The
 * Hakken Caretaker Agent" here — as Anthony named it, 2026-10-07.
 */
export const CARETAKER = {
  systemKey: "HAKKEN_CARETAKER",
  nameFor: (platformName: string) => `The ${platformName} Caretaker Agent`,
  description:
    "Looks at every task people have set up once a day and pauses any that can no longer work — its website removed, Search Console disconnected or silent, its page not shown in Google for four weeks, its question or search no longer tracked, or the same task twice — then tells its owner in the bell what happened and what to do. Turning it back on is one tap, once it's fixed. Plain code; it calls no model.",
  systemPrompt: "You look after the tasks people set up. The platform does this as a fixed job: you write nothing and call no model.",
  standingObjective: "Pause any task that can no longer work, and tell its owner what to do.",
} as const;
