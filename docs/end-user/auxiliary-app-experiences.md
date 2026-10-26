---
product: Hakken
documentation_type: End-user guide
feature_area: Auxiliary app experiences
audience: signed-in users and administrators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/auxiliary-app-experiences.md
last_reviewed: '2026-10-26T14:44:07+00:00'
reviewed_against: current implementation
status: Current
---
# Auxiliary App Experiences

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Auxiliary app experiences
> **Reviewed:** 26 October 2026, 14:44:07 GMT (Europe/London)
> **Source path:** `docs/end-user/auxiliary-app-experiences.md` · **Status:** Current

## Overview

Hakken includes a small set of app experiences outside the core assistant, website insights, workflow, and administration areas. These surfaces are implemented in the main authenticated dashboard and are useful for demos, experimentation, and lightweight engagement.

Current auxiliary app experiences include:

- Ronin's Run Night Heist, with saved campaign progress and workspace leaderboards.
- Ronin's Run 3D, a separate browser-session first-person experience.
- Agentic Testing Sandbox, an isolated prompt surface for exercising configured agents and auto-routing behavior.

These are authenticated app features. They are not public marketing pages and they do not replace the main Ask Hakken assistant.

## Ronin's Run Arcade

Ronin's Run is available from the app sidebar under the Arcade section when diagnostic routing is enabled for the platform. It opens the `Ronin's Run` game screen and lets signed-in users start a browser-based arcade session.

The page includes:

- A themed game launch screen.
- A play button that starts the game canvas.
- Keyboard movement instructions.
- Fullscreen controls while playing.
- An exit control while playing.
- A global leaderboard below the game when the game is not active.

Night Heist records a successful escape through a server-issued run receipt. It is not the older unrestricted score-submission flow. Leaderboards for its map keys are scoped to the active workspace; older legacy game keys retain their historical game-wide behavior. Treat those two visibility contracts separately.

## Agentic Testing Sandbox

The Agentic Testing Sandbox is an authenticated testing surface for sending prompts to configured agents without using the standard assistant screen. It is designed for clean AI-loop telemetry and agent behavior checks.

The sandbox lets a user:

- Select a specific active agent.
- Select `Any (Auto-Route)` so Hakken can choose the best matching agent.
- Send a prompt into a new or existing sandbox thread.
- Reset the sandbox session.
- Watch a lightweight loading phase indicator while the backend creates the response.

When `Any (Auto-Route)` is selected, Hakken first evaluates the prompt against available agents. If a strong match is found, the message runs against that agent. If no strong match is found, the message falls back to the global assistant behavior.

Auto-routing depends on the platform's configured router model and uses the configured router model through supported text-provider adapters. If auto-route returns no match or fails, the sandbox falls back to the global assistant rather than blocking the prompt.

The sandbox writes normal chat thread and message records. Its purpose is not to hide activity from the system; it is to keep test interactions separate from standard user assistant workflows.

## Permissions And Visibility

Both auxiliary experiences require an authenticated Hakken session. Access still depends on the normal dashboard route protection and backend auth checks.

Important visibility notes:

- Ronin's Run is exposed through the sidebar arcade navigation only when diagnostic routing is enabled.
- Agentic Testing Sandbox is implemented as an app route, but it is not currently a primary sidebar item.
- Arcade scores use signed-in user identity for names and avatars.
- Sandbox messages are stored through the same chat system used by other assistant and agent conversations.

## When To Use These Features

Use Ronin's Run when demonstrating the breadth of the app shell or testing interactive canvas behavior, fullscreen controls, leaderboard paging, and authenticated score writes.

Use Agentic Testing Sandbox when checking whether agent routing, agent selection, thread creation, and agent response telemetry behave as expected before presenting or relying on an agent configuration in a production workflow.

## Related Documentation

- [Assistant Chat](./assistant-chat.md)
- [Agents](./agents.md)
- [Platform Overview](./platform-overview.md)

## Night Heist Campaign And Saving

Open `/app/arcade/ronins-run`. The saved campaign proceeds through Lantern Courtyard, Night Market, Canal Docks, and Fortress Gardens. Escaping each earlier map unlocks the next for the same player and active workspace. The map selector shows locked, available, escaped, and best-score states. Switching company or impersonated workspace changes progress and leaderboard context; success in one workspace is not a global unlock for all companies.

The game is a client-side stealth experience. Collect the three green seals to open the exit, avoid patrol contact, and use the optional treasure and Spirit Power mechanics shown in its HUD. Spirit Power grants ten seconds of contact takedowns with a warning near expiry; pause freezes its timer. Patrols disabled during an attempt return on retry. The courtyard deliberately has gentler patrol behavior than later maps, so success there does not mean every map has identical difficulty.

A successful escape starts saving against the run receipt. Wait for Saved before advancing. If saving fails or remains pending until the timeout, the screen offers Retry save using that same receipt. A lost first response does not create a second score when the original mutation actually succeeded. Starting another run or advancing after an escape is held until that save is resolved. Leaving the page before saving is complete is not a reliable way to retain progress.

The score rewards escape, optional treasure, and speed, with alarm deductions. The server applies the formula to validated submitted values; it does not replay the entire game. It rejects impossible/expired receipt inputs and repeated rapid starts, but this is not competitive anti-cheat or independently verified movement evidence. A client-side animation, local score, and a saved leaderboard row are different stages.

The current finish contract accepts integer elapsed seconds from five through 1,800, bounds alarms, checks elapsed time against the server receipt, and expires old receipts after a day. If a save is refused, keep the actual error and current screen state rather than repeatedly starting runs. The normal start limit is twenty receipts per player per minute. These guardrails protect ordinary writes; they do not promise every browser/network failure can be recovered indefinitely.

## Leaderboards, Controls, And Browser Limits

Night Heist uses 15 rows per leaderboard page. Its backend count is bounded at 10,000 scores. Player search filters the rows already loaded into the browser, so a missing name is not proof that the full score archive was searched. Scores display the player's current name/avatar where available; unknown or removed users can appear with a fallback label. Treat this as an engagement feature, not a customer performance or business-metrics report.

Use the launch instructions and in-game controls for the selected view. Pause, retry, volume/mute, fullscreen, and exit are session controls. A browser can refuse fullscreen or pointer lock; the UI reports relevant failures or provides fallback controls. Audio normally needs user interaction before the browser allows it. Reduced-motion and rendering-quality choices affect presentation, not server-side permissions or the saved campaign contract.

The sidebar Arcade section appears only when diagnostic routing is enabled. That switch controls navigation visibility; it is not an access-security policy for every direct route. The app still uses its authenticated dashboard and server wrappers. Do not enable diagnostic routing as a substitute for establishing a user's actual account or workspace access.

## The Separate 3D Experience

`/app/arcade/ronins-run-3d` is a different first-person canvas, not a different camera on the persisted Night Heist page. Its page holds selected district, preferences, and completion results in browser component state. The reviewed route does not call the Night Heist score/progress backend. Completing all four districts can show a local campaign result, but refreshing or leaving that component is not guaranteed to retain it.

Desktop instructions are WASD movement, mouse look, Q/E turning, Space decoy dash, Escape pause, and M map. Touch controls and pointer-lock fallback are implemented for supported devices. Rendering depends on the browser's graphics support and available resources. A quality or graphics failure is a local interaction issue; it does not prove that a saved server campaign record was lost, since this route does not create that record.

## Sandbox Records And Removed References

The Agentic Testing Sandbox creates ordinary conversation records and can invoke real configured models and permitted tools. It is not a universal no-side-effect rehearsal. Reset clears the selected local session and composer rather than deleting the earlier thread. The rotating loading-phase labels are a presentation animation, not proof of live backend stages completing in that order. Agent listing has its own authorization, so an authenticated route does not guarantee every account can populate the selector.

Sales Data, Properties, posture/movement, and Swarm references are not current routed capabilities found in this checkout review. The route search, module registry, navigation, and matching backend filename search did not locate those feature entry points. Some generic schema, purge, and database allowlist references remain, including historical swarm logs. Their presence does not establish an available screen. Treat these as possibly deprecated/not found and request manual review before deleting residual documentation or stored records.

This guide records optional local implementation and source tests. It does not mark any dated arcade plan accepted, claim real browser/device testing, or change Hakken's product roadmap. No game, sandbox model call, saved score, or destructive cleanup was run during documentation maintenance.
