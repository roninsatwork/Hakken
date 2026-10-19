# Google Analytics — conversions on the website's other addresses

**Proposed 2026-10-19. Built on `dev` 2026-10-19, after Anthony's go ("The
other agent has finished, you can start"). Not committed. Not yet checked on a
live property.** What changed while building is under "Changed while
building" at the end.

## Why

National Extension College (nec.ac.uk) was connected to Google Analytics on
19 Oct. Its Purchase key event showed "0 in the last 30 days", and Hakken
advised unticking it.

That is wrong. NEC sells every course through a shop on a separate address.
Every "Add to cart to enrol" button on www.nec.ac.uk goes to
`store.nec.ac.uk`. The shop loads its own tag manager (GTM-PJ3SKDC5), and that
sends to the **same** Google Analytics property (G-02RSG38QML). It records
`add_to_cart`, `begin_checkout` and `purchase`. The property's visits come
from five addresses: `www.nec.ac.uk`, `store.nec.ac.uk`, `nec.cm-hosting.com`,
`nec.staging.cm-hosting.com` and `www-nec-ac-uk.translate.goog`.

Hakken reads only the website's own address. It leaves every other address
out of every figure (`siteAddresses`, `convex/googleAnalyticsApi.ts`), and
nothing on any screen lets anyone add one back. So NEC's sales are invisible.
We don't yet know how many sales the shop records, because Hakken has never
asked Google for that.

**This affects any client, not just NEC.** Shops, booking systems and checkouts
often sit on their own address. Anthony, 2026-10-19: it "will be a common
pattern". First he agreed to count same-domain shops. Then, on checkouts that
sit on another company's domain: "we need to add it".

## The rule, for every website

