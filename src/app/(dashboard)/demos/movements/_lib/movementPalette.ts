/**
 * Movement demo palette.
 *
 * These are DOMAIN visualization colours for the movement-capture demo
 * surfaces (capture panels, replay lab, play HUD, avatar scenes). They are
 * deliberately NOT app theme tokens: the demos render a fixed dark "stage"
 * look that must not shift with the dashboard theme.
 *
 * IMPORTANT — Tailwind safelist below. Components build arbitrary-value
 * classes from these constants via template literals (e.g.
 * `bg-[${MOVEMENT_SALMON}]/10`). Tailwind's scanner only sees literal class
 * text, so every such class must ALSO appear verbatim in the safelist
 * comment at the bottom of this file. If you use a new variant/opacity
 * combination in a component, add its literal class there or it will
 * silently have no CSS.
 */

/** Signature Posture Studio salmon: primary accent, player side, warn tier. */
export const MOVEMENT_SALMON = "#f6ccbe";

/** Mint green: instructor side, pass/ready/success tier. */
export const MOVEMENT_MINT = "#a8d5ba";

/** Cream: hover state of salmon controls, light control surfaces. */
export const MOVEMENT_CREAM = "#f7efe7";

/** Dark ink text used on salmon/cream controls. */
export const MOVEMENT_INK = "#17131d";

/** Near-black stage/canvas background behind video and avatar scenes. */
export const MOVEMENT_SCENE_BG = "#07070b";

/** Dark HUD/overlay panel background (cards, tooltips, dialogs). */
export const MOVEMENT_PANEL_BG = "#111018";

/** Blocked/fail accent for borders and washes. */
export const MOVEMENT_ALERT = "#ff8f8f";

/** Blocked/fail text (softer companion to MOVEMENT_ALERT). */
export const MOVEMENT_ALERT_SOFT = "#ffb0b0";

/*
 * Tailwind safelist — literal classes emitted at runtime from the constants
 * above. Do not delete; keep whitespace-separated so the scanner picks each
 * token up. Generated from the class combinations in use across the demos.
 *
 * accent-[#a8d5ba] accent-[#f6ccbe]
 * bg-[#07070b] bg-[#07070b]/60
 * bg-[#111018] bg-[#111018]/70 bg-[#111018]/90 bg-[#111018]/95
 * bg-[#111018]/[0.72] bg-[#111018]/[0.82] bg-[#111018]/[0.86]
 * bg-[#a8d5ba] bg-[#a8d5ba]/10 bg-[#a8d5ba]/15 bg-[#a8d5ba]/20 bg-[#a8d5ba]/50
 * bg-[#f6ccbe] bg-[#f6ccbe]/10 bg-[#f6ccbe]/12 bg-[#f6ccbe]/15
 * bg-[#f6ccbe]/30 bg-[#f6ccbe]/45
 * bg-[#f6ccbe]/[0.08] bg-[#f6ccbe]/[0.12] bg-[#f6ccbe]/[0.14]
 * bg-[#f7efe7] bg-[#ff8f8f]/10
 * border-[#a8d5ba] border-[#a8d5ba]/20 border-[#a8d5ba]/25 border-[#a8d5ba]/30
 * border-[#a8d5ba]/45 border-[#a8d5ba]/60
 * border-[#f6ccbe] border-[#f6ccbe]/20 border-[#f6ccbe]/25 border-[#f6ccbe]/30
 * border-[#f6ccbe]/35 border-[#f6ccbe]/50 border-[#f6ccbe]/60
 * border-[#f6ccbe]/[0.16] border-[#f6ccbe]/[0.25] border-[#f6ccbe]/[0.35]
 * border-[#ff8f8f]/25 border-[#ff8f8f]/35
 * focus:border-[#a8d5ba]/60 focus:border-[#f6ccbe]/50 focus:ring-[#f6ccbe]/50
 * hover:bg-[#a8d5ba]/15 hover:bg-[#a8d5ba]/18 hover:bg-[#a8d5ba]/45
 * hover:bg-[#f6ccbe] hover:bg-[#f6ccbe]/15 hover:bg-[#f6ccbe]/20
 * hover:bg-[#f7efe7]
 * hover:border-[#a8d5ba]/45 hover:border-[#f6ccbe]/40 hover:border-[#f6ccbe]/45
 * hover:border-[#f6ccbe]/50 hover:border-[#ff8f8f]/50
 * text-[#17131d] text-[#a8d5ba] text-[#f6ccbe] text-[#ffb0b0]
 */
