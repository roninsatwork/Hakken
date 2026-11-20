---
product: Hakken
documentation_type: Developer guide
feature_area: words on screens, drawings and canvas notes
audience: every agent and developer who writes words Anthony or a client reads
source_repository: roninsatwork/Hakken
source_path: docs/developer/writing-guide.md
last_reviewed: '2026-11-18T09:15:00+00:00'
reviewed_against: current implementation
status: Current
---
# Writing words people read — read before you write any

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** words on screens, drawings and canvas notes
> **Reviewed:** 18 November 2026, 09:15 GMT (Europe/London)
> **Source path:** `docs/developer/writing-guide.md` · **Status:** Current

Every word Anthony or a client reads is written the way a helpful person
would say it out loud. That means short, plain and friendly. It covers
screen titles, buttons, box labels, chart titles and hints, table headings,
empty pages, emails, Ask Hakken's replies, the words on a drawing, canvas
notes, and your own replies to Anthony.

## Why this guide exists

Anthony has asked for this again and again. Each new agent started without
the rules, so he had to teach them again.

- 7 October 2026: "remember this is customer facing so the wording needs to be super friendly and intuitive".
- 2 November: "your language is awful". Then "why dont you ever remember the language".
- 3 November: "we need to remember the reading age for whenever you write text, here or on the pages".
- 6 November: "i asked for a reading age of 14 - these look terrible".
- 7 November: "i keep asking for it to be in our style and its not".
- 17 November: "have you forgotten the language style and reading age".
- 18 November: "why do I have to ask every day", then "how do we stop that for other agents".

This guide is the answer. Read it before you write. Then let the checks
catch what a machine can, and read every line yourself for the rest.

## The standard is the redone screens

Hakken has no brand book. The standard is the screens Anthony has redone
with an agent, line by line, and nothing else. A screen still waiting for
its redo may be the very thing that's wrong, so it can't set the standard.

