/**
 * How a navigation list marks the page being read: a light pill with a faint
 * border and a soft shadow, the label in full colour at medium weight.
 *
 * Never the brand colour — orange means "this page's action" and nothing else
 * (AGENTS.md). Shared by the sidebar's items and the Sites side menu, so both
 * mark "you are here" the same way. Anthony, 2026-09-25, of the Sites menu's
 * orange edge: "not consistent with the rest of platform".
 */
export const NAV_ACTIVE_PILL = "bg-foreground/10 border border-border-dim shadow-sm";

/** The label of the page being read, and of every other page, in a navigation list. */
export const NAV_ACTIVE_TEXT = "text-foreground font-medium";
export const NAV_IDLE_TEXT = "text-secondary hover:text-foreground";
