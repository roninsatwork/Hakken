# What Hakken sees: getting the bubble right on every screen

Read this before you give any screen's eye a bubble written by the Insights
team. It records what it took to make the Conversions page's bubble worth
reading (Anthony, 30 October 2026), so the next screen starts where this one
ended, not where it began.

The eye in the top bar opens a speech bubble. On the Conversions page and a
conversion's own screen, the Insights team writes it: the Head of Strategy picks
a specialist, the specialist reads the saved data and writes, the Editor's code
checks every word and number, and the Head takes a second look. Plans:
`docs/plans/active/sees-conversion-specialist-plan-2026-10-30.md` and
`docs/plans/active/stronger-agents-plan-2026-10-30.md` (A1, Progress).

## What a good bubble is

Anthony's test: does it tell me something I hadn't spotted? "It could find
other things that I have not spotted, that's the whole point of this."

- **It finds what a person looking at the page would miss.** Gaps, differences
  between groups (channels, kinds of page, devices, countries), and what got
  better or worse against the span before.
- **It says more than the boxes.** The reader can already see the boxes.
- **It gives advice a person can act on.** Each step names the thing to fix: a
  step of the shop, a channel, a kind of page, a product.
- **Every number is true and is one Hakken holds.** "We need to be super
  careful in what we say as the platform will lose credibility."
- **It speaks the screen's language.** On the Conversions screens that is
  conversions and purchases, never money: "i just dont want it focusing on
  money".
- **It is plain.** Short sentences, everyday words: the plain-words rule binds
  every agent (`PLAIN_WORDS` in `convex/utils/insightTeam.ts`).

## How it went wrong, round by round

Each round below was a real bubble on morehandles.co.uk that Anthony rejected,
and the rule that came from it. Every rule is now in the code.

1. **"There is so much data on this page and this is the best it can do."** The
   eye handed the team only the four boxes' figures, so the bubble repeated the
   boxes. *Rule:* the agent reads the saved data for itself (A1), through the
   screens' own reads, and at least one sentence must name a figure read beyond
   the boxes.
2. **The bubble said 1,246 beside a box showing 1,258.** A saved answer stood
   for three hours after the page's figures changed. *Rule:* a saved bubble
   stands only while every figure on the page is the same (`sameFigures`).
3. **The Head made it worse.** Its second look rewrote a good point back into
   the boxes' figures with "up from". *Rule:* the Editor applies every check to
   the Head's rewrite too; a rewrite that fails leaves the specialist's words.
4. **"The advice is still really shit."** The Head sent the Conversions page to
   the tracking auditor, whose advice was about settings; it told Anthony to undo
   a choice he made on purpose (basket additions count as conversions); and it
   glued numbers onto steps ("to correct 28,623") because every step had to name
   a figure. *Rules:* a page about conversions goes to the Conversion specialist
   unless tracking health found a fault that breaks the conversion figures
   (`routeFor`, `SERIOUS_TRACKING_FAULTS`); the Editor sends back tracking advice
   without such a fault (`TRACKING_TALK`); steps name the thing to fix in words.
5. **"We are not money related anymore."** The shop brief said "money first".
   *Rule:* on the Conversions screens, speak in conversions and purchases.
6. **"I don't want it hard coded, these are examples of what I want it to
   find."** When Anthony named things he could see (a drop from basket to
   checkout, better rates from AI assistants, about 25 visits for one
   conversion), the answer was not to list them in the brief. *Rule:* give the
   agent the figures the screen shows and room to speak (up to six sentences and
   four steps), and tell it to find what a person would miss. Never a checklist
   of findings.
7. **"The advice is still very poor."** Four facts in a row, each "X, up from
   Y", and steps any website could be given. Three causes: every agent ran on the
   fast, cheap model; the brief said "number first, one fact a sentence", which
   writes stat lines; and the agent saw that checkout got worse but never looked
   for where. *Rules:* the Insights agents run on Google's newest flagship model,
   set on each agent in Admin → Agents, never in code; the bubble is a short story
   (what is happening, where, why it matters); the agent digs before it writes,
   breaking the biggest change down by device, channel, kind of page and country;
   every step says where. On the flagship model it read the devices by itself and
   found that phones bring more visits than desktops but add to basket far less
   often: the first bubble Anthony did not send back.

