# Company AI Overview UX Plan

Created: 2026-07-02

This plan documents how to redesign the Company AI overview from a dense system inventory into a clear triage page, and how to make the wider Company AI workspace easier for clients to understand. It is a planning document only. Do not implement this work unless the user explicitly asks to move from planning into coding.

Related plans:

- [Company AI Upgrade Plan](./company-ai-upgrade-plan.md)
- [Company AI Modal To Screen Plan](./company-ai-modal-to-screen-plan.md)
- [Company Workspace AI Navigation Plan](./company-workspace-ai-navigation-plan.md)
- [Company Admin Laptop UX Upgrade Plan](./company-admin-laptop-ux-upgrade-plan.md)

Index keywords: company AI overview, readiness UX, triage dashboard, progressive disclosure, runtime context, readiness history, learning suggestions, company memory UX, client-friendly AI workspace.

## Product Decision

Keep this as one `Overview` page.

Do not add a new `Diagnostics` submenu tab as the default solution. A diagnostics tab would reduce visual density, but it would also hide evidence that admins need in order to trust the readiness score. The better UX is progressive disclosure on the same page.

The overview should answer these questions in order:

1. Is this company's AI ready?
2. Why is it in that state?
3. What should the admin do next?
4. Which areas are healthy, need work, or quiet?
5. What evidence supports the score?

The current page starts too close to question 5. The redesign should move questions 1 to 3 into the first viewport.

The same principle applies across the Company AI workspace: if a client has to ask what a label, button, or workflow means, the UI has failed. Company AI pages must use plain product language, clear hierarchy, and visible explanations at the moment of action.

## Current Problem

The current Company AI overview shows many subsystems with similar visual weight:

- readiness score,
- knowledge,
- instructions,
- model routing,
- widget,
- memory,
- skills,
- evals,
- drift,
- activity,
- runtime context preview,
- readiness history,
- learning suggestions,
- evidence-based readiness copy.

Most of this content is useful, but the presentation makes it feel like every item is equally urgent. That forces the admin to inspect the whole page before understanding what matters.

The UX problem is not that the data exists. The UX problem is the lack of priority order.

There is also a language problem across the Company AI workspace. Terms such as `candidate`, `runtime injection`, or `evidence` may be technically accurate, but they are not always clear to a client admin. The interface should explain what becomes trusted AI behavior now, what is only proposed for review, and what action the admin is being asked to take.

## Target UX

The overview should behave like a triage page, not a control-room wall.

The first viewport should make the state obvious:

```text
Company AI

Needs review
70% ready

Why it needs review
1. Prompt needs company-specific instructions.
2. No eval evidence has been recorded.
3. No approved memory exists.

Next best action
[Review prompt]
```

Below that, the page should show a compact health summary:

```text
Needs work
- Prompt
- Evals
- Memory

Healthy
- Knowledge
- Models
- Widget

Quiet
- Skills
- Drift
- Activity
```

Then the page should keep supporting evidence in expandable sections:

```text
Details

[Runtime context preview]
[Readiness history]
[Learning suggestions]
[Evidence explanation]
```

## Page Structure

### 1. Readiness Header

Purpose:

- answer whether the AI is ready,
- show the score,
- name the readiness state,
- avoid technical detail.

Content:

- readiness label, for example `Ready`, `Needs review`, `Not ready`, or `Drifted`,
- readiness score,
- one short plain-English sentence about the state.

Example:

```text
Needs review
70% ready
The AI can run, but prompt, memory, and eval evidence need attention before it should be treated as fully ready.
```

### 2. Priority Reasons

Purpose:

- explain why the score is not higher,
- turn abstract readiness into concrete user work.

Show the top 3 reasons only. If there are more issues, show a small `View all` affordance lower on the page or inside the health summary.

Reason priority:

1. blockers,
2. warnings,
3. unresolved drift,
4. missing eval evidence,
5. missing prompt or weak prompt,
6. missing approved memory,
7. missing skills or skill tool gaps,
8. inactive widget,
9. low knowledge readiness.

Each reason should have:

- a short title,
- one line of explanation,
- an optional link to the relevant section.

### 3. Next Best Action

Purpose:

- prevent the page from becoming passive reporting,
- give the admin a single obvious next step.

Show one primary action based on the highest-priority reason.

Examples:

| Top reason | Primary action |
| --- | --- |
| Prompt missing or weak | `Review prompt` |
| Blocking eval failure | `Open evals` |
| No eval evidence | `Create eval` or `Open evals` |
| Memory candidates waiting | `Review memory` |
| No approved memory | `Add memory` |
| Skill tool gap | `Open skills` |
| Widget inactive | `Open widget` |
| Knowledge failures | `Open knowledge` |

Secondary actions should be visually quieter.

### 4. Compact Health Summary

Purpose:

- preserve the current subsystem coverage,
- stop using large equal-weight cards for every subsystem.

Replace the current card wall with grouped rows or compact tiles:

- `Needs work`
- `Healthy`
- `Quiet`

Each item should show:

- subsystem name,
- status pill,
- one short metric,
- link affordance.

Avoid long explanatory paragraphs in this section. Details belong in the expandable evidence sections or the destination page.

