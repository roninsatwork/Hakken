---
product: Hakken
documentation_type: developer guide
feature_area: Microsoft Clarity
audience: developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/microsoft-clarity.md
last_reviewed: '2026-10-26T15:16:13+00:00'
reviewed_against: current implementation
status: Current
---
# Microsoft Clarity

> **Product:** Hakken · **Document type:** developer guide · **Feature area:** Microsoft Clarity
> **Reviewed:** 26 October 2026, 15:16:13 GMT (Europe/London)
> **Source path:** `docs/developer/microsoft-clarity.md` · **Status:** Current


## Modules and feature boundary

Microsoft Clarity is implemented in `convex/clarity.ts`,
`clarityAgentRun.ts`, `clarityScreens.ts`, `claritySchema.ts` and pure row,
packing, recording and collector-definition helpers under `convex/utils/`.
The frontend lives under `src/app/(dashboard)/app/clarity/`. This guide covers
connection, collection, retained data and the screen read contracts. It is
not evidence of deployed provider acceptance or a legal determination about
website recording.

`_components/useClarity.ts` shares website, period and device state. The site
layout shows only an owned site, carries date/device choices and omits
those controls for Recordings. `openingPeriod` handles a connection whose
oldest day is in the current month. The source calendar periods, provider
coverage and retained days remain separate facts.

## Connection authorization and secrets

`connectClarity` is an `adminAction`. It trims the supplied token, rejects an
obviously short input and calls the internal `canConnect` query with the
resolved active company and user. That query checks the hold belongs to the
company, its relationship is explicitly OWNED and the user is ADMIN or
SUPER_ADMIN. Do not replace that with an unchecked host argument or assume
a global website grants access.

The action tests the token with `askClarity(token, "Device")`, encrypts it
using `encryptConnectorToken` and calls `saveConnection`. Encryption depends
on `CONNECTOR_TOKEN_ENCRYPTION_KEY`; the per-project Data Export token is
connection data rather than a hardcoded application environment variable.
It must not be included in client status or logging. A successful token test
is an actual provider request, not a reversible local validation command.

`disconnectClarity` uses a tenant mutation with an explicit administrator
role check and `requireMySite`. It marks DISCONNECTED and clears ciphertext
without deleting retained figures. This is not implemented remote token
revocation or project deletion. Status and list reads use tenant queries;
`clarityScreens` calls `requireMySite` for individual report reads.

## Collector and request budget

`clarityAgentRun.ensureClarityCollector` creates the system role
MICROSOFT_CLARITY_COLLECTOR and its initial morning schedule without replacing
an administrator's activation switch or changed schedule. The default is
05:50 Europe/London. Regular work creates a run for each connected website,
with starts staggered by three seconds. The role executes plain collection
code rather than a model conversation.

`utils/clarityCollectorAgent.ts` defines a ten-request daily allowance with
two requests kept in reserve, a three-day source window and request costs
for main daily data, splits and selected recordings. The collector prioritizes
missing recent daily figures, then yesterday's source/browser breakdowns,
then recordings within the remaining budget. Recordings are counted
conservatively against the export allowance; the source comments explicitly
say Microsoft's quota treatment for that endpoint is uncertain.

`askClarity` targets the Data Export endpoint and `askRecordings` the sample
recording endpoint. A refused token becomes NEEDS_RECONNECT with a recorded
problem and a bounded administrator notification. Missing recent days can
be recovered only while the source still supplies them; no code can recreate
expired source detail by increasing the retained-history limit.

Do not run a token test, reconnect loop, collector or recording request while
performing documentation maintenance. Those consume real allowance and may
expose visitor-related information. The implementation's quota assumptions
have been read from source, not independently verified against a live account.

## Totals, parts and source coverage

`utils/clarityRows.ts` defines additive stored measures rather than storing
only averages: visits, bots, scroll/time sums, counts of frustration/error
signals, users and page totals. `measuresOf` derives presentation measures
from the stored totals. Preserve weighting when combining days or devices;
an average of page averages need not equal the website's own average.

The collector asks for website/device and page/device figures separately.
A page row, whole-site row and a source/browser split are different
populations. Main visits exclude counted bot visits and keep bots separately.
`CLARITY_ROWS_AN_ANSWER` and cut markers preserve the provider's row-limit
boundary. A complete website total does not establish that every page row
was returned.

