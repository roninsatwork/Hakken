/**
 * Font choices for the Aesthetics screen, as named keys.
 *
 * The old dropdown submitted raw CSS strings, and its "Inter" option was the
 * literal string `var(--font-sans)`. The theme injector then executed
 * `setProperty('--font-sans', 'var(--font-sans)')` — a custom-property cycle,
 * which computes to invalid and drops the whole app to the browser's default
 * serif. Storing keys instead of CSS makes that class of bug unrepresentable:
 * the injector owns the mapping to concrete stacks, and "default" writes
 * nothing at all.
 *
 * Stacks may reference OTHER variables (`--font-mono` comes from next/font on
 * `<body>`, see `src/app/layout.tsx`) but never the property being set.
 */

export type ThemeFontKey = "default" | "mono";

const MONO_STACK = "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, monospace";

/**
 * The concrete font-family stack for a stored value, or undefined for "leave
 * the app default alone". Accepts the legacy raw-CSS values the old dropdown
 * wrote, including the self-referential one this module exists to bury.
 */
export function resolveFontFamily(stored: string | undefined | null): string | undefined {
  if (!stored || stored === "default") return undefined;
  if (stored === "mono" || stored === "var(--font-mono)") return MONO_STACK;
  // The old "Inter" option — the self-cycle. Default is already Inter.
  if (stored === "var(--font-sans)") return undefined;
  // Any other variable reference is a legacy value we no longer trust.
  if (stored.includes("var(")) return undefined;
  // A legacy literal stack (e.g. "'Playfair Display', serif"). Those fonts
  // were never loaded, so the browser was already falling back; render the
  // app default instead of pretending.
  return undefined;
}

/** The dropdown key a stored value should show as. */
export function normalizeFontKey(stored: string | undefined | null): ThemeFontKey {
  if (stored === "mono" || stored === "var(--font-mono)") return "mono";
  return "default";
}
