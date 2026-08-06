# Governance And Trust Plan

Written 2026-08-05, after reading the platform against the EU AI Act and against
what an enterprise security review actually asks for.

## Status: delivered 2026-08-06

All eight phases are built and on `dev`. The estimates below are left as they
were written rather than corrected after the fact — a plan whose figures are
edited to match what happened teaches nobody anything next time.

This stays in `active/` rather than moving to `completed/`, on purpose. Two
things here outlive the build and are the reason to keep it in front of people:

- **The framework test** at the top — what Sonae carries versus what belongs to
  the products built on it. It is the rule for deciding anything proposed next,
  not a note about work that is finished.
- **The decisions in the closing section** — no single sign-on, no two-factor,
  no AI literacy, and why each. Filed under "completed" they become
  archaeology, and the way a recorded decision gets quietly reversed is that
  nobody can find it.

What was built, and what it turned out to be worth, is in the commits. What was
deliberately *not* built is here.

Two things stated plainly, because a plan that only records successes is worth
less than one that does not:

- **Continuous conformance is a first version.** It answers whether an
  assistant's behaviour matches its classification, which is the drift that
  makes the rest of these screens untrue. It does not judge whether output was
  good, on-topic or faithful to instructions — that needs a model to decide, and
  a model's opinion is not evidence.
- **The one-time-code throttle sits on the request path, not inside the send.**
  It stops the sign-in form being used to post mail at someone. It is not a
  defence against a caller driving the auth endpoint directly.

## What this is

This is the plan for the layer that lets Sonae be sold to organisations who take
AI governance and data security seriously — and, because Sonae is the starter
framework every later product is built from, the layer every future product
inherits rather than rebuilds.

It covers two things that turned out to be one thing:

1. **Governance** — an AI register, risk classification, human oversight
   evidence, and an export an auditor will accept.
2. **Trust and data security** — the access control and personal data rights a
   serious buyer checks before they will discuss anything else, plus a
   one-time-code sign-in option alongside the existing magic link.

They are one thing because the governance product does not work without the
access control. The compliance officer this is built for needs to *see* the
register, the approvals and the audit trail without being able to *change* the
platform they are overseeing. Today the only role that can see any of it is a
full administrator. That conflict is the exact thing the regulation exists to
prevent, so roles come first and everything else sits on them.

## The framework test

Agreed 2026-08-05. Apply this to anything proposed for this plan, and to
anything else that comes out of the same source material.

**Sonae carries what every product needs and none should rebuild. Anything that
depends on knowing a client's staff, their processes, or their business belongs
one layer up.**

The chain is: Sonae is the layer, a product is built on it, a client runs that
product, and their people use it. A rule that needs to reach past the second
link is not a framework feature, however good the justification sounds.

Passes the test — every product would otherwise build its own, badly:

- the register, and what counts as an AI system;
- risk classification and the restraints that follow from it;
- approvals and the audit trail;
- the evidence pack;
- roles, sign-in, and personal data rights.

Fails the test:

- staff training and AI literacy — removed from this plan on the day it was
  written, and the worked reasoning is in the closing section;
- anything requiring knowledge of a client's org chart, HR system, internal
  policies, or commercial arrangements.

The value of writing this down is that the material this plan came from is a
sales pitch for a finished enterprise product. Much of it is right for Sonae.
Some of it is right for the products built on Sonae, and belongs to them.
Telling the two apart is the judgement this test exists to make.

## What already exists

This matters more than usual here, because most of the governance layer is
presentation over data the platform already records. Nothing below needs
building again.

**Recording is already thorough.** There are around 130 separate places in the
backend that write to the audit trail. Every agent run stores its steps, its
tool calls, its inputs and outputs, plus reflections on what it did.

**Human oversight is already real.** Agents are gated by default — nothing
writes without a human unless someone deliberately switches that off per agent.
Approvals carry a reviewer, a decision reason, a timestamp, and expire rather
than sitting unanswered forever. The queue has a live count in the navigation.

**Policy enforcement exists** as rules at platform, company and agent level,
with priorities.

**Models and providers are catalogued**, with per-company routing, defaults and
cost tracking against each.

**Personal data is stripped before logging** — from chat content and from tool
call arguments — with configurable rules held as a system setting.

**Memory is separated** between agent memory and company memory, each with its
own review queue and approval before anything is learned.

**Skills already carry a risk rating** of low, medium or high, and a high-risk
skill switched on without an approval policy is flagged. This is the seed of
the classification model in Phase 2, and the pattern to copy.

