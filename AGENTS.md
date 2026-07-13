# Sonae Agent Handoff

This is the repo-level handoff for future coding agents. Treat this file as the first local project guide to read after the user's latest instructions.

## Current Branch Rules

- Daily development happens on `dev`.
- `main` is production. A push to `main` triggers `.github/workflows/deploy.yml`.
- Before editing, run `git branch --show-current`. If it is `main`, switch to `dev` before making changes.
- Do not push after every small task. Batch related fixes, verify them, then push only when the user asks.
- After merging or pushing to `main`, switch back to `dev` before continuing feature or cleanup work.

## Git in Codex Desktop

- In Codex Desktop, prefer Apple system Git for network operations: `/usr/bin/git pull`, `/usr/bin/git fetch`, and `/usr/bin/git push`.
- The bundled Codex Git can fail against the HTTPS GitHub remote with `could not read Username for 'https://github.com': Device not configured`, even when the user's normal machine credentials work.
- If a normal `git pull` or `git fetch` fails with that credential error, retry the same operation with `/usr/bin/git` before asking the user to fix GitHub auth.
- The remote is expected to be `https://github.com/roninsatwork/Sonae.git`; do not switch it to SSH just to work around Codex auth unless the user asks.

## Progress Reporting

- For roadmap, plan, or multi-step product builds, include a percentage-complete estimate in user updates and final summaries.
- Report both the overall roadmap progress and the current slice/phase progress when they differ.
- Update the estimate when scope changes, after meaningful implementation milestones, and before pausing, committing, or handing work back.
- Use plain estimates such as "Overall: 10%. Current slice: 40%." Do not wait for the user to ask for percentages.

## Verification Gates

Use Node `22.13.0` (`.nvmrc` / `.node-version`) and run `npm ci` before trusting local verification. The local gate starts with `npm run verify:env`, which checks Node and installed direct dependency versions against `package-lock.json` so stale `node_modules` cannot produce misleading green tests.

Run these before asking the user to merge or push:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

The GitHub Actions production gate also runs:

```bash
npm audit --audit-level=high
npm run lint
npm run typecheck
npm run test:run
npm run build
```

If the local frontend is running on port 3000, stop it before `npm run build`, then restart both services afterwards:

```bash
npm run dev
npm run convex:dev
```

## Movement Demo Freeze

Do not refactor, redesign, or expand the movement demo unless the user explicitly asks or a quality gate is broken by it.

Frozen areas:

- `src/app/(dashboard)/demos/movements/**`
- `src/app/(dashboard)/demos/movement-capture/page.tsx`
- `convex/movements.ts`

The user considers this demo temporary and expects to delete it after the client has seen it. Focus maintainability work elsewhere.

If the user explicitly reopens avatar body motion, read `docs/developer/movement-demo-retargeting-approach.md` before changing `VrmAvatar` or lower-body tracking. The documented direction is source-skeleton proof, neutral calibration, vector retargeting, and foot locking; do not drive body animation primarily from labels such as `squat` or from canned poses.

### Mirror Methodology — Mandatory Contract

Before changing movement capture, display preparation, landmark ownership, scoring correspondence, retargeting, head/spine signs, hands, face, root motion, VRM bone application, or movement proof, read `docs/developer/movement-mirror-and-side-ownership-contract.md`.

Follow the ordered implementation and acceptance work in `docs/plans/active/movement-mirror-methodology-implementation-plan.md`; do not skip directly to bone tuning or selected-frame proof.

The non-negotiable mirror-game invariant is:

- recorded instructor motion preserves anatomical side: instructor right drives instructor-avatar right;
- the live player uses the opposite anatomical side to imitate the instructor: instructor right is matched by player left;
- the player avatar reverses the player's anatomy: player left drives player-avatar right;
- therefore, the instructor avatar and player avatar must visibly perform the same anatomical movement.

Keep preview mirroring, coordinate reflection, anatomical side ownership, and player-to-instructor scoring as separate named decisions. Do not use one generic `mirror` / `facing-player` flag to represent all four.

Mirror acceptance requires actual rendered VRM-bone proof. For shared avatar-behaviour changes, run the three-party instructor/player/player-avatar invariant through every rendered frame of all nine acceptance recordings with zero silent skips; selected frames, solver labels, debug metadata, or a high score are not sufficient proof.

### Replay/Game Motion Vision

Replay Studio is the motion source of truth. If avatar motion is broken, fix the Replay/shared motion pipeline first, prove it with recorded data such as FULL MOTION EXERCISES, and then make Game Studio consume that same shared result. Do not patch Game Studio with separate bone rules, pose-specific tuning, or live-only presentation numbers that diverge from Replay. Any remaining Game Studio difference must be explicit input cleanup before the shared pipeline, or documented VRM application plumbing with parity proof.

Before changing Replay Studio diagnosis, proof artifacts, avatar-follow gates, or the agent debugging workflow, read `docs/plans/active/replay-studio-agent-repair-harness-plan.md`. It defines the required record-once repair loop, canonical repair packet, durable fixture strategy, rendered telemetry, and one-command acceptance workflow. Do not treat a UI verdict or solver label as sufficient rendered-avatar proof.

When debugging Game Studio movement, do not ask the user to repeat live motions until the matching recording has been run through the replay/game harness. Live testing is final confirmation, not the primary debugging loop.

## Project Guardrails

- Keep English and Italian locale dictionaries in parity: `messages/en.json` and `messages/it.json`.
- Do not use native browser dialogs (`alert`, `confirm`, `prompt`) in app UI. Use in-app feedback or the existing Sonae modal patterns.
- Administrative tables and feeds should use 15 rows per page unless a specific product requirement says otherwise.
- Preserve tenant isolation in Convex queries and mutations. Scope non-super-admin access by company.
- Mutations that manage users must prevent privilege escalation. Admins must not create, edit, or delete super-admin privileges.
- Resolve AI model choices from stored configuration instead of hardcoding model literals in runtime paths.
- Avoid committing generated reports, build output, local caches, or scratch artifacts.

## Code Quality Priorities

1. Turn drift checks into automated tests or scripts so future regressions are caught before review.
2. Promote cleaned lint categories back to hard errors now that `npm run lint:all` is clean.
3. Extract repeated admin table/search/pagination structure outside the frozen movement demo.
4. Consolidate app feedback banners, confirmation flows, and empty/error states into shared UI primitives.
5. Add Convex auth helper functions for common `requireUser`, `requireAdmin`, and `requireSuperAdmin` patterns.
6. Normalize Convex error handling and typed row contracts in admin and AI surfaces.
7. Continue splitting workflow editor/runtime types and helpers, but leave movement demo code alone.
8. Add regression tests for auth redirects, locale parity, no-native-dialog drift, and 15-row admin pagination.

See `docs/developer/future-agent-maintenance-plan.md` for the fuller plan.
