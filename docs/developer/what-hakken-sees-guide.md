# What Hakken sees: getting the bubble right on every screen

Read this before you give any screen's eye a bubble written by the Insights
team. It records what it took to make the Conversions page's bubble worth
reading (Anthony, 30 October 2026), so the next screen starts where this one
ended, not where it began.

## How it works now (since 31 October 2026)

The eye in the top bar opens a panel on every page of Google Analytics, Search
Console, Bing Webmaster, Clarity, Visibility and Insights
(`docs/plans/active/sees-every-page-plan-2026-10-31.md`). On each page:

1. **The page hands the eye its own figures**: the answer of the query that
   draws it, passed as `data` to its section's eye piece (`AnalyticsSees`,
   `SearchConsoleSees`, `BingSees`, `SiteSees`) or as `page` to `HakkenSees`.
   The eye cuts it to what the page shows first and keys every number
   (`convex/utils/sees/pageData.ts`). Every figure the panel, the writer and the
   chat name is the reader's own.
2. **Code finds what the figures show**, at once, before any model
   (`convex/utils/sees/pageFindings.ts`): a total that moved, a list's biggest
   rise and fall, one row holding most of it, a percentage far from the list's
   average. Only figures named in `convex/utils/sees/measures.ts` are spoken of,
   in the reader's words; a row named by a code is never a finding's name. The
   Conversions screens keep their own rules (`findings.ts`).
3. **Pressing writes the words** (about 5p, 2 credits; nothing at zero credits):
   the page's specialist, named in the screen list (`convex/utils/sees/screens.ts`)
   — no model chooses — writes from the page's figures and the findings, covering
   the first four. The Editor's code checks every word and number; what fails
   goes back once, with why. Words stand three hours while the figures do.
   Insights' weekly boxes, the Summary and Live write nothing new.
4. **Ask about this page** starts an Ask Hakken conversation told the page,
   its dates, its findings, its words and its figures.

A table or chart that runs its own query hands its figures over with `useSeesPart("name", answer)`; the eye reads
them beside the page's. A page with nothing to show yet still has the eye: the section's layout draws a stand-in
(`SeesStandIn`) with the chat alone, which the page's own eye replaces.

Bringing a new page to the eye is one entry in the screen list (writer, what it
is, its parts, what it never talks about) and its figures passed to its eye
piece. Anything not in the list falls back to its section's specialist.

The rest of this guide is how the Conversions bubble got good: the rounds still
hold, and the rules they left are in the code. Plans:
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
8. **"What do you think of the advice compared to what I gave you?"** Against
   his three notes it half found one and missed two, and it was a wall of
   numbers: six long sentences, about fifteen figures, words like "clicks".
   *Rules:* cover the page's parts first, a short sentence each, then dig
   (`pageParts`); at most two figures a sentence and eight a bubble, the rest
   left off; sentences under 20 words; words the screen never uses go back
   (`ANALYTICS_JARGON`); a gap of three times or more is questioned as possible
   broken tracking before it is called behaviour. His notes became the first
   eval page, graded by a judge point by point (`JUDGE_FORMAT`): the next
   bubble found one of three (visits for one conversion), missing the basket to
   checkout drop and the channels. That score, not a look at one bubble, is how
   a change is judged from here.

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
- The screen list names each page's specialist (`writerFor`); the Head of
  Strategy no longer chooses. On a page about conversions, a tracking fault that
  breaks the figures hands it to the Measurement specialist. Clarity's pages have
  a specialist of their own, the Visitor behaviour specialist.
- The Insights agents run on the strongest model, set on each agent in Admin →
  Agents; a specialist added later takes the Conversion specialist's model. The
  fast model's bubbles were the weakest of the night, whatever the brief said.

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

**The second look** was removed on 31 October 2026: it said "useful" every
time and cost a sixth of a press. Jev's checks (a guess stated as fact, a step
that would fit any website) stand in, through the Decisions engine.

## Bringing it to a new screen

1. Say the screen's intent in one sentence and agree it with Anthony.
2. Pass the page's own figures to its eye piece (`data`, or `page` on an inline
   `HakkenSees`), built once while their parts stay the same.
3. Give it an entry in the screen list: its writer, what it is, its parts, what
   it never talks about, and `writes: false` if its words are already the team's.
4. Check its figures' names are in the measures list, so its findings speak;
   add any that are missing, with their words in English and Italian.
5. Press the eye on morehandles.co.uk and a second real website — a random
   handful, never every page (Anthony, 2026-10-31). Read the run's log. Judge the
   words by Anthony's test: what does it say that a person scanning the page
   would miss?
6. Keep the page as an eval page with Anthony's notes (`keepSeesEvalPage`, or
   `keepSeesEvalPageInternal` from the command line), and grade every change
   against the set (`gradeSeesEvalNow` / `gradeSeesEvalInternal`). The notes are
   never put in the brief.

## Cost and time

- A press makes one model call for the words, two when the Editor sends them
  back; code finds, and Jev's checks are cheap. About 5p on the flagship model
  (31 October 2026), charged as 2 credits to whoever pressed, once the words are
  written. Kept three hours while the figures stand, so a page pays once.
- At zero credits the eye writes nothing and says so, with the way to Billing.
- "Hakken is researching…" shows meanwhile: 40 to 70 seconds on morehandles.co.uk.
