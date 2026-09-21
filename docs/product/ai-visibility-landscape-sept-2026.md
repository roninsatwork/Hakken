# Hakken — AI visibility and GEO tools: competitive landscape

**20 September 2026: the product is now named Hakken (発見, discovery). References below to "the product" or "the platform" mean Hakken; the current plan is app-vision-v2.md.**


**Prepared 11 September 2026. For internal strategy use.**

**Update 18 September 2026.** The target market is now fixed as e-commerce retailers, agencies (running the product on their clients, with the workspace owned by the business), and businesses that need leads and sales. Earlier references in this document to plumbers, trades and local sole traders are superseded and should be read as the general "lead-driven business" case; e-commerce is a launch loop, not a second product; multi-tenant and white-label are phase-one scope. The current plan is app-vision-v2.md.

**Update 14 September 2026.** Since this report was written the vision has moved on in three ways, recorded in app-vision-v1.1: the target is established businesses wanting leads or sales (and, second, e-commerce stores), not sole traders on free website builders; the business launches as a Ronins service run on our own software, with self-serve as an option rather than the plan; and pricing has moved to £500 to £2,000 a month for the service and £79 to £249 for any self-serve tier. Sections 7 and 8 below reflect the original small-business framing and are annotated where that matters.

---

## 1. The short version

