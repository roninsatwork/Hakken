---
product: Hakken
documentation_type: End-user guide
feature_area: competitor discovery and content gaps
audience: company website teams
source_repository: roninsatwork/Hakken
source_path: docs/end-user/competitor-discovery-and-gaps.md
last_reviewed: '2026-10-26T11:52:18+00:00'
reviewed_against: current implementation
status: Current
---
# Competitor Discovery And Content Gaps

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** competitor discovery and content gaps
> **Reviewed:** 26 October 2026, 11:52:18 GMT (Europe/London)
> **Source path:** `docs/end-user/competitor-discovery-and-gaps.md` · **Status:** Current

Hakken's competitor reports compare a website with the company's watched group and show other websites found in retained search or AI evidence. They help a team decide which businesses deserve investigation and which searches may be missing from its own coverage. A suggested website is not automatically a verified direct competitor or a newly tracked site.

Open a website in Visibility and select Competitors at `/app/sites/[siteId]/competitors`. Related views include Organic competitors, Suggested competitors, Market map, Content gap and a watched-rival detail. Reports read saved observations and company setup. Viewing, sorting or exporting them does not add a website to tracking or run another supplier request.

## Understand The Watched Group

The active company's website holdings define the group. A report opened on an owned website compares it with applicable held rivals; navigation from a tracked site can compare that site with the rest of its group. A website shared in the underlying supplier data does not expose another company's private tracking choices.

Group membership and discovered competition are different. The company chooses watched competitors through its supported administration workflow, subject to limits. Organic discovery can also find directories, publishers, suppliers and other websites ranking for similar searches. Those records remain useful labeled evidence even when they are not businesses selling the same service.

If a rival seems unsuitable, inspect its website and the reason it was suggested before changing setup. Removing or dismissing tracking is a separate action with collection implications. A report verdict alone does not remove a competitor, change a plan or stop a paid operation.

## Read The Main Comparison

The main table compares observed search positions and AI-answer naming over the company's selected private lists. Beats you counts compared searches where the rival has an observed better position or your website lacks an observed place. You beat counts the reverse. Equal positions or mutual absence do not force a winner.

Compared searches is a bounded sample, not every keyword either website ranks for. The query considers up to three hundred standing candidates, then compares at most one hundred searches per rival, sharing a 2,500-read budget across the group. Larger groups can therefore compare fewer searches for each rival. Do not interpret a small beats-you count without its compared-on count.

The comparison aligns a rival's position with the list's latest check so an old place is not automatically treated as current after the rival falls off the observed page. This does not make every provider source perfectly simultaneous. Check saved days and tracking coverage before treating a difference as a recent competitive event.

AI naming counts use answers to active private questions and selected engines. The same answer can name several websites. Named-answer counts are not exclusive shares, and the answers-counted denominator belongs to those selected observations rather than all public conversations or the supplier's entire question database.

## Treat Verdicts As Heuristics

Verdicts summarize the comparison with fixed thresholds. A holding less than twenty-eight days old is Too new. With no usable last-seen evidence it is Not checked. Evidence not seen for at least fifty-six days can become Gone quiet. Otherwise the relative beats counts determine Ahead, Behind or Level.

Those labels are implementation opinions about observed evidence. Gone quiet does not prove the business closed, and Ahead does not establish greater sales or market share. A newly tracked strong competitor can still be Too new because the holding's age takes precedence in that verdict rule.

Keep the date, sample size and data source in any handoff. If a verdict conflicts with what you know about the business, investigate coverage and group membership before trying to improve the verdict number itself.

## Organic Competitors

Organic competitors lists up to three hundred stored discovery candidates for the company holding, ordered by keyword overlap. It can show category, overlap, average position, estimated traffic, whole-domain keyword and traffic figures, tracked state and discovery day. Different columns concern different scopes.

Shared searches measures overlap found by discovery. Whole-domain keywords and traffic describe the candidate's wider domain evidence where supplied. Do not substitute an overlap count for the size of the whole domain, or interpret estimated traffic as measured Analytics sessions.

The supplier's overall discovery total can exceed the rows Hakken retains or displays. A count beside the report is not proof that every candidate has a readable row or complete classification. Missing category or domain figures remain missing rather than confirming the website has no relevant activity.

