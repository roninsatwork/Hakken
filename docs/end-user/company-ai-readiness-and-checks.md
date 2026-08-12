# Company AI Readiness And Checks

Last reviewed: 2026-07-30 17:39 BST +0100
Status: current; related rebuild and checks plans are still active
Audience: administrators, operators, support, and customer-success teams reviewing a company's AI setup.

## What This Area Is

Company AI is the company-specific AI control area inside a company record. It
answers two practical questions:

- What has this company configured for itself?
- Is anything configured here broken or waiting for review?

It does not replace global AI administration. Global AI controls decide platform
defaults, provider state, global rules, global knowledge, and global widgets.
Company AI shows the tenant-specific layer: company knowledge, company prompt,
company rules, company model choices, company widget, company memory, company
skills, company checks, company usage, and company chat logs.

The current overview is not a percentage score. It shows a table of areas and
uses three states:

- Needs attention: something set for this company is not working or needs review.
- Set for this company: the company has its own working configuration.
- Not configured: the company is using the platform setup, which is normal.

This distinction matters. A company can be healthy without setting every AI
area itself. Not configured is not automatically a warning.

## Where To Find It

Company AI routes live under a company detail page:

- `/admin/companies/[id]/ai`: overview of company AI areas.
- `/admin/companies/[id]/ai/knowledge`: company knowledge.
- `/admin/companies/[id]/ai/prompt`: company instructions.
- `/admin/companies/[id]/ai/rules`: company AI rules.
- `/admin/companies/[id]/ai/models`: company model defaults.
- `/admin/companies/[id]/ai/evals`: company checks.
- `/admin/companies/[id]/ai/memory`: company memory.
- `/admin/companies/[id]/ai/skills`: company skills.
- `/admin/companies/[id]/ai/usage`: company AI usage.
- `/admin/companies/[id]/ai/chat-logs`: company chat logs.
- `/admin/companies/[id]/widget`: company widget setup.

Some older company AI routes also exist outside the `/ai` subgroup, such as
company knowledge, model, prompt, rule, chat-log, and widget routes. They are
part of the same product area.

## Overview Areas

The Company AI overview checks these areas:

- Knowledge: whether company documents exist and whether any failed to process.
- Widget: whether a company widget exists and whether it is active.
- Instructions: whether the company has its own prompt or active rules.
- Model routing: whether company model choices are configured and whether any
  point at a model that cannot run.
- Memory: whether active company memories exist and, when review mode is used,
  whether suggestions are waiting.
- Skills: whether company skills are switched on and whether any switched-on
  skill is missing required tools or approval policy.
- Checks: whether checks exist and whether must-pass checks are failing.
- Drift: whether company AI inputs changed since checks last ran.

If anything needs attention, the overview highlights the items to fix first and
links to the relevant screen. If nothing needs attention, the company reads as
ready even if some areas are not configured.

## Company Checks

Checks are repeatable questions for the company's AI. A check contains a prompt
and a description of what a good answer should do. Running a check asks the
company AI the question and uses another AI pass to mark the answer.

The checks screen can:

- show all active checks
- show whether each check is passing, failing, not run, or not tested
- show whether a check is must-pass
- run one check
- run a batch of checks
- add three starter checks on an empty company
- create a custom check
- delete a check after confirmation

The starter checks are designed around common embarrassing failures: inventing
pricing, guessing from missing documents, and failing to hand over to a person.

Running checks costs provider calls. The UI says how many checks and provider
calls will run before starting a batch. Results appear as each check completes.

## Drift

Drift means a relevant company AI input changed after the latest checks. Examples
include changes to knowledge, memory, skills, evals, rules, models, widgets, or
prompts.

Drift does not always mean the company is broken. It means previous check
evidence may no longer represent the current setup. Run the checks again when
drift appears, especially before launch or after changing company-facing AI
behavior.

## Company Memory

Company memory stores durable notes that the company's AI can use in later
answers. A memory can apply to every answer or only when relevant. The memory
screen supports active memories, removed memories, and proposed suggestions.

Operators can:

- add a memory
- edit a memory
- remove or restore a memory
- approve or reject a suggested memory when Autonomous memory is off
- search current memories
- review proposed suggestions

When the platform-wide Autonomous memory switch is on, safe suggestions can be saved immediately instead of waiting in the review list. They are labelled as saved by the AI, written to the audit trail, and can still be removed. A previously rejected suggestion is remembered so the same proposal is not repeatedly reintroduced.

There is a cap on memories that apply to every answer. Use always-on memories
for facts or boundaries the AI must never miss. Use relevant memories for
context that should appear only when the conversation calls for it.

## Company Skills

Company skills are skills from the Skill Center that this company's own AI can
use. The current company skill screen lets an administrator add skills from the
global Skill Center, search company skills, and remove company skills.

The current implementation allows only a small number of company skills at once.
This keeps company-level context predictable and prevents broad skill packages
from being attached casually to every company message.

Skills should be reviewed carefully before use. A skill can bring instructions,
risk, suggested tools, and behavior expectations. A high-risk or tool-connected
skill should have matching checks and clear approval expectations.

## Model Routing

Company model defaults let a company override selected platform defaults. If a
company has no override for a job, it inherits the platform model for that job.
That is the normal state for many companies.

The overview flags model routing only when a company-specific choice points at a
model that cannot run. In that case, choose a working model or clear the company
override so the platform default applies.

## Practical Review Flow

When preparing a company for launch:

1. Open Company AI.
2. Fix any "Needs attention" rows first.
3. Confirm knowledge is ready if the assistant must answer from documents.
4. Review prompt and rules for customer-specific behavior.
5. Check model routing only where the company needs overrides.
6. Review memory and skills.
7. Add starter checks or custom checks.
8. Run checks.
9. Resolve drift by rerunning checks after changes.
10. Review company usage and chat logs after real testing.

## Important Caveat

Company AI is an active product area. The current implementation is documented
here, but related work remains open in the Company AI readiness rebuild and AI
Checks plans. When those plans land, this guide should be refreshed in the same
documentation pass.

## Related Documentation

- [AI Administration](./ai-administration.md)
- [AI Rules And Prompts](./ai-rules-and-prompts.md)
- [AI Models, Providers, And Costs](./ai-models-providers-and-costs.md)
- [Knowledge Management](./knowledge-management.md)
- [Agents](./agents.md)
- [Company Workspace Administration](./company-workspace-administration.md)