### 5. Expandable Evidence

Purpose:

- keep trust and auditability on the Overview page,
- make detailed evidence available without overwhelming the first read.

Use accordions or collapsible panels for:

- runtime context preview,
- readiness history,
- learning suggestions,
- evidence-based readiness explanation.

Default open state:

- open `Learning suggestions` only if there are blocker or warning suggestions,
- otherwise keep all evidence sections collapsed.

Do not make the evidence disappear. It should be present, but lower priority.

## Company AI Workspace Clarity Rules

These rules apply to the Company AI section, not only the Overview page.

- Prefer client-facing labels over implementation labels.
- Explain every approval workflow in the UI where the decision happens.
- Make the difference between trusted/active content and proposed/review content obvious.
- Use action labels that say what will happen, not just what object will be created.
- Avoid showing two primary actions with unclear differences.
- Do not rely on the user understanding internal words such as `candidate`, `runtime`, `drift`, or `evidence` without nearby context.
- Empty states should explain what the section is for and what the next action is.
- Tables or lists that contain long business content should have full width unless they are only small summaries.

Recommended language changes:

| Current label | Better label | Meaning |
| --- | --- | --- |
| `Add memory` | `Add approved memory` | Create trusted memory immediately. |
| `Add candidate` | `Suggest memory` | Create a proposed memory that must be approved before use. |
| `Review Queue` | `Suggested memories` or `Memory review queue` | Proposed memories waiting for approval or rejection. |
| `Approved Memory` | `Approved memory` | Trusted company memory available to the AI. |

Where space allows, add short helper copy:

```text
Approved memory is trusted context the company AI can use.
Suggested memories are not used until someone approves them.
```

## Company Memory Page UX

The Company Memory page should be redesigned as a clear approval workflow.

The current two-column layout for `Approved Memory` and `Review Queue` is not ideal. These are not equal summary widgets. They are working lists that can contain long business context, categories, confidence, evidence, and actions.

Use full-width stacked sections instead.

Recommended layout:

```text
Company Memory

Stats

Suggested memories
[full-width review queue]

Approved memory
[full-width approved memory list]

Archived / Rejected
[collapsed or lower-priority sections]
```

Ordering rule:

- If there are suggested memories waiting for review, show `Suggested memories` first.
- If there are no suggested memories, show `Approved memory` first.

Reason:

- pending suggestions are the active task,
- approved memory is the trusted runtime context and needs room to inspect,
- rejected and archived memory are lower-priority audit/history views.

Button rules:

- Replace `Add candidate` with `Suggest memory`.
- Replace `Add memory` with `Add approved memory`.
- Keep `Add approved memory` visually primary only when direct trusted authoring is the main action.
- If review items exist, make review/approval actions more prominent than adding more memory.

Empty state examples:

```text
No suggested memories waiting.
Suggestions appear here before they become trusted AI memory.
```

```text
No approved memory yet.
Approved memory is trusted company context the AI can use in future answers.
```

## Content Mapping

| Current content | New location |
| --- | --- |
| Readiness score | Readiness header |
| Readiness state | Readiness header |
| Blocker and drift warning banners | Priority reasons |
| Knowledge card | Health summary |
| Instructions card | Priority reasons if weak, otherwise health summary |
| Model routing card | Health summary |
| Widget card | Health summary |
| Memory card | Priority reasons if empty or pending, otherwise health summary |
| Skills card | Priority reasons if blocked, otherwise health summary |
| Evals card | Priority reasons if missing or failing, otherwise health summary |
| Drift card | Priority reasons if unresolved, otherwise health summary |
| Activity card | Health summary |
| Runtime context preview | Expandable evidence |
| Readiness history | Expandable evidence |
| Snapshot button | Readiness history evidence panel |
| Learning suggestions | Expandable evidence; open by default only when actionable |
| Evidence-based readiness copy | Expandable evidence explanation |

## Diagnostics Tab Decision

Do not add `Diagnostics` in the first redesign.

Reconsider a separate diagnostics tab only if at least one of these becomes true:

- support or engineering needs a deeper troubleshooting view that normal admins should not use,
- runtime context preview grows into raw payload inspection,
- readiness history becomes a long audit log rather than a short trust signal,
- the overview still feels too dense after progressive disclosure,
- permissions need to separate operational admins from technical troubleshooters.

If a diagnostics tab is later added, the Overview should still keep a summary of the evidence and link to diagnostics for deeper inspection.

## Visual Rules

- The first viewport should not contain a 4-column grid.
- Do not use equal-size cards for every subsystem.
- Use one primary button for the next best action.
- Keep secondary actions smaller and quieter.
- Use concise row labels instead of paragraph-heavy cards.
- Keep status language plain: `Needs review`, `Ready`, `Not ready`, `Drifted`.
- Avoid making the user decode raw counts before seeing the recommendation.
- Keep the existing admin visual style: dark surface, restrained borders, 8px radius, compact controls.
- Use full-width working lists when users need to read, compare, approve, reject, or inspect long content.
- Use plain-language button labels that distinguish direct approval from suggestion/review flows.

## Implementation Phases

