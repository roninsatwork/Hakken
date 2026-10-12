# Hakken never waits for a person

Status: proposed, 12 October 2026. Nothing here is built yet.

Anthony, 12 October 2026: "this is supposed to be automated and should never
need me. That goes against the whole point of Hakken. How can Hakken be an SEO
and CRO agency if it needs me." Then: "Hakken should never wait for a human and
we need to change that."

An agency does the work and reports it. It does not hand its client a to-do
list. This plan lists every place the Insights build still waits on a person,
why it waits, and what would let Hakken carry on by itself.

## Where Hakken waits today

| # | Where | What waits | Why it waits |
|---|---|---|---|
| 1 | Visibility → Local, Reviews, Links (`convex/insightsDrafts.ts` `decideDraft`, `sites/[siteId]/drafts/[draftId]`) | Seven kinds of draft wait for a person to approve and copy them: profile category, name and description, posts, review requests, review replies, outreach emails | Hakken has no way to publish them: no write access to the Business Profile, and no sending of email on the company's behalf |
| 2 | Experiments (`insightsConversion.startExperiment`, the "It's live" button) | An experiment's before-figures are taken only when a person says the change went live | Built before Hakken could see a page change by itself. Since 12 October the weekly page check does (`fingerprintChanges`) |
| 3 | A finding's page and a page's review (the "Add to Hakken tasks" button, `markInsightFindingActed`) | A finding counts as "acted on" only when a person presses the button | The Track record was built to measure what the client did |
| 4 | Track record ("Acted on 0 of 26", "Act on a finding so its result can be measured") | The page asks the client to act | As 3 |
| 5 | Every "What Hakken sees" box ("Do first") | Each box ends in a numbered list of things for the reader to do | Written as advice to a client, not as the agency's own next steps |
| 6 | Measurement check | Says "what to test" when enquiries may be counted wrongly | Hakken cannot change the website's Google Analytics set-up |
| 7 | Page changes the reviews call for (rewrite the top, add a price, add proof, move the button, add structured data) | Someone has to change the website | Hakken has no access to the website |

Connecting a source (Google Analytics, Search Console, Business Profile,
Clarity) is the one thing a client must do, once, as they would give an
agency its logins. That is set-up, not waiting.

## What would stop each wait

**Needs no new access: Hakken can do these now.**

- Experiments start themselves (2): when the weekly page check sees a money
  page change, Hakken takes its before-figures and measures it 30 days on.
  No button.
- "Acted on" becomes "changed" (3, 4): the Track record counts what Hakken
  sees change on the website and in the profile (the change log), not what a
  person ticks. The "Add to Hakken tasks" buttons go.
- "Do first" becomes Hakken's own next step (5): each box ends with what
  Hakken does next and when it will report, not a to-do list.
- The Executive summary says what Hakken did and does next (drawn on the
  canvas, 12 October).

**Needs a one-time permission per company, then no person per item.**

- The Business Profile (1, 7): with Google's approval of Business Profile API
  access, Hakken posts, replies to reviews and corrects the profile itself,
  and the screen shows what it posted and what followed.
- Email (1): review requests and outreach go out through the Outbox from the
  company's sender address, once the company says Hakken may write as it.
- Google Analytics (6): with edit access, Hakken fixes the enquiry count
  itself (key events, duplicate counting) instead of saying what to test.

**Needs access to the website itself: the biggest decision.**

- Page changes (7): a connection to the website's CMS (WordPress, Webflow,
  Shopify first) would let Hakken make the changes its reviews call for and
  measure each one. Without it, the client's own developer makes them, and
  Hakken sees and measures the change by itself.

## Proposed order

1. **No new access** (about 2 days): automatic experiments, "changed"
   instead of "acted on", Hakken's next step instead of "Do first", the new
   Executive summary.
2. **Publishing by permission** (about 5 days once Google approves Business
   Profile access): a per-company switch for each channel, drafts publish
   themselves, a record of everything Hakken sent.
3. **Website access** (to be scoped): which CMSs, and whether Hakken changes
   pages directly or proposes them for the client's developer.

## Decisions for Anthony

- Whether stage 2 publishes straight away or after a short notice period the
  client can stop (never an approval step).
- Whether stage 3 is in scope, and which website builders first.
