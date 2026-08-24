# Consolidate the atoms/ vs components/screens/ split

## Context

`src/ui/atoms/` contains only four modules — `Button.tsx`, `StatusPill.tsx`, `typography.tsx`, `statusTone.ts` (plus tests) — while the components that are actually atoms in the atomic-design sense (`Checkbox`, `Select`, `Field`, `CursorPagination`, …) live in `src/ui/components/screens/` alongside genuine composites (`DataTable`, `DetailLayout`, `ModalForm`, `PageHeader`). So `screens/` mixes two abstraction levels and `atoms/` is a vestigial folder rather than the home of the primitives.

The tooling already treats the two folders as one namespace: `scripts/check-screen-kit.mjs:439` reads the kit's protected export names from both `src/ui/components/screens/` and `src/ui/atoms/`, and the anti-shadowing rule (`docs/developer/screen-kit.md`, "component declared under a name the kit already exports") covers both. The folder split therefore carries no meaning to the checks — but it leaves no rule for where a new primitive goes (`Button` went to `atoms/`, `Checkbox` went to `screens/`), which is exactly the "guessing instead of standards" gap `docs/developer/screen-kit.md` (line ~245) says the kit exists to close.

## Task

Fold `atoms/` into the kit directory (the cheap direction: 4 files move instead of 15+):

1. Enumerate importers first: grep `src/` for `ui/atoms` — `Button` is imported widely (the screen-kit button rule at `scripts/check-screen-kit.mjs:193` names its path in guidance text).
2. `git mv` the `atoms/` modules and their tests into `src/ui/components/screens/`; update all import paths across `src/`.
3. Update every hardcoded reference to the old path:
   - `scripts/check-screen-kit.mjs` — the `KIT_DIRS`-style list (line ~439), the `Button.tsx` path constant (line ~136), and the guidance strings (lines ~193, ~225).
   - `docs/developer/screen-kit.md` and `docs/developer/frontend.md` wherever `src/ui/atoms` is named.
   - Any drift tests or allowlists that reference `ui/atoms` paths (grep `scripts/` and `src/*.test.ts`).
4. Remove the empty `src/ui/atoms/` directory.
5. State the placement rule in `docs/developer/screen-kit.md`: all kit components — primitive or composite — live in `src/ui/components/screens/`; there is no separate atoms tier.
6. Verify the anti-shadowing protection still covers the moved names (temporarily declare a fake local `Button` in a page and confirm `npm run check:screen-kit` fails, then remove it).

## Constraints

- Pure move: no component behavior, props, or styling changes.
- Keep test files co-located with their components, matching the kit's existing layout.
- Do not touch the frozen movement demos even if they import `Button`; update their import paths only (path updates are mechanical, not feature work).
- No code comments; do not commit or push.

## Acceptance

- `src/ui/atoms/` no longer exists; zero references to `ui/atoms` anywhere in `src/`, `scripts/`, or `docs/` (grep proves it).
- `npm run check:screen-kit` still reads the kit names correctly and still catches shadowing (verified per step 6).
- `npm run check` passes.