| Figure | Read on |
|---|---|
| Visits, views, people, time on site, pages, routes, titles | The website's own address, as today |
| Conversions, their value, visits that converted | The website's own address **and its conversion addresses** |
| Sales and revenue (Google's ecommerce figures) | Own and conversion addresses |
| Products: looked at, added to the basket, bought, revenue | Own and conversion addresses |
| Events screen | Counted events: own and conversion addresses. Every other event: own address only |
| "People who converted after it" (funnels) | The first step on the website's own address. The conversion step on any of them |

**Where each sale is credited.** A sale goes to the visit it happened in. It
is credited to that visit's source, channel, campaign and **landing page**. So
an NEC course page gets credit for the sale its visitor made on the shop. That
is the point of the change: it shows which pages make money.

**A page's own figures stay its own.** "Conversions that happened on this
page" never includes a shop page. Shop pages never appear in All pages.

## How Hakken picks the conversion addresses

Hakken picks them itself. Nobody has to set anything up.

1. **Same domain:** any address ending in the website's own address. For
   example, `store.nec.ac.uk` ends in `nec.ac.uk`. These always count. This is
   a plain ending check, so no new package is needed.
2. **Another domain:** counts when one of the website's counted conversions
   happened there in the last 12 months. `nec.cm-hosting.com` would count if
   the shop's checkout records sales there.
3. **Never counted:** copies of the website. That means addresses with
   staging, test, dev or demo in their name, Google Translate's addresses
   (`translate.goog`), web caches, `localhost` and bare IP addresses. These
   are recorded visits of the same pages, not real sales.

Hakken picks the addresses when what counts is read: when a website is
connected, and when someone presses "Change what counts". One extra small ask
of Google covers it: the counted events by address, for 12 months.

## What changes on screen

- **Connection page, "Choose what counts".** Each event's "in the last 30
  days" includes its conversion addresses, so NEC's Purchase shows its real
  number. The addresses line says what Hakken now does. For example:
  "Hakken reads visits on www.nec.ac.uk. It also counts conversions on
  store.nec.ac.uk. It leaves nec.staging.cm-hosting.com and
  www-nec-ac-uk.translate.goog out." **Needs Anthony's OK:** each address gets
  a tick box (the kit's `Checkbox`). It is set to Hakken's choice, and an admin
  can change it, for example to leave out a partner's domain. This changes the
  page's structure.
- **Connection page, once connected.** The "Addresses" row lists the
  conversion addresses as well.
- **Every Google Analytics figure screen.** Conversions, value, rate, sales,
  revenue and products include the shop. No layout changes.
- **Tracking health.** It reads the stored figures, so it follows by itself.
  Check 12 ("never happens") stops firing for NEC's Purchase.

## The past

When the conversion addresses change, the year's conversions are counted
again. This uses the same mechanism as a change to what counts
(`forgetCountedHistory`, then the website collected again in full;
conversions-back-in-time-plan.md BT3, BT4). The work is spread over hours
within Analytics' hourly allowance, as every collection is.

Websites that are already connected are picked up the next time their events
are read. Only a website that gains an address is counted again. A website
with no other addresses costs nothing extra.

## Tracking health: two new rows

These are only reports. Neither row ever changes what counts.

- **Conversions on an address Hakken leaves out.** The daily collection makes
  one small ask: counted events by address, for the last 30 days. When an
  address that isn't counted has some, the row says how many and where. This
  is how a new booking site or a moved shop gets noticed. It's part of the
  existing 04:00 run, not a new schedule.
- **Sales credited to the website itself.** When a checkout on another domain
  isn't set up as one site in Google Analytics (cross-domain measurement), the
  sale starts a new visit whose source is the company's own website. Hakken
  counts the sale, but it can't credit the right page or source. The row says
  how many conversions came "from" the website itself, and what to set up in
  Google Analytics.

## Limits (said now, not found later)

- **A visit that begins on the shop.** Google records only a landing page's
  path, not its address. A visit that starts on `store.nec.ac.uk/` is
  credited to the website's page at the same path, usually only the home
  page. Visits that start on a shop-only path, like `/cart`, stay under that
  path.
- **Checkouts that don't run the company's tag** (most card payment pages,
  such as Stripe or PayPal) are invisible to everyone. The sale counts when
  the visitor comes back to the website's thank-you page, as today.
- **Payment pages that send visitors back** can credit the sale to the payment
  provider as a "referral". That is Google Analytics' own setting (unwanted
  referrals). It is not in this plan. A later Tracking health row could flag
  it.
- **Insights is left alone.** Anthony paused it on 16 Oct while core data is
  fixed. Insights makes its own asks of Google (`insightsRun.ts`,
  `insightsRunAfter.ts`, `insightHistory.ts`), so for a website with a shop,
  its conversions will leave the shop out until Insights is picked up again.
  The Google Analytics screens and Insights will disagree for those websites
  until then.

## Cost

Conversions already have their own ask beside each list's visits ask.
Widening that ask's addresses costs nothing. Sales and revenue sit in the
visits ask today, so a website with a conversion address needs at most one
more ask per list for them. Fewer if they can join the conversions ask, which
the build will try first. Websites without other addresses ask exactly as
today.

## Phases

| | What | Effort |
|---|---|---|
| 1 | The address rule, read when what counts is read; Connection page counts include them | ½ day |
| 2 | Collection: conversions, value, visits that converted, sales, products and the Events screen read the conversion addresses; page lists stay own | 1½ days |
| 3 | Funnels and the live screens | ½ day |
| 4 | Connection page: the addresses' tick boxes and wording, English and Italian | ½–1 day |
| 5 | The past counted again when addresses change; connected websites picked up | ½ day |
| 6 | Tracking health's two new rows | 1 day |
| 7 | Tests, the full check and GitHub's steps; then one live run on NEC | 1 day |

About **5½ days** in all.

**Verification.** Tests cover each list kind, the address rule and the
recount. The live run on NEC asks Google, so it waits for its own go. Before
it, Analytics' remaining allowance is read and the run's cost worked out,
keeping a fifth of the hour and the day in hand.

## Changed while building (2026-10-19)

- **Another domain also needs visitors to reach it from the website.** The dev
  deployment's properties showed why. ronins.co.uk's property records a dozen
  unrelated sites that copied its tag. Korda's and More Handles' record their
  developers' test sites. Any of these could fire a "contact" event. So an
  address on another domain counts only when a page on it has the website as
  its referrer. A checkout always does, and a copy of the tag never does. This
  is the plan's "copies never count" rule made strict. One more small ask when
  what counts is read.
- **Hakken's choice reads the listed events and sales, not only the ticked
  ones.** So ticking or unticking an event never moves an address, and never
  starts a recount on its own.
- **Tracking health extends two existing checks and adds one.** "Self-referral"
  and "payment referrals" already existed. The self-referral check now also
  names a counted address that shows as a referral. The "visits on another
  address" check no longer names an address whose conversions count. The new
  row, check 13 "conversions on another address", reads a weekly ask that sits
  beside the existing weekly ask of every address's visits. It names an
  address with 3 or more conversions or sales in 30 days. That removes the
  plan's "payment pages" limit, which was already covered.
- **Sales are asked apart only where sales happen on a counted address.** A
  booking page asks nothing extra. A website whose counted address has sales
  is a shop from its first run, so its products are collected from the start.
- **Limits:** at most 50 other addresses are held, the most conversions first.
  The rest stay in the plain "left out" list. Existing connections have their
  events listed again once, on their next run (3 small asks). Only a website
  that gains a counted address is then collected again, whole.
- **Unchecked against Google:** a funnel step that holds to its own addresses
  (`funnelFieldFilter` on `hostName`). Google's documentation allows any
  dimension there, but nothing has asked it yet. **Safety net (Anthony, "Yes",
  2026-10-19):** if Google refuses it, Hakken asks again at once the old way,
  on the website's own address, so "People who converted after it" is never
  missing. The run log says so, naming the addresses left out of it.
- **A run under way when the addresses move (found on NEC, 2026-10-19; fixed at
  Anthony's "Yes").** The connection now notes when the counted addresses last
  moved (`addressesMovedAt`). A run that began before that never marks its
  figures as counted, so the next run collects them again, whole. NEC's first
  run began at 19:29, before this existed and before its shop was read at
  19:57. Nothing NEC counts happens on the shop, so none of its figures
  differ.

## Not in this plan

- Hakken's "Do first" advice on NEC's Connection page tells the admin to tick
  "Chat Shown" and "Chat Opened". Those mean the chat window appeared or was
  opened, not that someone got in touch. That's a separate fault in what reads
  as an enquiry. Raised with Anthony, not fixed.
- NEC's "Book a call" goes to a Google Form on another site, and its phone
  enrolments go to an 0800 number. Google Analytics sees neither. That's NEC's
  tracking, not Hakken's.
