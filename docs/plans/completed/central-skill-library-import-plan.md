# Central Skill Library Import Plan

Created: 2026-07-02

This plan documents the product direction for turning the existing Hakken agent skills surface into the intended workflow: upload or import `SKILL.md` files into one central skill library, then select those approved skills anywhere the platform asks for agent capabilities.

Implementation started on 2026-07-02 after the user asked to build this out. This document records the completed product and engineering direction for the central skill library, importer, pickers, app-kit adoption, and workflow adoption.

Related docs:

- [Agent Skills Development Plan](./agent-skills-development-plan.md)
- [Agent Skill Authoring Guide](../../developer/agent-skill-authoring-guide.md)
- [Global AI Navigation Consolidation Plan](./global-ai-navigation-consolidation-plan.md)

Index keywords: SKILL.md import, agent skills, central skill library, skill upload, skill picker, agent capability catalog, reusable skills, skill governance, skill validation, skill bindings.

## Goal

Admins should be able to upload a `SKILL.md` file once, review what Hakken extracted from it, publish it into a governed central library, and then reuse that skill from pickers across agents, workflows, app kits, and company AI surfaces.

The target product claim is:

> Hakken has a central, governed skill library. Skills are imported once, validated, versioned, and selected everywhere else from a predefined list.

## Implementation Status

Current estimate: overall 100% complete for the requested central skill library build.

Completed:

- Phase 1 copy/navigation: the global Agent Skills catalog now exposes `Import SKILL.md` as the primary import path while preserving Hakken bundle import as a secondary path.
- Phase 2 Markdown upload and parse: admins can upload a Markdown file and receive a deterministic parsed preview with warnings and suggestions.
- Phase 3 import review and draft creation: parsed imports can be edited and saved as draft global skills.
- Phase 4 validation slice: the import review shows active AI tool handler mappings as selectable controls and a production-readiness panel for tools, approval guidance, eval fixtures, and shared-scope review.
- Phase 5 first adoption slice: agent skill binding, company skill import, company eval required skills, and manual eval run skill evidence now select from skill lists instead of requiring raw skill IDs or JSON.
- Phase 5 shared picker slice: company eval skill selection now uses a reusable company-skill checkbox picker.
- Phase 6 first app-kit slice: app kit templates and launch plans now carry recommended central-library skills, and app kit detail/setup screens link matching active skills back to the Agent Skills library.
- Phase 6 materialization slice: app kit launch plans now attach matching active recommended central skills to created draft agents, pinned to the current skill version while agents remain inactive for review.
- Phase 6 workflow builder slice: workflow agent nodes now select active central skills from the library, save selected skill IDs into node data, show selected skills on the canvas, and bind selected skills to the backing agent through versioned `agentSkillBindings`.
- Phase 6 workflow follow-up slice: deselecting an existing workflow-agent skill now detaches the versioned binding, and workflow agent nodes fall back to live agent skill bindings when older graph JSON has no saved skill names.
- Phase 7 first docs slice: the agent skill authoring guide now documents importable `SKILL.md` conventions.
- Phase 7 parser regression slice: tests now cover frontmatter variants, opening-paragraph descriptions, dependency/connector tool sections, high-risk approval language, examples/eval extraction, duplicate warnings, and active tool mapping checks.

Remaining for this requested scope:

- None. Future enhancements such as folder/zip imports, permanent source Markdown retention, company-specific `SKILL.md` imports, or AI-generated eval suggestions remain product decisions rather than unfinished scope.

## Product Problem

The current screen language can be confusing because the product already has an `Agent skills` area, but the primary import action is oriented around a Hakken JSON bundle or manual skill creation.

The user expectation is different:

```text
I have a SKILL.md file.
I want to upload it into Hakken.
Hakken should understand it, validate it, and make it selectable later.
```

The product should not make users paste raw JSON or recreate a skill by hand when the source material is already a `SKILL.md` file.

## Current Code Position

Hakken already has a substantial skills foundation. Build on it instead of creating a second skill system.

Already present:

- `convex/schema.ts` has `agentSkills`, `agentSkillVersions`, and `agentSkillBindings`.
- `convex/agentSkills.ts` has catalog queries, CRUD, immutable version snapshots, starter seeding, skill binding, rollout upgrades, analytics, and JSON bundle import/export.
- `src/app/(dashboard)/admin/ai/skills/page.tsx` is the global skill catalog.
- `src/app/(dashboard)/admin/ai/skills/[id]/page.tsx` is the skill detail, editor, export, clone, archive, rollout, and learning view.
- `src/app/(dashboard)/admin/agents/[id]/skills/page.tsx` attaches skills to agents.
- `src/app/(dashboard)/admin/companies/[id]/ai/skills/**` provides company AI skill management.
- Runtime paths already compile enabled skill instructions and include skill evidence in runs, readiness, evals, learning suggestions, and memory candidates.

Original gaps for the desired UX, now addressed in this implementation:

- A first-class `SKILL.md` upload action.
- A parser that extracts Hakken skill fields from Markdown.
- An import review screen before saving.
- A validation report that explains what is missing, unsafe, or ambiguous.
- A clear difference between importing external `SKILL.md` files and importing existing Hakken JSON bundles.
- Reusable picker patterns across agent, company AI, eval, workflow, and app-kit surfaces.
- A product label that makes the central library obvious in navigation.

## Product Decision

Use one canonical central library:

```text
Agents -> Agent Skills
```

This page should become the primary repository for reusable skills. It should support:

- Upload `SKILL.md`.
- Import Hakken skill bundle JSON.
- Create skill manually.
- Seed starter skills.
- Search, filter, archive, clone, export, and monitor rollout health.

Anywhere else that needs a skill should not ask for a file upload. It should open a picker from the approved central library.

## Information Architecture

Recommended global placement:

```text
Agents
- Agent Approvals
- Agent Skills
- Ship Checks
- Run Observatory
- Manage Agents
- Manage Workflows
- Schedules
- Workflow Logs
```

Recommended skill library actions:

```text
Import SKILL.md
Import bundle
New skill
Seed starters
```

`Manage Global AI` should remain the place for platform AI controls such as usage, governance, widget, models, tools, and global AI configuration. It should not become the canonical home for skill file uploads unless the IA is deliberately consolidated later.

## Primary User Flow

```text
Admin opens Agent Skills
        |
        v
Clicks Import SKILL.md
        |
        v
Uploads one SKILL.md file, or a folder/zip containing SKILL.md plus references
        |
        v
Hakken parses the file and shows an import review
        |
        v
Admin fixes missing fields, confirms risk level, and checks required tools/evals
        |
        v
Skill is saved as DRAFT with a version snapshot
        |
        v
Admin publishes it as ACTIVE after validation
        |
        v
Agents, workflows, app kits, and company AI surfaces select it from the library
```

## Import Review UX

The review screen should show extracted fields before saving:

| Section | Purpose |
| --- | --- |
| Identity | Name, description, category, source filename, source format. |
| Instructions | Parsed operating guidance from the `SKILL.md` body. |
| Trigger Guidance | When this skill should be selected or suggested. |
| Tools | Required and recommended tool mappings inferred or manually selected. |
| Knowledge | Recommended knowledge references or source expectations. |
| Safety | Risk level, approval needs, tenant-boundary concerns, side-effect warnings. |
| Evals | Suggested starter fixtures extracted or generated from examples. |
| Validation | Blocking errors, warnings, and suggested improvements. |

The import should save as `DRAFT` by default. Publishing to `ACTIVE` should require the same validations as manually created skills.

## Parser Requirements

The parser should accept common `SKILL.md` structures without needing one rigid format.

Extract when available:

- Skill name from the first `#` heading or frontmatter `name`.
- Description from frontmatter, an opening paragraph, or a `Description` section.
- When-to-use guidance from sections like `When to use`, `Use this skill when`, or trigger rules.
- Instructions from body sections such as `Instructions`, `Workflow`, `Process`, or the remaining durable guidance.
- Tool requirements from sections like `Tools`, `Required tools`, `MCP`, `Connectors`, or `Dependencies`.
- Safety constraints from sections like `Safety`, `Constraints`, `Do not`, `Approval`, or `Permissions`.
- Examples from `Examples`, `Eval`, `Tests`, or similar sections.

The parser should produce:

```ts
type ParsedSkillMarkdown = {
  sourceFormat: "SKILL_MD";
  sourceFilename: string;
  name: string;
  description?: string;
  category: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  instruction: string;
  triggerGuidance?: string;
  requiredToolMappings: string[];
  recommendedToolMappings: string[];
  recommendedKnowledgeJson?: string;
  defaultRulesJson?: string;
  suggestedEvalFixtures: Array<{
    type: string;
    objective: string;
    expectedFinalOutputRubric: string;
    expectedToolMappings?: string[];
    tags?: string[];
  }>;
  validation: {
    errors: string[];
    warnings: string[];
    suggestions: string[];
  };
};
```

Implementation can store parsed values in the existing `agentSkills` fields first. Add explicit source metadata only if it proves useful in the UI or audit log.

## Validation Rules

Blocking errors:

- Missing skill name.
- Empty durable instruction.
- Instruction exceeds existing skill text limits.
- Parsed JSON fields are invalid.
- Unsupported file type.
- Attempted import contains executable files when only Markdown import is expected.

Warnings:

- Missing description.
- No suggested eval fixtures.
- High-risk language without explicit approval guidance.
- Tool references that do not match active `aiTools.handlerMapping` values.
- Tenant-specific facts embedded in reusable instructions.
- Conflicting or duplicate skill name.

Suggestions:

- Add at least two starter eval fixtures.
- Map named external tools to existing Hakken tool mappings.
- Move tenant facts into knowledge documents instead of the shared skill.
- Add approval handoff language for side-effecting actions.

## Central Picker Requirements

Everywhere the app selects skills should use one shared picker pattern backed by the central library.

Picker behavior:

- Search by name and description.
- Filter by category, status, risk level, and missing tool requirements.
- Show only `ACTIVE` skills by default.
- Allow super-admins to include `DRAFT` skills in testing contexts.
- Show version, risk, required tools, smoke status, and whether the target agent/workflow already has the skill.
- Provide a preview drawer with instructions, tool requirements, eval fixtures, and recent rollout health.
- Never grant permissions just because a skill is selected.

Initial picker adoption targets:

- Agent skill binding.
- Company AI skill binding.
- Workflow builder skill selection.
- App kit setup where skills are part of a starter package.
- Eval case requirements where required skills are currently typed as IDs or JSON.

## Data Model Direction

Prefer extending the existing tables conservatively.

Possible additions to `agentSkills`:

- `sourceFormat`: optional `"MANUAL" | "SONAE_BUNDLE" | "SKILL_MD"`.
- `sourceFilename`: optional string.
- `sourceHash`: optional string for duplicate detection.
- `sourceMarkdown`: optional original imported Markdown, only if product wants a source preview.
- `importWarningsJson`: optional validation warnings at import time.

Possible addition to `agentSkillVersions.snapshotJson`:

- `sourceFormat`.
- `sourceHash`.
- `importWarnings`.

Do not add a separate `skillFiles` table unless there is a clear need for multi-file source bundles, per-file audit history, or retained attachments.

## Implementation Plan

### Phase 1: Product Copy And Navigation

Build:

- Rename the primary catalog action from `Import bundle` emphasis to `Import SKILL.md`.
- Keep `Import bundle` as a secondary advanced action.
- Add explanatory empty-state and header copy that says this is the central reusable skill library.
- Ensure the sidebar label `Agent Skills` clearly routes to the canonical repository.

Acceptance:

- A user looking for a place to upload `SKILL.md` can find it without knowing about bundle JSON.
- JSON bundle import remains available for internal migrations and exports.
- No other screen appears to be the competing canonical skill repository.

### Phase 2: Markdown Upload And Parse

Build:

- Add client-side file selection for `.md` files.
- Add a Convex mutation or action that accepts Markdown text and returns a parsed draft preview.
- Implement a deterministic parser for frontmatter, headings, body sections, tool hints, safety hints, and examples.
- Reject unsupported files and overly large content before mutation.

Acceptance:

- Admin can upload a `SKILL.md` and see parsed fields.
- A simple skill with heading, description, and instructions imports without manual copy/paste.
- Parsing errors are shown in-app, not native browser dialogs.

### Phase 3: Import Review And Draft Creation

Build:

- Add an import review modal or full page.
- Let admins edit parsed fields before saving.
- Save imported skills as `DRAFT`.
- Store source metadata and validation warnings if the schema is extended.
- Reuse existing skill version snapshot logic.

Acceptance:

- Imported skills are not published automatically.
- Admin can correct category, risk, tools, instructions, and evals before saving.
- The saved skill opens in the existing skill detail page.

### Phase 4: Validation And Tool Mapping

Build:

- Compare parsed tool names to active `aiTools.handlerMapping` values.
- Show missing tool mappings as warnings.
- Offer a mapping control for unresolved tools.
- Flag high-risk or side-effecting language when approval guidance is missing.
- Flag likely tenant-specific facts in reusable instructions.

Acceptance:

- Import review separates blocking errors from warnings.
- A skill with unresolved tools can be saved as draft, but cannot be treated as production-ready until resolved.
- High-risk imported skills make approval expectations visible before activation.

### Phase 5: Shared Skill Picker

Build:

- Extract a reusable skill picker component.
- Use it for agent binding first.
- Replace typed skill ID or JSON fields in nearby admin surfaces where feasible.
- Add preview and readiness indicators.

Acceptance:

- Users select from approved library entries instead of pasting skill IDs.
- Skill selection is consistent across agent and company AI flows.
- Archived skills cannot be newly selected.

### Phase 6: Workflow And App Kit Adoption

Build:

- Add skill selection to workflow templates or workflow nodes only where a skill actually changes runtime behavior.
- Add app kit starter package support for included skills.
- Keep selected skills versioned or snapshotted when package behavior needs reproducibility.

Acceptance:

- Workflow/app kit authors select skills from the central library.
- Runtime behavior remains auditable by skill and version.
- Selecting a skill still does not bypass connector permissions or backend authorization.

### Phase 7: Regression Coverage And Docs

Build:

- Add parser unit tests for common `SKILL.md` variants.
- Add UI tests for upload, validation, review, and draft creation.
- Add picker tests for active/draft/archived visibility.
- Update the agent skill authoring guide with the importable Markdown conventions.

Acceptance:

- Common imports are covered by tests.
- English and Italian locale dictionaries stay in parity for new UI text.
- `npm run lint:all`, `npm run check`, `npm run build`, and `git diff --check` pass before merge/push.

## Open Product Decisions

- Should imported source Markdown be retained permanently, or should Hakken only store the parsed skill fields?
- Should the importer support a folder/zip with `SKILL.md` plus references, or start with single-file Markdown only?
- Should company-specific skills be able to import `SKILL.md`, or should import start as super-admin global library only?
- Should AI help generate starter eval fixtures from examples, or should Phase 1 stay deterministic?
- Should duplicate skill names create a warning, a draft clone, or an update flow?

## Non-Drift Rules

- Do not create a second skill catalog separate from `agentSkills`.
- Do not treat uploaded Markdown as trusted tenant knowledge.
- Do not store tenant-specific facts in shared skill instructions.
- Do not grant tool permissions by selecting a skill.
- Keep existing immutable skill version snapshots.
- Preserve tenant isolation for company skill reads, bindings, evals, and runtime use.
- Keep admin tables and feeds at the shared 15-row pagination convention unless a specific product requirement says otherwise.
- Keep English and Italian locale dictionaries in parity for all new user-facing UI.
- Do not touch the frozen movement demo.

## Rollout Strategy

Recommended rollout:

1. Ship copy/navigation changes and keep existing manual and bundle paths working.
2. Add single-file `SKILL.md` import behind the existing super-admin skill catalog.
3. Save imports as draft only.
4. Add validation and tool mapping before allowing confident activation.
5. Extract and adopt the shared picker in agent binding.
6. Extend picker adoption to workflows, app kits, and eval requirements.
7. Consider folder/zip imports only after the single-file path is proven.

## Success Criteria

This work is successful when:

- A super-admin can upload a normal `SKILL.md` file without hand-converting it to JSON.
- Hakken parses the file into the existing governed skill model.
- The admin can review and save the imported skill as a draft.
- Published skills appear in a central library.
- Other surfaces select skills from that library instead of requiring file uploads, raw JSON, or pasted IDs.
- Runtime, readiness, eval, audit, and learning evidence continue to attribute behavior to skill versions.
