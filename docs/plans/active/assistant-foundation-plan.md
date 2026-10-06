# The assistant's foundation — one brain, many doors

Hakken is to become a personal assistant whose main job is work it takes on
and does by itself; questions and answers come second. Before any of that is
planned, the foundation has to work: **one brain**, answering in Ask Hakken
with the company's real figures, that every other door — Telegram first,
WhatsApp later, the phone line, email replies, the website chat — will use
unchanged.

Anthony, 2026-10-06: "It's important for me we have one source of truth and
Ask Hakken works in the same way as Telegram — we cannot have two AI giving
two different answers." And: "Make this a repo plan first and let me know how
many man days."

**Status, 2026-10-06: planned, the four decisions taken (below), and items 1
to 5 built the same day — saved locally on `dev`, not pushed; Ask Hakken
answers through the Assistant on the dev deployment. About 50% done; about
4.5 to 6.5 building days left.** The wider
assistant (jobs, Telegram) is planned after this one is proven — the
decisions already taken for it are recorded at the end so they are not
asked again.

This is the second "one brain" in the repo's history and builds on the
first: [one-brain-plan.md](../completed/one-brain-plan.md) (2026-08-17)
folded saved answers and memory into the wiki, so the company has one place
to correct; this one makes every door read that one place the same way.

## The rule

Every door is a thin door onto one assistant. A door does three things only:
works out who is talking and for which company, passes the message in, and
shapes the reply for its screen.

| Always the same, whichever door | Allowed to differ |
|---|---|
| The instructions, rules, skills and memory | How long the reply is — a phone call or a Telegram message is short |
| What it reads, from where, in what order | How much it reads where the reply must be short (6,000 characters for calls and email, 32,000 for chat — PRODUCT.md §24) |
| The tools, and what needs a person's yes | Buttons on Telegram, boxes in the app |
| Every figure — read through the same code its screen uses | Spoken or written |
| What it may do — decided by **who is asking**, never by which door | |

## Where it stands today

The same question can get a different answer depending on the door, because
what Hakken knows is put together in three places:

| Door | Where it is put together | What it reads |
|---|---|---|
| Ask Hakken, typed; the company checks (`companyEvalRunActions.ts:128`) | `aiChat.ts:197` | Everything: prompts, rules, skills, memories, the personal note, the wiki, documents, Helpful content, files in the conversation |
| Ask Hakken, spoken; the phone line (`voiceRelay.ts:433`); email replies (`gmailWatcher.ts:389`) | `aiVoiceSession.ts:121` (reading) and `:590` (instructions) | The same kinds, from its own copy of the code. Email replies borrow only the reading, and write under instructions of their own in `gmailWatcher.ts` |
| An agent in a conversation — including the website chat, which normally has an agent attached (`aiPromptAssembly.ts:173`) | `agentRuntime.ts:200–330`, instructions from `aiPromptAssembly.ts:165` | Prompts, skills, memories and documents. No rules (PRODUCT.md §22), and as far as can be seen no wiki, personal note or Helpful content |

The typed and spoken doors already share one instruction builder
(`aiPromptAssembly.ts:42`); nothing shares the reading.

Ask Hakken also cannot use any tool — it makes one model call per answer —
so it cannot look up the company's own figures, and cannot do anything. The
agent runtime can: its conversation path already streams replies, saves
checkpoints, keeps the evidence trail and runs tools under approval and a
spending limit (`agentRuntime.ts:341`). The foundation joins the two: Ask
Hakken's knowledge, the agent runtime's hands.

## The list

