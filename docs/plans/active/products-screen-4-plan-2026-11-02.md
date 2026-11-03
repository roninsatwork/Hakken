# Build plan: the Products page as screen 4, and Ask Hakken reading it

**Written 2026-11-02 at Anthony's request: "ok im happy with screen 4 for now, until i see it and want to play
with it, can you make a plan and let me know how many man days it is". Not yet approved to build.**

The drawing is board "4 · Your products" on the canvas "Products page, three ways"
(https://claude.ai/artifact/PjgeVJ13qGwsbeVSxRCYKi). The board "The products chart, ready to reuse" beside it shows
the chart's four views. Both use MoreHandles' real October 2026 figures. When Anthony approves, the boards are saved
under `docs/plans/assets/products-screen-4/` and become the binding look.

## How long

**About 7½ man-days**, in this order.

| Phase | What | Days |
|---|---|---|
| 1 | Each website remembers its shop's steps and the event that means a sale | ½ |
| 2 | The figures the page reads | 1½ |
| 3 | The page as drawn | 2½ |
| 4 | The eye reads the new page | 1 |
| 5 | Ask Hakken reads it too, and can draw the products chart | 1 |
| 6 | Checking everything, on MoreHandles and in the full test run | 1 |
| | **Total** | **7½** |

## What the page shows, top to bottom

1. **The header**: Products, with the line "Where shoppers leave without buying, and the products they leave behind
   most."
2. **Four boxes**, each against the month before: Baskets left behind, Checkouts not finished, Visits that bought,
   and Added but not bought.
3. **Bought or left behind.** For each step the shop picks, the visits split into those that went on to the sale
   (orange) and those that didn't (grey). Two dropdowns: **Steps** (tick boxes, every event the shop recorded) and
   **The sale** (one event, Purchase to start with).
4. **The products chart**: our configurable chart drawn as bars. **Show** picks Left in basket, Products sold,
   Selling more or Selling less. **Category** narrows it to one of the shop's categories. Ten products each time,
   picked from the whole list.
5. **The products table**: Products or Categories; the search box; Show (Every product, Selling, Added but not
   bought) and Category filters; columns Product, Bought, Share and Added. Every heading sorts the whole list. Pages
   of 25 rows, the exact total, and Download CSV.

**No money anywhere**, because not every Google Analytics account records revenue (Anthony, 2026-11-02). Everything
counts visits and items.

**Nothing new is asked of Google.** Every figure is in lists Hakken already saves each night: the events list and
the product list, for each period and the period before. Google's allowances are not touched.

## What goes from today's page

These are not on screen 4. Anthony to confirm each one goes.

- The four step boxes (Visits that looked at a product, Added to the basket, Started checkout, Bought).
- "The shop's steps" bars.
- "Shoppers at each step a day".
- "Products bought a day". It counted orders, not products, and drew the same line as Bought.
- The table's Looks, Revenue and Change columns. Looks is empty for almost every MoreHandles product, because its
  product views don't say which product was viewed.
- The money in What Hakken sees and in Ask Hakken's answer about products.

## Phase 1: each website remembers its steps and its sale (½ day)

- Two saved choices for each website: which events are the shop's steps, and which event is the sale. Kept with the
  website's Google Analytics connection (`convex/googleAnalyticsSchema.ts`), beside the events that count as
  conversions.
- To start with, Hakken picks Google's own names where the shop records them: `add_to_cart` and `begin_checkout`
  as the steps, `purchase` as the sale. A shop with none of them sees words asking it to pick.
- Changing the dropdowns saves the choice for everyone at that company, so the page, the eye and Ask Hakken always
  agree. Only the company's own people can change it (tenant rules as every other setting).
- Done when: a test saves and reads a choice, a company can't change another company's, and the starting choice is
  right for MoreHandles.

## Phase 2: the figures the page reads (1½ days)

In `convex/googleAnalyticsProductReads.ts`:

- **Each product** gains items bought in September (from the saved list for the month before), items left in the
  basket (added less bought), and its share of all items sold. Revenue goes from the answer.
- **The chart's four views**, each the ten products picked from the whole list, with the category if one is chosen:
  most left in baskets, most bought, the biggest rise in items bought, and the biggest fall.
- **The Categories table**: each category's items bought, share and items added.
- **Bought or left behind** from the saved choice: each step's visits, and how many ended with the sale.
- **The four boxes** read the same saved choice, so they always agree with the chart.
- **The events** the Steps dropdown lists: every event recorded in the dates chosen, Google's four automatic ones
  left out (session start, first visit, engagement, page view).
- Done when: tests cover each view, the category filter, sorting over the whole list, and a shop whose events have
  other names.

## Phase 3: the page as drawn (2½ days)

`src/app/(dashboard)/app/analytics/[siteId]/products/page.tsx`, built only from kit parts: `PageHeader`,
`FigureRow` and `Figure`, `ChartExplorer` (as bars, with `TickSelect` and `Select`), `DataTable`, `TableBar`,
`SiteViewSwitch`, `Meter`. No new parts.

- The five pieces above, in that order. Every chart full width.
- The products table follows the Sites table rules: whole-list sorting (`useSiteSort`), 25, 50, 75 or 100 rows,
  numbered pages, an exact total.
- The words in English and Italian (`messages/en.json`, `messages/it.json`), checked against the wording rules.
- The approved look saved with a look test, so a part added, moved or renamed later fails a test.
- Done when: the page matches the board at 1440 wide and works on a phone.

## Phase 4: the eye reads the new page (1 day)

- The page hands the eye its own figures: the boxes, Bought or left behind with the chosen steps, the chart's
  current view, and the table's rows (`AnalyticsSees`, `useSeesPart`).
- The screen list's entry says what the page is, and that it never talks about money (`convex/utils/sees/screens.ts`).
- The new figures get their words in English and Italian, so the eye's findings can speak of them
  (`convex/utils/sees/measures.ts`): items left in basket, share of items sold, items bought in September.
- Its own rules count items, not money (`convex/utils/sees/analyticsProducts.ts`).
- Done when: pressing the eye on MoreHandles and on one other shop gives words that say something a person scanning
  the page would miss. Each press costs about 5p and 2 credits.

## Phase 5: Ask Hakken reads it too (1 day)

- Ask Hakken's answer about products (`convex/assistantAnalyticsReads.ts`) changes to match the page. It drops the
  money. For each product it gives items bought, added, left and share, and it includes selling more and selling
  less against September and the chosen steps.
- Ask Hakken can draw the products chart in a conversation, with the same four views
  (`convex/assistantChartHandlers.ts`, `convex/utils/assistantGroupCharts.ts`).
- Done when: four test questions get right answers from MoreHandles' figures. "Which products are left in baskets
  most?", "What sold best last month?", "What's selling less than in September?", "How many baskets were left?"

## Phase 6: checking everything (1 day)

- GitHub's own steps run here first: `npm run check`, `test:coverage`, `coverage:check`, `test:e2e:smoke`, and
  `build`, the last two in a copy so the app on port 3000 keeps running.
- Looked at in Anthony's Chrome on http://hakken.localhost:3000, on MoreHandles, against the board.
- Nothing is committed or pushed until Anthony asks.

## Open questions

Each has a recommendation. None stops the build.

1. **The Share column.** Keep it as drawn, or rename it "% of items sold"? *Recommended: rename it, keep the bar.*
2. **A Bought row** in Bought or left behind? *Recommended: no. The orange part of each bar is already the
   purchases.*
3. **Visits or people?** Baskets are counted by visits, as agreed on 21 October. Counting people would need a new
   figure from Google. *Recommended: keep visits.*
4. **The Category dropdown on the products chart** was my idea. *Recommended: keep it.*
5. **If a shop picks different steps**, should the boxes follow them and be named after them? *Recommended: yes, so
   the boxes and the chart always agree.*

## Limits, said plainly

- A shopper is a visit. Someone who adds on Monday and buys on Tuesday counts as a basket left on Monday and a sale
  on Tuesday. A visit that buys from a basket filled on an earlier visit counts as a sale though it added nothing.
- Most MoreHandles products (1,150) are in "Default Category", so the category filter helps less there.
- Long product names are cut on the bars. The three Waltz knob sizes look alike until the hover names them.
- Selling more and Selling less on the canvas use an estimate. The built page reads September's saved figures.

## Afterwards

A Services section for service businesses such as Ronins is planned only once this page is finished (Anthony,
2026-11-02: "lets plan services after we finish the products pages").

## As built (2026-11-02)

Built the same day on Anthony's "Build it now", with the recommendation taken for each open question: Share is
"% of items sold" with its bar kept, no separate Bought row, visits kept, the Category dropdown kept, and the boxes
follow the steps a shop picks. Not committed.

- **Phase 1.** `shopSteps` and `shopSale` on the connection (`convex/googleAnalyticsSchema.ts`);
  `convex/googleAnalyticsShopSteps.ts` (`saveShopSteps`, `shopChoiceOf`). Company admins save the choice. Anyone
  else's change shows for them alone.
- **Phase 2.** `convex/googleAnalyticsProductReads.ts`: `analyticsProducts` (events, choice, journey, the products
  never bought), `analyticsProductChart` (the four views, products sold the period before and none now among those
  selling less), `analyticsProductList` / `analyticsProductListAll` (products or categories; Show; sorting over the
  whole list). Overview's shop panel keeps its own `productList`.
- **Phase 3.** `src/app/(dashboard)/app/analytics/[siteId]/products/page.tsx` and `_components/ProductsCharts.tsx`,
  from kit parts only. `BeforeLine` gained `lowerIsBetter`; `TableBar` gained the noun `categories`. The look is held
  by `docs/plans/assets/products-screen-4/look/Products.txt`, beside the boards saved from the canvas.
- **Phase 4.** The eye: the screen list's entry, with parts and never money or channels; the measures `itemsBought`,
  `itemsAdded` and `itemsLeft`; its rules in items. The table goes to the eye without each row's share, and the chart
  as its view and product names alone: shares of a whole and ten products picked from a list both read wrongly as
  findings (seen on MoreHandles).
- **Phase 5.** Ask Hakken's products answer, with no money and with each step's visits left; its charts gained
  `by: "product"` with `itemsBought`, `itemsLeft`, `sellingMore` and `sellingLess`, bars only, in the chat, emails and
  sent tasks.

**Checked on MoreHandles in Anthony's Chrome:** every figure matches the drawing; Selling less reads September's saved
figures (the Waltz 32mm knob, 547 then 493); the eye's writer wrote its words ("Written by the Hakken team") once it
was told the page never talks about channels. **Not checked:** a second shop, as dev has only MoreHandles.

**Found beside it, not fixed:** Ask Hakken's knowledge search took four minutes before answering, because the model
saved for searching knowledge doesn't support it ("Configured embedding model does not support the embedding use
case").

**Checks run (2026-11-02):** type-check, lint, every touched test, the browser smoke tests (19 of 19) and the build
(both in a copy), all passing. The full `npm run check` failed only on 23 Search Console tests in 6 files, plus one
agent-runtime test that ran out of time while the machine was busy and passes on its own. The Search Console tests
fail the same way on the pulled code without this work ("Cannot read properties of undefined (reading 'catch')"), so
they were there before it. Coverage was not run, because those failures would fail it either way.

**The full check passing (2026-11-02).** The 23 Search Console screen tests had aged: their figures end on fixed
days, and "Last month" moved past them on 1 November. They and every screen test like them now run on a fixed day,
held by `src/test-time-limits-drift.test.ts`. The speed check then failed only on three Google Analytics tests, just
over five seconds alone on the pulled code too; on "Make them lighter" they were. The load test returns only what it
checks (5.3s to 1.3s), and the test database answers equal words and numbers, ids and fields of several kinds the
quick way, with Convex's own answers (`src/test/convexTestTables.ts`, `convex/testDatabaseShortcuts.test.ts`): the
home countries test went from 4.8s to 2.6s, the nightly run from 5.3s to 2.2s. `npm run check` then passed whole:
8,297 tests, none over five seconds alone. Coverage was not run.

**Click-through (2026-11-02, on "i still cant click on the products").** A product's row opens the page it is sold
on (`analyticsProductPage`, `bestPageFor`): the page viewed in the dates whose address is most nearly the product's
name, its sizes and finishes sharing one page. Read only when a row is clicked. Back on that page returns to Products
as it was. With no page near enough, All pages opens, searched for the name. Tried on MoreHandles: the Waltz 32mm knob
opened `/waltz-round-cupboard-knob-on-stepped-rose.html`, and Back returned to Products.
