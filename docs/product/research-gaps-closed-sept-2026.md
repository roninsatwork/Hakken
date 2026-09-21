# Hakken — closing the research gaps: market size, demand, platform risk, incumbents, legal, and the live tests

**20 September 2026: the product is now named Hakken (発見, discovery). References below to "the product" or "the platform" mean Hakken; the current plan is app-vision-v2.md.**


**Prepared 11 September 2026. Third document in the set, following the competitive landscape and the data-sources reports.**

**Update 18 September 2026.** The target market is now fixed as e-commerce retailers, agencies (running the product on their clients, with the workspace owned by the business), and businesses that need leads and sales. Earlier references in this document to plumbers, trades and local sole traders are superseded and should be read as the general "lead-driven business" case; e-commerce is a launch loop, not a second product; multi-tenant and white-label are phase-one scope. The current plan is app-vision-v2.md.

**Update 14 September 2026.** The customer definition has since narrowed to established businesses wanting leads or sales, with the Ronins service launching first and self-serve as an option. The sizing (section 1) still holds as the pool; section 1.3's launch-vertical reading, section 7's revised view and appendix B's recruitment and pre-order test have each been annotated with the reframed version rather than rewritten, so the original reasoning is still visible.

---

## How to read this

Six gaps were identified. Four could be closed from desk research and are closed below: market size by vertical (section 1), platform risk (section 3), the incumbents' next moves (section 4), and the legal position (section 5). Two need things I cannot do from here — running real queries through DataForSEO and talking to business owners — so for those the document supplies the exact protocol, prompt set, scoring sheet and interview guide, ready to run (sections 2 and 6, with appendices). Nothing in those two should need designing before you start.

The overall picture has moved since the first report, and not in a comfortable direction. The window for a small-business AI-visibility-plus-fixing product in the UK is still open, but three things have changed the shape of it: BrightLocal has published a roadmap that covers most of what we described; Squarespace and Wix now include AI visibility scores for free; and OpenAI has opened self-serve ads in ChatGPT to UK businesses, with sponsored placements now appearing in roughly a quarter of ChatGPT replies where ads run. Each of these is addressed below with what it means.

---

## 1. Market size by vertical

### 1.1 The overall pool

ONS counts about 2.7 million VAT- or PAYE-registered businesses in the UK (UK Business: activity, size and location, 2025), of which the overwhelming majority are micro-businesses. The commonly quoted 5.5 million includes unregistered sole traders who mostly won't buy software. The realistic addressable pool for a local-visibility product is the registered, customer-facing, locally-searched subset: trades, personal and professional services, hospitality, healthcare and retail with a physical or service-area presence. Call it 800,000 to 1.2 million businesses, of which a fraction are digitally active enough to be reached.

### 1.2 By vertical

Figures are the best available public counts; where I've had to estimate, it says so. Directory dependency comes from the citation studies in the data-sources report.

| Vertical | UK businesses (approx.) | Source basis | AI citation pattern | Fixing loop weight | Willingness to pay signal |
|---|---|---|---|---|---|
| Plumbing, heating, HVAC | ~45,000 | IBISWorld 2026: 45,457; ONS SIC 43.22 ad hoc tables | Checkatrade in 78 of 80 ChatGPT answers; directories 72% of citations | Directories first, own site second | High: already pay Checkatrade £50–£150+/month |
| Electrical installation | ~40,000–50,000 (estimate) | ONS SIC 43.21 ad hoc tables; CITB workforce ~200k | Same as plumbing | Directories first | High: same directory spend habit |
| Builders, roofers, other trades | ~150,000+ (estimate) | ONS construction SIC 41/43 | Same pattern; MyBuilder, Rated People | Directories first | High but fragmented |
| Dental practices | ~12,000 | IBISWorld 2026: 12,040–12,052 | Google properties dominant; directories in 19% of professional-service answers | Google Business Profile, own site, reviews, CQC | Medium–high: private dentistry marketing budgets exist |
| Solicitors' firms (England & Wales) | ~9,000–9,500 (estimate; SRA publishes exact count monthly) | SRA regulated community statistics, July 2026 | Google, own site, Law Society; Checkatrade once in 79 | Own site, SRA record, reviews | Medium: cautious buyers, but high value per client |
| Accountancy practices | ~35,000–45,000 (estimate) | ICAEW/ACCA firm counts; ONS SIC 69.20 | Professional-service pattern | Own site, register, reviews | Medium; also a partner channel, not just a customer |
| Estate and letting agents | ~20,000–25,000 branches (estimate) | ONS SIC 68.31; Rightmove agent counts | Google, own site, portals; Checkatrade cited once for fees | Own site, GBP, portals | Medium–high: marketing-led sector |
| Restaurants, cafés, pubs | ~90,000+ | ONS accommodation & food SIC 56 | Tripadvisor, OpenTable, Yelp heavy; BrightLocal shows vertical directories in top five | Tripadvisor, GBP, Yelp | Low–medium: thin margins, high churn |
| Hair, beauty, wellness | ~45,000+ (estimate) | ONS SIC 96.02 | Google, Treatwell, Fresha | GBP, booking platforms | Low–medium |
| Vets | ~5,000 practices (estimate) | RCVS practice register | Professional-service pattern; RCVS named not cited | GBP, own site, reviews | Medium |
| Garages, MOT | ~35,000 (estimate) | ONS SIC 45.20 | Trades-like: directories and Google | Directories, GBP | Medium–high |

