---
product: Hakken
documentation_type: end-user guide
feature_area: Microsoft Clarity
audience: company members and administrators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/microsoft-clarity.md
last_reviewed: '2026-10-26T09:13:34+00:00'
reviewed_against: current implementation
status: Current
---
# Microsoft Clarity

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Microsoft Clarity
> **Reviewed:** 26 October 2026, 09:13:34 GMT (Europe/London)
> **Source path:** `docs/end-user/microsoft-clarity.md` · **Status:** Current

## What Clarity helps you inspect

Microsoft Clarity supplies observations about how people use an owned
website: visits, scrolling, time engaged, frustration signals, errors and
selected recording links. In Hakken it complements search and conversion
reports. Use it to examine a page that people reach but struggle to use,
rather than treating every search-performance problem as a ranking problem.

Open `/app/clarity` and choose an owned website. Its section contains
Overview, Pages, an individual page view, Errors, Recordings and Connection.
The website's header identifies the site, connection state and freshness.
This guide describes local implementation reviewed on the date above. It
does not prove a live project has been connected or a deployment has collected
complete data.

Clarity's observations are a separate source from
[Google Analytics](./google-analytics.md) and
[Search Console](./search-console.md). Their populations, bot treatment,
collection windows and measurements can differ. A visit count that does not
match Analytics is a reason to inspect definitions and coverage, not evidence
that one service must be broken.

## Connect the correct owned website

A company administrator or super administrator connects Clarity using the
website's Connection page. Ordinary members can read authorized company
figures but cannot supply or replace the project's token. A tracked
competitor is not eligible merely because its host appears in Visibility.
Company ownership and connection permission are checked on the backend.

The setup asks for the Clarity project's Data Export token. Obtain it from
the intended project and paste it into the password-style field on the
Connection screen. Do not paste it into Ask Hakken, an ordinary message,
a support ticket or a documentation file. Connecting tests the token with
one provider request and stores it encrypted if the test succeeds. The
screen does not show the original token back afterward.

This is a different setup from Google's browser consent. A working Google
Analytics connection does not create a Clarity project or token. The platform
must also have encrypted-token storage configured. If the token is refused,
check the correct project and permissions with its owner rather than
repeatedly submitting the same secret.

Successful connection ensures the Clarity collector and its schedule exist.
That is not a promise of an immediate complete historical import. The
Connection page distinguishes waiting for its first figures from a recorded
last-read time and can show today's request usage and a connection problem.
Use those details before interpreting an empty page as zero activity.

## Understand the source window and request allowance

The collector is designed around a short source export window. It asks for
missing recent days while the source can still provide them, then stores
history in Hakken. A newly connected website cannot reconstruct months of
behavior merely because Hakken has room to keep months later. An outage
lasting beyond the source window can leave a permanent historical gap.

The implementation budgets ten project requests per day and keeps two in
reserve. Recent daily figures take priority, followed by source/browser
breakdowns and a few selected recordings when allowance remains. Recording
requests are conservatively counted against the same budget because the
provider's treatment is uncertain in the source implementation. These are
the application's current assumptions, not a fresh external quota audit.

Do not repeatedly reconnect or manually start collection to accelerate a
healthy run. Connecting itself tests the token and consumes a request.
If a day or breakdown is absent, ask which work was completed and what
allowance remains before requesting more. The normal morning schedule can
catch up a missed recent day without a person pressing a retry button.

## Read Overview and choose comparable dates

Overview summarizes retained Clarity figures. Check the selected period,
device and recorded coverage before interpreting its changes. The section
uses shared calendar periods and shows how many days actually contributed.
A month label does not mean the website has a full month's observations.
A new connection whose first data falls in the current month can open on
This month to avoid presenting an empty preceding month.

Device choices use Clarity's own categories. Compare a phone problem with
the relevant device rather than assuming a whole-website average describes
every visitor. A page used mostly on phones can have a different experience
from a desktop-heavy page without either having changed over time.

Metrics include visits, scroll depth, active time and frustration/error
signals where collected. Hakken stores totals to support weighted measures;
source and browser breakdowns can cover fewer days than main figures.
Missing values and shorter coverage should remain visible qualifications.
Do not label a missing older error count as proof there were no errors.

## Investigate a page or error

Pages lets you compare site pages and open one for more detail. The page
view can show visits, scrolling, engaged time and quick-back behavior beside
the site's context and the preceding comparable span. It also brings together
errors by browser/device, related recordings and source breakdowns. Follow
the page address as well as its title so you inspect the intended content.

A dead click or rage-click signal describes observed interaction patterns,
not the user's motive. A low scroll average can be expected on a short page
or a page whose useful answer is near the top. Use multiple signals and the
page's purpose before proposing a redesign. A friction signal does not prove
a particular amount of lost revenue.

The Errors view helps locate where recorded failures concentrate. Inspect
the browser/device and sample size before deciding the issue is universal.
A new field introduced after the beginning of the selected period can have
less coverage than visits. The page's notes distinguish that from a genuine
zero where the data supports it.

Large source answers can be cut at the provider's row limit. Hakken records
that condition, because quieter pages may be missing even while the website
total exists. A page absent from a limited list is not necessarily a page
with no visits. Use the displayed coverage notice when explaining which
part of the site was observed.

## Recordings and heatmaps

The recording list contains selected links, not an archive of every visitor
session. The collector chooses a few potentially useful recordings within
its remaining request budget. Their presence supports investigation of the
recorded interaction; their absence does not establish that nobody
encountered a problem.

Recordings shows the retained selections without the normal historical
period and device controls. A page view can offer a related recording and
a link to open its heatmap in Clarity. Those links take you to the source
service and may require the appropriate project access. Hakken does not
promise that a provider link remains playable after the source expires it.

Apply your organization's data-handling rules when watching or sharing a
recording. The feature guide does not establish legal consent or a
compliance determination for your website. Avoid forwarding visitor-related
links or tokens in ordinary support messages; explain the page, signal and
relevant observation date instead.

## Retention, disconnecting and support

Current implementation keeps main daily figures for 180 days, daily
source/browser splits for 90 days, monthly records for 13 months and selected
recording links for 30 days. These are different retention shapes, not a
single duration for all Clarity information. Cleanup uses the newest held
data and bounded work, so a disconnected site's data is not necessarily
erased on a wall-clock anniversary.

Disconnecting removes the saved token and marks the connection disconnected
while retained figures remain. It is not remote deletion of the Clarity
project, revocation of every provider token or a verified purge of all
related history. A formal deletion request requires the operator to inspect
the actual retention/cleanup paths; this review did not establish complete
hold-removal cleanup for Clarity.

If access is refused later, the collector can mark Needs reconnecting and
notify company administrators in the bell once. Investigate whether the
project token changed or became invalid. A stopped connection and a healthy
connection awaiting the next morning are different states; copying the same
secret repeatedly does not resolve that distinction.

For useful support, provide the company, website, connection state, period,
device, coverage days and affected page or error. Do not include the Data
Export token. The [developer guide](../developer/microsoft-clarity.md) explains
storage, quotas, aggregation and the remaining cleanup uncertainty. This
documentation review connected no project, fetched no recording and started
no collector.