**Secrets are held as references, not values.** Connectors store pointers into a
vault, and active guards reject anything shaped like a real token pasted into
the field. Leaking a database row leaks nothing usable.

**Retention is configurable** — purge schedules exist for agent logs, workflow
logs, logins, chat history and audit records.

**Prompt injection has real defences** — attempts to extract hidden
instructions, bypass permissions, or reach across tenants are detected and
refused.

## What is missing

Verified against the codebase, not assumed:

- No inventory of AI systems anywhere. No register.
- No risk classification on agents. Only skills carry one.
- Purpose and owner are not recorded. An agent's description is optional and
  there is no owner field at all.
- No export. Everything is recorded, none of it can leave the screen.
- The audit trail is not in the navigation. It exists as a table inside
  Settings, which makes the most compliance-relevant screen in the platform the
  hardest one to find.
- Only three roles exist: user, admin, super admin.
- Nothing for deleting a person's data or answering what is held about them.
- Outbound webhooks are not signed, so a receiver cannot verify the sender.
- Retention defaults to 90 days with purging switched off, and nothing warns
  when a setting falls below the six months such records are expected to be
  kept.

## What counts as an AI system

Settled before Phase 1 starts, because getting this wrong makes the register
wrong rather than merely short.

An assistant is the obvious entry, but it is not the only one. Everything below
goes on the register in its own right, with its own purpose, owner and risk
rating:

- **Assistants.** The obvious case.
- **Website chat widgets.** The most important addition. A widget is embedded on
  a customer's own public site and talks to the public, which makes it the
  entry a regulator asks about first. Listing the assistant behind a widget and
  not the widget itself describes the engine and omits the car — a widget has
  its own audience, its own allowed domains, and its own exposure.
- **The in-platform assistant.** Staff-facing rather than public, but still an
  AI system in use.
- **Workflows that call AI** as part of a sequence.
- **Swarms**, where several agents work together on one conversation.

**The register fills itself.** Nothing here is filed by hand. Creating a new
assistant, publishing a new widget, or adding an AI step to a workflow puts the
thing on the register immediately, incomplete until its purpose and owner are
supplied. A register that has to be maintained manually is a register that goes
stale, and "it builds itself as you work" is the entire proposition — a build
that requires anyone to add entries by hand has failed this plan even if every
screen works.

## Naming conflict to resolve first

The word "governance" is already used twice in the platform and neither use is
this one:

- `/admin/ai/governance/rules` and `/admin/ai/governance/system-prompt` — AI
  configuration, not governance in the regulatory sense.
- Each agent has an internal tab keyed `governance` that displays as
  "Instructions".

A third meaning will confuse everyone. Phase 1 must rename these rather than
build alongside them. The AI paths become AI configuration paths; the agent tab
keeps its visible label and loses the internal name.

## Two surfaces, one set of data

Everything here exists twice, and this is a decision to take now rather than
retrofit:

- **Platform-wide, in admin.** Every client, for the platform operator.
- **Workspace-scoped, in the customer's own area.** Their AI only, for their own
  compliance officer.

The second is the sellable one. The pitch is that customers demonstrate *their*
compliance, and their compliance officer is not and never will be a platform
administrator. The platform already scopes almost everything by company, so this
is reach rather than duplication — but the screens must be written for both
audiences from the start.

## Framework scoping

The navigation already supports switching sections on and off per product; that
is how white-labelling works, and every nav item carries a stable key for it.

Every screen in this plan must be registered in that system from the day it is
built, so a future product inherits the governance layer automatically and can
switch it off if it genuinely does not need it. Nothing here may be wired
directly to the demos or to any one vertical.

---

# How long this takes

Estimates are **working days of focused build**, not calendar time, and they
assume the standard this repository already holds itself to: unit tests
alongside every change, end-to-end coverage where a screen is involved, and the
existing coverage thresholds met rather than lowered.

| Phase | What it is | Days |
| --- | --- | --- |
| 0 | Roles that fit the job | 4–5 |
| 1 | Governance section and AI register | 9–11 |
| 2 | Risk classification that binds | 2–3 |
| 3 | Evidence pack | 6–8 |
| 4 | One-time code sign-in | 2–3 |
| 5 | Personal data rights | 4–6 |
| 6 | Governance dashboard | 3–4 |
| 7 | Remaining trust work | 6–8 |
| | **Total** | **36–50** |

