# Product Research

The evidence base behind [PRODUCT.md](../../PRODUCT.md). Part One of PRODUCT.md
is a summary of this set; these documents hold the reasoning, the numbers and
the sources.

**These are dated research documents, not living specifications.** They record
what was true and what was believed on the date each was prepared. Do not edit
them to match later decisions — supersede them with a new document, or record
the change in PRODUCT.md's change log. Where a research document and PRODUCT.md
disagree about what is *built*, PRODUCT.md is right. Where they disagree about
*strategy*, the later document wins, and the dates below say which that is.

## The set

| Document | Prepared | What it settles |
|---|---|---|
| [App vision v2.3](./app-vision-v2.md) | 20 Sept 2026 | The current plan in full: what Hakken is, who it's for, the weekly loop, the engine, the moat, pricing, and the six phases. Supersedes v1.x. |
| [AI visibility landscape](./ai-visibility-landscape-sept-2026.md) | 11 Sept 2026, updated 18 Sept | Forty competitors by tier — enterprise platforms, mid-market, SEO suites, local and listings, growth-automation engines — with funding, pricing, a feature matrix and the unit-economics model. |
| [Data sources and integrations](./data-sources-and-integrations-sept-2026.md) | 11 Sept 2026, updated 18 Sept | Every data source by layer (what the engines cite, what customers ask, what happened, what is true, directories and listings, the client's own site, e-commerce), with read/write access, cost, priority, the legal exposure on each, and the recommended build order. |
| [Research gaps closed](./research-gaps-closed-sept-2026.md) | 11 Sept 2026, updated 18 Sept | Market size by vertical, willingness-to-pay evidence, platform risk (ads inside AI answers, terms of service, retrieval volatility), the incumbents' published roadmaps, the legal position, and **the two live test protocols in appendices A and B**. |
| [Research note: Dooley's search stack](./research-note-dooley-search-stack-sept-2026.md) | 18 Sept 2026 | The six-layer SEO/SMO/AEO/GEO/DEO/SXO frame, where it agrees with the thesis and where it stops. Source of "decision-ready" and "share of AI decisions". |

## Not in this repository

Referenced by the documents above but held elsewhere:

- `unit-economics-model.xlsx` — the working cost and margin model. All inputs
  editable; the landscape report's §8 quotes its defaults.

## Phase 0 is not done

Two tests gate the build, both fully specified in the research-gaps report:

1. **The DataForSEO query test** (appendix A) — twenty prompts, four verticals,
   three towns, five engines, through the sandbox and a $50 top-up. Settles
   billable rows per prompt, UK coverage per engine, and the real
   cited-versus-chosen pattern. Under £40, one afternoon.
2. **Owner interviews and the pre-order test** (appendix B) — twenty
   conversations plus a landing page with £500 of ad spend. Two weeks.

Both protocols were written for the earlier sole-trader framing and carry
annotated re-cuts for the current customer set. Neither has been run. Their
results belong in PRODUCT.md §19 (open questions) when they land.
