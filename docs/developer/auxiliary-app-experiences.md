# Auxiliary App Experiences

## Implementation Scope

This guide covers implemented dashboard experiences that sit outside the primary assistant, admin, workflow, property, and reporting product areas:

- Ronin's Run arcade route: `src/app/(dashboard)/app/arcade/ronins-run/page.tsx`
- Ronin's Run game canvas and engine: `src/app/(dashboard)/app/arcade/ronins-run/`
- Arcade backend functions: `convex/arcade.ts`
- Arcade score storage: `arcadeScores` in `convex/schema.ts`
- Agentic Testing Sandbox route: `src/app/(dashboard)/app/agentic-testing/page.tsx`
- Intent routing action: `convex/orchestrator.ts`
- Chat persistence and dispatch: `convex/chat.ts`

These areas are part of the authenticated dashboard app. They should be maintained as real implementation surfaces, even though they are auxiliary to the main platform workflows.

## Ronin's Run Arcade

The arcade page is a client component that renders a themed launch screen, game canvas, fullscreen controls, and a paginated leaderboard.

The page uses:

- `RoninCanvas` for gameplay rendering.
- Engine modules under `src/app/(dashboard)/app/arcade/ronins-run/engine/`.
- `AudioEngine` for menu and start sounds.
- `api.arcade.submitScore` to persist scores after game over.
- `api.arcade.getPaginatedLeaderboard` and `api.arcade.getScoresCount` for the leaderboard.

The current route writes scores with the game key `ronin`. The leaderboard query orders by the `by_game_score` index and then stitches each score to the user document for display name and avatar.

### Data Model

`arcadeScores` stores:

- `userId`
- optional `companyId`
- `game`
- `score`
- `playedAt`

The table is indexed by `by_game_score` for game-specific ranking and by `by_user` for user-oriented lookup.

### Permission Model

All arcade functions require an authenticated user:

- `getPaginatedLeaderboard` calls `requireCurrentUser`.
- `getScoresCount` calls `requireCurrentUser`.
- `submitScore` calls `requireCurrentUser` and records the active company id from the user context.

The leaderboard is game-scoped, not company-scoped. Do not present it as a tenant-private ranking unless the query is changed to filter by `companyId`.

### Maintenance Notes

Keep the admin-table 15-row convention in mind when changing leaderboard paging. The arcade page currently uses 15 leaderboard rows per page and loads more paginated Convex results as the user advances.

If adding another arcade game, give it a distinct durable game key and update both the page and any score-management documentation. Avoid reusing `ronin` for different gameplay.

## Agentic Testing Sandbox

The sandbox is an authenticated client route for exercising agent dispatch outside the normal assistant page. It creates chat threads, sends messages, and can dynamically select an agent before dispatch.

The route uses:

- `api.agents.list` to load selectable agents.
- `api.chat.createThread` to create the sandbox conversation.
- `api.chat.sendMessage` to persist the user message and schedule response generation.
- `api.orchestrator.routeAgentIntent` when the user chooses `Any (Auto-Route)`.
- `api.chat.getMessages` to render the current thread.

The sandbox does not create a separate message system. It writes standard `threads` and `messages` records and relies on the existing chat backend for auth, rate limits, quota checks, PII redaction, attachment validation, agent dispatch, and response scheduling.

### Auto-Routing Behavior

When `Any (Auto-Route)` is selected, the client calls `routeAgentIntent` before sending the message. The action loads active agents available to the user's company, builds an intent-routing prompt, and resolves the router model through stored AI model configuration for the `router` use case.

The action returns a matched agent only when confidence is greater than `0.65` and the model returns a non-empty agent id. Otherwise it fails open to the global assistant path by returning no matched agent.

### Dispatch Behavior

`chat.sendMessage` accepts `dynamicAgentId`. If the dynamic agent differs from the thread's current agent, the mutation patches the thread before scheduling response generation.

Response scheduling follows the shared chat rules:

- A target agent schedules `internal.agentRuntime.runAgentObjective`.
- `thinkingLevel: "SWARM"` schedules `internal.swarmActions.executeSwarmObjective`.
- Otherwise the standard Sonae response path schedules `internal.ai.generateSonaeResponse`.

### Visibility And Navigation

Ronin's Run is exposed by `src/ui/components/layout/SidebarNavigation.tsx` as an arcade item only when `settings.diagnosticRoutingEnabled` is true. The sandbox route exists under `/app/agentic-testing`, but it is not currently a primary sidebar destination.

If the sandbox becomes a customer-facing workflow, update `SidebarNavigation`, locale copy, and this guide in the same change. If it remains an internal test surface, keep language clear that it is for isolated agent testing rather than standard assistant use.

## Testing And Verification

Relevant existing tests include:

- `convex/arcade.test.ts`
- `convex/orchestrator.test.ts`
- `convex/chat.test.ts`
- Agent runtime and agent service tests under `convex/agent*.test.ts`

For UI changes, verify:

- The arcade can start, exit, and submit a score.
- Fullscreen controls do not break game state.
- Leaderboard paging stays at 15 visible rows.
- Sandbox agent selection creates or updates the expected thread agent.
- `Any (Auto-Route)` falls back cleanly when no strong agent match exists.

## Related Documentation

- [Assistant Chat](./assistant-chat.md)
- [Agents](./agents.md)
- [AI Administration](./ai-administration.md)
- [Platform Operations Settings](./platform-operations-settings.md)
