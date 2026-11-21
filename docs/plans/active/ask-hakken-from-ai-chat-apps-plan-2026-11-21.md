# Ask Hakken from ChatGPT and Claude: plan

**Status:** Plan, with Anthony's four answers in (21 November). Waiting for his go. Nothing is built. Overall 0% built.
**Date:** 21 November 2026
**Chosen:** Anthony, 21 November 2026, after comparing the usual way with Hakken's: "Let's go for the best practice way please".

## What it is

A client adds Hakken to ChatGPT or Claude. They sign in to Hakken once and press Allow. After that they can ask about their own websites in the chat, such as "How did my visits do last month?", and get Hakken's figures and findings, with a chart.

This is not the "agent-facing endpoint" in PRODUCT.md phase 5. That one lets a buyer's AI ask a client's business for a price or a booking. This one lets a client ask Hakken about their own figures. It isn't in PRODUCT.md yet.

## The best practice way, as agreed

From OpenAI's and Anthropic's guidance and what experienced builders recommend (sources at the end).

1. **A few useful powers, not the whole product.** Five things to ask, listed below.
2. **A few tools, each shaped around a question.** Not one tool per screen or per table.
3. **Plain names and clear descriptions.** The AI reads the tool list like a manual. The tools use the screens' own names, so Visits is Visits everywhere.
4. **Every tool reads only, and says so.** Claude's directory needs every tool marked.
5. **Small answers.** The top rows and a total, never a whole table. The lean table rule: the name and at most five figures.
6. **Charts, not just words.** A chart drawn in the chat, styled to fit the app it's in.
7. **When something's missing, say why.** The same states the screens show.
8. **Finished, fast and honest about data.** No half version listed. Reads only saved figures, so it's quick. The Allow page says what leaves Hakken.

**Hakken's findings travel with its figures.** The usual way is raw figures, which leaves ChatGPT to write its own advice. That could disagree with Hakken's screens and would make Hakken a pipe for Google's numbers. So every answer carries the findings the screen's eye works out in code, and ChatGPT repeats Hakken's view.

## What a client can ask in the first version

| # | Tool | The question it answers | What it gives back |
|---|---|---|---|
| 1 | `hakken_websites`, Your websites | Which websites do you have figures for? | The company's own websites. For each, the sections that are on and connected, with the newest day each one has |
| 2 | `hakken_summary`, How a website is doing | How did my website do last month? | Each section's headline figures for the dates against the dates before, with that section's top three findings. Each section on its own, never joined, because joining sources is Insights' job |
| 3 | `hakken_findings`, What changed on a screen | What changed in Search Console? | The findings that screen's eye shows, worked out in code and ranked, with their figures |
| 4 | `hakken_top`, The top of a list | What are my top keywords? | The first 10 rows of a screen's list with the total. Each row has its name and up to five figures. Asking again gives the next 10 |
| 5 | `hakken_page`, A page's story | How is my pricing page doing? | One page's figures from each section that has it, with its findings. Found by its address or its name |

Every tool:

- takes the same dates the Dates menu offers and compares them with the dates before.
- reads only what the sections have saved. It never asks Google, Bing, Microsoft or DataForSEO, so it uses none of their limits.
- uses the screens' own names for figures.
- says why when it can't answer. The section is switched off, isn't connected, is still collecting or has nothing in these dates.
- is marked read-only.

**Not in the first version**

- Insights, and so "what should I fix first". Insights is paused. It joins when Insights starts again.
- Anything that changes something. No tool writes, sends, runs or deletes.
- Hakken's own AI answers from Ask Hakken. They would cost credits on every question. If they're added later, they go through `convex/assistantKnowledge.ts` like every other door, which `src/assistant-doors-drift.test.ts` holds.
- The platform's admin screens.

## Charts in the chat

In the first version, on Anthony's answer of 21 November.

Since 26 January 2026, MCP Apps lets a tool send a small view that ChatGPT and Claude draw in the chat. The first version has one view, a figure over time against the dates before, with the figures on hover. It's drawn in real pixels for the space the chat gives it and never stretches. Colours come from `hakken.theme.json` through `chartPalette.ts`, laid out to sit well in the app around it, as OpenAI's design rules ask. The tool's words still carry the figures, so an app that can't draw views still gets an answer.

## How it works, step by step