Roughly **seven to ten weeks** at five focused days a week.

**The number that matters is 21 to 27 days.** That is Phases 0 to 3, and it is
the point at which the story in the plan becomes demonstrable: a register a
customer can open, risk ratings that actually restrain what agents do, and an
export an auditor can be handed. Everything after that improves the product
rather than proving it.

Two warnings about the estimates:

- **Phase 0 is bigger than it reads.** Adding two roles means every existing
  permission check across the platform is reviewed, and there are a great many
  of them. The build is small; the sweep is not.
- **Phase 5 is bigger than it reads.** Deleting everything held about one person
  means finding every table that holds anything about them — messages, threads,
  run history, logs, imported records — and being able to prove afterwards that
  nothing was missed.

Phases 2 and 4 are the only ones I would call genuinely small.

---

# Phases

The order is deliberate. Each phase is useful on its own and unblocks the next.
Phases 1 to 3 are cheap because they present data that already exists, and they
are what makes the governance story demonstrable rather than aspirational, so
they come before anything that changes how the platform itself works.

## Phase 0 — Roles that fit the job

**Estimate.** 4–5 days. The two new roles are quick; reviewing every existing
permission check so none of them loosen is what takes the time.

**Agreed 2026-08-05.** Keeping the existing three roles was considered and
rejected, because it would mean making a compliance officer a full administrator
just to let them read the register.

**Why first.** Nothing in the governance layer is honest until someone can be
given sight of it without being given control of it.

**Build.**

- Two new roles alongside the existing three: **read-only** and **auditor**.
- Read-only sees what an admin sees and can change nothing.
- Auditor sees the governance surfaces — register, approvals, audit trail,
  policies in force, evidence pack — and nothing else.
- Role assignment is itself an audited action.
- Every existing screen keeps working unchanged for the three roles that already
  exist. No current permission may loosen.

**Done when.** An auditor account can open every governance screen, export
evidence, and cannot alter a single setting, agent, rule or user.

## Phase 1 — The Governance section and the AI Register

**Estimate.** 9–11 days, the largest phase. Roughly two of those go on the
renaming and the navigation move, four on the register across both surfaces and
across every kind of AI system listed above, and the rest on making purpose and
owner compulsory without breaking anything that already exists.

**Build.**

Resolve the naming conflict described above, then add a top-level **Governance**
section to the navigation — not a child of AI. The audience is a compliance
officer, not an AI administrator, and buried under AI they will never find it.

The section contains, in this order:

- **Overview** — placeholder until Phase 6.
- **AI Register** — new, described below.
- **Approvals** — moved here from under Agents, keeping its live count badge.
- **Audit Trail** — promoted out of Settings into the navigation.
- **Policies** — a read-only view of every rule currently in force.

Approvals and the audit trail move rather than being copied. Two places showing
the same queue is worse than one place in the wrong section.

Policies are read-only here on purpose. The compliance officer needs to see what
is in force; the AI administrator needs to change it. Same data, two audiences,
and merging the two makes both worse.

**The register itself** lists every AI system in scope — as defined in "What
counts as an AI system" above, which means widgets, the in-platform assistant,
AI-calling workflows and swarms, not assistants alone — with:

- name and documented purpose;
- named owner;
- risk rating (populated in Phase 2);
- model and provider it runs on;
- what it can reach — tools, connectors, knowledge;
- whether a human approves its actions;
- when it last ran, and how often.

All of this is already recorded except purpose and owner.

**Purpose and owner become compulsory.** Both are required to create an agent,
and every agent that already exists shows as incomplete in the register until
someone fills them in. This is a small change with a large consequence: it is
the difference between the register being a record and being a list of names.

**Done when.** Both surfaces — platform-wide and workspace-scoped — show a
complete register, no agent can be created without a purpose and an owner, and
approvals and the audit trail are reachable from the Governance menu and nowhere
else.

## Phase 2 — Risk classification that binds

**Estimate.** 2–3 days. Skills already do this, so the pattern is copied rather
than invented.

**Why it matters.** This is the step that turns governance from documentation
into behaviour, and it is the part hardest for a competitor to copy.

**Build.**

- A risk rating on every agent, following the pattern skills already use.
- The rating drives what the platform permits rather than describing it. A
  high-risk agent requires human approval as a consequence of its
  classification, not as a per-agent preference an administrator can quietly
  switch off.
- Changing a rating is an audited action with a reason.
- The register filters and sorts by rating.

