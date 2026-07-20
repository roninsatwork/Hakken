> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Agent Scheduler Upgrade Plan

This plan covers the scheduler upgrade shown in the June 9, 2026 screenshots. The target is a richer agent/workflow schedule builder with two schedule styles:

- Recurring cadence: hourly, daily, weekly, and monthly schedules with a configured local time.
- Targeted times: a list of exact times of day, displayed in local time with the UTC equivalent.

The goal is to make the scheduler easier to configure, safer to execute, and less dependent on parsing display strings.

## Screenshot Target

The screenshots show these required UI states:

- A two-card schedule-mode selector:
  - `Recurring Cadence` with a repeat icon.
  - `Targeted Times` with a clock icon.
  - Selected state uses a green border, tinted background, circular icon badge, and checkmark.
- Recurring cadence controls:
  - Segmented interval control: `Hourly`, `Daily`, `Weekly`, `Monthly`.
  - Hourly: interval selector such as `Every 4 hours` plus an initial start time.
  - Daily: one time-of-day input.
  - Weekly: day-of-week selector plus time-of-day input.
  - Monthly: day-of-month selector plus time-of-day input.
- Targeted times controls:
  - Time input plus `Add Time`.
  - Configured-times list with local time, UTC equivalent, and remove action.
  - Multiple times per day are supported.
- A live summary panel:
  - Examples:
    - `Active Schedule: This agent will execute Daily at 09:00 Local (08:00 UTC).`
    - `Active Schedule: This agent will execute every 4 hours starting at 09:00 Local (08:00 UTC).`
    - `Active Schedule: This agent will execute Weekly on Monday at 09:00 Local (08:00 UTC).`

## Current Code Findings

### Frontend

- Schedule list page:
  - `src/app/(dashboard)/admin/workflows/schedules/page.tsx`
  - Shows schedules, search, pagination, enable/disable, manual run, delete, and navigation to create/edit pages.
- Create page:
  - `src/app/(dashboard)/admin/workflows/schedules/new/page.tsx`
  - Already has workflow versus agent target selection.
  - Already has basic hourly/daily/weekly/monthly controls.
  - Currently builds a translated human-readable `intervalStr` for the backend.
- Edit page:
  - `src/app/(dashboard)/admin/workflows/schedules/[id]/page.tsx`
  - Duplicates much of the create-page logic.
  - Rehydrates state by parsing the human-readable `intervalStr`.
- Workflow drawer schedule controls:
  - `src/ui/components/workflows/ConfigDrawer.tsx`
  - Already writes a JSON schedule config into `_scheduleInterval`.

### Backend

- Schedule schema:
  - `convex/schema.ts`
  - `schedules.intervalStr` is the main schedule definition field.
  - `lastRunTs` and `nextRunAt` already exist.
  - `by_active_next_run` index already supports due-only dispatch.
- Schedule API:
  - `convex/scheduler.ts`
  - `createSchedule`, `updateSchedule`, `toggleSchedule`, `deleteSchedule`, and `manualRunSchedule`.
  - Create/update accepts only `intervalStr`, not a structured schedule payload.
- Schedule calculation:
  - `convex/workflowScheduleService.ts`
  - Supports JSON configs with `mode: "interval" | "daily" | "weekly" | "monthly"`.
  - Also supports legacy strings such as `hourly`, `daily`, `weekly`, and `monthly`.
  - Current calendar schedules are interpreted in UTC.
- Dispatcher:
  - `convex/workflowEngine.ts`
  - Reads active due schedules through `by_active_next_run`.
  - Currently filters to workflow schedules only: `activeSchedules.filter(s => s.workflowId)`.

## Main Gaps

1. Agent schedules can be created in the UI, but the automatic dispatcher currently only executes workflow schedules.
2. Standalone schedule create/edit pages submit display text, while the backend calculator is safer when given structured JSON.
3. Local/UTC preview in the screenshots needs a timezone-aware schedule contract. Current backend calendar calculation is UTC based.
4. Targeted times require multiple daily fire times; the current config supports only one `time`.
5. Create and edit pages duplicate most of the scheduler UI and parsing logic.
6. English and Italian locale dictionaries need new keys kept in parity.
7. Existing list rows show raw `intervalStr`, which will become poor UX once structured configs are stored.