The category is roughly eighteen months old, has absorbed north of $300 million in venture funding, and already has a clear leader (Profound), a fast challenger (Peec AI), a budget floor (Otterly at $29 a month, HubSpot's grader for free), and two exits (Scrunch to Sitecore for around $225 million, XFunnel to HubSpot for around $30 million). Roughly forty products are competing, most of them indistinguishable: pick some prompts, run them against ChatGPT, Perplexity, Gemini and Google's AI surfaces, report who got mentioned and which pages were cited.

Three findings matter for us.

First, the market has diagnosed its own weakness and keeps saying it out loud. Nearly every review of every tool ends with the same complaint: it measures, it doesn't act. Profound is criticised for focusing on reporting over recommendations. Otterly is described as stopping at monitoring. Peec is praised as a diagnostic layer that assumes you already have a content operation underneath it. The "fixing" gap we identified is real and widely acknowledged.

Second, that gap is closing at the enterprise and mid-market end. Profound has shipped Agents on a credit system, Peec has an Actions engine, Scrunch has an Agent Experience Platform that delivers content to AI crawlers at the CDN layer, and a cluster of small tools (Rankability, Analyze AI, Geoptie, Bloomiro, GetMint) are pitching "tracking plus fixes". None of them has combined it with listings sync, Search Console attribution and a plain-English small-business product, but the direction of travel is obvious.

Third, the small-business and local end is almost untouched by the well-funded players, and the data says it's where the pain is sharpest. SOCi's 2026 Local Visibility Index found ChatGPT recommends just 1.2% of 350,000 business locations it analysed, against 35.9% appearing in Google's local pack. Yext reports that listings and directories supply over half the distinct URLs AI engines cite for local brands. The local incumbents (Yext, Uberall, BrightLocal) are either enterprise-priced, still maturing, or don't track AI at all. The newcomers here (Pantora, Local Vitals, Ayzeo, Frizerly) are tiny, mostly US, and mostly agencies with a scan tool bolted on.

The window is real but it isn't wide. Six to twelve months before someone credible owns "AI visibility for small businesses, done for you" in the UK.

---

## 2. Why the category exists: the numbers

The underlying shift is well documented, though every source measures it differently.

ChatGPT dominates usage share of standalone AI assistants (StatCounter puts it around 77% in April 2026, Similarweb's web-traffic measure around 53%, both trending down as the category grows). Claude is the fastest-growing platform proportionally, and generates the highest conversion rate of any AI referrer at around 17%. Gemini benefits from Android and Google distribution. Google AI Overviews now appear in roughly half of tracked queries and a randomised field experiment measured a 38% drop in organic clicks when they appear.

AI referral traffic is still small in volume, around 1% of global web traffic, but converts at several times the rate of organic search (figures of 7% to 14% appear across Similarweb and agency panels, against a Google organic baseline near 3%). Similarweb's brand visibility work puts AI ahead of search two-to-one at the discovery and evaluation stages of a purchase journey.

For the UK specifically, one small-business-focused source cites 51% of UK adults now searching with AI tools; BrightLocal's 2026 survey puts consumer use of AI for local business discovery at 45%. Treat the exact figures with caution; the direction is not in doubt.

Two structural facts shape what works. Around 84% of AI citations come from earned and third-party media rather than brand-owned pages (Muck Rack, May 2026), and 40 to 55% of ChatGPT Search and Perplexity citations flow to fewer than a thousand domains (BrightEdge, Ahrefs). Being cited is mostly about being corroborated elsewhere, not about publishing more.

---

## 3. The landscape by tier

### 3.1 Venture-backed enterprise platforms

**Profound** is the category leader by every measure. Around $155 million raised, a $1 billion valuation, Fortune 500 logos, named the definitive AEO leader in G2's Winter 2026 report. Self-serve pricing starts at $99 a month for ChatGPT only, $399 for three engines and 100 prompts with 400 Agent credits, and enterprise deals reportedly run $2,000 to $5,000-plus a month. Features: prompt-volume data, citation tracking, historical time series, AI bot and crawler analytics (needs CDN integration), ChatGPT Shopping visibility, agency pitch workspaces, and Agents that generate and optimise content on a credit model. Criticised for price, a steep learning curve, reporting-first orientation, and reports of technical instability.

**Bluefish AI** has raised about $68 million and sells a five-module enterprise platform (monitoring, GEO optimisation, measurement, commerce, accuracy) at roughly $4,000 a month. Demo-led, no published pricing. One mid-2026 roundup flagged it as possibly inactive; verify before treating it as a live competitor.

**Evertune** positions as a measurement company, grounding AI visibility in a claimed 150-million-person consumer panel and extending into AI advertising. Analyses over a million prompts per brand per month. Enterprise only.

**Scrunch AI** was acquired by Sitecore in June 2026 for around $225 million. Still sold standalone (Core from $250 a month, 125 prompts, four platforms) but the roadmap is being pulled into Sitecore's digital experience platform. Its distinctive asset is the Agent Experience Platform, which serves AI-optimised content to crawlers at the CDN layer. That's the closest anyone has come to "being usable by agents", and it's now owned by a CMS vendor.

**Brandlight** and **AthenaHQ** are the smaller enterprise plays. AthenaHQ raised a $2.2 million seed from Y Combinator with founders from Google Search and DeepMind, has passed 100 paying customers, and prices from $95 a month annual (agency and white-label ready) up to $900 for growth plans. Brandlight is recognised by CB Insights alongside Bluefish and leans on forecasting and cross-source mapping.

### 3.2 Mid-market and self-serve

**Peec AI** (Berlin, founded 2025) is the story of the category. $29 million raised, $4 million ARR at its Series A in November 2025, around $10 million ARR by May 2026 with 2,500-plus customers, over 3,000 by August, adding 300-plus customers a month. Pricing €70 to €360 a month annual, three engines per plan with paid add-ons, a separate agency track from around €205 with credits across client brands, unlimited seats, Looker Studio and API. Cut prices 16% in July 2026. Best-in-category sentiment analysis and citation-source reports. Now shipping an Actions engine and crawler analytics. Widely described as a measurement layer that assumes you bring the execution.

**Otterly.AI** is the accessible entry point. From $29 a month (Lite) to around $189 (Standard), free tier available, Gartner Cool Vendor 2025. Tracks six engines daily, multi-country, Looker Studio, GA integration, white-label reporting for agencies. Explicitly stops at monitoring.

**The long tail** includes Trakkr ($100 a month, eight engines, Reddit monitoring, crawler analytics, white-label portals), Rankscale and Rankshift (broadest coverage at the lowest prices), Menra ($69, nine engines), Sanbi ($37), xSeek (twelve-plus models), Geoptie ($79, citation tracking plus per-page recommendations), Bloomiro (small teams, "tracking plus fixes"), Promptwatch (persona-first), Knowatoa, Goodie AI (attribution-focused, Agentic Commerce Optimizer), Airefs, SE Visible, ZipTie, Cairrot, Waikay and thirty more. A pricing survey of 28 tools puts the category median at $95 a month and the mean around $138; another survey of 30-plus tools puts the average at $337. The spread tells you the category has not yet settled on what a fair price is.

### 3.3 Incumbent SEO suites and content tools

**Semrush**, now inside Adobe (acquisition completed mid-2026), sells an AI Visibility Toolkit at $99 a month per domain or bundles it into Semrush One from $199. Tracks 25 to 100 prompts daily across ChatGPT, Google AI, Gemini and Perplexity. Keyword-style manual prompt entry, no autonomous prompt discovery. The cheapest way for an existing Semrush customer to add AI tracking, and the likeliest default for any marketing team already paying for the suite.

**Ahrefs Brand Radar** is the ambitious one: $199 per AI platform per month or $699 for all six, on top of a $129-plus base plan, so $828 to $1,148 a month all-in. What you get is a database of 260 million-plus real user prompts, citation-to-URL mapping, YouTube, TikTok and Reddit mention tracking in beta, and Agent A, an autonomous assistant with access to the full Ahrefs dataset. Enterprise-priced by design.

**Conductor**, **SE Ranking** (SE Visible) and **seoClarity** have bolted AI modules onto enterprise SEO platforms.

On the content side, **Surfer** has added an AI Tracker to its content optimisation suite (visibility score, mention rate, share of voice, sentiment). **Clearscope**, **Frase**, **MarketMuse** and **NeuronWriter** have added AI-visibility signals to their scoring. **Writesonic** offers GEO prompt tiers for localised content. **AirOps** automates content production for agencies and has a free Insights tier covering ChatGPT. Reviewers consistently say none of these is a complete GEO solution; a serious programme still needs a separate tracker plus disciplined analytics.

### 3.4 Platform-bundled and free

**HubSpot** offers a free AEO Grader (one-off, three engines, five-dimension score) and a $50 a month AEO product with 25 prompts and a 28-day trial, following its XFunnel acquisition. Single-brand, so agencies outgrow it, but it resets the price floor and it's the default for HubSpot's installed base.

Expect Wix, Squarespace, GoDaddy and Shopify to bundle basic AI visibility scores within the next year. That's the real long-term threat to a monitoring-only product for small businesses.

### 3.5 Local and listings platforms

This is the tier closest to our thinking and the one the venture-backed players ignore.

**Yext** manages four million-plus locations, distributes to 200-plus publishers directly, and now positions its Knowledge Graph as the thing that lets AI engines understand rather than merely read a business. It publishes research showing listings supply over half the URLs AI engines cite for local brands. Enterprise pricing, enterprise sales motion.

**Uberall** (European, SMB to mid-market) has added UB-I for task automation and GEO Studio for AI visibility monitoring; both described as in-market but still maturing.

**BrightLocal** does not track AI visibility at all as of mid-2026, is raising prices 5 to 10% for new subscribers from July 2026, charges $1,299 a month for its managed service, and does not bundle API access. The most widely used local-SEO reporting tool in the UK agency market has a hole where our product sits.

**Local Falcon** has quietly become the most complete AI visibility tool in local SEO: every plan from $24.99 includes ChatGPT, Gemini, Perplexity, Grok and Google AI Mode tracking alongside its geo-grid rank scans. **Synup** bundles a full API and white-label for agencies. **SOCi** publishes the Local Visibility Index and targets multi-location brands. **Localo** (formerly Surfer Local), **Whitespark**, **Moz Local**, **Birdeye** and **Chatmeter** cover listings, reviews and GBP without meaningful AI tracking.

### 3.6 Small-business and vertical newcomers

A cluster of small, mostly US operators are selling "get recommended by ChatGPT" to trades and local services: **Pantora** (home services AEO), **Local Vitals** (60-second scan, 21-checkpoint audit, 90-day implementation sprint), **Ayzeo** (local prompts plus auto-generated LocalBusiness schema), **Frizerly** (AI citation optimisation for plumbers), **GrowthPro AI** (full local automation including AI visibility). In the UK, **Impact Digital**, **Scopesite** and **Solvyn** are agencies publishing guides and audits for plumbers and small firms. All are agency-shaped with a scan as the lead magnet; none is a product at scale.

**Rankability** deserves a mention as the agency-workflow play: $99 a month for unlimited clients across nine AI platforms with a content workflow, MCP for SEO and an Agent API.

### 3.7 Growth-automation engines (added 17 September 2026)

A tier the first draft missed: products that don't sell visibility at all but sell an autonomous marketing operator, of which SEO and GEO are two channels among many.

**Cogny** (Stockholm) is the reference. OAuth your channels — Search Console, GA4, Bing Webmaster, Google, Meta, LinkedIn, TikTok and OpenAI Ads, HubSpot, Klaviyo, Mailchimp — and an AI collates, proposes an action and executes it on a y/n. Solo at $9 a month is an MCP plus fifty open-source Claude Code skills you run with your own Claude subscription; Cloud at $499 with 5,000 credits adds schedules, shared context and parallel autonomous runs for a team. Logos include Lovable and WWF; the headline case study is a 271% organic-click uplift on the founders' own site. GEO is Bing Webmaster used as a proxy, with citation tracking "coming soon". No local, no listings, no directories, no multi-engine AI mention data, no human in the loop.

Why it matters: it's the same collate-advise-execute engine as ours, built for a different buyer (marketing teams and technical founders who'll type prompts), and it proves both that the analysis layer is a commodity — the playbooks are on GitHub — and that teams pay $499 a month for scheduled autonomous execution. It is a DataForSEO connection and a local-SEO skill away from overlapping our self-serve tier for marketing-literate customers; it will never do the directory work or the service. Its architecture (connections, skills, scheduler, approval) and its breadth-of-integration strategy are both adopted in app-vision-v1.2.

---

## 4. Feature comparison

| | Track AI mentions | Cite sources | Sentiment | Prompt discovery | Content/fix workflow | Listings sync | GSC/GA attribution | Crawler analytics | Agent-facing delivery | Entry price |
|---|---|---|---|---|---|---|---|---|---|---|
| Profound | Yes, 10 engines ent. | Yes | Yes | Prompt volumes | Agents (credits) | No | GA on ent. | Yes (CDN) | No | $99 |
| Peec AI | Yes, 6 core | Best in class | Best in class | No | Actions engine | No | Looker/API | Yes | No | ~€70 |
| Otterly | Yes, 6 | Yes | Yes | No | No | No | GA | No | No | $29 |
| Scrunch (Sitecore) | Yes, 4 | Yes | Yes | Personas | Site audits | No | Partial | Yes | Yes (AXP) | $250 |
| Semrush AI Toolkit | Yes, 4 | Yes | Partial | Manual | Via suite | Semrush Local | Via suite | No | No | $99 |
| Ahrefs Brand Radar | Yes, 6-7 | Yes | Yes | 260M prompt DB | Content Helper | No | No | No | No | $828 all-in |
| HubSpot AEO | Yes, 3 | Partial | Yes | Suggestions | Content workflows | No | Via HubSpot | No | No | $0/$50 |
| Yext | Emerging | Partial | No | No | No | Yes, 200+ direct | No | No | Knowledge graph | Enterprise |
| Local Falcon | Yes, 5 | Partial | No | No | No | No | No | No | No | $25 |
| BrightLocal | No | No | No | No | No | Yes | GBP | No | No | ~$39 |
| Rankability | Yes, 9 | Yes | Partial | No | Yes | No | No | No | MCP | $99 |
| Cogny | Bing proxy only | No | No | No | Yes (y/n execute) | No | GSC + GA4 | No | No | $9 / $499 |

Nobody in this table has more than one of the three columns on the right-hand side filled in with a real "yes". That's the product.

---

## 5. Traction and money

| Company | Funding | Revenue / customers | Notes |
|---|---|---|---|
| Profound | ~$155M, $1B valuation | Fortune 500; ent. deals $2-5k+/mo | Category leader, G2 leader |
| Peec AI | ~$29M | ~$10M ARR (May 2026), 3,000+ customers, +300/mo | Fastest growth; NY office 2026 |
| Bluefish | ~$68M | Undisclosed, Fortune 500 | Status uncertain mid-2026 |
| Scrunch | Acquired by Sitecore ~$225M (Jun 2026) | Undisclosed | Roadmap moving into DXP |
| XFunnel | Acquired by HubSpot ~$30M (Oct 2025) | Became HubSpot AEO | |
| AthenaHQ | $2.2M seed (YC) | 100+ paying customers | White-label from $95 |
| Otterly | Undisclosed | Gartner Cool Vendor 2025 | Widest free-tier reach |
| Azoma | $4M pre-A (Dec 2025) | Undisclosed | |
| Semrush | Inside Adobe | Millions of suite users | AI toolkit bundled |
| Ahrefs | Bootstrapped | Large installed base | Brand Radar premium-priced |
| Yext | Public | 4M+ locations | Pivoting to AI-era knowledge graph |

The category raised over $300 million between summer 2025 and spring 2026, two thirds of it concentrated in nine enterprise platforms. Only 22% of marketers say they actively track AI visibility, which is the number the whole category is selling into.

---

## 6. What the market keeps saying it's missing

Reading across forty-odd reviews and comparisons, the same four complaints recur regardless of tool.

The tools tell you where you stand and not what to do. This is the single most repeated criticism, and it's being addressed slowly by the well-funded players and quickly by tiny ones.

Prompt sets are only as good as the person who wrote them. Most tools require manual prompt entry; a bad prompt set produces a confident dashboard about nothing. Autonomous discovery of what customers actually ask is rare (Profound's prompt volumes and Ahrefs' 260-million prompt database are the exceptions, at enterprise prices).

Attribution to revenue is weak or absent. Goodie and a few others lead on it; most report mentions, not money.

Small businesses have no on-ramp. One roundup states plainly that if you're an SMB none of the mainstream tools is the right starting point. The local incumbents don't track AI; the AI trackers don't do local.

---

## 7. Strategic implications

**The gap we described exists and is publicly acknowledged, but the enterprise version of it is being filled.** Profound Agents, Peec Actions and Scrunch AXP mean "we fix, they report" is not a durable distinction against those players for mid-market and enterprise. Competing there means competing with $155 million and Adobe.

**The small-business and local version is open.** Nobody credible has combined: a plain-English scan that shows the owner what ChatGPT says about them; listings and Google Business Profile sync (the thing Yext does at enterprise prices and BrightLocal does without AI); AI-quotable page fixes pushed to the site; Search Console and GA4 attribution so the report is in enquiries rather than mentions; and a price a sole trader will pay. The demand evidence is stark (1.2% of local businesses recommended by ChatGPT; over half of local citations coming from directories), and the two incumbents best placed to serve it are asleep (BrightLocal) or enterprise-only (Yext).

**Three threats to watch.** BrightLocal adding AI tracking, which would be easy for them and would reach every UK local-SEO agency overnight. Website builders (Wix, Squarespace, GoDaddy) bundling a free AI visibility score, which would kill monitoring-only SMB tools but not a fixing service. And Local Falcon or Synup adding listings sync plus fixes, since they already have the local agency channel and AI tracking on every plan.

**What this says about the moat.** The monitoring layer is fully commoditised; DataForSEO sells the raw data to everyone and the floor is $29 a month or free. Value has to sit in the fixing loop, the single business record, the integrations to listing sites and CMSs, and the accumulated record of which fixes moved which results. The agent-facing delivery layer (Scrunch's AXP is the only precedent, and it's now inside Sitecore) is the one genuinely uncontested feature, and the one most likely to make the product an acquisition target rather than a competitor.

**On timing.** Peec went from launch to $10 million ARR in sixteen months in the mid-market. The local and SMB equivalent hasn't been built. Twelve months from now it will have been, by someone.

**Reading this section after the 14 September reframe.** The gap is the same but the customer inside it is more specific: not the sole trader, who Wix and Squarespace now serve for free, but the established service business and the multi-location group that would otherwise pay an agency and get a report. That segment sits between the free builders and Profound's $2,000-a-month floor, is served by nobody in the UK, and is the one Cheers has proven in the US. The three threats (BrightLocal, builders, Local Falcon/Synup) all attack the monitoring layer and the sole-trader price point; none of them sells outcomes to a firm with a sales target. The Kieren test (see app-vision-v1.1) also passes at our price: nobody spends a week of senior engineering to replace a £2,000-a-year tool.

---

## 8. Unit economics (from the working model, 11 September 2026)

The companion spreadsheet, unit-economics-model.xlsx, prices the loop per client using DataForSEO's pay-as-you-go rates (LLM Mentions at $0.001 per row; LLM Responses at a 1c prepayment plus the underlying model cost; the $100 monthly commitment on mentions was removed in July 2026 alongside roughly 20% rises on several other APIs) and scraper costs of $2.39 to $3.00 per thousand directory profiles. All inputs are editable; the figures below are the defaults.

**Three tiers were modelled.** Lite at £29 a month tracks 20 questions across three engines weekly, reads two directories, and is fully automated with no human review. Standard at £79 tracks 50 questions across five engines, runs a monthly direct-model accuracy check, reads four directories, drafts three pages a month and gets ten minutes of human review. Pro at £149 tracks 100 questions across six engines with weekly direct-model queries, six directories, six drafts and thirty minutes of review.

**Cost to serve and margin.** Lite costs about £2.60 a month to serve, a 91% gross margin, with data and compute under 7% of price. Standard costs about £19.50, a 75% margin, of which £5 is the reviewer's time. Pro costs about £80, a 46% margin, almost entirely because weekly direct LLM Responses across 100 prompts and six engines are $39 a month on their own; run those fortnightly and Pro recovers to the mid-sixties. Through a partner taking 25% of price, Lite still clears 88% and Standard 67%; Pro falls to 28% and needs the same fix.

**At scale.** With a 50/40/10 tier mix the blended price is £61 and blended cost to serve about £17. Fixed costs of £33,500 a month (a three-person product team at £25k, ops base £4k, tooling £1.5k, funnel £3k) and 4% monthly churn give break-even at roughly 950 paying clients. At 3,000 clients the model shows about £70k a month operating profit on £1.9m ARR; at 10,000, about £320k a month on £6.4m ARR. Lifetime gross margin per direct Lite client is about £660 against a £60 assumed CAC, an LTV to CAC of 11 and payback inside three months; Standard and Pro are higher still.

**What this says.** The data is not the cost. Even on DataForSEO's rates, variable data and compute is single digits of price on the entry tier and under 20% on Standard. The two costs that decide margin are human review minutes and how often you query the models directly; both are product decisions, not supplier prices. The product can be priced where Otterly and HubSpot sit (£29 to £50) and still run at software margins, which is what makes the small-business tier viable where an agency service would not be.

**What to verify before pricing.** The single input the whole Lite cost line rests on is how many billable rows DataForSEO returns per prompt per engine per run (modelled at 5 for Lite, 15 for Pro). Twenty real UK trade prompts through their sandbox settle it. Second is the real per-query cost of LLM Responses on the models that matter, which ranges from under a cent to several cents depending on model and whether web search is enabled. Neither changes the conclusion; both change the Pro tier's shape.

**Repricing after the 14 September reframe.** The tiers above were priced for sole traders. With the target now established businesses and the service launching first, the relevant numbers are: the Ronins service at £500 to £2,000 a month against a cost to serve of £80 to £200 including the human, a 75 to 90% margin, with £30k a month reachable from fifteen to sixty clients depending on mix; multi-location groups at £2,000 to £5,000 a month with cost scaling per location, where ten clients reach the same target. Any self-serve tier at £79 to £249 runs at the Standard/Pro cost lines in the model (roughly £20 to £80 a month) and therefore at 68 to 92% margin, which is comfortably higher than the original £29 Lite tier ever needed to be. Change the price cells in the workbook to see it; the cost side is unchanged.

---

## 9. Sources consulted

Search Influence, Enterprise AI visibility platform comparison 2026 · Surmado, Best AI visibility tools 2026 · Sanbi, AI visibility platform comparison · GenerateMore, Peec AI review (updated Aug 2026) · GEO Toolbox, What is Peec AI · AEO Labs, Peec AI review · Geoptie, Peec AI review · SE Ranking Visible, Peec AI review · Tim Soulo, 14 Peec AI alternatives · Bloomiro, Best AI search visibility tools · Lemniscate Growth, AI visibility tools comparison · IndustryLens, AI search intelligence · G2, Profound pricing · Trakkr, Profound review and pricing · Rankability, Profound review, HubSpot AEO review and alternatives · AI Peekaboo, Profound and Peec reviews · WorkDuo, Profound pricing · Indexly, Profound pricing · That Marketing Buddy, Profound pricing calculator · Plate Lunch Collective, AEO/GEO tools 2026 · Menra, Evertune vs Bluefish; Semrush vs Ahrefs · Cloud Analyst, GEO competitive landscape 2026 · Airefs, 40 best AI search tools · Brandlight, Evertune comparison · EWR Digital, Ahrefs Brand Radar review · Layer3 Labs, Ahrefs Brand Radar review · Arobis, Ahrefs vs Semrush · Omid Saffari, Brand Radar vs Semrush cost maths · Analyze AI, Ahrefs vs Semrush · MarGen, Semrush vs Ahrefs · Yext, Yext vs Uberall; How listings shape AI visibility · Marketraa, BrightLocal alternatives · Surferstack, Yext vs Uberall vs SOCi · GrowthPro AI, Best local SEO tools · BrightLocal, Listings management compared · Trakkr, AI visibility tools for plumbers · Scopesite, AI visibility checker guide · Solvyn, AI visibility for UK small businesses · Pantora, Local Vitals, Ayzeo, Frizerly, Impact Digital product pages · ScatterBranch, AI search and local visibility · Whatagraph, AI SEO tools · RankScope, GEO tools comparison · RankUp, Surfer alternatives · FixAEO, Surfer AI Tracker review · UgliAI, AI SEO content tools · Technova, Best AI SEO software · Exposure Ninja, AI search statistics · Similarweb, AI search stats 2026 · Goodie, AI search traffic report 2026 · Digital Applied, AI search engine statistics · Reporter Outreach, AI search statistics · Axis Intelligence, AI search statistics · HubSpot, AEO Grader vs Otterly; Best AEO software; Scrunch alternatives · xSeek, HubSpot AEO Grader alternatives · TryHikoo, Otterly vs HubSpot · DataForSEO, AI Optimization API documentation, pricing list, LLM Responses pricing, July 2026 pricing update · That Marketing Buddy and Meikuio, DataForSEO reviews (Sept 2026) · Apify, Checkatrade, TrustATrader and Yell scraper listings · unit-economics-model.xlsx (companion workbook, all assumptions editable) · Cogny, cogny.com and github.com/cognyai/claude-code-marketing-skills (17 Sept 2026).
