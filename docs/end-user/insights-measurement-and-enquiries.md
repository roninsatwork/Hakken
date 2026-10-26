---
product: Hakken
documentation_type: End-user guide
feature_area: Insights measurement and enquiry attribution
audience: company members
source_repository: roninsatwork/Hakken
source_path: docs/end-user/insights-measurement-and-enquiries.md
last_reviewed: '2026-10-26T12:09:25+00:00'
reviewed_against: current implementation
status: Current
---
# Insights Measurement And Enquiries

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Insights measurement and enquiry attribution
> **Reviewed:** 26 October 2026, 12:09:25 GMT (Europe/London)
> **Source path:** `docs/end-user/insights-measurement-and-enquiries.md` · **Status:** Current

Insights measurement and enquiry views help a company assess what its retained analytics can support before acting on a change in results. They show source readiness, whole-period comparisons, enquiry sources, page and event breakdowns and estimated search contributions. These reports do not establish that every real enquiry was measured, every attribution is certain or a numerical change has a proven cause.

Open Insights and use Measurement at `/app/insights/measurement` or What brings enquiries at `/app/insights/enquiries`. A source detail opens below `/enquiries/source`. Summary uses the same period-comparison foundation. Select the intended owned website and active company before interpreting the figures.

## Choose A Supported Period

The section can offer a whole month, a calendar quarter whose three months are held, or the latest twelve consecutive whole months. It opens on the newest whole month when no valid selection is supplied. A period typed into a URL without suitable retained evidence falls back to an available opening month rather than manufacturing missing data.

Whole means that the retained Analytics source-month record covers its first through last calendar day. It does not mean every other page, event, source or search dataset has complete detail. The reports have additional coverage and row limits that still matter inside an eligible period.

The selected period is compared with the span immediately before and, for a month or quarter, the same span a year earlier when every required month is held. Missing comparison months leave that baseline unavailable. A missing previous value is not a measured zero or a confirmed one-hundred-percent fall.

The twelve-month option does not show a separate same-period-year-ago comparison, which would overlap its previous-twelve-month concept. Retained history is limited, so a full long-term baseline may simply not be available. Do not infer that absent periods prove the business had no earlier visitors.

## Website Selection And Source Windows

Without a website selection, period and enquiry queries prefer the first eligible owned site with some retained history, falling back to the first owned site. They do not add all company sites into one blended funnel. Measurement uses the first eligible owned site for its saved check record, so explicitly selecting the site avoids confusion between these defaults.

Company membership and the website holding govern access. A tracked competitor does not provide your business's private enquiry-history view. Changing the selector reads another permitted context; it does not reconnect Analytics or launch a historical fill.

Most headline enquiry and visit comparisons follow the selected whole-month span. The saved measurement checklist has its own latest analysis week. Journey and estimated search panels use their own retained windows. Check each panel's dates instead of assuming the period menu transforms every dataset on the screen.

## What Measurement Checks Mean

Measurement shows ten checks with Passing, Look, Limit or Unknown status. They address enquiry counting, whether configured ways to enquire occur, possible uncounted enquiry events, values, page assignment, Google/Analytics agreement, Google's page-linked click coverage, tracking continuity, referrals and website scope.

Passing means the implemented check found sufficient supporting evidence under its rule. It is not an audit certificate. Look highlights something to investigate. Limit can identify an upstream evidence restriction rather than a website defect. Unknown means the required evidence is absent or too small to judge reliably.

The enquiry-counting check considers available configured events and potential duplicate-count problems. With fewer than twenty counted events in the retained year and no identified problem, it remains uncertain. A low-volume business should not read that uncertainty as proof its tracking failed.

An event that resembles an enquiry but occurs often without being counted can be flagged. These are naming and health heuristics, not an instruction to count every contact-like event as a qualified lead. Review the actual event meaning and your agreed conversion definition before changing settings.

## Compare Google And Analytics Carefully

The agreement check compares retained Google clicks with retained Analytics visits from Organic Search. Being within twenty percent is Passing under the implemented rule; a larger difference is something to inspect. Clicks and visits are different measurements, so disagreement does not uniquely diagnose a missing tag or consent problem.

The daily chart uses days both sources hold, up to a fifty-six-day window ending at their common available date. Search Console and Analytics can settle on different schedules. Missing days are not padded into a false measured zero merely to draw a continuous comparison.

Google tying fewer than ninety percent of clicks to pages produces a Limit result rather than automatically blaming your site. Private or incomplete upstream detail can prevent page/query totals matching the site headline. Do not “correct” a legitimate source limit by inventing missing rows.