Classification can be absent when the configured decision is off or has not produced a result. A category is an aid to choosing suitable comparisons, not an external business-identity certification. The report does not automatically hide every non-competitor type.

## Suggested Competitors

Suggested competitors combines websites often named by answers to your private questions with retained organic discoveries. It prioritizes up to ten eligible AI-named suggestions, then organic candidates with the greatest overlap. The reasons indicate which evidence led to the suggestion; the two numerical measures should not be treated as equivalent scores.

Websites already held anywhere in the company are excluded, even if held beside another owned website. Organic discovery records already decided about are also excluded. This avoids offering a website that cannot simply be added again through the normal company-holding rule.

The customer suggestion page is read-only. Administrative acceptance uses the normal competitor-tracking workflow; dismissal records a decision instead of deleting the evidence, so a later discovery run should not casually resurrect that organic suggestion. Viewing a row or opening its public website does not count as acceptance.

Do not confuse an AI-named business with a confirmed search rival. It may be a publisher, directory or similarly named organization. Review the identity and business context with the person responsible for tracking before requesting a collection-changing action.

## Market Map

The market map positions the open website, held rivals and discovered candidates using whole-domain keyword and estimated-traffic figures. Held sites use their own saved site figures; discovered candidates use available discovery domain metrics. Their dates can differ.

Candidates without either domain keyword or traffic information can be absent from the map even when they appear in Organic competitors. The chart is therefore not the full discovery list and not a geographical local-market map. It compares search scale, not physical proximity.

Roles distinguish you, watched rival and found candidate. Being visually close on the chart does not prove the two businesses sell the same product, share customers or have equal commercial results. Use the map to choose investigations, then inspect overlap and saved dates.

## Content Gap

Content gap at `/competitors/gap` is for an owned website. Tracked competitor holdings return the explanatory empty scope. The report compares current keyword copies: searches a rival currently ranks for that your site currently does not. It does not generate an article, publish a page or buy another search request while you read it.

The report can be preparing when your own keyword copy is not ready. A rival without a ready copy contributes no rows until its evidence is available. Empty or small gaps therefore require a coverage check before concluding the website already covers every worthwhile search.

The calculation considers up to twenty-five rivals, each bounded to five thousand highest-volume current keywords, and retains at most fifty thousand gap searches. These are implementation ceilings, not promised collection coverage. A cut warning means there can be more candidates beyond the retained result.

Each row can show volume, intent, difficulty and separate rival position/traffic columns. Filters include text, intent and a minimum number of rivals ranking. Heading sorting runs across the retained filtered list; selecting a rival position or traffic column orders by that rival's evidence. Blank columns mean that rival has no corresponding retained ranking for that row.

The report's narrative summary describes the whole computed gap, independent of visible filters. It can mention a search excluded by your current filter. A gap keyword's volume is the largest available among its contributing rows, and its difficulty is available saved evidence, not a fresh difficulty calculation on every view.

## Rival Detail And Recent Moves

A watched-rival detail combines shared-search evidence, trend figures and a bounded set of AI-cited pages from answers to your private questions. Broad discovery overlap can exceed the saved shared-search list. Citation examples are capped and do not represent everything an assistant has ever cited for that business.

Recent moves reads up to four hundred high-volume keyword rows per rival. New searches exclude rows from that bounded sample's earliest first-seen day, avoiding presenting the first import as all new activity. Climbed and fell describe current row statuses, while new-search counts follow the selected date interval. Those measures need not cover identical periods.

The checked flag and last-check date help distinguish an interval with an observation from one between collection runs. Estimated visits come from saved period-end figures. A missing visit figure or no new search is not proof a competitor stopped operating or lost every customer.

## Export And Follow Up

Local report downloads and charts represent their supplied retained rows or series. The shared server export has its own kind, row and byte bounds, and screen text/filter state is not automatically part of every download contract. Check the particular control and completeness indication before assuming a file exactly matches the visible table.

Use the reports to identify suitable rivals, prioritize relevant search gaps and prepare a source-backed content investigation. Verify business identity, current page purpose and observation dates before changing tracking or commissioning content. See [Organic Keywords And Pages](./organic-keywords-and-pages.md), [Brand Radar](./brand-radar.md), [AI Questions And Answers](./ai-questions-and-answers.md) and the [developer guide](../developer/competitor-discovery-and-gaps.md) for adjacent evidence and implementation boundaries.