Sources to firm these up: ONS IDBR ad hoc tables by SIC (free on request via IDBRDAS@ons.gov.uk; the plumbing and electrical tables are already published), the SRA regulated-community statistics page (exact firm count, monthly), CQC's register for dental, RCVS for vets, and Companies House bulk data filtered by SIC code, which is free and gives you a name-and-address list at the same time.

### 1.3 What the sizing says about where to start

Three verticals stand out on the combination of count, citation pattern, existing spend habit and fixing-loop simplicity.

**Trades (plumbing, electrical, building, roofing) — around 250,000 businesses.** The citation pattern is the most concentrated in the whole dataset: a handful of directories decide almost everything, and the business already pays those directories. The pitch writes itself ("you pay Checkatrade £100 a month; here's whether ChatGPT is actually sending you anything, and what to fix"). The fixing loop is the hardest to automate (no APIs), which is also the moat. This is the launch vertical.

**Dental — around 12,000 practices.** Small count but high value per client, a clean data source (CQC), a professional-service citation pattern that rewards the own-site and Google work we can fully automate, and a sector already shifting to private and marketing-led. A second vertical, and a good one for the partner channel through dental marketing agencies and practice management software.

**Estate agents — around 20,000 branches.** Marketing-literate, competitive, local by definition, and with the same Google-plus-own-site loop as dental. Third.

Restaurants and hospitality are large but low-margin and high-churn; the platforms that matter (Tripadvisor, OpenTable) are their own ecosystems. Leave for later. Solicitors and accountants are better treated as partners and referrers than as first customers.

At a 5% penetration of the three launch verticals (roughly 14,000 clients) and the blended £61 price from the economics model, that's about £10m ARR — well beyond the 950-client break-even and inside the range the model shows as strongly profitable. At 1% it's about £2m ARR and still profitable. The market is big enough; the question is reach, not size.

**Reframed 14 September.** Apply the "established business" filter to the counts above and the pool shrinks but the value per client rises. Of the ~45,000 plumbing businesses, ONS size bands show the large majority are sole traders or 1–4 staff; the firms with a team, a marketing budget and a sales target — perhaps 5,000 to 8,000 across plumbing and electrical, more across building — are the target, and they already spend £200 to £2,000 a month on directories and agencies. Dental (12,000 practices, of which a growing share are private and group-owned), estate agents (20,000+ branches, most in chains), vets (5,000 practices, heavily consolidated into groups) and home-services brands are closer to the target as a whole. The multi-location groups on top — dental groups, agency chains, vet groups, franchises, care groups — number in the low thousands in the UK but pay £2,000 to £5,000 a month each and give the panel a hundred locations per sale. At the service price the £30k-a-month target is fifteen to sixty clients; sizing is no longer the constraint, and the sections on reach and demand (2 and 6) matter more than this one.

---

## 2. Whether anyone will pay: what we know, and the protocol to find out

### 2.1 What the desk evidence says

