# Settle the component file-naming convention and ratchet it

## Context

Component file naming splits three ways with no rule: of ~583 `.tsx` files, 202 are kebab-case, 207 camelCase (e.g. `src/ui/components/screens/standardTableScreen.tsx`), 174 PascalCase (e.g. `src/ui/atoms/Button.tsx`, `src/context/ToastContext.tsx`). Next.js route files (`page.tsx`, `layout.tsx`, kebab route segments) are structural and fine; the drift is in component/module files. The repo's established remedy for this class of problem is a shrink-only ratchet (see `src/admin-i18n-adoption.test.ts`, `src/theme-drift.test.ts` for the pattern).

## Task

1. Measure the actual split excluding Next.js-mandated names (page/layout/error/loading/route files and route-segment directories) to see which convention dominates among *component* files. Adopt **PascalCase for component files** unless the measurement clearly favors another (PascalCase matches the exported component name and the `src/ui/atoms`/`context` core).
2. Do not mass-rename now. Instead:
   - Add a drift test (e.g. `src/file-naming-drift.test.ts`) following the house ratchet pattern: enumerate non-conforming files into a frozen, shrink-only baseline list with a freeze date; fail on any **new** non-conforming file and on stale baseline entries.
   - Document the rule in `docs/developer/frontend.md` next to the other conventions.
3. Optionally rename one small, low-fan-in directory as a demonstration batch (update all imports; git mv to preserve history), shrinking the baseline.

## Constraints

- Renames are case-only on a case-insensitive filesystem (macOS) — use two-step `git mv` if you do any.
- Do not rename anything imported by the frozen movement demos.
- No code comments; do not commit or push.

## Acceptance

- The new drift test passes on the current tree, fails when a wrongly-named new file is added (verify by temporarily adding one), and rejects stale baseline entries.
- `docs/developer/frontend.md` states the rule.
- `npm run check` passes.
