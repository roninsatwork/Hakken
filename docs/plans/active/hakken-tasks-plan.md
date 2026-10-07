# Hakken tasks — the assistant that does the work

Hakken becomes a personal assistant whose main job is work it takes on and
does by itself, with questions and answers second. A person asks in Ask Hakken
("tell me if this page gets fewer than 10 visitors a day"); Hakken writes the
task back in plain words and asks for a yes; from then on it checks every
morning and tells them when it matters, in the bell, by email and later in
Telegram. This plan builds that on the foundation
([assistant-foundation-plan.md](./assistant-foundation-plan.md): one brain,
Ask Hakken on the agent runtime, the company's figures read through the
screens' own code), and moves every email Hakken sends onto one new style.

Anthony, 2026-10-06: "give it a task and then it does it, it's more than
questions and a reply" — "these are all examples of a true assistant … the
main purpose is tasks". 2026-10-07: "remember this is customer facing so the
wording needs to be super friendly and intuitive"; on the email style, "B — it's
more engaging and intuitive"; "can we make this the default email style too …
update the other emails from the platform at the same time in this plan … we
crack everything in one go".

**Status, 2026-10-07: planned; the drawings signed off the same day (below),
the Limits board with them; Phase 1 started the same day ("yes all good. lets
build this"). About 28 to 36 building days, in six phases; the first, about
9 to 10.5 days, gives working alerts.** Estimates come from reading the code each
item touches, not from building it; each phase is re-estimated before it starts.

## The rules

| Rule | Decided |
|---|---|
| **One brain** | Only the Hakken Assistant Agent talks with people — in Ask Hakken and in Telegram, which is another way in to the same Assistant, not a new agent. Every other agent works in the background, and anything it writes is told what every door is told (`convex/assistantKnowledge.ts`), in the same friendly voice. |
| **Code checks, the model writes** | Whether "fewer than 10 visitors" is true is plain code. A model is used only where words or judgement are needed — an alert's sentence, a report, a "find out why". |
| **A figure is the screen's figure** | An alert, a report and a chart use only the figures read through the screens' own code (`convex/assistantReads.ts`); the model never writes a number of its own. |
| **A task is its owner's** | Tasks are set up by a user and seen by that user. Anyone in the company may set one; so may a super admin viewing as it. A company admin does not see colleagues' tasks in the client app; the company-wide view is Admin → Companies → a company → Hakken tasks. |
| **Alerts go to the person who set it** | No one else, inside or outside the company. |
| **An alert repeats** | Every morning its rule is met, until its owner pauses or deletes it (Anthony, 2026-10-07: "until they are stopped"). |
| **A limit per person** | Up to 25 active tasks each; adding a 26th is refused kindly, with a suggestion to pause one. The number is a limit like the others: a new **Hakken tasks** topic on the Limits screens, set for the platform and overridable per company (Admin → Settings → Limits; `admin/_components/limits/limitTopics.ts`). Drawn before it is built. |
| **Their time** | "9am" is the person's own time zone, taken from their browser when they set the task, and shown on their Hakken tasks page. |
| **Costs** | Every task's cost goes through the existing credit ledger (`convex/creditLedger.ts`) from day one: each kind of task work gets its own price in Admin → Settings → Credit prices, and scheduled tasks show in Usage → Coming up. Anything that costs asks for a yes first. Charging itself starts when the usage plan's parked step 5, "Switching it on", is built ([usage-credits-plan.md](./usage-credits-plan.md)). |
| **Words** | Everything a customer reads is warm, plain and free of internal terms: "visitors from Google", "keep an eye on", "let you know", Pause, Resume, Delete. Dates in emails read "Monday 5 October". |
| **Names** | Hakken's own work is **Hakken tasks**, a menu item after Ask Hakken; the existing Tasks list (work waiting on a person) is unchanged. "Hakken" in an agent's name comes from the platform's name setting, so a renamed clone shows its own. |
| **Earlier decisions kept** | A Search Console click counts as a visitor. AI-answer alerts cover tracked questions only, and adding one asks first because it spends. Timing follows the data: Search Console settles about three days behind (`convex/searchConsoleDays.ts`), so a day is judged once settled. WhatsApp is left out. |

## The agents

Six, all built-in like the Translator (`convex/utils/contentTranslator.ts`):
each on the Agents screen with its own switch, schedule, spending limit and
log of every run, its calls in the cost ledger.

| Agent | What it does | When | Its model is used for |
|---|---|---|---|
| **The Hakken Assistant Agent** | Talks with people; writes each task back for a yes; lists, pauses, resumes and deletes them when asked; answers "why?". Today's "The Assistant" (`convex/hakkenAssistant.ts`), renamed. | When someone asks | The conversation |
| **The Hakken Watcher Agent** | Checks every alert against the new figures — Search Console first, then AI answers and Google rankings — and writes the alert when one is met. | Each morning, once the day has settled | The alert's sentence only |
| **The Stat Report Agent** | Builds recurring reports, like "every Monday, the five pages that lost the most visitors". | On each task's schedule | Writing the report |
| **The Hakken Research Agent** | Does "find out why this page dropped": looks through rankings, competitors and changes with the read tools, and writes up what it found. | When asked, or after an alert | The digging and the write-up |
| **The Weekly Digest Email Agent** | Sends the weekly news digest: picks the week's stories, writes the intro, in each reader's language (`convex/outboxTemplates.ts`). | Weekly | Choosing stories and the intro |
| **The Hakken Caretaker Agent** | Pauses a task that can no longer work — its page gone or redirected, its website removed, no figures coming in, the same alert twice — and tells its owner what happened and what they can do. | Daily | The message only |

Kept as code, not agents: delivering each alert at the person's time to the
bell, email or Telegram, once; and asking before anything costs.

## The drawings — signed off 2026-10-07

The canvas, "Hakken tasks — the wider assistant":
https://claude.ai/artifact/7dwwqvq4GHbffypVB5Lnpf — 20 boards in five rows (the Limits board, Admin → Settings → Limits with the Hakken tasks topic, signed off after the first 19),
drawn from the app's real components on the drawing kit (stylesheet
`844c6461de95`, look `149d9f4fb243`), every screen board passing
`npm run check:drawing`. Copies:
[`boards/`](../assets/hakken-tasks/boards/). They bind
([drawing-guide.md](../../developer/drawing-guide.md)): a change is drawn and
approved again first.

- **Setting a task**: you ask; Hakken writes the task back line by line (what
  it will watch, on which page, when it will let you know, when, where, what
  to know, the cost) with **Yes, start watching** / **Not now** — a new part,
  `JobConfirmation`; then "All set!". Changed after sign-off, the same day, by
  Anthony's answer that alerts go only to their owner: the hint under the
  buttons no longer offers "let Jo know too".
- **Charts in Ask Hakken**: an answer with a chart under it, drawn from the
  figures looked up, with a link to the screen. The chart on the board is a
  picture of the Sites line chart's look (`SiteCharts.tsx`), because the chart
  library draws only in a live page.
- **Seeing and managing them**: Hakken tasks in your menu, with Pause, Resume
  and Delete; "Delete this task?", which offers a pause instead; Admin →
  Companies → a company → Hakken tasks.
- **Where you hear from Hakken**: the alert in the bell; your profile's
  Telegram section (open Telegram, send the code); the words Hakken sends in
  Telegram (Telegram's own look is not drawn). The profile board fails
  `check:drawing` only on the flag colours of the profile's real language
  picker.
- **Every email Hakken sends, in the chosen style ("the picture")**: a task
  alert, a task's report, sign-in, sign-in code, invitation, weekly news, from
  your agent, an automation's email, collecting stopped, system health.
  Stories, people and figures on every board are examples.

## What gets built

| # | What | Days |
|---|---|---|
| **Phase 1 — Hakken tasks and alerts** | | **9–10.5** |
| 1.1 | **The task record**: who set it, what it watches (a website, a page, later a tracked question), the condition and how long, the time and time zone, how it tells you, its state (on, paused, needs you, deleted), and every check it made. Read only by its owner, and by super admins in Admin; tenancy tests. | 1.5 |
| 1.2 | **Setting one up in Ask Hakken**: new Assistant tools to propose a task, and to list, pause, resume and delete the person's own; the proposal saved on the reply and shown as `JobConfirmation`; the two buttons; a change typed instead ("make it 8:30") redrafts it. Writes ask for a yes, as the foundation's rule says. | 2–2.5 |
| 1.3 | **The Hakken Watcher Agent, Search Console**: the built-in agent; each morning, for each alert whose next day has settled, the rule checked in code against the figures `convex/searchConsoleReads.ts` serves; tried against the last four weeks before it starts; the alert's sentence written through the one brain; its credits in the ledger. | 2–2.5 |
| 1.4 | **Delivery**: the bell (`convex/notifications.ts`) and an alert email through the outbox, at the owner's time, once per alert. | 1.5 |
| 1.5 | **The screens**: the Hakken tasks menu item (`SidebarNavTrees.tsx`) and page, with Pause, Resume, Delete and its yes-or-no; the Hakken tasks tab on Admin → Companies (`admin/companies/[id]/layout.tsx`); the limit of 25 per person on the Limits screens; English and Italian; a look test per approved screen. | 2–2.5 |
| **Phase 2 — Charts in Ask Hakken** | | **1.5–2.5** |
| 2.1 | A chart the Assistant asks for by naming a look-up and a measure; drawn under the answer from that look-up's own figures with the Sites chart (`SiteCharts.tsx`), its link to the screen, and kept on the message like the "Looked up" line (`LookedUpLine.tsx`). Visitors and impressions over time first. | 1.5–2.5 |
| **Phase 3 — Emails** | | **5.5–7** |
| 3.1 | **The new style in the one layout** (`convex/emailLayoutService.ts`): the wordmark and a small label, a big number or code, a friendly headline, one dark button, a short footer — table-built so Outlook holds it, with its plain-text twin. | 2 |
| 3.2 | **Charts in email as pictures**: Gmail removes drawn charts, so a chart is rendered on the server to an image and attached by address. | 1–1.5 |
| 3.3 | **The eight emails moved onto it, in friendly words**, English and Italian (`convex/utils/emailWording.ts`): sign-in and sign-in code (`convex/auth.ts`), invitation (`convex/invites.ts`), weekly news and collecting stopped (`convex/outboxTemplates.ts`), system health (`convex/platformAlertService.ts`), from your agent (`convex/aiToolNotificationService.ts`), an automation's email (`convex/workflowRuntime.ts`). The email plan's standing reference page updated ([email-design-system-plan.md](./email-design-system-plan.md)). | 1.5–2 |
| 3.4 | **The Weekly Digest Email Agent**: the digest goes out through it. | 1–1.5 |
| **Phase 4 — Reports, research, and more to watch** | | **6–7.5** |
| 4.1 | **The Stat Report Agent** and the report email. | 2–2.5 |
| 4.2 | **The Hakken Research Agent**: "find out why" as a background run with the read tools, its write-up in the conversation and the bell. | 2–2.5 |
| 4.3 | **The Watcher on AI answers and Google rankings**: tracked questions' answers (`convex/siteListAi.ts`) and positions; adding a question asks first, as it spends. | 2–2.5 |
| **Phase 5 — The Hakken Caretaker Agent** | | **1–1.5** |
| 5.1 | The daily sweep for tasks that can no longer work: paused, and their owner told in plain words with a one-tap way on. | 1–1.5 |
| **Phase 6 — Telegram** | | **3–4** |
| 6.1 | One Hakken bot, **AskHakken** — Anthony creates it with a walkthrough and pastes only its key; messages in through a web address (`convex/http.ts`); a ten-minute code on the profile (`ProfileTabs.tsx`) links one person; every message answered through the same Assistant (`hakkenAssistant.answerInternal`); alerts and reports sent as messages; replies such as "why?". | 3–4 |
| **Across all of it** | The Assistant renamed by the platform's name; each task kind's credit price and its place in Usage → Coming up; the checks and the push at the end of each phase. | **2–2.5** |
| | **Total** | **28–36** |

## Open, not blocking

- The Telegram bot: called **AskHakken** for now (Anthony, 2026-10-07; not set up yet). Telegram requires a bot's username to end in "bot", so its shown name is AskHakken and its username something like @AskHakkenBot, if free.
- Each task kind's price in credits, set by a super admin in Credit prices
  once the Watcher's real cost per check is measured.

## Risks

- **An alert that is wrong costs trust.** Every rule is tried on the last
  four weeks before it starts, and the alert quotes only figures the screens
  show, with a link to them.
- **A model inventing a figure.** The Watcher, Reporter and Researcher are
  given the checked figures and told to use only those; a test fails an
  alert whose number is not in its figures.
- **Telegram is an outside door.** One person per link, a code that lasts ten
  minutes, nothing sent to a chat that is not linked, and the same company
  isolation as Ask Hakken.
- **Changing every email at once.** Each email keeps its tests on the
  rendered text; the old and new are compared side by side before Phase 3 is
  pushed.
- **Cost of daily checks.** Checks are code; the model is used only when an
  alert is met. Measured in Phase 1, priced before customers use it.

## How we will know it works

- A task set in Ask Hakken appears on its owner's page and nobody else's
  (tenancy tests), and the Watcher's alert quotes the figure the Search
  Console screen shows for that day.
- Each approved screen has its look test; every email its rendered-text test;
  English and Italian in step.
- Tests follow AGENTS.md's rules: no time limit of their own, no waiting on a
  guess, no timer outliving its test.

## Not in this plan

- WhatsApp: its business service bars general AI assistants (2026-01-15).
- Alerts to anyone but the task's owner; a company admin's view of colleagues'
  tasks in the client app.
- Buying credits and switching charging on: steps 4 and 5 of
  [usage-credits-plan.md](./usage-credits-plan.md), parked.