There is no published willingness-to-pay study for AI visibility among UK small businesses. The proxies we have:

Trades already pay directories. Checkatrade, Rated People, MyBuilder and TrustATrader charge subscriptions or per-lead fees that commonly run £50 to £200 a month. That's the reference price in the customer's head, and it's higher than our Standard tier.

Demand for the adjacent thing is documented. A Search Engine Journal figure cited in the ads coverage puts nearly 80% of small and medium businesses as having signalled interest in ChatGPT Ads. Interest in being visible in ChatGPT is not the same as interest in paying a software tool, but it's the same anxiety.

Free tools are appearing at the top of the funnel. HubSpot's grader, Semrush's free checker, Wix's built-in overview, Squarespace's AI Visibility, Cheers' free grader, Local Vitals' 60-second scan: everyone is using "see what the AI says about you" as the hook. The hook works well enough that everyone copies it. It also means the free scan alone is no longer a differentiator; the paid step has to be the fix.

Consumer-side adoption is real. BrightLocal's 2026 Local Consumer Review Survey puts consumer use of AI for local business discovery at 45%; a UK source cites 51% of UK adults now searching with AI tools. The owner has probably had a customer say "ChatGPT told me to call you" or, more painfully, has not.

### 2.2 The interview protocol (appendix B)

Twenty conversations, 25 minutes each, split ten trades, five dental, five estate agents. The full guide is in appendix B. The design principle: never ask "would you pay for this". Show them their own scan result first (run it manually the day before), watch the reaction, then ask what they do today, what they pay for, and what they'd expect something like this to cost. The answers you're after are the language they use, the number they say unprompted, and who they'd trust to sell it to them.

Run alongside it: a landing page with the free scan and a "notify me" or £29 pre-order button, driven by £500 of Meta ads targeted at UK trades. Conversion rate on that is worth more than the twenty conversations for the pricing question.

---

## 3. Platform risk

This is the section that changed most from the assumptions in the first two reports.

### 3.1 Ads inside AI answers are already here, including in the UK

OpenAI began showing ads to logged-in adult users on the Free and ChatGPT Go tiers in the US on 9 February 2026, and on 5 May 2026 opened a self-serve ChatGPT Ads Manager to US businesses. Ads then expanded to Canada, Australia and New Zealand, to Japan and South Korea on 22 June, and to a UK self-serve beta that opened 6 June. From the week of 23 August the platform expanded to 31 European countries. Self-serve removed the earlier minimum spend, opening the platform to small and mid-market advertisers. Similarweb's ad data shows roughly 26% of ChatGPT replies carrying sponsored ads where they run, though Adthena recorded zero ChatGPT ad placements across 169,560 UK scrapes in June — so UK volume is early.

Ads are shown below the end of a response, clearly labelled, not inside the answer, and paid tiers stay ad-free. Targeting is by conversation context and history, not keywords or precise location. OpenAI's ad policy has been updated six times since April, most recently in September to reserve the right to decline ads that conflict with its business interests or competitive position; legal services became permitted in the US in August.

Google, meanwhile, expanded AI Overview ads to 11 additional countries in December 2025 without announcement, formalised shopping ads in AI Mode in February 2026, and one UK agency's July update reports AI Mode ads appearing on around one in three queries. Google Ads reporting does not segment AI Overview placements and advertisers cannot opt out. Perplexity is testing native ads and affiliate links.

**What this means for the product.** Two things, pulling in opposite directions.

The threat: if a plumber can buy a sponsored slot under the ChatGPT answer for "emergency plumber Guildford", the value of earning the organic mention falls, exactly as paid search eroded organic for commercial local queries. OpenAI's own June update shipped a GPT-5.5 Instant change explicitly aimed at shopping and local-business queries, alongside product-feed ads and the Agentic Commerce Protocol. Local is a monetisation target.

The opportunity: the same coverage notes that ranking organically in ChatGPT and buying placement in ChatGPT are becoming two different disciplines, the way SEO and paid search diverged. Every SEO agency added PPC management and it became the bigger revenue line. A product that already holds the business record, the prompt set, the citation data and the enquiry attribution is the natural place to run ChatGPT Ads and AI Mode ads for a small business, and the natural place to tell them which queries to buy and which to earn. Attribution for ChatGPT Ads is described as thin and messy; we'd have the GA4 and Search Console side already.

