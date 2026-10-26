---
product: Hakken
documentation_type: end-user guide
feature_area: Google Analytics
audience: company members and administrators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/google-analytics.md
last_reviewed: '2026-10-26T08:30:17+00:00'
reviewed_against: current implementation
status: Current
---
# Google Analytics

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Google Analytics
> **Reviewed:** 26 October 2026, 08:30:17 GMT (Europe/London)
> **Source path:** `docs/end-user/google-analytics.md` · **Status:** Current

## What this section does

Google Analytics brings a company's own website traffic and conversion figures into Hakken. Use it to understand where visits came from, which pages people reached, what they did, and which actions your company counts as useful results. It complements Search Console: Search Console describes Google search exposure and clicks, while Analytics describes activity measured on the website. They measure different stages, so their numbers should not be expected to match exactly.

This guide describes local implementation reviewed on 26 October 2026. It does not establish that a particular deployment has connected Google successfully or collected a complete history. [PRODUCT.md](../../PRODUCT.md) still contains an older GA4-unbuilt statement; that discrepancy is recorded in the [documentation inventory](../index.md#documentation-coverage-inventory). The broader product vision, including a complete asset profit-and-loss record, must not be inferred from the existence of this section.

## Who can read and change it

Open Google Analytics from the application navigation, then choose one of your company's own websites. The section starts at `/app/analytics`, with a website's figures under `/app/analytics/<siteId>`. The identifier represents the company's website relationship, not an unrestricted global website record. Members can read their own company's figures. Company administrators and super administrators can connect, choose a property, change conversion choices, and disconnect. A member who can read the figures does not thereby receive permission to change the connection.

Connecting is for owned websites. Watching a competitor in Visibility does not grant access to that competitor's private Analytics. If a website is missing, check that it belongs to the selected company and is recorded as owned. This guide does not establish a subscription entitlement for Analytics: connection authorization is enforced by company ownership and role in the reviewed backend. Deployment configuration and the website's connection state also determine what is available.

## Connect and choose the correct property

An administrator opens the website's **Connection** page and starts Google's sign-in. Use a Google account that can read the website's Analytics property. Hakken uses a Google application configured by the platform operator; if that application is unavailable, the page cannot complete setup. An administrator cannot solve missing platform credentials by repeatedly signing in.

The Analytics sign-in requests read access for Analytics and Search Console together. The two sections can share a sign-in where access permits. An existing working Search Console connection can also remain on a different Google account. Adding Analytics therefore does not require replacing a working Search Console account just to make the names match.

After sign-in, review the properties found. Properties with a web stream matching the website are presented first. When exactly one property matches, Hakken presents it for confirmation and offers a way to see the others. Confirm the property actually records the site you intend to analyse; a similar property name is insufficient evidence. The setup then reads addresses and events before asking what should count. Signing in alone is not the final step: saving the conversion choices establishes the connection and begins collection.

A sign-in is time limited. If its return cannot be completed, start a fresh connection attempt from the page. An account without a suitable property, access left unticked in Google's consent screen, revoked access, or a temporary Google failure can each prevent completion. Read the explanation shown for the attempt before choosing another account or asking the operator for help.

## Decide what counts as a conversion

The next screen lists the property's events, recent counts and available values. Hakken suggests likely useful actions, but the administrator decides which ones count. Scrolling and other routine browsing actions should not be mistaken for an enquiry simply because their counts are large. Inspect the event's technical name as well as its readable label, and review warnings about duplicate or similar events.

Where Analytics provides a value, Hakken uses that value. Where no Analytics value exists, you can assign a value in Hakken, in the property's currency. That is a local reporting assumption: entering it does not write a value back to Google. The page also explains the alternative of setting the value in Analytics. A value must be non-negative and within the application's allowed range. Leaving a useful event without a monetary value is different from proving that the event is worth nothing.

Review **where conversions count** as well as which events count. A property can record several addresses: the main site, a shop, a booking service, or a copy used for testing. The setup shows addresses Hakken identified and whether their conversions should count beside the website's own. Administrators can adjust the offered choices. Visits and pages remain about the website's own addresses; including a shop's conversions does not turn every shop visit into a visit to the main website.

Conversion choices affect reporting history. Changing a tick or a local value can change previously displayed totals without any new customer action occurring. The implementation recalculates figures from retained event counts and values; dependent history may need to be collected again when its definition changes. If a report changes after setup is edited, review the definition before concluding the business improved or declined. Record the business reason for a material measurement change in your own reporting process.

## Read the figures in a useful order

Begin with **Overview** for a summary, then use **Channels** to understand sources and **Campaigns** for tagged links. A channel detail can lead to the pages reached from that source. **Landing pages** examines where visits began and what happened next. **All pages** includes pages viewed beyond the first page of a visit. Those are different questions: a page can be widely viewed without commonly being the entry point.

**Conversions** brings together the actions counted as results and the events behind them. Follow an event or page into its detail view when you need context rather than relying on an aggregate count. **Visitors** describes audience groups recorded by Analytics. **Products** appears for a website identified as a shop; it is not a universal menu item. Use these views to locate a question worth investigating, rather than treating every difference as a recommended change.

The period menu offers This week, Last week, This month, Last month, This quarter, Last quarter and This year. It opens on Last month. Weeks run Monday to Sunday, and comparisons distinguish whole periods from periods still in progress. An incomplete period is compared with corresponding days rather than automatically with the entire preceding period. Check the dates actually shown, especially at the start of a month or when collection has not caught up.

Device and home-country choices refine the stored figures where supported. Choices travel in the address between section pages, making Back and shared links more useful. A different device, country or date range can explain why two people see different totals. Check those choices before escalating an apparent discrepancy. Small samples also matter: the implementation marks conversion rates based on fewer than 100 visits as having few visits. A large percentage movement from a very small base is a weak basis for a business decision.

## Freshness, history and live activity

Most screens read figures already saved by collection. Opening them does not request a fresh full report from Google. The Connection page shows collection timing and how far retained figures reach. New connections begin collection immediately, while scheduled collection continues through the collector agent. A large property can take time to fill; a partially populated history is not evidence that earlier traffic was zero.

The current storage rules retain 92 days at daily detail, older history by week out to approximately a year, and monthly history out to two years. Longer history is filled separately from the initial recent collection. Older charts therefore have coarser detail, and the existence of a two-year retention window does not prove that every newly connected website already has two years available.

Collection respects Google's allowances and can wait for them to recover. Waiting work continues automatically within its nightly budget; later work can resume on another night. Reconnecting repeatedly is not a useful way to accelerate a healthy collection. Check the recorded connection problem, freshness and progress first.

**Live** is an exception to stored reporting. It requests Google's recent activity while the page is open and visible, at most once a minute. It pauses after 30 minutes without interaction, and hidden or closed pages do not keep polling. It includes all countries and describes the recent 30-minute window, so it should not be compared directly with a home-country historical total. Live responses are not retained as a historical log.

## Tracking checks, disconnecting and related help

**Tracking health** shows saved checks, with failures first. Each check opens an explanation of what was found, why it matters and suggested steps. Reading this checklist does not itself ask Google for another report or repair the website's measurement. Use the last checked time to judge whether a recent external correction has been evaluated yet. New failures can notify platform super administrators; a continued failure is not repeatedly announced every week.

Disconnecting requires administrator access and a confirmation. It stops future Analytics collection and records the disconnect time; it does not immediately erase collected figures or delete the Google property. Search Console can remain connected. Google access is released only when no remaining connection needs the shared grant. Removing the company's website relationship is a different operation: the backend schedules removal of that relationship's Analytics data as part of cleanup.

For access questions, see [Login, Access, And Authentication](./login-access-and-authentication.md). Operators and engineers should use the [developer guide](../developer/google-analytics.md) for module boundaries, setup variable names, collection behavior and tests. Report a connection problem with the website, the affected screen, the displayed dates and the visible error; never include access tokens or client secrets.
