# Auxiliary App Experiences

## Overview

Sonae includes a small set of app experiences outside the core assistant, reports, property, workflow, and administration areas. These surfaces are implemented in the main authenticated dashboard and are useful for demos, experimentation, and lightweight engagement.

Current auxiliary app experiences include:

- Ronin's Run, an arcade game with a persistent leaderboard.
- Agentic Testing Sandbox, an isolated prompt surface for exercising configured agents and auto-routing behavior.

These are authenticated app features. They are not public marketing pages and they do not replace the main Ask Sonae assistant.

## Ronin's Run Arcade

Ronin's Run is available from the app sidebar under the Arcade section when diagnostic routing is enabled for the platform. It opens the `Ronin's Run` game screen and lets signed-in users start a browser-based arcade session.

The page includes:

- A themed game launch screen.
- A play button that starts the game canvas.
- Keyboard movement instructions.
- Fullscreen controls while playing.
- An exit control while playing.
- A global leaderboard below the game when the game is not active.

When a user finishes a game with a score above zero, Sonae records the score. The leaderboard shows ranked entries with the player name, avatar when available, score, and play date. Leaderboard paging uses 15 rows per page.

The leaderboard is global for the game key currently used by the arcade screen. It is visible to authenticated users, so it should be treated as a shared engagement surface rather than a tenant-private operational report.

## Agentic Testing Sandbox

The Agentic Testing Sandbox is an authenticated testing surface for sending prompts to configured agents without using the standard assistant screen. It is designed for clean AI-loop telemetry and agent behavior checks.

The sandbox lets a user:

- Select a specific active agent.
- Select `Any (Auto-Route)` so Sonae can choose the best matching agent.
- Send a prompt into a new or existing sandbox thread.
- Reset the sandbox session.
- Watch a lightweight loading phase indicator while the backend creates the response.

When `Any (Auto-Route)` is selected, Sonae first evaluates the prompt against available agents. If a strong match is found, the message runs against that agent. If no strong match is found, the message falls back to the global assistant behavior.

Auto-routing depends on the platform's configured router model and currently uses the Google Vertex routing path behind the scenes. If auto-route returns no match or fails, the sandbox falls back to the global assistant rather than blocking the prompt.

The sandbox writes normal chat thread and message records. Its purpose is not to hide activity from the system; it is to keep test interactions separate from standard user assistant workflows.

## Permissions And Visibility

Both auxiliary experiences require an authenticated Sonae session. Access still depends on the normal dashboard route protection and backend auth checks.

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