**Done when.** Setting an agent to high risk enforces its approval gate, and
attempting to switch that agent to autonomous execution is refused with a
message that names the reason.

## Phase 3 — The evidence pack

**Estimate.** 6–8 days. The records are all there; the time goes on turning them
into plain readable English and on proving the workspace version leaks nothing
from another customer.

**Why it matters.** This converts everything above from a screen into a
deliverable. Today the platform records everything and none of it can leave —
which means the claim that it generates a customer's evidence automatically
currently fails at the last step.

**Build.**

A dated export for any chosen period, covering:

- every AI system, its purpose, owner and risk rating;
- every approval, who gave it, when, and their stated reason;
- every policy in force during the period;
- every model and provider used;
- every occasion something was blocked or refused;
- retention settings in force.

All of it is recorded already. The work is assembly and presentation.

**Plus a readable account of what the AI actually did.** This is the part that
does not exist today and it is the reason the estimate is what it is.

The platform records every step a run took, every tool it called and everything
it read. That record is complete, and it is written for someone who administers
AI. There is no version a compliance officer, an executive or an auditor can
read.

The pack must turn a run into plain sentences: what it was asked to do, what it
looked at, what it decided, what a human approved, and what it changed. No
identifiers, no tool names, no raw arguments. The claim in the sales pitch is
that every decision can be explained — a complete record nobody can read does
not meet it.

This is customer-facing writing, not a data dump. If a reader has to ask what a
line means, it has failed.

**Done when.** An auditor role can produce the pack for a chosen period on both
surfaces, the workspace-scoped version contains that customer's data and no one
else's, and someone with no technical background can read an entry and say what
the AI did without asking a question.

## Phase 4 — One-time code sign-in

**Estimate.** 2–3 days, including the expiry, attempt limits and throttling.
Sign-in is the one screen where a half-built feature locks people out, so the
end-to-end tests are not optional here.

**Scope note.** Sign-in stays as it is. This adds a second email option beside
the existing magic link, it does not replace it and it does not touch the Google
option. Single sign-on is deliberately out of scope — see the closing section.

**Why it is worth doing.** A magic link has to be opened in the same browser
that asked for it, which is the common failure: the request comes from a desktop
and the email opens on a phone. A six-digit code is typed wherever the person
already is. It also survives corporate mail scanners that follow links and burn
them before the recipient clicks.

**Build.**

- A one-time code option beside the magic link on the sign-in screen. The person
  chooses; neither is forced.
- The code is emailed through the shared email shell, so it matches every other
  message the platform sends rather than arriving as a stock template.
- Short expiry, single use, and a limit on attempts before the code is
  invalidated and a fresh one must be requested.
- Requests are rate limited per address, so the sign-in form cannot be used to
  post mail to someone repeatedly.
- Both the request and the successful sign-in are recorded in the audit trail,
  the same as any other sign-in.

**Done when.** Someone can sign in by typing a code on a device that never
received the email, expired and reused codes are refused with a plain message,
and repeated requests for one address are throttled.

## Phase 5 — Personal data rights

**Estimate.** 4–6 days. Almost all of it is finding every place a person's data
is held and being able to show afterwards that nothing was missed.

**Build.**

- Delete everything held about a named person, on request, with a record that it
  happened and what was covered.
- Produce everything held about a named person, as an export.
- Both actions restricted to appropriate roles and both audited.

**Done when.** Both requests can be answered from the interface without anyone
touching the database.

## Phase 6 — The governance dashboard

**Estimate.** 3–4 days, because by this point it is reading the register rather
than gathering anything new.

**Why last of the governance work.** This is the part that demos well, which is
exactly why it is tempting to build first. A dashboard over an empty register is
a screenshot, not a product.

**Build.**

The standing view, reading the register:

- how many AI systems, and how they are classified;
- where documentation is missing;
- what is waiting on human review, and for how long;
- where an agent has drifted outside what it was approved to do;
- retention status.

**Done when.** The overview replaces its Phase 1 placeholder on both surfaces
and every figure on it can be clicked through to the records behind it.

## Phase 7 — Remaining trust work

Each of these is real, none blocks the others, and they can be taken in any
order once Phases 0 to 6 are done.

**Estimate.** 6–8 days for all three, broken down below. Nothing here needs to
be done in one run, and the first two are small enough to slot between larger
work.

- **Outbound webhook signing**, so a receiver can verify data came from Sonae.
  *1 day.*