## Proposed Schedule Contract

Keep `intervalStr` for backward compatibility, but store structured JSON in it for new schedules until a dedicated schema field is worth adding. This matches the existing workflow drawer pattern and avoids a migration-heavy first pass.

Suggested versioned shape:

```ts
type ScheduleConfigV2 =
  | {
      version: 2;
      kind: "recurring";
      cadence: "hourly";
      everyHours: number;
      startTimeLocal: string;
      timezone: string;
    }
  | {
      version: 2;
      kind: "recurring";
      cadence: "daily";
      timeLocal: string;
      timezone: string;
    }
  | {
      version: 2;
      kind: "recurring";
      cadence: "weekly";
      dayOfWeek: number;
      timeLocal: string;
      timezone: string;
    }
  | {
      version: 2;
      kind: "recurring";
      cadence: "monthly";
      dayOfMonth: number;
      timeLocal: string;
      timezone: string;
    }
  | {
      version: 2;
      kind: "targetedTimes";
      timesLocal: string[];
      timezone: string;
    };
```

Notes:

- `timezone` should be an IANA timezone such as `Europe/London`, captured from the browser by default and displayed in the UI.
- `dayOfWeek` should use a documented numeric convention. Prefer JavaScript-compatible `0 = Sunday` through `6 = Saturday` because existing backend code already uses `Date#getUTCDay()`.
- `timesLocal` should be normalized, deduplicated, sorted, and limited to a reasonable maximum such as 24 times per day.
- The display string should be derived from the structured config, not stored as the only source of truth.

## Implementation Plan

### Phase 1: Shared Scheduler Domain Helpers

Create a shared scheduler helper module for the admin UI, for example:

- `src/app/(dashboard)/admin/workflows/schedules/_lib/scheduleConfig.ts`

Responsibilities:

- Build default schedule drafts for recurring and targeted-times modes.
- Convert form drafts to `ScheduleConfigV2`.
- Parse legacy strings and current JSON configs for edit-mode hydration.
- Format the active summary text.
- Format local and UTC time previews.
- Validate schedule configs before submit.

Backend companion changes:

- Extend `convex/workflowScheduleService.ts` to parse `ScheduleConfigV2`.
- Keep existing parsing for legacy strings and older workflow drawer JSON.
- Add tests for daily, weekly, monthly, hourly, targeted times, DST-sensitive next-run calculation, and legacy fallback.

### Phase 2: New Scheduler Builder Component

Extract the duplicated create/edit scheduler UI into a reusable component:

- `src/app/(dashboard)/admin/workflows/schedules/_components/ScheduleBuilder.tsx`

Builder sections:

- Mode cards:
  - Recurring Cadence.
  - Targeted Times.
- Recurring controls:
  - Hourly/Daily/Weekly/Monthly segmented control.
  - Conditional controls matching the screenshots.
- Targeted-times controls:
  - Add time.
  - Configured-times list.
  - Remove time.
  - Empty state when no times exist.
- Active schedule summary panel.

Design constraints:

- Use lucide icons: `Repeat2`, `Clock3`, `CheckCircle2`, `ChevronDown`, and `X` or `Trash2`.
- Keep the operational dashboard feel: restrained, dense, and scannable.
- Avoid nested card styling; use the two mode cards and the configured-times rows as the only framed elements in this section.
- Make the layout responsive so the cards stack on narrow screens and controls wrap without overlapping.

### Phase 3: Create/Edit Page Integration

Update:

- `src/app/(dashboard)/admin/workflows/schedules/new/page.tsx`
- `src/app/(dashboard)/admin/workflows/schedules/[id]/page.tsx`

Changes:

