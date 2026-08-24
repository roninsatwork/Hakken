# Fix /app pages importing admin internals

## Context

`src/app/(dashboard)/app/governance/page.tsx` (lines ~7-9) and `src/app/(dashboard)/app/governance/audit-trail/page.tsx` (line ~9) import from `src/app/(dashboard)/admin/_components/**` and `admin/settings/_components/AuditLogsTable`. `docs/developer/frontend.md` says genuinely admin-specific parts stay under `admin/_components`; customer-facing `/app` routes reaching into them is a boundary violation and nothing currently enforces this.

## Task

1. Grep for all imports from `(dashboard)/admin/` in files under `(dashboard)/app/` to get the complete list (the two pages above are the known cases).
2. For each shared component, promote it to the shared layer: `src/ui/components/screens/` if it is generic screen-kit material, or a shared feature directory if it is governance-specific. Update both the admin and app import sites; keep the component's behavior and props identical.
3. Leave truly admin-only components where they are.
4. Add enforcement so this cannot recur: either an ESLint `no-restricted-imports` pattern blocking `(dashboard)/app/**` → `(dashboard)/admin/**` imports (the config already uses this mechanism for Convex module imports — follow that style in `eslint.config.mjs`), or a check in `scripts/check-layering.mjs` alongside its existing rules. Prefer the ESLint route.

## Constraints

- No visual or behavioral changes to either the admin or app screens.
- Follow the screen-kit conventions for anything promoted into `src/ui/components/screens/`; do not grow any allowlist.
- No code comments; do not commit or push.

## Acceptance

- Zero imports from `admin/` internals in `app/` routes.
- The new lint/guard rule fails if such an import is reintroduced (verify by temporarily adding one).
- `npm run check` passes.
