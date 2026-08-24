# Extract a shared chart palette and dedupe local formatters

## Context

Two duplication clusters:

**Chart colors.** 321 hex-literal occurrences outside `globals.css` and the demos; hotspots: `src/app/(dashboard)/admin/page.tsx` (21 — chart band/series fills), `src/ui/components/TimeframeDropdown.tsx` (11), `app/reports/page.tsx` (hardcoded `backgroundColor: "#0d0d0d"` at line ~28). Chart hexes are partly forced by the documented html2canvas/oklab constraint (`docs/developer/frontend.md`: Tailwind v4 opacity shorthands compile to `color-mix(in oklab, ...)` which crashes `ChartExportWrapper` exports — explicit hex-with-alpha is the sanctioned workaround), but every page redeclares its own palette. `src/theme-drift.test.ts` ratchets the total (baseline 1,231) and already forbids new local `get*Color` helpers outside two allowed files.

**Formatters.** Despite `src/lib/dates.ts` existing: near-identical local `formatDate` in `src/app/(dashboard)/admin/settings/scripts/page.tsx:26`, `admin/settings/scripts/[scriptId]/page.tsx:37`, `admin/ai/models/[id]/page.tsx:23`; local `formatCurrency` in `app/reports/page.tsx:16`; local `formatNumber`/`formatTime` in `demos/movements/replay-lab/_lib/replayLabHelpers.ts:50,60` (frozen — leave) and `convex/platformAlertService.ts:215`. Also 131 raw `toLocale*` calls coexist with 155 date-fns imports.

## Task

1. Create a shared chart-palette module (e.g. `src/ui/lib/chartPalette.ts`): named series/band/status colors as export-safe hex values, documented as the oklab-workaround boundary. Migrate `admin/page.tsx`, `TimeframeDropdown.tsx`, and the other non-demo chart hex hotspots to it. Check each migrated component for `ChartExportWrapper` boundaries before touching classes.
2. Register the new module as an allowed color-helper location in `src/theme-drift.test.ts` and lower the ratchet baseline to the new actual count.
3. Delete the duplicate `formatDate` implementations in favor of `src/lib/dates.ts` (extend it if a needed format is missing); move `formatCurrency` into `src/lib` and reuse; leave the frozen demo helpers untouched.
4. Do not chase all 131 `toLocale*` calls — only the files you already touch.

## Constraints

- Rendered output must be pixel-identical (same hexes, same date formats) unless a format was inconsistent between duplicates — then pick the dominant one and note it.
- Respect the oklab constraint: no custom-variable opacity shorthands inside export boundaries.
- No code comments beyond what the palette module genuinely needs for the oklab footgun; do not commit or push.

## Acceptance

- Non-demo chart pages import the shared palette; duplicate formatters are gone.
- `src/theme-drift.test.ts` baseline lowered and passing; `npm run check` passes.