## The rules for every screen

**Data**
- The agent reads saved data only, through the very function the screen reads,
  so a figure it names is the figure on the screen (`convex/insightsTools.ts`,
  `convex/agentReads.ts`). Never Google, never a fetch: Live is never offered.
- The screen's own data is read for the agent before it starts (`firstReadsFor`
  in `convex/seesAskActions.ts`): every part the screen draws. On Conversions
  that is the screen, its map by kind of page and by channel, and a shop's
  products. Other screens' reads are offered; the agent decides.
- Any rate or "visits for one" is worked out in code, never by a model
  (`conversionsByInternal`).
- Every number a read returns carries its own key (`keyedRead` in
  `convex/utils/agentTools.ts`). The agent names figures by key and never types
  a number; the Editor fills them in.
- Reads are fixed to the company, the website and the page's dates, country and
  device. A page on custom dates offers no reads.

**Who writes**
- The Head chooses, held to a rule only where Anthony made one (`routeFor`).
- The Insights agents run on the strongest model, set on each agent in Admin →
  Agents. The fast model's bubbles were the weakest of the night, whatever the
  brief said.

**The brief**
- General, never a list of findings. Say what to look across (groups, steps,
  the span before) and what to leave out (money on Conversions, tracking
  without a fault, comparisons with nothing or a handful of visits).
- A short story, never a list of figures: what is happening, where it happens,
  why it matters.
- Dig before writing: break the biggest change down until the agent knows where
  it happens. Every step says where — the device, channel, kind of page, step or
  product.

**The Editor's checks** (`seesFrom` in `convex/utils/seesAsk.ts`)
- No typed number. Every key named is one the page holds or the agent read.
- No sentence over 24 words. No supplier named.
- At least one sentence names a figure read beyond the page's boxes.
- No tracking advice unless tracking health found a fault that breaks the
  conversion figures.
- Each step uses one of the page's links.
- What fails goes back to the agent once, with why, in the same conversation.

**The Head's second look**
- Rejects tracking advice without a fault, words that lead with money, words
  that don't say what got better or worse, and words that say less than the
  figures hold.

## Bringing it to a new screen

1. Say the screen's intent in one sentence and agree it with Anthony.
2. List every part the screen draws. Make sure each has a read the agent can
   call (Ask Hakken's reads in `assistantAnalyticsReads.ts` cover most
   Analytics screens; add the rest to `agentReads.ts`).
3. Add the screen to `firstReadsFor`, so its own data is read first.
4. Have the screen hand its boxes' figures to the eye (`seesAskFacts.ts`), with
   the words from the catalogue.
5. Decide with Anthony anything the screen must never talk about (money on
   Conversions is the example). Put it in the brief and, where the words can be
   recognised, in the Editor.
6. Press the eye on morehandles.co.uk and a second real website. Read the run's
   log (each read, the Head's choice, the second look). Judge the bubble by
   Anthony's test: what does it say that a person scanning the page would miss?
7. Keep a good bubble as an eval page with the sentences Anthony would write
   (`keepSeesEvalPage`), so the next change is graded against it.

## Cost and time

- A bubble reads four to six screens and makes four to six model calls; each
  is recorded on the run with its cost and held by the run's spend limit.
- On the flagship model a bubble cost $0.39 and took 76 seconds (30 October,
  morehandles.co.uk); on the fast model it was about $0.06 and two to four
  minutes. "Hakken is researching…" shows meanwhile, and the answer is kept three
  hours while the figures stand, so each page pays once.
- Each part has its limit, together inside Convex's ten minutes: one minute to
  choose, four and a half to read and write, two and a half for the second look.
