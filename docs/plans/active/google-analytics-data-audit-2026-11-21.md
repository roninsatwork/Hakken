# Google Analytics: the data audit (21 November 2026)

Anthony, 21 November 2026, after the Search Console audit (`search-console-data-audit-2026-11-21.md`): "we audit first
across both, make the plan, discuss it and then build it".

This is what was checked on the Analytics screens, how, what is right and what is wrong. Nothing was changed.

## How it was checked

- **Against Google itself.** A temporary probe on the dev deployment asked Google Analytics the same questions the
  screens answer, the way Hakken's collector asks them: More Handles' own addresses (www.morehandles.co.uk and
  morehandles.co.uk), the United Kingdom only, and the events "What counts" lists. The probe was removed straight after.
- **Google's allowance read first, and on every answer.** Hakken may use 14,000 tokens an hour on a property. About 60
  asks used about 350 tokens, and never fewer than 13,600 were left.
- **The screens' own reads**, called as Anthony on More Handles, for all seven periods. On Saturday 21 November, with
  Analytics' newest day Friday 20 November, This week is 16 to 20 November against 9 to 13 November, and Last 3 months
  is 21 August to 20 November against 21 May to 20 August.
- **The eye's saved words** on 11 Analytics screens, written 1 to 17 November.
- Nothing was pressed and no screen was opened.

## What's right

These match Google exactly.

1. **Overview**, Last week and Last month, and every period's comparison: visits, engaged visits, views, people, new
   people, purchases, sales and conversions. October: 35,739 visits, 25,573 people, 1,207 purchases and £108,697.08 of
   sales. Mobile on its own too.
2. **People are counted properly.** Google counts a person once over any span, so people can't be added up day by
   day: October's days add up to 30,749, against 25,573 for the month. Overview and Visits both show 25,573, and no
   chart adds people up.
3. **Landing pages**: all 25 top rows (visits, people, conversions), Last week and Last month, and the number of
   landing pages (2,118 and 5,135).
4. **All pages**: 24 of the top 25 exactly. The other is six views out.
5. **Events, Products, New and returning, and Campaigns**: every row checked.
6. **Every read loads on every period**: 147 reads across the seven periods, none failed, none slow.
7. **The eye on Overview, Channels, Conversions and Purchases**: "visits fell 4.7% to 35,739", "362 sales" from
   Cross-network, "9.1 sales for every 100 visits" on Paid Search, and "1,207 purchases, slipping from 1,258" are all
   right.

## What's wrong

### 1. A finished period is saved once and never asked again

Last month's lists were saved on 3 November, two and a half days after October ended. Google went on revising October
after that. Today:

- **Channels, Last month**, are up to 1% out. Organic Search shows 13,169 visits and 9,003 engaged, and Google now says
  13,211 and 8,896. Last week's channels, saved more recently, are within a few visits.
- **The eye on Overview** says "Cross-network lost 1,917 visits" from September to October. Google now says 1,792.
- **Last 12 months** shows 395,867 visits against Google's 395,438.
- **The day chart** is one to three visits out on some October days.

The totals for Last month still match, so this is mostly how Google sorts visits into channels. Adverts' visits in
particular (Cross-network, Paid Search, Paid Shopping) can move between channels for some days. The fix is to ask a
finished period once more about a week after it ends.

Separately, the newest day is still settling. This week shows 5,136 visits, and Google now says 5,078. Hakken fetches
the newest days again each night, so that one corrects itself.

### 2. Conversions on More Handles count each sale twice, and count the basket

"What counts" for More Handles lists 12 events. In October they made 27,254 conversions from 35,739 visits:

| Event | October |
|---|---|
| add_to_cart | 17,469 |
| begin_checkout | 5,885 |
| newsletter_sign_ups | 1,458 |
| checkout_complete | 1,218 |
| purchase | 1,205 |
| contact_us_submit | 19 |
| confirmation, order_form, place_an_order, view_cart, ua_5 minutes on site, ua_6 pages visited | 0 |

So each sale is counted twice, as purchase and as checkout_complete. Add to basket makes up 64% of all conversions,
and six of the events never happen. Last week the home page shows a 100% conversion rate: 717 conversions from 717
visits. Hakken adds up exactly what it's told to count. The question is what it's told. This reaches every
conversion figure and rate on every Analytics screen and its eye, and Analytics' landing page stages.

### 3. A channel's people are only roughly right, and no screen shows them

A channel's people are added up from its sources, so someone who came by two of them counts twice. Cross-network has
6,780 in October, and Google's figure for the channel is 6,743, under 1% out. The code knows this (`addInto`,
`googleAnalyticsRows.ts`: "a screen shows people only where Google counted the row whole"), and no Channels screen
shows them. The figure is still on the row, where Ask Hakken or the eye could pick it up.

### 4. Google now has its own AI Assistant channel

Google files ChatGPT, Claude, Copilot, Perplexity and its own assistant under "AI Assistant". Hakken builds "AI assistants" from
their sources, wherever Google filed them. October's figures agree, 876 against Google's 871. Only the name differs from
Google's, and the rule for channel names is to use Google's own.

### 5. The eye guesses, and sometimes rounds wrong

- **Guesses.** Products says "likely from a trade order" and "likely shock shoppers at checkout". Purchases says
  shoppers "likely hesitate over delivery costs or account creation". None of that is in the figures.
- **Rounding.** Conversions says "29" visits a purchase in September. 37,507 ÷ 1,258 is 29.8, so it's 30.
- **Hakken talking about itself.** Visits says "our fastest-growing age group".

These answers were written on 1 to 3 November. On 4 November the eye's instructions gained "never write likely,
probably or may be because", and an answer is kept only a day, so none of these show now. The rule is only in the
instructions, though: nothing in the code sends back a sentence that guesses. The writing guide says a guess is fixed in
the shared checker, for every page.

Checked again while building (21 November): the other two aren't faults now. The checker already turns "our" into
"your" before an answer is saved. The rounding is right: figures are rounded the usual way, and today September is
37,507 visits for 1,246 purchases, 30.1, so "30". The "29" was written on 3 November from that day's figures.

### Worth knowing

**Pages a visit halved on 3 September**, from 9.9 to 4.1, and stayed there. That looks like a tracking change on the
website, not a change in what people did. The eye already says the days either side can't be compared. Any period
reaching back past 3 September, Last 3 months and longer, compares views across it.

## Not checked

- **Live**: it's Google's last 30 minutes, and can't be asked again after the fact.
- **Funnel's steps**, and how Services and Classifications sort pages.
- **Tracking health.**
- **Countries other than the UK.**
- **Ronins' and NEC's Analytics.** The screens can only be read as the company being viewed, More Handles here.