Other checks reuse saved Analytics health, including never-firing counted events, missing values, unknown pages, tracking stops or sudden falls, self/payment referrals and unexpected website hosts. Opening Measurement does not run a live test enquiry, alter tags or apply a repair. Follow the linked source workflow and agree any actual testing separately.

## Read What Brings Enquiries

The enquiry page breaks down retained sources by their own names and groups them into Google, AI assistants, other search, typed/direct, websites, social and other. These are implementation mappings of saved channel/source evidence. A source name is not proof of a person's intent or identity.

Each row can compare visits and enquiries for the selected period, previous period and available year baseline. Sources and landing pages are selected from those present in the current period. Something that existed only in the previous period may not get its own current row, even though aggregate comparisons still include its effect.

Event rows include names from the current and comparison periods and separate event occurrences from enquiry counts. The counted marker here means an event contributed positive recorded enquiries in at least one compared span. An enabled event that never occurred need not appear as counted in this projection; use the source configuration and Tracking health for the actual setup.

Page rows use the company's current classifications and can group Google, AI, typed/direct and other enquiry sources. Classification can change how old evidence is grouped without rewriting the underlying historical events. Not sorted and Not recorded are useful distinctions, rather than a reason to silently drop inconvenient rows.

## Open A Source

A source detail selects the retained source name, combines its keys across possible channels and shows visits and enquiries over time, page kinds and leading pages. The lookup matches its reconstructed source name. It is a saved observation view, not an authenticated session in that external service.

The monthly series uses the whole months available, while the headline and page breakdown use the chosen period. A source absent in the current period can still have historic monthly evidence when reached through an appropriate direct context. An unknown source cannot be turned into measured traffic just by changing its URL parameter.

Page lists are bounded to one hundred fifty leading rows. Sources, main pages and several enquiry panels have their own one-hundred-fifty-row cap. Screen pagination and local CSVs organize those supplied rows; they do not remove the backend bounds.

## Journeys And Estimated Searches

The journey panel shows retained aggregate pages read on the way to recorded enquiries. Its stored from/to dates are separate from the selected period. It does not display identified individual people or prove the exact sequence and motivation of every customer.

Search contributions are estimates because the retained Google and Analytics sources do not directly reveal which private search produced each enquiry. The code allocates a landing page's Google enquiries according to each retained query's share of that page's Google clicks, using an all-page click denominator where available so private queries keep their missing share.

This panel uses the newest three whole months, regardless of the selected period elsewhere. A relatively confident marker requires at least three Google enquiries for the page and at least a quarter of its clicks for the query. That is a heuristic threshold, not a statistical confidence interval or observed end-to-end attribution.

Searches landing on pages with no retained Google enquiries appear separately as clicks without enquiries. This is useful for investigation, but a zero can still reflect incomplete measurement or source scope. Do not present estimated enquiries as signed contracts, revenue or proof that a page change caused a result.

## Why A Figure Moved

The period view evaluates retained evidence for counting changes, market context, rankings, visibility, source changes and conversion. It can split the overall enquiry difference into estimated counting, visitor and rate components that add back to the observed difference. Arithmetic agreement does not prove those components are causal facts.

The explanation can use saved Search Console, Analytics, competitor estimates and a limited Clarity comparison when sufficient common days exist. A detected change in Google's counting can make impressions and average position unsuitable for comparison across that boundary. The report can withhold that comparison rather than treating incompatible definitions as a real commercial decline.

A saved analyst paragraph is used only when its period and comparison match the selected view. Otherwise rule-derived evidence can still be shown without pretending a new narrative was written. Treat words such as likely or ruled out as rule verdicts over available observations and verify critical business decisions independently.

## Retention, Exports And Follow-Up

The Insights history writer keeps a rolling sixteen-month set, thinning old month records during later saves. Reader paths are bounded to two hundred history records per holding. Some whole-span records have separate stored windows. This is not an unlimited source-system archive or an exact-anniversary deletion promise.

Measurement stores a latest check per holding, so its screen is not a complete history of every past health verdict. Local downloads contain the supplied checks, breakdowns or chart series, preserving their actual scope. They do not run a new source export or repair data.

For a practical review, select the site, establish source coverage and the chosen dates, resolve important measurement uncertainty, then investigate the largest relevant enquiry changes. See [Google Analytics](./google-analytics.md), [Search Console](./search-console.md), [Insights Reports And Exports](./insights-reports-and-exports.md) and the [developer guide](../developer/insights-measurement-and-enquiries.md). No local report establishes live integration acceptance or completion of Hakken's planned commercial outcome proof.