| # | What | Why | Days |
|---|---|---|---|
| **One brain** | | | |
| 1 | **Built 2026-10-06.** **One record of what Hakken knows** — one shared piece that puts together the instructions (global and company prompt, rules, skills, ALWAYS memories, the personal note) and the reading (wiki, documents, Helpful content, relevant memories, the conversation's files), with a reading allowance per door. Typed and spoken Ask Hakken, the phone line, email replies, the company checks and agents in a conversation all use it; the three copies go | three copies today, each a little different — the cause of "two AI giving two different answers" | 2–3 |
| 2 | **Built 2026-10-06.** **Email replies written under the same instructions** as every other door, keeping their own manners (the AI notice, the holding reply). As built: the reply format and "no greeting, no signature" are the email door's presentation in `assistantKnowledge.ts` (`emailReplyStyle`), added after the shared instructions as speaking is; the sender is the public, so no private note; tested in `gmailWatcher.test.ts` | today they read what voice reads but write under instructions of their own | 0.5 |
| 3 | **Built 2026-10-06** (`src/assistant-doors-drift.test.ts`; it failed on a copy planted to test it, naming the file and the piece). **A guard so a second brain cannot come back** — a test that fails any file other than the shared one putting together instructions or reading for an answer. Jobs that are not answers (the Translator, the wiki staff, Decisions, an agent's scheduled or workflow run) are named in it | a fresh copy always compiles; only a test notices it, the way the other drift tests do | 0.5 |
| **One engine** | | | |
| 4 | **Built 2026-10-06** as "The Assistant" (`convex/hakkenAssistant.ts`, `convex/utils/hakkenAssistant.ts`): created on first use, its prompt empty so it is told exactly what typed Ask Hakken was, never overwriting an administrator's switch, prompt or limits; Run refuses it ("it has no run of its own"), since a run with nobody asking only spends; a conversation's model and thinking level reach the run and are kept on it (`agentRuns.reasoningEffort`), so a resumed segment finishes as it started. **The Hakken assistant** — a built-in agent like the Translator (`utils/contentTranslator.ts:8`): on the Agents screen, can be switched off, its own spending limit, its calls in the cost ledger. Its model comes from the chat setting, and the conversation's model picker still works — the chosen model is passed to the run, which today takes none (`agentRuntime.ts:68`) | the agent runtime needs an agent to run; this one is the assistant | 1 |
| 5 | **Built 2026-10-06.** Every message without an agent of its own, the company checks and the wiki's Ask box go through one entry point, `hakkenAssistant.answerInternal`, which answers through the Assistant; switched off, the conversation says so. Four things typed Ask Hakken did had to move with it: waiting up to a minute for a file dropped into the conversation to be read; sending a photo to the vision model when the chosen one cannot see; the "Checking / Searching / Writing" pill; and, once the answer is written, counting the company memories used and offering staff answers drawing on two or more wiki pages to the Filing Clerk — now `learnFromAnswer`, one step for every door. The Swarm is gone (its two modules, its status card, the composer's dead switch); its `swarmLogs` table stays for the rows in it. The built-in agent's key is `ASSISTANT` and its words avoid the platform's name, so a renamed clone reads right. Checked in Anthony's Chrome: a question answered from the Knowledge article, through the Assistant, with the stages showing. **Ask Hakken runs on it, for everyone at once** — no switch (decided 2026-10-06: the platform is on dev only and Anthony is its only user). `chat.ts:448` sends every Ask Hakken message to the assistant; streaming, attachments, photo actions, the model picker and the evidence trail as now. The company checks run through it too, so the exam always tests the brain people actually use. The Swarm "autonomous" mode is removed (`swarmActions.ts:31`, `app/assistant/page.tsx:270`) | one engine with tools, approvals and limits, instead of a second one beside it | 1.25–1.75 |
| 6 | **Old and new compared** — the company checks and a fixed set of questions run through both; answers graded, cost and time per answer measured, and the results written here. Nobody uses the old path after item 5; it is kept only until this comparison is done | proof that the move changed nothing but what it should, before the old path goes | 0.5–1 |
| **Real figures** | | | |
| 7 | **The first four read tools**, each calling the same function its screen calls, after the same access check (`siteAccess.ts:59`): Search Console performance for the site or a page over 7, 30 or 90 days (`searchConsoleReads.ts:135`); the Sites overview (`siteOverview.ts:58`); AI answers — mentions per question and engine (`siteAi.ts:33`, `siteAnswers.ts:166`); open Tasks (`tasks.ts:150`). Every figure links to its screen; under the reply a quiet line says what was looked up ("Looked up Search Console · 7 days"), drawn first and approved | a figure in a reply is always the figure on the screen, and anyone can check it | 2.5–3 |
| 8 | **Which client** — a super admin's conversation belongs to the company they are viewing as (`getActiveCompanyId`, `chat.ts:306`); a picker at the top of the conversation changes it without changing their whole view. Everyone else is always in their own company. Drawn first and approved | a super admin sees every client, so "how did we do last week?" needs to know whose week | 1 |
| **Finishing** | | | |
| 9 | **The old answer path removed** after item 6 — the model call of its own in `aiChat.ts` goes; PRODUCT.md §22 and §24 and the developer guides updated | one brain in the code, not only in use | 0.5–1 |
| 10 | **Checks and push** — the local gate, GitHub's own steps (coverage, smoke), English and Italian wording in step, a look in Anthony's Chrome on port 3000; push on his word | as every release | 0.5 |
| | **Total** | | **10.25–13.25** |

### Item 1, as built — 2026-10-06

`convex/assistantKnowledge.ts` is the one place: `gatherInstructions` (what
the model is told before anyone speaks) and `gatherReading` (what is looked
up for each question), with `READING_ALLOWANCES` — `full` for written
answers, `brief` for spoken ones, calls and email — the only thing that
differs between doors. Typed Ask Hakken (`aiChat.ts`, 688 → 378 lines), the
spoken session, the phone line, reception and the spoken lookup that email
replies borrow (`aiVoiceSession.ts`, 782 → 492), and an agent answering a
conversation (`agentRuntime.ts`, `agentObjectiveLoopService.ts`) all read
through it. Who is asking decides what may be read: a signed-in person in
their own conversation may be read customer pages and Helpful content; a
website visitor, a caller or an email sender may not.

Found while building, beyond the table above:

- **The agent door read far less than it looked.** Besides the rules and the
  wiki, it never read the company's own documents, the global brain, files
  in the conversation or Helpful content — only the agent's own knowledge —
  and it was told neither the platform's prompt nor the company's. A website
  chat with an agent attached could not see the company's price list. It now
  reads and is told everything typed Ask Hakken is, with its own prompt,
  skills, knowledge and memory inside that.
- **The spoken door read by different rules, not just less.** With no
  company it skipped the platform's wiki and searched the global documents
  even where the global brain answers; when the wiki found nothing but a
  global document did, it skipped the company's own filed documents; and a
  failed embedding silenced its whole answer. All now as typed.
- **Work nobody waits on in a conversation keeps its own instructions** — a
  schedule, a workflow, a webhook, a replay (`runTriggeredAgentObjective`).
  It is not a door; item 3's guard names it.

Tests: `convex/assistantKnowledge.test.ts` asks one question through typed
Ask Hakken, a live voice session and an agent — the same instructions (the
spoken one word for word, plus how to speak) and the same documents read;
three of its four fail against the old code. The safety pins in
`src/ai-safety-drift.test.ts` moved to the shared module with the code. The
full suite passed (6,550 tests, none slow), and in Anthony's Chrome Ask
Hakken answered a question from the Knowledge article on how traffic is
worked out. A display fault seen there — inline code drawn as a code box —
is its own task, not this plan's.

**Milestones.** After item 5 (about 5 to 7 days), Ask Hakken runs on one
brain, with no figures yet. After item 8 (about 9 to 12 days) the foundation
is complete and ready to test. Items 9 and 10 close it.

## How we will know it works

- Today's tests pass unchanged after item 1; a new test shows every door gets
  the same instructions and reading for the same question, differing only in
  its allowance.
- The guard (item 3) fails on purpose against a planted second copy, then
  passes.
- Each read tool's figure equals its screen's figure for the same website and
  days; a test proves one company can never read another's.
- The comparison in item 6, written into this plan.
- Tests follow AGENTS.md's rules: no time limit of their own, no waiting on a
  guess, no timer outliving its test.

## Risks

- **Agents' answers change.** Item 1 gives agents in a conversation the wiki
  and the rules, which they do not read today — every website chat with an
  agent attached will start following the company's rules. That is the point,
  but it is a visible change for those companies.
- **Cost and speed.** An answer that uses tools makes several model calls,
  not one. The assistant's spending limit caps it; item 6 measures it.
- **Everyone moves at once.** There is no switch back to the old path once
  item 5 lands. Acceptable on dev, where Anthony is the only user; the old
  path stays in the code, unused, until item 6 has compared the two.
- **Tenant isolation.** Every tool takes the company from the conversation,
  never from the model's arguments — the existing rule
  (`aiToolExecutionService.ts`) — and passes the same access check as the
  screens.

## Decided, 2026-10-06

- **The Swarm mode is removed** — yes. It is a hard-coded demo of five agents
  found by name: a second brain under the rule.
- **Agents read the wiki and the rules** — yes; see Risks.
- **The model picker stays** — yes. The brain is the same whichever model
  answers; the person chose it knowingly.
- **Everyone at once, no super-admin stage** — Anthony: "everyone please, it's
  a dev platform only at the moment so there is only me."

## Not in this plan — the wider assistant

Planned once this foundation is proven. Decided in the 2026-10-06 discussion,
recorded here so it is not asked again:

- **Its main purpose is tasks.** Five kinds of job: watches ("alert me when
  impressions for this page drop 50% for 3 days in a row"), routines ("every
  Monday, the five pages that lost most clicks"), errands ("find out why this
  page fell"), actions with a yes first, and follow-ups. Each job says what,
  when, what it may do alone, what it may spend, how it reports, and when it
  ends; every run is logged.
- **A watch is a rule in five parts** — what, for which thing, the condition,
  for how long, who to tell — picked from a menu of the numbers Hakken already
  collects (Search Console; AI answers named, recommended or warned against
  per engine; Google rankings). The AI only writes the rule and the alert;
  code does the checking. A rule is tried against past data before it starts.
  Anything it cannot watch goes on a list, like Unanswered.
- **A Search Console click counts as a visitor** — there is no GA4. Alerts say
  "visitors from Google".
- **AI-mention watches cover tracked questions only**; adding a question
  spends, so the assistant asks first.
- **Timing follows the data** — Search Console is about three days behind
  (`searchConsoleDays.ts:4`) and the fresher source; DataForSEO is as fresh
  as the company's collection schedule. The assistant says which when it sets
  a watch.
- **Test in Ask Hakken first, then Telegram** as the first outside channel,
  for a test only; WhatsApp later — its Business API bars general-purpose AI
  assistants since 15 January 2026, to be checked before it is built on.
- **Suggested, not yet confirmed:** "job" for what Hakken does, "task" kept
  for a person's to-do; one Hakken Telegram bot for the platform; `/client`
  on Telegram as item 8's picker; a day judged once its Search Console figures
  have settled.
