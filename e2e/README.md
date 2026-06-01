# E2E Browser Coverage

Run the browser regression suite with:

```bash
npm run test:e2e
```

The Playwright config starts `npm run dev` when no local server is already running and reuses `http://localhost:3000` when it is available.

## Coverage Shape

Always-on unauthenticated coverage:

- Protected admin and app routes redirect to `/login`.
- High-value admin, workflow, AI, table, chat-log, and settings routes return non-5xx responses.
- Route visits collect browser console/page errors to catch obvious Next.js shell crashes.
- `/login` remains publicly accessible.

Authenticated coverage:

- Admin table pagination and search behavior.
- Workflow designer and schedule route rendering.
- AI models and tools route rendering.
- Dashboard export flow.
- End-user assistant and profile flows.

These authenticated specs deliberately skip when the current Playwright context has no auth storage state. That keeps the suite deterministic in local and CI smoke runs while preserving deeper checks for environments that provide authenticated browser state.

## Current Auth Limitation

The app uses Convex Auth and does not currently expose a deterministic test login or seeded Playwright storage state. Until that exists, Phase 7 browser tests focus on route stability and auth boundaries, with deeper behavior guarded behind auth-state checks.