1. The client adds Hakken in ChatGPT or Claude, from its listing or by pasting Hakken's address.
2. The app reads Hakken's sign-in details from a public document on Hakken's address (`/.well-known/oauth-protected-resource`, RFC 9728).
3. The app sends the client to Hakken's Allow page. They sign in as usual if they aren't already. The page says which app is asking, what it will be able to read and what leaves Hakken. A super admin picks one company here. They press Allow or Cancel. It's a page, never a pop-up.
4. Hakken gives the app a pass for that person and that company. The app sends it with every question.
5. On every question, Hakken checks the pass, the person, the company, the section's switch and the website. Then it reads the saved figures with the same functions the screens use.

## Keeping it secure

| The danger | What stops it |
|---|---|
| Someone sees another company's figures | A pass belongs to one person and one company. Every tool reads through the screens' own company checks: a `SiteReader` built from the pass's company, and `requireModuleOn` for the section. A company or website the AI names is never trusted, only checked against the pass. A test has a person from one company ask for another company's website by its id and get nothing |
| A pass is stolen | A pass lasts an hour. Renewal passes are used once each, and using an old one again cancels the whole chain. Hakken keeps only a fingerprint of each pass, never the pass. A pass works only on Hakken's address (RFC 8707) and is never passed on to Google or anyone else |
| A fake app asks for passes | Only ChatGPT and Claude get in at first, as Anthony agreed on 21 November. Return addresses must match exactly. Sign-in uses PKCE (S256) and sends Hakken's name back with the answer (RFC 9207), which ChatGPT checks. An app's details come from its own published document (Client ID Metadata Documents, the MCP rules of 28 July 2026). Hakken fetches it carefully: secure addresses only, never a private one, small and quick, kept for a while. The older way of signing up an app (Dynamic Client Registration) is accepted only for the same allowed apps, because Claude may still use it |
| Hidden instructions in saved text | Some saved text comes from other websites, such as page titles, search terms and rivals' names. Tools send it marked as quoted data, never as instructions, with figures in their own fields. Every tool only reads, so a trick can't change or send anything |
| Too many questions, or an app stuck in a loop | A limit per person per minute, as API keys already have (`convex/apiKeys.ts`, 60 a minute). Answers are capped at 10 rows. The log shows who asked what |
| Someone leaves the company | Removing the person, switching the feature off or cutting the app off stops their passes at once. Every question checks the person still belongs to the company |
| A super admin's reach | A super admin's pass covers only the company picked on the Allow page, never every company. No admin tool is ever offered |
| Figures leave Hakken | Once the app has the figures, OpenAI or Anthropic keeps a copy under the person's own terms with them. The Allow page says so plainly. Only the figures the screens show go out, and nothing about any one visitor |
| No record of what happened | Every question is logged with the person, the app, the tool, the website, the time and whether it was refused, like the API's request log (`publicApiRequests`). A company's admins see the latest on the settings page |

## What gets built, in order

| # | Phase | Days | Done when |
|---|---|---|---|
| 0 | **Drawn first.** The Allow page, the Connected apps page, the new switch on both Features screens and the chart in the chat, drawn from the drawing kit on a Hakken canvas for Anthony to sign off | 1 | Anthony signs off the boards. Each board passes `check:drawing` and a fresh reader |
| 1 | **Hakken gives passes.** The Allow page, the pass and renewal endpoints, the two public documents, app details from Client ID Metadata Documents and Dynamic Client Registration for allowed apps, pass fingerprints and cutting off. All built in Hakken | 4 | MCP Inspector and Claude Code sign in on `hakken.localhost`. A renewed pass works and an old one cancels the chain. A pass for one company can't read another's |
| 2 | **The door.** `/mcp` on Hakken's address, answering MCP's Streamable HTTP in plain JSON with no sessions. The pass, person, company and switch checked on every call. The per-person limit and the request log | 2 | Claude Code lists the tools. A refused call says why and is logged |
| 3 | **The five tools.** Each a thin layer over the screens' own reads (`readSeesFindings`, `OWN_FINDINGS`, each section's list reads), taking `{ db, companyId }` as `seesFindingsInternal` does. Lean answers and every "can't answer" state | 3 | Each tool answers on More Handles' saved figures for every period the Dates menu offers, like `pageFindingsPeriods.test.ts`, and every read is checked on the dev deployment |
| 4 | **Charts in the chat.** One view, a figure over time against the dates before | 2 to 3 | The view draws in MCP Apps' own test host at a narrow and a wide size, and the words still answer without it |
| 5 | **Settings and switches.** A Connected apps page in the person's settings, with each app, when it was last used and a button to cut it off. A new switch, working name Ask Hakken in ChatGPT and Claude, on System Settings → Features and on each company's Features tab, saved in `featureSwitches` like the menu sections. It isn't a menu section, so it sits in a group of its own on both screens, as drawn in phase 0. New words in `messages/en.json` and `messages/it.json` | 1½ | The words pass `check:words` and `check:reading`, and a fresh reader signs them off before Anthony sees them |
| 6 | **Security checks.** A test for every row of the table above. Drift tests that fail a tool not marked read-only, a tool that skips the shared checks and a tool that fetches from outside | 2 | The full gate passes |
| 7 | **Online and listed.** Needs Hakken online, and a test site is enough. Connect from ChatGPT and claude.ai, fix what they show up, then submit to both directories | 1 to 2, plus the review wait | Both apps answer the five questions. OpenAI asks for a verified business name and demo sign-in details, and its reviews can take weeks |

