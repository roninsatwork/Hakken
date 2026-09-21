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

Read the [Ronin's Run — Night Heist Plan](../plans/active/ronins-run-night-heist-plan.md)
for the preserved concept, four-map scope, Spirit Power rules and outstanding acceptance checks.
The first local playable build replaces the earlier arcade runtime at the same authenticated route.

Each map has a separate blue Spirit Power flame. It grants ten seconds of
contact takedowns, with a warning during the final three seconds. Guards and
mechanical hounds flee while it is active. Disabled patrols remain down for the
attempt; retry restores them and the flame. Pausing freezes the timer. The three
green seals still open the exit. Knockouts have a local HUD counter and do not
change the backend score formula or run receipt. `RULES` owns the timer and contact
distances; the HUD and renderer share its duration/warning thresholds.

The courtyard uses a gentler patrol profile: movement at 75% of standard speed,
suspicion builds at half rate, and searches last two seconds after losing sight.
`Levels.ts` owns these map-specific settings; later maps use the standard values.
The ronin runs faster than both courtyard pursuers. Direct contact still captures.
Sound defaults to 65% via the shared `DEFAULT_GAME_VOLUME`, with a stronger music
and footstep mix. Slider and mute controls retain control of the master gain.

The game uses:

- `src/app/(dashboard)/app/arcade/ronins-run/RoninCanvas.tsx` for loading, HUD, session controls, result saving and recovery.
- `src/app/(dashboard)/app/arcade/ronins-run/engine/GameEngine.ts` for a 60 Hz fixed-step simulation, focused keyboard input, click-to-move, visibility pause and lifecycle cleanup.
- `src/app/(dashboard)/app/arcade/ronins-run/engine/NightHeistSimulation.ts` for patrols, suspicion, pursuit/search, the hound's trail, decoys, Spirit Power, pickups and terminal outcomes.
- `src/app/(dashboard)/app/arcade/ronins-run/engine/Levels.ts`, `src/app/(dashboard)/app/arcade/ronins-run/engine/MapData.ts` and `src/app/(dashboard)/app/arcade/ronins-run/engine/Navigation.ts` for authored ground polygons, original routes, shared actor clearance and A* navigation.
- `src/app/(dashboard)/app/arcade/ronins-run/engine/NightHeistRenderer.ts` for cropped sprite frames, sorted depth, foreground masks, lantern effects and restrained rain.
- `src/app/(dashboard)/app/arcade/ronins-run/engine/RoninAnimation.ts` for the hero's distance-based contact/compression/flight cycle, front/back mirroring, planted idle and held dash pose. Footstep events share its half-stride distance.
- `src/app/(dashboard)/app/arcade/ronins-run/engine/AudioEngine.ts` for original procedural music and cues. Audio starts with a run; pause suspends it, results stop the music, and disposal closes the context.
- `public/games/ronins-run/` for runtime artwork and atlas metadata. Origins and animation conventions are recorded in [asset production](../plans/assets/ronins-run/asset-production.md).

Recover three seals and reach the map’s escape gate. Treasure is optional. Capture ends the run; retry starts afresh. Desktop controls are WASD/arrows, Space for a decoy dash, Escape to pause, and clicking walkable ground to travel. Mobile/gamepad controls are not implemented.

### Scores and permissions

All endpoints use the authenticated tenant wrappers. Courtyard retains the key `ronin-night-heist-v1`; market, docks and gardens append `:market`, `:docks` and `:gardens`.
Every Night Heist key’s leaderboard and count use the `by_company_game_score` index with the active company,
including an impersonated workspace. Historical game keys and scores are preserved.
Legacy leaderboard queries retain their prior game-wide visibility; the new private ranking
must not be described as changing the visibility of those older records.

`startNightHeistRun` creates an `arcadeRuns` receipt owned by the caller and active company.
`finishNightHeistRun` checks that ownership, rejects invalid/expired results, calculates the
score on the server and writes one `arcadeScores` row. A transaction stores the result on
the receipt so retrying after a lost response returns the same score without a duplicate.
The older `submitScore` endpoint rejects the entire Night Heist key namespace.

`arcadeScores` retains `userId`, optional `companyId`, `game`, `score` and `playedAt`, and
adds an optional `runId`. `arcadeRuns` stores the owner, workspace, start time and optional
completion time/score and an optional level ID, indexed by `by_user_started`. Missing level IDs on old receipts mean courtyard. Both tables belong to the personal-data
erasure inventory. Run creation is limited to 20 per player per minute. These checks are
sanity and duplicate-write protection; gameplay still runs on the client and has no authoritative
replay or competitive anti-cheat.

### Campaign and per-map state

The approved sequence is Lantern Courtyard → Night Market → Canal Docks → Fortress Gardens.
`getNightHeistProgress` reads the best escape for each map through the
`by_user_company_game_score` index (four bounded `.first()` reads). The saved
scores are the progress record; there is no second table or browser-storage
unlock flag. An old courtyard escape therefore unlocks market immediately.
`startNightHeistRun` checks every earlier map for the same player/workspace and
stores the chosen level on the receipt. Finishing derives the leaderboard key
from that receipt, never a client result field. Transactional score writes also
make unlocks idempotent. Failed saves block new runs/advancement until recovered. A 15-second pending-save timeout exposes retry with the same receipt; late original writes remain idempotent.

The selector shows locked, available and escaped states, plus personal bests.
A saved escape offers the next map; the fourth shows campaign completion and
replay. Map changes replace the engine, preserving the fullscreen container and
sound preferences. Progress/locale/score updates do not restart it. Workspace
or player changes remount the session so old receipts cannot carry across.

Each `LevelDefinition` owns its painted background, terrain, objectives, explicit
guard/hound routes and foreground masks. `navigationFor` caches immutable graphs
per definition in a WeakMap; there is no mutable global selected terrain. Renderer
sight cones, simulation visibility, movement and A* use that same map definition.
The docks have two hounds and three individually tested bridge crossings. Gardens
have three guards and one hound. All maps keep the v2 ronin gait and original audio.

### Maintenance notes

The leaderboard displays 15 rows per page. Search covers the loaded rows, as before;
score counts remain capped at 10,000 and are still recorded in the broad-read inventory.
Do not claim an exact unlimited total or global player search. A larger-scale leaderboard
needs a separate indexed search/count design. Abandoned run receipts currently have no
scheduled expiry; decide retention before a broad launch.

Keep the simulation separate from React. Parent callback changes, locale updates and
fullscreen changes must not create another engine. Navigation and physical movement use
the same actor clearance. Regression tests walk the full route, including the bridge and
narrow treasure approach, rather than only checking that destinations are reachable nodes.

Hero artwork uses one reference scale per sheet and explicit ground origins. Do not
resize each pose to its own painted height or anchor every pose at its lowest toe:
that removes body compression/flight and makes the character glide. Stopping resets
ordinary gait to contact and selects the separate idle sheet; dash uses a held pose
without rapid running footsteps. See the [asset record](../plans/assets/ronins-run/asset-production.md)
for selected frames, scales, provenance and unfinished animation polish.

Keyboard input and queued dashes clear on canvas blur and session transitions.
Window blur or a hidden document pauses the simulation and audio; resume resets
the frame clock. Canvas blur alone releases keyboard input while an existing
pointer destination continues, allowing use of the in-game sound controls.

### Development performance check

On the local development server, open `/app/arcade/ronins-run?gamePerformance=1`
and play normally. `GamePerformanceMonitor.ts` logs `[Night Heist performance]`
JSON to the browser console for each ten-second active window. It records frame
count, duration, average RAF frequency, p95 frame interval, p95/max synchronous
engine work, frames over 34 ms, and milliseconds discarded by the engine's 100 ms
frame cap. Pausing, retrying or resetting discards an incomplete window.

This is opt-in development instrumentation and never changes game state. It is
disabled in production. Engine work excludes asynchronous browser/GPU paint;
RAF cadence also reflects the surrounding page and browser scheduling. Record
viewport, canvas backing resolution, environment and sample duration alongside
the output. Short samples on one machine do not establish a minimum-device budget.
Remove the query parameter and reload to return to normal development play.

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

Routing remains Vertex-specific today. `convex/orchestrator.ts` calls `getGoogleVertexProviderModelId` after resolving the configured router model and uses the Google Vertex generation helper with a strict JSON response schema. A non-Vertex router default can therefore make routing fail open to the global assistant until the router path is moved onto the shared provider adapter layer.

The action returns a matched agent only when confidence is greater than `0.65` and the model returns a non-empty agent id. Otherwise it fails open to the global assistant path by returning no matched agent.

### Dispatch Behavior

`chat.sendMessage` accepts `dynamicAgentId`. If the dynamic agent differs from the thread's current agent, the mutation patches the thread before scheduling response generation.

Response scheduling follows the shared chat rules:

- A target agent schedules `internal.agentRuntime.runAgentObjective`.
- `thinkingLevel: "SWARM"` schedules `internal.swarmActions.executeSwarmObjective`.
- Otherwise the standard Hakken response path schedules `internal.aiChat.generateSonaeResponse`.

### Visibility And Navigation

Ronin's Run is exposed by `UserNavTree` in `src/ui/components/layout/SidebarNavTrees.tsx` as an arcade item only when `settings.diagnosticRoutingEnabled` is true. The sandbox route exists under `/app/agentic-testing`, but it is not currently a primary sidebar destination.

If the sandbox becomes a customer-facing workflow, update `SidebarNavTrees.tsx`, locale copy, and this guide in the same change. If it remains an internal test surface, keep language clear that it is for isolated agent testing rather than standard assistant use.

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