The risk to price in: OpenAI's policy now explicitly allows it to decline ads on competitive grounds, and it may restrict third-party management. Watch the advertiser terms as the UK self-serve beta matures.

### 3.2 Terms of service on automated querying

OpenAI's terms prohibit, except through the API, any automated or programmatic method to extract data or output from the Services, including scraping. Querying the consumer ChatGPT interface at scale is a breach. This is a risk carried by DataForSEO (whose LLM Scraper product does exactly this), by Peec (which scrapes the consumer interface deliberately so results match what users see), and by most of the category. It has not been enforced against visibility tools so far, and OpenAI's public stance is that ChatGPT still cites Reddit and it doesn't set visibility levels for individual sites — but enforcement could arrive with the ads business, since sponsored placements are exactly what a scraper would also capture.

Mitigation: use DataForSEO's LLM Responses (which goes via the model APIs) for anything a client's contract depends on; treat consumer-interface scraping as a data source that could disappear; and never resell raw scraped ChatGPT output under your own name.

DataForSEO's own terms permit building products on their data (it's their business model and they market to tool builders explicitly); check the current ToS for any clause on redistributing raw data versus derived metrics before launch.

### 3.3 The retrieval mechanics can change overnight

Covered in the data-sources report: Reddit lost 86% of its ChatGPT citation share on 14 August after an 8 August change in how ChatGPT constructs background searches. Any source, including Checkatrade, can lose weight in one engine in a day. The product design response (learned per-engine source weights, alerts on share movement, own-site work as the constant) is already in that report.

### 3.4 Opt-outs and access

June 2026 saw Google ship a way for publishers to opt out of generative features without blocking crawling, and Microsoft ship an AI-answer opt-out for Bing. Cloudflare made AI-crawler blocking the default for new domains in July 2025 and a million-plus sites have enabled it. Two implications: some directories may start blocking the AI crawlers that currently read them, which would change the citation map; and a client on Cloudflare may be blocking the very bots we need to reach them. Checking and fixing crawler access is a day-one onboarding step.

---

## 4. The incumbents' next moves

### 4.1 BrightLocal has published its roadmap, and it covers us

BrightLocal's "Future Platform" page (June 2026) lists: tracking presence in Google AI Overviews, AI Mode and ChatGPT with visibility, sentiment and share of voice plus actions to improve; easier aggregator management in the platform; an automated press release service; additional automated Google Business Profile services and website content services; AI insights with new data sources; a conversational AI over the account data; and benchmarking against thousands of similar businesses.

That is, almost line for line, the product we described: monitoring, actions, listings sync, GBP automation, content, chatbot. BrightLocal has the UK local-SEO agency channel, tens of thousands of users, and citation-building infrastructure already. Its weaknesses are that it's a reporting tool at heart (reviewers still say most actions require manual execution by the team or agency), its pricing is rising, its managed service is £1,299 a month, and a "future platform" page is a promise, not a shipping product.

**Implication.** Do not plan to beat BrightLocal on monitoring or on listings breadth. Plan to beat it on the trade-directory fixing loop it doesn't do (Checkatrade, MyBuilder, TrustATrader — no API, browser agent), on Search Console-to-enquiry attribution it doesn't report, on price for the sole trader, and on speed, since they've announced and we can ship. And consider that BrightLocal is also a plausible acquirer.

### 4.2 The website builders now include AI visibility for free

Squarespace has launched AI Visibility as a feature, currently in English-language markets, with more languages later in 2026. Wix's AI Visibility Overview is free inside Wix Analytics: it auto-generates test questions from the site's content, sends them to ChatGPT, Gemini and Perplexity, and shows a visibility score alongside real AI bot crawl traffic. Wix has also configured its builder for the Agentic Commerce Protocol and is telling site owners that forms, checkouts and bookings need to be accessible to AI agents or they won't be in the game.

**Implication.** Monitoring-only for small businesses is dead as a paid product; the builders give it away. This was predicted in the first report and has now happened. It confirms the fixing loop as the only viable paid layer. It also means the free scan is table stakes rather than a hook, so the scan must be better than theirs (multi-engine, UK-local prompts, competitor names, source tracing) and must hand straight into a fix.

