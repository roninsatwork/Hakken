# Plans

On 2026-07-20 the earlier movement and platform plans were retired to start
fresh. The current active folder now contains the live movement plan, current
platform/admin planning notes, and handover material for unfinished or recently
completed work.

## Active Plans

- [Movement Definitive Plan](./active/movement-definitive-plan.md) — the vision,
  acceptance rules, capture-screen rules, and work queue for all movement work.
- [Platform Hardening Plan](./active/platform-hardening-plan.md) — the platform
  hardening record for correctness, security, operational envelope, agent
  runtime, and reusability work. Its current handover states that all planned
  days are complete, but the document remains in `active/` as the detailed
  write-up until it is deliberately archived.
- [Admin UI/UX Plan](./active/admin-ux-plan.md) — the current admin usability
  plan for model catalogue, Skill Center, skill detail, model defaults, system
  options, API keys, and related admin surfaces.
- [OpenRouter And Model Scale Plan](./active/openrouter-and-model-scale-plan.md) —
  adding OpenRouter as a provider across the whole app, and the database-side
  paging, search indexes and rollups the model catalogue needs to hold hundreds
  of models. Owns the AI Providers screen and everything about provider
  resolution at run time.
- [Outstanding Tasks](./active/OUTSTANDING-TASKS.md) — the current queue of
  work left outside the platform hardening plan or deliberately stopped short of
  that plan.
- [Handover](./active/HANDOVER.md) — the current platform-hardening handover
  state, including verification status, local operating notes, and unfinished
  follow-up context.

The plans do not overlap. If work touches movement, the Movement Definitive Plan
wins. If work touches non-movement platform hardening, check the Platform
Hardening Plan, then Outstanding Tasks and Handover for current status. If work
touches AI providers, provider resolution at run time, or the scale of the model
catalogue, use the OpenRouter And Model Scale Plan. If work touches the other
named admin UX screens, use the Admin UI/UX Plan.

## Retired And Completed Plans

Everything in [completed/](./completed/) is historical reference only unless a
current active document explicitly points to it for background. Retired movement
plans carry a note at the top pointing back to the Movement Definitive Plan.
Completed platform plans such as provider-neutral model work, analytics scale
optimization, platform scale hardening, post-scale hardening, Replay repair, and
Replay/Game alignment should not be treated as current implementation
instructions unless they are deliberately reopened.