**About 17 developer days**, with the charts and the drawing day, plus the directories' review time. Phases 1 to 6 can be built and tested on `hakken.localhost` with Claude Code and MCP Inspector. Phase 7 waits for Hakken to be online, and no production deployment exists yet.

## Notes for whoever builds it

- **Where it lives.** The door, the pass endpoints and the public documents are Convex HTTP actions in `convex/http.ts`, reached at Hakken's own address so the app sees one name. The Allow page is a Next.js page in the signed-in app. Read `node_modules/next/dist/docs/` before wiring the address, because this Next.js differs from older ones.
- **The MCP library.** First job in phase 2: check whether the official MCP library runs in Convex's HTTP actions. If it doesn't, the door answers MCP's few messages itself.
- **New tables**, names settled at build: allowed apps, grants (person, company, app, allowed when, last used, cut off), pass fingerprints (kind, expiry, chain) and the request log.
- **Reuse.** The `SiteReader` pattern, `requireModuleOn`, the API keys' limit and `constantTimeEqual`, `featureSwitches` and the screen kit for the settings page (`PageHeader`, `DataTable`, `StatusLabel`, `Button`).
- **The other direction stays.** Hakken already connects out to other tools' MCP servers (`convex/mcpServers.ts`). That is unchanged.
- **No AI in the tools.** They choose no model and cost no credits.
- **Tests never flake.** The rules in AGENTS.md apply, including a fixed day for any test whose saved figures end on a written day.

## Decided

Anthony's answers, 21 November 2026:

1. **The sign-in part is built in Hakken.** "use hakken". No outside service.
2. **Charts are in the first version.** "first".
3. **A switch in Features, for everyone and for each company.** "we add it to global and company features which can be turned on and off". It works like the menu sections' switches. It's on unless it's switched off, for everyone in System Settings → Features or for one company on its Features tab. Switched off, Hakken refuses that company's passes at once and the Connected apps page says why. Nothing leaves Hakken until a person presses Allow.
4. **ChatGPT and Claude only at first.** "agree". Other apps can be added once it works.

Also decided, unchanged since the plan was written:

- **Who can connect.** Every signed-in person at a client company, seeing only what they see on the screens. A read-only viewer can connect too, because every tool only reads.
- **Cost.** Covered by the subscription. The tools use no AI, so they cost Hakken almost nothing.
- **What's in it.** The five sections: Visibility, Search Console, Bing Webmaster, Google Analytics and Microsoft Clarity. Insights joins when Insights starts again.
- **Languages.** The tools send figures and the screens' names in English. ChatGPT and Claude reply in the person's own language.

**Still open, for before phase 7.** Which business the app is listed under, because OpenAI checks it. Where Hakken first goes online.

## Checks before it's handed back

`npm run verify:env`, `npm run lint:all`, `npm run check`, `npm run test:coverage`, `npm run coverage:check`, `npm run test:e2e:smoke`, `npm run build` and `git diff --check`. The smoke tests and the build run in a copy, so the app on port 3000 keeps running. Then a real sign-in and all five questions from Claude Code on `hakken.localhost`.

## Sources

- [MCP authorization rules, 28 July 2026](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [MCP Apps announcement, 26 January 2026](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
- [OpenAI: Authentication for apps](https://developers.openai.com/apps-sdk/build/auth)
- [OpenAI: App review requirements](https://developers.openai.com/plugins/deploy/app-review)
- [OpenAI: What makes a great ChatGPT app](https://developers.openai.com/blog/what-makes-a-great-chatgpt-app)
- [OpenAI: Planning your tools](https://developers.openai.com/apps-sdk/plan/tools)
- [OpenAI: Design guidelines](https://developers.openai.com/apps-sdk/concepts/design-guidelines)
- [Claude: Connector authentication](https://claude.com/docs/connectors/building/authentication)
- [Claude: Connector submission](https://claude.com/docs/connectors/building/submission)
- [Block: Playbook for designing MCP servers](https://engineering.block.xyz/blog/blocks-playbook-for-designing-mcp-servers)
