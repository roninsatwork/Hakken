# Testing Progress State

**Date:** March 31, 2026
**Status:** In Progress
**Current Goal:** Implement a comprehensive testing suite (Unit -> Integration -> E2E) for Hakken.

## What's Completed (Tier 1: Frontend Unit Testing)
- **Framework Installed:** Vitest, React Testing Library, jsdom.
- **Configured:** 
  - `vitest.config.ts` (with alias mappings matching `tsconfig.json`).
  - `vitest.setup.ts` (jest-dom extenders and manual global overrides like `window.matchMedia`).
  - `package.json` now includes the `"test": "vitest"` script.
- **Tests Written & Passing:**
  - `src/ui/components/layout/ThemeToggle.test.tsx` (Renders skeleton vs button depending on mount).
  - `src/ui/components/chat/ChatInput.test.tsx` (Mocks `useMutation` for Convex, `useVoiceToText` hook, and ensures correct form submission logic works instantly).

## Next Steps (To Resume Next Session)

When resuming development:
1. **Tier 2 (Backend/Convex Testing):** 
   - Need to install `convex-test` to spin up a local mock database.
   - Target writes for `knowledge.ts`, `invites.ts`, and `auth.ts` to ensure mutations trigger properly and RAG nodes inject correctly.
2. **Tier 3 (E2E Testing):**
   - Install Playwright (`npx playwright install`).
   - Create workflows that simulate logging into the Hakken app with an invited user session.

*Note for AI Assistant: Use `npm run test` to verify the frontend still passes before starting Tier 2.*