- **Retention warnings** when a purge setting falls below the six months such
  records are expected to be kept. The current default is 90 days with purging
  switched off, so today's compliance is accidental. *1 day.*
- **Continuous conformance** — a standing check that each agent is still doing
  what it was approved to do. The raw material exists in run reflections and in
  the existing company drift detection, but this one needs real design rather
  than assembly, and it should not be attempted before Phase 6 lands. *4–6 days,
  and the least certain figure in this plan — the design work comes first and
  may change the number.*

---

## Rules that apply to every phase

- **Nothing loosens.** No phase may widen an existing permission or reduce an
  existing check as a side effect.
- **Every governance action is itself audited** — including changing a risk
  rating, exporting evidence, assigning a role, or deleting personal data.
- **Both surfaces, or neither.** A governance screen built only for platform
  admin is half-built; the workspace-scoped version is the sellable one.
- **Registered for white-labelling from day one**, so future products inherit
  the layer and can switch it off.
- **Written for a reader who is not technical.** These screens are opened by
  compliance officers and executives. No identifiers, no jargon, no file paths —
  a plain sentence saying what is true and what to do about it.

## How every screen in this plan must be built

Nothing in this plan justifies a new visual language. These are ordinary Sonae
screens that happen to be about governance, and a governance section that looks
imported from somewhere else undermines the very thing it is selling.

**Use what exists. Do not invent a parallel set.**

- Build with the shared admin components rather than page-specific ones — the
  table shell, search bar, header rows, loading and empty rows, row actions,
  pagination footer, page header, detail layout, tabs, modals, confirmation
  modals, and save controls. They are catalogued in
  [Shared Admin UI](../../developer/shared-admin-ui.md); read it before writing a
  screen, not after.
- Global styling rules are in [Frontend](../../developer/frontend.md). Follow
  them.
- A new pattern is only justified when nothing existing fits, and then it is
  added to the shared set rather than kept private to one screen. A future
  product inherits this layer, so a one-off pattern here becomes everyone's
  problem later.
- Dense records use real table semantics, not stacked boxes. Destructive actions
  go through a confirmation modal. Row actions carry labels for screen readers.
- Both languages. Every string is translated in `messages/en.json` and
  `messages/it.json` at the time the screen is written, never afterwards.

**Wording is customer-facing on every screen here, not only in the export.**

- Say what is true and what to do about it, in one plain sentence.
- No internal names, no identifiers, no field names, no jargon, no abbreviations
  a reader would have to look up. "Nobody is accountable for this assistant"
  rather than "owner: null".
- An empty state explains what would appear here and how to make it appear.
- A warning names the consequence, not the rule that fired.
- Anything a reader has to ask about has failed, and the fix is the wording
  rather than a tooltip.

**Colour.** No status may be carried by red-versus-green alone, anywhere in this
plan. Use the blue/amber axis, clear brightness differences, and a text label on
every state. This is a hard rule, not a preference.

## What this plan does not cover

- **Single sign-on.** Decided against on 2026-08-05. Sign-in stays as it is:
  Google, magic link, and the one-time code added in Phase 4. This is a
  deliberate choice, not an oversight — some enterprise buyers ask for SAML in a
  security review, and the answer is that Sonae does not offer it. Revisit only
  if a real deal turns on it, and scope it properly when that happens, because
  it touches every authenticated route.
- **Automatic deprovisioning.** Follows from the above. Removing someone's
  access when they leave stays a manual action, so whoever operates the platform
  needs a habit of reviewing who has access rather than a system that does it
  for them.
- **Two-factor authentication.** Out of scope for the same reason — the current
  login flow stands.
- **AI literacy and staff training.** Removed on 2026-08-05 after being written
  in, because it fails the framework test at the top of this plan. The duty to train staff falls on the
  organisation running a finished product, which is three steps from Sonae:
  Sonae is the layer, a product is built on it, a client runs that product, and
  their people use it. A framework cannot know anything about a client's staff.
  If a product built on Sonae ever needs to show which of its users have been
  using high-risk AI, the raw data is already recorded — every conversation and
  every run stores who triggered it — so it is a query to write on the day a
  product needs it, not a feature the framework carries.
- Certification schemes such as SOC 2 or ISO 27001. Those are audits of an
  organisation, not features of a platform, though the evidence pack makes them
  considerably easier.
- Legal advice about which risk tier a given customer's AI falls into. The
  platform records a classification; it does not decide one.
- Data residency. Worth a decision later, out of scope here.