### Phase 1: Extract Decision Model

Goal:

- create a small derived model that ranks readiness reasons and selects the next best action.

Tasks:

- keep existing Convex queries unchanged,
- derive `priorityReasons` from the current readiness items, readiness summary, drift, evals, memory, prompt, skills, widget, and knowledge data,
- derive one `nextBestAction`,
- add pure helper tests for reason priority and action selection.

Acceptance:

- overview can identify the top 3 reasons without relying on card order,
- the same input data always produces the same recommended action,
- tests cover at least ready, needs-review, not-ready, and drifted states.

### Phase 2: Redesign First Viewport

Goal:

- make the top of the page answer readiness, reason, and next action.

Tasks:

- replace the current header plus alert banners with a readiness summary section,
- show top reasons directly below the readiness state,
- show one primary action and optional secondary action,
- keep copy short and plain.

Acceptance:

- a user can understand the state without reading subsystem cards,
- no dense grid appears in the first viewport on desktop,
- mobile keeps the same information order.

### Phase 3: Replace Card Wall With Health Summary

Goal:

- preserve subsystem visibility while reducing cognitive load.

Tasks:

- replace large readiness cards with grouped compact rows or small tiles,
- group by `Needs work`, `Healthy`, and `Quiet`,
- keep each subsystem linkable,
- limit each row to one short status and one key metric.

Acceptance:

- all current subsystem entry points remain accessible,
- healthy systems are visible but do not compete with urgent work,
- the page no longer reads as a wall of equal-priority cards.

### Phase 4: Move Details Into Expandable Evidence

Goal:

- keep auditability without overwhelming the main page.

Tasks:

- turn runtime context preview into an expandable section,
- turn readiness history into an expandable section,
- move snapshot controls into readiness history,
- turn learning suggestions into an expandable section that opens automatically only when suggestions exist,
- move evidence-based readiness copy into an expandable explanation.

Acceptance:

- no current content is lost,
- details are discoverable from the Overview,
- first-read density is materially lower.

### Phase 5: Company Memory Page Clarity

Goal:

- make the memory workflow obvious to a client admin.

Tasks:

- replace unclear action labels:
  - `Add candidate` -> `Suggest memory`,
  - `Add memory` -> `Add approved memory`.
- stack `Approved memory` and `Memory review queue` as full-width sections.
- put the review queue first when there are suggestions waiting.
- keep approved memory first when there are no suggestions waiting.
- move archived and rejected memory into lower-priority collapsed sections or tabs.
- add short helper text that explains approved memory versus suggested memory.
- verify empty states explain what each section is for.

Acceptance:

- a user can tell which memories are trusted and which are only proposed,
- the page does not force long memory content into cramped two-column panels,
- approval/rejection work has enough horizontal space,
- button labels make the action outcome clear without external explanation.

### Phase 6: AI Workspace Language Pass

Goal:

- make the wider Company AI section understandable for clients without needing operator explanation.

Tasks:

- audit Overview, Knowledge, Memory, Skills, Prompt, AI Rules, AI Models, Evals, and Chat Logs for unclear labels,
- replace implementation words with client-facing labels where possible,
- add short helper copy only where a concept is not obvious from the label,
- verify primary actions are distinct and outcome-oriented,
- make empty states describe what appears there and what to do next.

Acceptance:

- common client questions are answered in the interface,
- primary buttons do not have ambiguous differences,
- technical concepts are either renamed or explained near the action,
- the section feels like a client admin tool rather than an engineering console.

### Phase 7: Visual And Interaction QA

Goal:

- ensure the redesign actually feels calmer and remains useful.

Tasks:

- verify desktop and mobile layouts with screenshots,
- check text wrapping in status pills, buttons, and health rows,
- ensure keyboard focus reaches accordions, links, and buttons in order,
- run the local quality gate before asking to merge or push.

Acceptance:

- `npm run verify:env` passes,
- `npm run lint:all` passes,
- `npm run check` passes,
- `npm run build` passes,
- `git diff --check` passes,
- screenshots show the first viewport answers readiness, reason, and action.

## Non-Goals

- Do not redesign the individual Knowledge, Memory, Skills, Prompt, AI Rules, AI Models, Evals, Widget, or Chat Logs pages as part of this plan.
- Do not change Convex readiness calculations unless the UI cannot derive a reliable priority order from current data.
- Do not create a new diagnostics tab unless the criteria above are met.
- Do not change tenant isolation, permissions, model routing, eval logic, memory approval, or knowledge processing behavior.
- Do not touch the frozen movement demo.

## Open Questions

- Should `No approved memory` be a warning for every company, or only for companies with enough chat evidence to justify memory?
- Should `No active skills` be treated as quiet, advisory, or warning before skills become a required product layer?
- Should the next best action prefer setup order, for example prompt before memory before evals, or operational risk, for example blocker eval before prompt quality?
- Should readiness history default to collapsed even after a snapshot has just been recorded, or open temporarily to confirm the action?
- Should the memory page label the review workflow as `Suggested memories`, `Memory review queue`, or both?
- Should direct trusted creation be allowed for all admins, or should some roles only be able to suggest memory for approval?
