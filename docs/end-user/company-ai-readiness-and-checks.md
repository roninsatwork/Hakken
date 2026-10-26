---
product: Hakken
documentation_type: End-user guide
feature_area: Company AI readiness and checks
audience: end-user
source_repository: roninsatwork/Hakken
source_path: docs/end-user/company-ai-readiness-and-checks.md
last_reviewed: '2026-10-26T14:37:23+00:00'
reviewed_against: current implementation
status: Current
---
# Company AI Readiness And Checks

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Company AI readiness and checks
> **Reviewed:** 26 October 2026, 14:37:23 GMT (Europe/London)
> **Source path:** `docs/end-user/company-ai-readiness-and-checks.md` · **Status:** Current


## What This Area Is

Company AI is the company-specific AI control area inside a company record. It
answers two practical questions:

- What has this company configured for itself?
- Is anything configured here broken or waiting for review?

It does not replace global AI administration. Global AI controls decide platform
defaults, provider state, global rules, global knowledge, and global widgets.
Company AI shows the tenant-specific layer: company knowledge sources, company
Wiki pages, company prompt, company rules, company model choices, company
widget, company memory, company skills, company checks, company usage, money
view, saved answers, unanswered questions, diary, and company chat logs.

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
- `/admin/companies/[id]/ai/pages`: company Wiki pages, import, reviews, and open questions.
- `/admin/companies/[id]/ai/pages/map`: company Wiki map.
- `/admin/companies/[id]/ai/diary`: company Wiki learning diary.
- `/admin/companies/[id]/ai/unanswered`: questions this company's Wiki could not answer yet.
- `/admin/companies/[id]/ai/saved-answers`: legacy address that redirects to company Wiki pages, where saved answers now live with receipts.
- `/admin/companies/[id]/ai/prompt`: company instructions.
- `/admin/companies/[id]/ai/rules`: company AI rules.
- `/admin/companies/[id]/ai/models`: company model defaults.
- `/admin/companies/[id]/ai/evals`: company checks.
- `/admin/companies/[id]/ai/memory`: company memory.
- `/admin/companies/[id]/ai/skills`: company skills.
- `/admin/companies/[id]/ai/usage`: company AI usage.
- `/admin/companies/[id]/ai/money`: company money/cost view.
- `/admin/companies/[id]/ai/chat-logs`: company chat logs.
- `/admin/companies/[id]/widget`: company widget setup.

Older company knowledge and chat-log aliases still exist outside the `/ai`
subgroup. Company models, prompts, rules, users, and invites have moved to the
current routed sections listed above.

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
7. Check Wiki unanswered questions and the diary when users say the assistant missed known context.
8. Add starter checks or custom checks.
9. Run checks.
10. Resolve drift by rerunning checks after changes.
11. Review company usage, money view, calls, Outbox delivery, and chat logs after real testing.

## Verification Scope

This guide describes reviewed local implementation. Dated plans and research remain historical/planned context; no product or roadmap completion is changed by this review.

## Related Documentation

- [AI Administration](./ai-administration.md)
- [AI Rules And Prompts](./ai-rules-and-prompts.md)
- [AI Models, Providers, And Costs](./ai-models-providers-and-costs.md)
- [Knowledge Management](./knowledge-management.md)
- [Agents](./agents.md)
- [Company Workspace Administration](./company-workspace-administration.md)

## Readiness Is A Configuration Review

The overview's Ready headline means none of its inspected areas currently requires attention. It does not certify answer quality, live provider access, complete knowledge, or accepted external integrations. The state is derived from the same eight area rows it displays, without an invented percentage. Wiki pages, diary, demand, and money are related navigation destinations rather than extra independently counted readiness rows.

Not configured is informational because a company can inherit platform behavior. Needs attention is reserved for a detected issue in its local setup, such as failed documents, broken overrides, unsafe bound-skill configuration, failing must-pass checks, or unresolved drift. Never-run checks remain visibly never run; they are not silently included in passing results. A widget labeled live reflects its saved active state, not a fresh browser or DNS acceptance test.

The overview reads bounded populations. It inspects up to 500 knowledge documents, 200 rules, 1,000 memories/skills/checks in relevant groups, and 100 unresolved drift events. Some counts show a plus sign at their limit. The most recently created widget is used for its widget summary; the row is not an exhaustive report of every historical widget configuration. Large-company totals and absent warnings should be interpreted with those bounds.

## What A Company Check Exercises

A check creates an evaluation conversation and asks the company assistant through the actual answer path. It then grades the reply and applies required source, memory, skill, and forbidden-claim expectations from recorded evidence. The target-surface label organizes the check; it does not mean the system opened a real public widget, made a phone call, or exercised every workflow destination. Evaluation conversations also omit the running administrator's personal note, keeping the result from varying with that private context.

One to five repeated samples can be requested. Each usually involves an answer and a grading call, and grading may fall back to the same model when no independent text model is available. Batches take at most 100 selected active cases; the preview is a bounded estimate and extra tool/retrieval work can add to the nominal answer-plus-grade calls. Results are local saved evidence, not free or universal integration acceptance.

A missing answer is an answer failure. An exception that prevents testing is recorded as not tested rather than proving the assistant gave a bad answer. Review that distinction before changing content in response to an unreachable provider. Nothing in this documentation task ran a check or purchased model work.

## Drift, Skills, And Memory Follow-Through

Drift records say a tracked input changed. They can be resolved explicitly, so a resolved drift list alone is not proof a new check passed. Rerun appropriate checks as a deliberate operation when updated behavior needs evidence. Large resolution operations are bounded and can leave additional history to inspect.

Company skills link to the central Skill Center. Runtime reads the active central instruction through that link; editing or archiving the central skill can affect every linked company. The current limit is two company skills. An old copied-looking description is not a frozen independent skill version. Company memories have a separate five-item always-applied cap, with other memories selected when relevant. Autonomous memory is a platform policy, not individual per-company approval for every learned note.

The mailbox mentioned in older operating checklists is retired; use the current email/outbox and conversation guides for actual communication paths. Preserve dated plans as historical context without using their status as current implementation or live proof. Review [AI rules](./ai-rules-and-prompts.md), [models and Decisions](./ai-models-providers-and-costs.md), and [Company Wiki](./company-wiki.md) for the specific permissions and known limitations of those controls.