- Replace duplicated frequency UI with `ScheduleBuilder`.
- Submit `JSON.stringify(ScheduleConfigV2)` as `intervalStr`.
- Keep target selection, active toggle, submit actions, and error modal behavior.
- Ensure edit mode can load:
  - New `ScheduleConfigV2`.
  - Existing workflow drawer JSON.
  - Existing legacy display strings.
- Add targeted-times validation:
  - At least one time.
  - Valid `HH:mm`.
  - No duplicates.
  - Sorted display.

### Phase 4: Backend Execution Upgrade

Update:

- `convex/workflowScheduleService.ts`
- `convex/workflowEngine.ts`
- `convex/scheduler.ts`

Required behavior:

- `getNextWorkflowScheduleRunAt` must calculate the next due timestamp from `ScheduleConfigV2`.
- `shouldRunWorkflowSchedule` must support targeted times and avoid double-running the same configured time.
- `createSchedule`, `updateSchedule`, and `toggleSchedule` must compute `nextRunAt` using structured configs.
- The dispatcher must support agent schedules, not just workflow schedules.

Agent execution options:

- Preferred first pass: route scheduled agents through the same behavior as manual agent schedules if that is the current product contract.
- If scheduled agents should run a specific generic agent runtime instead of only the sales report path, add an explicit backend execution path and tests before enabling it broadly.

### Phase 5: Schedule List Display

Update:

- `src/app/(dashboard)/admin/workflows/schedules/page.tsx`

Changes:

- Format schedule config into a user-readable summary instead of showing raw JSON.
- Search both workflow and agent names. Current search checks schedule name and workflow name only.
- Consider showing next run time if `nextRunAt` is present.
- Keep the existing 15-row admin pagination rule through `ADMIN_PAGE_SIZE`.

### Phase 6: Locale Updates

Update both files in parity:

- `messages/en.json`
- `messages/it.json`

Add keys for:

- `Recurring Cadence`
- `Targeted Times`
- `Execution Interval`
- `Initial Start Time`
- `Time of Day`
- `Configured Times`
- `Add Time`
- `Remove`
- Active summary variants for hourly, daily, weekly, monthly, and targeted times.
- Validation messages for duplicate time, missing time, invalid time, and unsupported schedule config.

### Phase 7: Verification

Focused tests:

- `convex/workflowScheduleService.test.ts`
  - Parses `ScheduleConfigV2`.
  - Computes next run for recurring hourly/daily/weekly/monthly.
  - Computes next run for targeted times.
  - Does not rerun a targeted time already covered by `lastRunTs`.
  - Keeps legacy strings working.
- `convex/scheduler.test.ts`
  - Create/update/toggle persists structured configs and advances `nextRunAt`.
  - Dispatcher runs due workflow schedules.
  - Dispatcher behavior for due agent schedules is covered once the execution contract is chosen.
- UI tests for schedule create/edit:
  - Mode switching.
  - Hourly/daily/weekly/monthly control rendering.
  - Targeted time add/remove/dedupe.
  - Active summary copy.
  - Submit payload uses structured JSON.
- Existing list page test:
  - Verify agent-name search.
  - Verify formatted interval summary.

Full gates before merge or push:

```bash
npm run lint:all
npm run check
npm run build
git diff --check
```

## Open Decisions

1. Should scheduled agents run the current `salesReportActions.generateReport` path, or should they run a more general agent runtime path?
2. Should schedules store timezone explicitly per schedule, or should they always use the admin creator's browser timezone at creation time?
3. Should targeted times mean every day at those times, or should targeted times also support weekly/monthly scoping later?
4. Should `intervalStr` remain the long-term storage field, or should we add a dedicated `scheduleConfig` field after the UI stabilizes?
5. What maximum number of targeted times per schedule should the product allow?

## Recommended First Build Slice

Build the UI and backend contract together, but keep the scope tight:

1. Add `ScheduleConfigV2` parsing and next-run calculation.
2. Add the reusable schedule builder component.
3. Wire create/edit pages to submit structured JSON.
4. Preserve legacy schedule compatibility.
5. Fix automatic agent schedule dispatch according to the chosen execution contract.
6. Add tests and run the full gates.