| Screen | Words in `messages/en.json` |
|---|---|
| Google Analytics, a page's own screen | `googleAnalytics.page` |
| Google Analytics, Visits | `googleAnalytics.visitors` |
| Google Analytics, All pages | `googleAnalytics.allPages` |
| Google Analytics, Funnel | `googleAnalytics.landing`, `googleAnalytics.chart.flow` |
| Google Analytics, Products | `googleAnalytics.products` |
| Google Analytics, Campaigns | `googleAnalytics.campaigns` |
| Google Analytics, Live | `googleAnalytics.live` |
| Google Analytics, Channels | `googleAnalytics.channels`, `googleAnalytics.channelsPage`, `googleAnalytics.channelPage` |
| Google Analytics, Overview | `googleAnalytics.overview` |
| Google Analytics, Services | `googleAnalytics.services` |
| Search Console, Performance | `searchConsole.performance`, `searchConsole.figures` |
| Search Console, Keywords | `searchConsole.keywords` |
| Search Console, Pages | `searchConsole.pages` |
| Search Console, a keyword's and a page's own screens | `searchConsole.record` |
| Search Console, Countries and devices | `searchConsole.places` |
| Search Console, Classifications (Demand by Classification until 18 November 2026) | `searchConsole.services` |
| Search Console, Indexing and a reason's own page | `searchConsole.indexing` |
| Search Console, Low click rate (Shown but not clicked until 20 November 2026; "position", never "place") | `searchConsole.lowCtr` |
| Search Console, Keyword cannibalisation (Pages competing until 20 November 2026; "impressions", never "showings") | `searchConsole.competing` |
| Search Console, Brand and non-brand ("Brand searches", "Other searches Google names", "Searches Google hides", as Performance) | `searchConsole.brand` |
| Search Console, Click rate by position ("position", never "place"; rates with two decimals) | `searchConsole.ctrCurve` |
| Search Console, Rich results (Google's names for each kind; "Plain results" for the rest) | `searchConsole.appearance` |

When a screen is redone, add it here. Name the screens you checked
whenever you give a word or a pattern as the standard.

Those screens talk about people and Google. They never say Hakken. They
use lines like "Google only knows the age for 12 of the 40 visits" and
"Nobody in the last 30 minutes". Even a redone screen can slip, so when two
of them say a thing two ways, use the one that sounds like a person.

## The checklist

Check every line against this list before anyone sees it.

1. **One idea a sentence.** A hint is one short sentence, two at most,
   under about 20 words each.
2. **No colons, semicolons or dashes joining ideas.** Write two sentences.
   A one-word label like "Show:" is fine.
3. **Name the dates.** Say "in September", "since September", "last month"
   or "Sunday 5 October". Never "the month before" or "the days before" when
   the month has a name.
4. **Use the words a shop owner would use.** "Average order", "Added but
   not bought", "Selling more", "Left behind". Never system words like
   routine, errand, judged, slot, list, span, step, row or measure.
5. **Say who and what, not how it's counted.** "Half your sales come from
   149 products", never "the products that make half the products' revenue".
6. **Round when it's easier to read.** "1 in 10", "about a third". Keep
   the exact figure for the big number itself.
7. **Read each line aloud.** If it sounds like a report or a spreadsheet,
   write it again.

And always:

- **Reading age 14 at most, measured, never judged by feel.** The redone
  screens average about 8, so aim for that. `scripts/reading-age.mjs` measures it.
- **Copy the redone screens' own phrases.** Look them up in
  `messages/en.json` before you write. Don't invent a menu name or a hint.
- **Promise nothing the screen or the board can't do.** If a row opens
  nothing on a board, don't say "click a service to see its pages".
- **Say a thing once on a screen.** One line under the boxes, not the same
  note in every chart's hint.
- **Use the name the app already has.** Classification, never "kind of page".

## Google's own terms stay

Where a screen shows what a Google tool reports, keep Google's words for it
(Anthony, 18 November 2026: "we need to use the google terminology too as
these are accepted as industry standard"). On Search Console's Indexing that
means "Indexed", "Not indexed", "Why pages aren't indexed", "Last crawled",
and each reason exactly as Google writes it, such as "Excluded by 'noindex'
tag" or "Crawled - currently not indexed". Put one plain line under the term
to say what it means. Don't swap the term for your own words.

But Google's term only **names** a thing: a reason, a box label, a table
heading, a menu choice. Every sentence around it is in everyday words. Say
"in Google", not "indexed". Say "visited", not "crawled". Say "page" or
"link", not "URL" or "address". On 18 November every line on the Indexing
boards passed the reading-age check, and Anthony still asked "are these pages
using the language rules", because the sentences leaned on "index", "crawl"
and "product feed". A low score doesn't make a line easy to understand.

One word is the exception: **impressions** stays, in sentences too, as the
redone Performance and Services screens use it ("The top row is where 100
impressions went"). Anthony chose this on 18 November 2026 ("Keep
impressions"). A table heading still says "Shown", with Impressions on hover.

| Bad | Good |
|---|---|
| Google doesn't have these addresses in its index. | Google hasn't saved these pages. |
| Each page counts once, on the day Google last crawled it. | Each page sits on the last day Google visited it. |
| Which of your pages Google has indexed, and why some aren't. | Which of your pages are in Google, and why some aren't. |

## Phrases to reuse

These are the redone screens' real words.

**Menus.** "Show", "Count", "Colour shows", "Split by", and "Compare with",
which is only ever a period: "September", or "No comparison".

**Comparisons in a box.** "▼ {change} fewer than {before}" and
"▲ {change} more than {before}", with the month's name for `{before}`.
Say "No change since September" when nothing moved.

**Squares.** "All your {noun} in {when}. That's {count} {noun}. Each square
is 1 in every 100."

**Bands.** "The top row is where 100 impressions went. The bottom row is
the same for 100 {noun}." Then "Press one to keep it lit."

**Maps.** "Bigger boxes had more visits." Then "Orange boxes got more visits
than in {before}, and grey boxes got fewer."

**Dots.** "Each dot is a service. The further right, the more {unit} it had.
The higher up, the more {did} for every 100 visits."

**Boxes.** "Busy pages, fewer views", with "Out of {count} pages with
{visits} visits or more." under it.

## Bad and good

| Bad | Good |
|---|---|
| Each product's revenue last month against the month before: the six that rose most and the six that fell most, in pounds. | The products whose sales went up or down most since September. |
| Half the sales · 10.0% of the 1,491 that sold | Half your sales come from 149 products · That's 1 in 10 of the products that sold |
| Spent an order | Average order |
| Added, never bought | Added but not bought |
| Rising / Falling | Selling more / Selling less |
| Set against: Nothing / The month before | Compare with: No comparison / September |
| Every place visits came from | Where visitors came from |
| Where visits came from, day by day | Visitors each day |
| Came in on this page | Started on this page |
| 26% of them were bought | 1 in 4 were bought |
| ▼ 7.2% on the month before | ▼ 7% fewer than September |
| Further right had more impressions. Higher up got clicked more. | The further right, the more impressions it had. The higher up, the more clicks for every 100 impressions. |
| Click a service to see its pages. (on a row that opens nothing) | Leave it out, or say only what works. |
| The chart: Show and Compare with. | The chart has two menus, Show and Compare with. |

## Ask Hakken's answers

Ask Hakken's typed answers to the company's own people are told these rules
in `COMPANY_ANSWER_STYLE` (`convex/assistantKnowledge.ts`). On 18 November
2026 every answer had the right figures and still read like a report, with
headings like "Key Observations", "CTR" and "-5.2%". Nothing had told a typed
answer how to sound. A visitor on a company's website chat isn't told them,
since that chat speaks in the company's own voice. The eye's writer has the
same rules in its own words (`convex/utils/seesAsk.ts`). When you change a rule
here, change it in both. `convex/assistantAnswerStyle.test.ts` holds the
style's good examples to the screens' word checks.

## Canvas notes and replies

Canvas notes and your replies to Anthony follow the same rules. Explain in
three or four short lines, with one example each. Don't send lists of
figures joined by colons and dashes. Give the plain answer first.

## Who checks

Whoever hands Anthony a board or a screen reads every string on it first.
That includes boards a helper drew. A helper saying "the check passes" is
not that read. On 18 November 2026 two canvases reached him with "on the
month before" in the boxes, one note said three times, and a promise that
rows open. Every one of them passed the reading-age check.

## What the checks catch

- `npm run check:reading` fails a client line over reading age 14 in
  `messages/en.json`.
- `npm run check:words` fails a client line in `messages/en.json` with a
  month left unnamed, a colon or a dash joining two ideas, or Hakken
  talking about itself (`scripts/word-style.mjs`). Both run inside
  `npm run check:guards`, so they run on every push.
- `npm run check:drawing -- <board.dc.html | canvas.json>` holds a board to
  the same rules. It also fails a sentence said twice on one board, and a
  "Compare with" menu that offers something other than a period. Given a
  canvas's `canvas.json`, it holds the canvas's notes to them too.

Words in quote marks are left alone, so a note can quote a bad line to
point at it. A table's rows are the website's own words, so the words rules
skip them. A board copied from the app (`<!-- copied-from-app -->`) is
today's page and is let through.

The lines already at fault the day `check:words` came in are frozen in
`scripts/word-style-allowlist.json`, by rule. Like
`scripts/reading-age-allowlist.json`, the list may shrink, never grow. Fix a
line and take it off. Never add one.

## What the checks can't catch

A check can't tell whether a line sounds like a person talking, whether it
copies the redone screens, or whether it promises something that doesn't
work. Passing every check is a floor, never proof. Read each line aloud.
