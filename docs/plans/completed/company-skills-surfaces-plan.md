# Company Skills Apply Where They Are Bound

Status: Delivered 2026-08-13. All five steps done; proven live in a real
browser — skill in the answer and the evidence panel with the Chat switch on,
gone from both with it off, and the widget switch independent throughout.
Owner: Anthony

## The decision

A company's skills reach the model automatically — nobody picks a skill per
question, the admin's assignment *is* the selection, and the model decides
in-context whether a skill applies. That model stands; Anthony confirmed it
2026-08-13. What does not stand is the half-built layer around it: the
per-surface switches (`companySkillBindings`) that the schema, the readiness
gates, and the eval categories all assume exist, but which no UI creates and
no runtime reads. Anthony's call, same day: **wire the bindings up** rather
than delete them, and **agents stay separate** — a thread with an agent
attached keeps using the agent's own bound skills only, as AGENTS.md already
describes. Company skills are a chat-and-widget concept.

## What the code does today

- `chat.sendMessage` routes agent-less, non-swarm messages to
  `ai.generateSonaeResponse` (`convex/chat.ts:303-325`). Widget visitors take
  the same path — `threads.widgetId` is the only thing that distinguishes a
  widget thread from company chat.
- `companySkills.getRuntimeCompanySkillsInternal`
  (`convex/companySkills.ts:384-415`) returns every ACTIVE company skill, most
  recently updated first, capped at `MAX_SKILLS_PER_COMPANY` (2), instruction
  resolved through `sourceAgentSkillId` so the uploaded SKILL.md stays the
  source of truth. It never looks at bindings.
- `buildAssistantSystemInstruction` concatenates those skills verbatim into
  the system prompt on every message
  (`convex/aiPromptAssembly.ts:74-81`), and the skill ids are recorded as
  evidence on the assistant message (`convex/ai.ts:449-452`), which is what
  company evals assert against.
- `companySkills.setBinding` and `getBindingsForSkill` exist and are
  audit-logged (`convex/companySkills.ts:446-830`) but **no frontend calls
  them**. `importGlobalSkill` creates no binding either. The bindings table
  is empty in practice.
- The readiness rollup (`convex/companyReadiness.ts:137`), the skills summary
  (`convex/companySkills.ts:189-243`) and the learning loop
  (`convex/companyLearningLoop.ts:213`) all count *enabled bindings* — so
  today they count zero, always, for every company.

## The faults

1. **The switch is painted on.** An admin screen and three governance
   surfaces speak the language of "bound to company chat", "bound to the
   widget" — and none of it is connected to anything. Disabling could not
   work because enabling never happened.
2. **Readiness reports are wrong.** A company with two active skills serving
   every chat message shows zero bound skills in its readiness gates. The
   gate passes or fails on a number that is always zero.
3. **Widget and chat cannot be told apart.** A skill written for signed-in
   staff ("look up the customer's account…") is injected verbatim into
   anonymous widget conversations, because the runtime has no notion of
   surface.

## The work

Each step lands with tests proven failing-then-passing against the pre-change
code, in the repo's usual way.

### 1. The runtime respects the switch

`getRuntimeCompanySkillsInternal` gains a required `surfaceType` argument
(`"COMPANY_CHAT" | "WIDGET"`) and returns only skills with an enabled binding
for that surface (`by_company_surface_enabled` index already exists).
`ai.generateSonaeResponse` derives the surface from the thread:
`thread.widgetId ? "WIDGET" : "COMPANY_CHAT"`. Eval threads
(`purpose: "EVAL"`) count as company chat unless they carry a widget id —
evals must run through the runtime that ships.

**No binding means off.** Absence is not "default on"; that reintroduces the
painted switch with the polarity flipped. Which makes the migration in step 2
load-bearing — it must land in the same deploy, or every existing company's
skills silently stop applying.

Tests: a skill with its COMPANY_CHAT binding disabled does not appear in the
system instruction; a widget thread gets WIDGET-bound skills and not
chat-only ones; a skill with no bindings at all reaches no model.

### 2. Import turns the switch on, and a migration catches up the past

`importGlobalSkill` (both the fresh-import and revival paths) creates enabled
bindings for COMPANY_CHAT and WIDGET alongside the skill, audit-logged as the
existing `setBinding` path does. Assigning a skill keeps meaning "it works",
with no second step to forget — the default is on; the switch exists to turn
things off.

A one-shot migration backfills enabled COMPANY_CHAT and WIDGET bindings for
every existing ACTIVE company skill that lacks them, so behaviour on deploy
day is identical to behaviour the day before. `archiveSkill` already disables
bindings (`convex/companySkills.ts:727`) and needs no change.

Tests: import creates both bindings; re-import of an archived skill re-enables
them; the migration is idempotent.

### 3. The admin can reach the switch

The company skills list
(`src/app/(dashboard)/admin/companies/[id]/ai/skills/page.tsx`) shows two
toggles per row — **Chat** and **Widget** — reading binding state from the
skills query and writing through the existing `companySkills.setBinding`.
Plain words on the screen: "Answers in company chat", "Answers on the
widget". No new page; the row is still a name, a description and when it
arrived, now with two switches.

The other three surface types (AGENT, WORKFLOW, APP_KIT) stay in the schema
but get no toggle: nothing consumes them yet, and a switch wired to nothing
is the exact fault this plan removes.

### 4. Governance tells the truth by consequence

No new code should be needed here — once bindings actually exist, the
readiness rollup, skills summary and learning loop counts become correct on
their own. The step is verification: after steps 1–3, confirm on a dev
deployment that a company with skills shows non-zero bound counts, that
disabling a binding moves the readiness number, and that the risk flags
(`riskLevel !== "LOW"` with no required tools) fire against bound skills as
written. Extend `getSummary` tests to cover the now-real states.

### 5. Live proof

Repo convention: stage a company with one skill on a dev deployment, then in
a real browser —

- ask in company chat, see the skill shape the answer and appear in the
  evidence panel;
- disable the Chat binding, ask again, see it gone from answer and evidence;
- open the company's widget as an anonymous visitor with the Widget binding
  off, confirm the skill is absent there while chat (re-enabled) still has it.

## Deliberately not done

- **Per-question skill matching.** Still no relevance scoring, embeddings or
  routing. With a cap of two, always-on within the bound surface is cheaper
  and simpler than matching, and the cost argument from commit `c2db6dff`
  (every skill is text on every message) is what keeps the cap at two.
- **Company skills on agent threads.** Anthony's call, 2026-08-13: agents are
  governed by their own prompt, skills and tools. The `AGENT` surface type
  and the `AGENT_INHERITANCE` eval category stay dormant until that decision
  is revisited — this plan is where that is recorded.
- **Runtime enforcement of `requiredToolsJson` and `approvalPolicyJson`.**
  Ask Hakken's chat path calls no tools, so there is nothing to gate at run
  time; these stay readiness-screen concerns. If chat ever grows tools, that
  is its own plan.
- **Per-widget bindings.** `surfaceId` allows binding a skill to one specific
  widget. The toggle ships company-wide per surface; per-widget granularity
  waits for someone to ask for it.

## Noticed in passing, not changed

- The chat path fetches each skill's `category` and `riskLevel` and then
  drops them; the agent prompt renders them. Harmless today, but if risk is
  ever meant to change the *prompt* (not just the readiness screen), the chat
  path is the one that ignores it.
- `companySkills.createSkill` exists only to throw `CENTRAL_SKILL_ONLY_ERROR`
  (`convex/companySkills.ts:459-479`). Dead weight, but removing it belongs
  to a cleanup pass, not this plan.
