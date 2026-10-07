/**
 * The types of communication (docs/plans/active/outbox-and-preferences-plan.md):
 * every email that goes through the Outbox is one of these, stored on its row
 * so Admin → Content → Outbox can show and filter by it, and a person's
 * profile turns the ones they may choose on or off. Plain code, free of any
 * Convex function, so the screens read the same list as the server.
 *
 * Signing in and invitations are none of these: they never go through the
 * Outbox (Anthony, 2026-10-07).
 */
export const COMMUNICATIONS = [
  "WEEKLY_NEWS_DIGEST",
  "WEBSITE_PERFORMANCE",
  "HAKKEN_TASKS",
  "COLLECTING_STOPPED",
  "SYSTEM_HEALTH",
  "AUTOMATIONS",
  "AGENT_EMAILS",
] as const;

export type Communication = (typeof COMMUNICATIONS)[number];

/**
 * What a person may turn off on their profile, in the order it lists them;
 * everything else always comes. Everyone starts with all of them on and opts
 * out. Weekly website performance joins when its email is built (Anthony,
 * 2026-10-07: hidden until then).
 */
export const CHOOSABLE_COMMUNICATIONS: readonly Communication[] = ["WEEKLY_NEWS_DIGEST", "HAKKEN_TASKS"];

export function isChoosable(communication: string): communication is Communication {
  return (CHOOSABLE_COMMUNICATIONS as readonly string[]).includes(communication);
}

export function isCommunication(value: string): value is Communication {
  return (COMMUNICATIONS as readonly string[]).includes(value);
}