### 4.3 A US company is already running our model for bigger brands

Cheers (cheers.tech) describes itself as a done-for-you local SEO and AI visibility platform for multi-location service brands. It tracks how ChatGPT, Gemini, Perplexity and Google recommend local businesses, then handles the work on reviews, profiles, location pages, citations and proof behind the answers. It publishes benchmark data from its own panel (119 home-services organisations; mean appearance rate 27%, top quartile 37%), runs a free grader, and positions explicitly against monitoring tools with the line that a local visibility platform also has to change the answer. It targets PE-backed HVAC groups, plumbing brands, med-spa chains and franchise systems.

**Implication.** The thesis is validated by someone else's money. Cheers is US, multi-location, and done-for-you at a custom price; the gap is UK, single-location, and productised at £29 to £149. Watch it for two reasons: it will publish the best benchmark data in the category, and it will eventually come to the UK or be bought by someone who's here.

### 4.4 Local Falcon, Synup, Birdeye, Uberall

Local Falcon includes ChatGPT, Gemini, Perplexity, Grok and Google AI Mode tracking on every plan from $24.99, alongside geo-grid rank scans, with API and a citation finder, but no listings sync and no fixing. Synup bundles a full API and white-label for agencies. Birdeye's public Search AI material now speaks directly to AI-search visibility. Uberall has GEO Studio. None of them is doing the UK trade-directory work.

### 4.5 The pattern

Everyone is converging on "monitor plus recommend". Nobody has shipped "monitor plus actually change the directory profile" for UK trades, and nobody has tied it to enquiries. That is a narrower gap than the first report described, and it's the one to take.

---

## 5. Legal and consent

Not a legal opinion; a map of what a solicitor needs to look at, with the desk position on each.

### 5.1 Reading public directory pages