`pageParts` orders rows by page and device and avoids splitting one page's
rows across boundaries. Daily page parts use 250 rows, while larger prepared
parts use 4,000. `readPageRows` can then locate a page's relevant part instead
of loading every page for every historical day. A new dimension must preserve
that ordering/index relationship rather than make a fast page read scan the
whole property's history.

`keepDay` replaces the existing day's parts for that span/kind and stores a
separate whole-site part. `saveDay`, `rebuildFigures` and `buildSpan` maintain
month and calendar-period records from the collected totals. Executable
span definitions are DAY, MONTH, PERIOD and PERIOD_BEFORE; older comments
referring to newly built 7/30/90-day rolling periods are historical.

## Schema, screen reads and uncertainty markers

`claritySchema.ts` defines `clarityConnections`, `clarityFigures` and
`clarityRecordings`. Connections use `by_hold` and `by_status`. Figure indexes
include `by_hold_span_part`, `by_hold_span_kind_key` and
`by_hold_span_kind_key_page`; recording selections use `by_hold_day`.
Connection state and secret ciphertext are not an invitation to return
complete connection rows to browsers.

`clarityScreens.ts` exports `clarityOverview`, `clarityPagesList`,
`clarityPagesAll`, `clarityPage`, `clarityErrors` and
`clarityRecordingsList`. Ordinary screen loads read prepared saved figures,
not another full provider export. The page detail can include provider links
for heatmaps and recording playback; opening the provider service is a
separate access/data exposure boundary.

The read shape records actual days and spans, `firstDay`, `countedFrom`, page
coverage, cut days and waiting/newest state. Days before new error/user/page
fields were collected must not be rendered as measured zero. The selected
calendar period can legitimately contain fewer recorded days than its label.
Preserve those markers in exports and Assistant lookups as well as cards.

`device` uses Clarity's PC, Mobile and Tablet categories. The comparison
should stay within Clarity's own source; another tool's visit or session
count is not an interchangeable denominator. Small-sample and absent-value
presentation belongs to the shared Clarity helpers rather than a local
screen-specific guess.

## Retention and incomplete deletion evidence

Constants in `clarity.ts` retain main daily figures for 180 days, daily
source/browser splits for 90, selected recordings for 30 and months for 13.
`tidyFigures` performs bounded deletion relative to the connection's newest
held day/month. This is not a guarantee that a disconnected connection's
rows expire at a fixed wall-clock time without further collection/cleanup.
A retained recording link is also not a promise of provider playback after
its own retention period.

`disconnectClarity` deliberately leaves figures. This review searched
`googleConnection.ts` and website purge modules for Clarity-specific hold
cleanup and did not establish a complete removal cascade for connections,
figures and recordings. That is an unresolved implementation/retention
question, not permission to add a cascade during documentation work. Keep it
in the coverage inventory and do not advertise company-site removal as a
verified permanent Clarity purge until the actual path is reviewed or fixed.

## Tests and operational handoff

`clarity.test.ts` covers replacement, prepared periods, packed data and
retention; `clarityAgentRun.test.ts` covers collector behavior;
`clarityScale.test.ts` covers large-record/read shapes; and
`clarityScreens.test.ts` covers reader output. Pure tests under
`utils/clarityRows.test.ts` and `utils/clarityPacks.test.ts` verify aggregation
and packing. Read those contracts before adding another dimension or field.

This pass inspected selected implementation and test declarations but ran
no application gates, collector, token test, export, recording fetch or
browser session. The [user guide](../end-user/microsoft-clarity.md) explains
setup, source coverage and the retention distinction. For an operational
issue, identify the hold, connection state, last collected day, allowance
used and missing data kind before proposing a new run. A missing or revoked
token needs a person; an expected scheduled wait does not require a manual
retry button.

## Retention and removal handoff

A disconnect, a collection failure and removal of a website holding are different events. Disconnect retains already collected figures; the source search did not establish a complete holding-removal cascade for Clarity. Before promising erasure, trace both connection ownership and retained report rows in a separately authorized implementation task. Do not use a missing token or an empty current-period screen as evidence that all older private data has been deleted.