UK law on scraping turns on five things: contract (the site's terms), IP (copyright and database right), data protection (UK GDPR and the DPA 2018), computer misuse (bypassing access controls), and confidentiality. Scraping publicly available business data is lawful if designed to respect these and documented; breaching terms that prohibit automated access exposes you to a breach-of-contract claim regardless of your data-protection posture; and bypassing technical barriers is criminal under the Computer Misuse Act 1990.

Checkatrade, Yell and the others have terms prohibiting automated access, and Yell sits behind Cloudflare. The desk position: reading a client's own profile page, at low frequency, on the client's instruction, is defensible as the client exercising their own access through an agent — but it's still a technical breach of the site's terms, and evading bot protection to do it edges toward computer misuse. Bulk scraping of competitor profiles is not defensible.

Design accordingly: per-client, low-frequency reads; no bot-protection evasion (if a site blocks, it blocks, and you fall back to the client's login); and for competitor data use DataForSEO's citation and business-data endpoints rather than your own scraper. Business contact details are personal data where they identify a sole trader, so a legitimate-interests assessment and a privacy notice are needed even for the client's own record.

### 5.2 Holding the client's directory logins and acting on their behalf

This is the part the first report flagged as the awkward one, and desk research confirms it is. Three separate issues.

**The directory's terms.** Most consumer-facing platforms prohibit sharing login credentials with third parties. HMRC's Standard for Agents, as a comparable example, treats collecting or sharing client credentials as a breach that can trigger enforcement, and points agents to APIs with tokenised, consent-based access instead. Checkatrade's and Yell's terms should be read for the same clause. Where a platform offers agency or partner access (Bing Places and Google Business Profile do; Trustpilot has a partner programme), use it; where it doesn't, the browser agent is acting as the business's delegate under the business's account, which the platform may tolerate and may not.

**Data protection and security.** Storing credentials makes you a processor with a heavy security obligation. The ICO's 2025 enforcement shows fewer actions but far larger fines, averaging £1.45m. A credential vault (HSM-backed or a managed secrets service), per-client isolation, MFA on your side, immediate revocation, and no human access to plaintext are the minimum. Consider whether to hold credentials at all, versus a session-based model where the client authenticates in a short-lived browser session you orchestrate and never store the password.

**Liability for what the agent publishes.** If the agent changes a price or a service description and it's wrong, the business bears the consumer-facing consequence (Consumer Protection from Unfair Trading Regulations, ASA, trade-body rules) and will look to you. Human approval before publish, a full audit log of every change with before/after, and terms that make the client responsible for approving content, are the controls. Regulated verticals (dental, legal, financial) have additional advertising rules; the SRA and GDC both regulate how firms describe themselves.

### 5.3 The AI-engine terms

Covered in 3.2. Use API-routed queries for anything contractual; treat interface scraping as best-effort.

### 5.4 DataForSEO and API licences

Read DataForSEO's terms for redistribution limits. Read Google's Business Profile API policies (prohibited uses are listed on their FAQ page; access requires demonstrating a legitimate use case for your own or clients' locations). Read the Trustpilot partner agreement's data-retention and deletion requirements (they require honouring consumer deletion requests via their Deletions API).

### 5.5 What to ask the solicitor

Six questions, in priority order: (1) whether a browser agent acting under a client's own login, with the client's written authority, is a defensible position against the directory's terms and the Computer Misuse Act; (2) the processor obligations and minimum security standard for holding third-party credentials, or whether a no-storage session model changes the analysis; (3) the liability allocation in client terms for agent-published content, and whether human approval is sufficient; (4) the legitimate-interests basis and privacy notice for the business record where it contains sole-trader personal data; (5) whether reading a client's own public directory profile at low frequency is a material breach of the directory's terms; and (6) whether anything in OpenAI's or Google's terms bears on reselling derived visibility metrics. Budget a few hundred pounds for a fixed-fee session with someone who does data and platform work; the answers shape the onboarding flow.

---

## 6. The two live tests

Both are fully specified in the appendices. In brief:

**The DataForSEO query test (appendix A)** settles the biggest unknown in the economics model — billable rows per prompt — and the biggest unknown in the data-sources report — whether the UK citation pattern from three small studies holds up when you run it yourself. Twenty prompts, four verticals, three towns, five engines, through the sandbox and then a $50 top-up. Expected cost under £40; expected time one afternoon.

**The owner interviews and the pre-order test (appendix B)** settle whether the price and the pitch land. Twenty conversations plus a landing page with £500 of ad spend behind it. Two weeks.

---

## 7. Revised view after closing the gaps

The market is large enough (250,000 trades businesses alone), the economics work at the entry price, and the demand evidence is strong though secondhand. The category has moved faster than the first report assumed: the free scan is now given away by website builders, BrightLocal has announced most of the feature list, a US company is running the done-for-you model for large brands, and paid placement inside AI answers is live in the UK. None of those closes the gap; all of them narrow it to a specific shape.

That shape is: UK; single-location trades first; the fixing loop for directories with no API as the core work; Search Console and GA4 attribution as the proof; a free scan that's better than Wix's and hands straight into a fix; pricing at £29 to £149 where BrightLocal's managed service is £1,299; and, within a year, managing the client's ChatGPT and AI Mode ad spend from the same record, because that's where the money in this category is going to go.

The two things to do before any build are in the appendices. Run them.

**Reframed 14 September.** The shape above still stands, with the customer moved one rung up: established service businesses and multi-location groups, sold as a Ronins service on outcomes, with self-serve as an option and e-commerce as a second product. That move takes the product out of direct competition with the free builders and Local Falcon on price, out of BrightLocal's sole-trader agency channel, and out of Profound's enterprise range — into the gap Cheers has proven in the US. It also passes the "software is free now" test (app-vision-v1.1, "Why this survives"): at £2,000 a year of software nobody rebuilds it, and the assets that matter (panel, record, directory integrations, relationship) aren't code.

---

## Appendix A: DataForSEO query test protocol

**Purpose.** Measure (1) billable rows per prompt per engine per run, (2) UK coverage per engine, (3) the citation pattern for UK local prompts, (4) whether a named local business appears at all.

**Setup.** DataForSEO account (free $1 sandbox credit; then a $50 top-up). Use the AI Optimization API: LLM Mentions (Search Mentions, and the Lite variant), LLM Responses, and the SERP API for Google AI Overview and AI Mode. Location: United Kingdom; language: English. Log every request's cost from the response metadata.

**Prompts.** Five per vertical, phrased the way a customer would ask an assistant, each run for three towns (Guildford, Leeds, Bristol). That's 20 prompts × 3 towns = 60 prompt-instances.

Trades:
1. Who's a good emergency plumber in [town]?
2. Recommend a Gas Safe registered boiler engineer near [town]
3. Best electrician in [town] for a consumer unit replacement
4. I need a roofer in [town], who should I call?
5. Reliable local builder for a kitchen extension in [town]

Dental:
6. Best private dentist in [town]
7. Dentist in [town] taking new NHS patients
8. Where can I get Invisalign in [town]?
9. Emergency dentist near [town] open today
10. Good dental hygienist in [town]

Estate agents:
11. Best estate agent to sell my house in [town]
12. Which letting agent in [town] has the best reviews?
13. Estate agents in [town] with the lowest fees
14. Who should I use to sell a flat in [town]?
15. Recommended property management company in [town]

Restaurants/hospitality (control vertical):
16. Best restaurant in [town] for a birthday dinner
17. Good pub with food near [town]
18. Where's the best Italian in [town]?
19. Family-friendly café in [town]
20. Best Sunday roast in [town]

**Engines.** ChatGPT, Google AI Overview, Google AI Mode, Gemini, Perplexity, Claude — whichever LLM Mentions supports for the UK, plus LLM Responses for the rest.

**Scoring sheet (one row per prompt-instance-engine).** Columns: prompt id; town; vertical; engine; endpoint used; rows returned; cost (USD); businesses named (count); names; cited domains (list); cited domain types (directory / own site / Google property / review site / editorial / register); whether a directory appears; which directory; whether any named business's own site is cited; notes.

**Analysis.** (a) Mean and max rows per prompt-engine — feed into the yellow cell in the economics model. (b) Coverage matrix: engine × vertical, which returned UK-relevant data. (c) Citation share by domain type, per engine, per vertical — compare against Whito (Google AI Mode), Murray (ChatGPT trades) and BrightLocal. (d) Directory frequency table — the launch fix list. (e) Named-business rate — how often a real local business is named at all, by engine.

**Decision rules.** If mean rows per prompt-engine exceed 15 on the Lite endpoint, revisit Lite pricing or cap prompts. If ChatGPT UK coverage via Mentions is thin, budget for LLM Responses on ChatGPT for every tier. If Checkatrade appears in fewer than half of trade answers across engines, the trades thesis needs re-examining before launch.

---

## Appendix B: Owner interview guide and pre-order test

**Recruitment.** Twenty owners: ten trades (mix of plumbing, electrical, building; sole traders and 2–10 person firms), five dental practice owners or practice managers, five estate agency branch managers or owners. Sources: your own network, one trade body or Facebook trade group, one dental marketing contact, one letting-agent contact. Offer a £30 voucher or the free scan report as thanks. 25 minutes, phone or video.

**Reframed 14 September.** Recruit the established-business version instead: ten owners or marketing leads at service firms with a team and a marketing budget (trades firms with 5+ staff, home-services companies, professional-services practices), five dental practice owners or group marketing leads, five estate agency owners or chain marketing heads, and — separately — three to five marketing leads at multi-location groups (dental group, vet group, franchise, care group) as a first read on the £2,000-plus tier. Ronins' own client and prospect list is the first source. The guide below works unchanged; add one question for the groups: "how do you currently know what's said about each of your locations, and who owns fixing it?"

**Preparation (the day before each call).** Run the person's business through the manual version of the scan: ask ChatGPT, Gemini and Perplexity three of the appendix A prompts for their town and trade, screenshot the answers, note whether they appear, who does, and what's said. This is the material for the call.

**Guide.**

Opening (2 min). Who they are, how long trading, how many people, roughly how much of their work comes from being found online versus word of mouth.

What they do today (6 min). Where do new customers come from? Which directories or platforms do they pay for, and roughly what does each cost per month? What do they think they get for it? Have they ever tried to work out which one actually produces jobs? Who looks after their website and Google profile — them, a family member, an agency, nobody?

The reveal (6 min). "I asked ChatGPT who to call for [their trade] in [their town]. Can I show you what it said?" Show the screenshots. Say nothing for a moment. Then: Had they seen this before? Does the description of them (if any) match reality? Do they recognise the competitors named? Has a customer ever mentioned finding them through an AI?

The reaction (5 min). What would they want to do about it, if anything? If they could pay someone to fix it, what would "fixed" look like to them — being named, being described correctly, getting the phone to ring? Who would they trust to do it: their web person, their accountant, the directory itself, a new company they'd never heard of?

Price (4 min). Never ask "would you pay £29". Ask: "If something did this — checked every week what the AIs say about you, fixed your listings and website so they get it right, and showed you which enquiries came from it — what would you expect it to cost per month?" Wait. Then, if they give a number, ask what would make it worth double that. Then ask what they'd stop paying for if this worked.

Close (2 min). Would they want the report? Can we come back to them when there's something to try? Who else should we speak to?

**What to record.** Verbatim phrases for the problem, the fix and the value. The unprompted price. The named trusted intermediary. The directories they pay for and what they cost. Whether the reveal produced surprise, anger, dismissal or indifference — the emotional reaction is the demand signal.

**Pre-order test.** One landing page: headline in the owners' own words from the first five interviews; the free scan form (business name, postcode, trade); the result page with the three screenshots and a plain sentence on what's wrong; one button, "Fix this — £29/month, first month free", to a Stripe checkout or a waitlist form. Meta ads at £500 over two weeks targeted at UK trades interests, plus three posts in trade Facebook groups. Measure: scan completions, result-page-to-button clicks, checkout or waitlist conversions, cost per conversion. A scan-to-paid conversion above 3% at that price is a strong signal; below 1% means the price, the pitch or the vertical is wrong, and the interviews will tell you which.

**Reframed 14 September.** With the service launching first, the pre-order button becomes "Book a 20-minute review" leading to a Ronins call, and the measure is scan-to-booked-call rate and call-to-proposal rate rather than checkout conversion. Keep the £500 of ads, but target owners and marketing managers of service businesses rather than trades interests, and run it alongside direct outreach to Ronins' own prospect list. A scan-to-call rate above 5% and a call-to-proposal rate above a third are the signals to look for. The £29 self-serve checkout test is still worth running later, as a separate experiment, if and when that door opens.

---

## Sources consulted

ONS, UK business: activity, size and location 2025; ONS ad hoc tables, plumbing and heating enterprises 2024–2025 and electrical and plumbing installation by size · IBISWorld, Plumbing, Heating & Air Conditioning Installation in the UK and Dental Practices in the UK (2026) · The Page, number of plumbers in the UK · AnglianPhe, UK plumbing, heating and electrical statistics · SRA, regulated community statistics (July 2026) · Segwise, ChatGPT Ads 2026 guide · Marketinglens, ChatGPT Ads guide · Great Ape Digital, ChatGPT ads for business owners · Maciej Turek, ChatGPT ads 2026 · 2Point Agency, ChatGPT advertising guide · explainx.ai, OpenAI Ads Manager launch · Marketing Agent, ChatGPT ads guide · OpenAI, Ad policies (v1.6, September 2026) · PPC Land, Similarweb opens AI ad data · Anicca, weekly search update 16 July 2026 · Airefs, AI search news June 2026 · Lemonade Digital, ChatGPT ads preparation · OSPOCO, OpenAI terms of use restrictions · BrightLocal, Future Platform page (June 2026) and Experts' predictions for local marketing 2026 · Squarespace, AI Visibility · Saffron Edge, AI visibility tools (Wix AI Visibility Overview) · Cheers, AI visibility platform, best AI visibility tools for local businesses, multi-location guide, pricing guide, appearance-rate benchmark · Rank.ai, Local Falcon alternatives · Integrate.io, best AI visibility tracking tools · Sprintlaw UK, web scraping legality (four articles, 2025) · Apify, is web scraping legal (Feb 2026) · Cloro, seven-country scraping compliance guide (Aug 2026) · UK Data Services, UK web scraping compliance 2026 (ICO enforcement figures; HMRC agent standard) · DataResearchTools, UK GDPR and web scraping 2026 · plus the sources in the two earlier reports.
