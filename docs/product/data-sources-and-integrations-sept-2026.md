# Hakken — data sources and integrations: where the platform gets its data

**20 September 2026: the product is now named Hakken (発見, discovery). References below to "the product" or "the platform" mean Hakken; the current plan is app-vision-v2.md.**


**Prepared 11 September 2026. Companion to the competitive landscape report.**

**Update 18 September 2026.** The target market is now fixed as e-commerce retailers, agencies (running the product on their clients, with the workspace owned by the business), and businesses that need leads and sales. Earlier references in this document to plumbers, trades and local sole traders are superseded and should be read as the general "lead-driven business" case; e-commerce is a launch loop, not a second product; multi-tenant and white-label are phase-one scope. The current plan is app-vision-v2.md.

**Update 14 September 2026.** The target is now established service businesses (and, as a second product, e-commerce stores) rather than sole traders. Layers A to F below apply unchanged to the service-business loop. A new layer G covers the e-commerce sources, which were not in scope on 11 September.

---

## 1. The short version

The product needs five kinds of data: what the AI engines are saying and citing, what customers are asking, what actually happened (traffic, enquiries, crawls), what is true about the business, and what the directories and listings currently say. Almost all of it can be bought or read for free. The hard part is not sourcing, it's writing back — and the UK-specific evidence says the directories that matter most for trades are the ones with no write API at all.

Three findings that should shape the build.

First, for UK trades, Checkatrade is the whole game. In an August 2026 study of Google AI Mode answers for UK local businesses, Checkatrade appeared in 83% of trade answers (50 of 60) and once in 79 professional-service answers. A separate study the same month, this time of ChatGPT with web search across ten UK towns, found Checkatrade cited in 78 of 80 trade answers and MyBuilder in 70 of 80, with 72% of all cited sources being trade directories and the business's own website only 14%. Neither Checkatrade nor MyBuilder has a public API. That's the first integration to solve, and it will have to be a claimed-login browser agent, not an API call.

Second, the sources differ by engine and by sector, and the differences are large. Google's AI cited Google's own properties 128 times in 159 answers and Trustpilot twice. ChatGPT, on BrightLocal's cross-market study, cited Yelp in 80% of local answers and leans on Bing's index. Regulators and trade bodies (Gas Safe, RCVS, ACCA, TrustMark) were named as things for the customer to check but were never a cited source. So the source-trust map has to be per engine and per vertical, and the product should learn it empirically from DataForSEO's citation data rather than from anyone's blog post.

Third, the genuinely free, high-quality UK data is in the public registers nobody in the AI-visibility category is using: Companies House, the SRA, the FCA, CQC, the Food Standards Agency. Those give you verified facts about the business — legal name, status, address, regulated activities — for nothing, and they're exactly the corroboration a model wants.

Fourth, no source assumption survives contact with the engines for long. On 14 August 2026 Reddit lost 86% of its ChatGPT Search citation share in a single day, after two years as one of ChatGPT's most-cited domains, while Perplexity doubled its Reddit citations over the same weeks. The cause was a change in how ChatGPT constructs its background searches, not anything Reddit did. The same can happen to Checkatrade, Yelp or any directory in the tables below. The product must learn its source-trust map from live citation data, per engine, and re-learn it continuously; the studies in section 2 are a starting point, not a specification. The corollary is that the one source no engine can drop is the business's own site, which is why the site crawler and the quotable-page work carry more weight than they did a month ago.

---

## 2. What the engines actually cite for UK local businesses

Three studies, all from the last month, all small but consistent.

**Whito, UK local business citation index (Google AI Mode, 159 answers, late August 2026).** Trade answers cited a directory 95% of the time and Checkatrade 83%. Professional services (vets, dentists, accountants, estate agents) cited a directory 19% of the time and Checkatrade once. Google properties cited 128 times; Trustpilot twice. Regulators and registers appeared 111 times, but 95 of those were the engine telling the customer to check the register; only 16 were the engine citing it as a source. Gas Safe Register appeared ten times and was never a source. The study covers Google AI Mode only; a second engine is planned for Q4.

**Murray Digital, what ChatGPT recommends for local trades (GPT-4o with web search, 80 prompts, ten UK towns, 25 August 2026).** Checkatrade cited in 78 of 80 answers, MyBuilder 70 of 80, then Three Best Rated, Yell, TrustATrader, MyJobQuote and Which? Trusted Traders. Of 405 cited sources, 71.9% were trade directories, 13.8% the business's own site, 9.4% national operators. Only 19.4% of businesses in the Google map pack were named in the ChatGPT answer. The model does not go looking for local tradespeople; it reads the directory and repeats it.

**BrightLocal, where AI gets local citations (Google AI Overviews, AI Mode and ChatGPT, 162,966 citations across 6,025 domains, September 2026).** Yelp is 8.5% of all citations and the most common ChatGPT source by some distance, appearing in 80% of ChatGPT local answers. Apple's listing data appears as a source; Google Business Profile itself does not appear as a top cited domain. Vertical directories matter (OpenTable in the top five for restaurants). Twenty non-directory site types recur, so promotion beyond citations matters.

Two further claims circulating in UK SEO content, which I could not verify and would treat as hypotheses to test: that Foursquare's database powers 60 to 70% of ChatGPT's local results, and that Bing Places feeds ChatGPT directly. The second is plausible (ChatGPT's search runs on a Bing-connected index) and cheap to act on regardless.

**What this means for the build.** For trades, the fixing loop is: Checkatrade profile, MyBuilder, TrustATrader, Yell, Google Business Profile, own site, in that order. For professional services it's: Google Business Profile, own site, the relevant register, then Yelp and Trustpilot. Those are different products in practice, which is an argument for vertical packs from day one.

---

## 3. The data sources, by layer

### Layer A: what the machines say and cite

**DataForSEO AI Optimization API.** The primary source for the monitoring half of the loop. Four products: LLM Mentions (mention data, cited and non-cited sources, AI search volume, historical trends, Lite endpoints for cheaper recurring runs; covers Google AI Overview and ChatGPT with more platforms being added), LLM Responses (submit your own prompts, get structured answers from ChatGPT, Gemini, Claude, Perplexity in one format), LLM Scraper (cheaper aggregate of platform responses), and AI Keyword Data (search volume as phrased in AI tools). Live endpoints return in seconds, up to 2,000 calls a minute, pay per use, sandbox free. Combine with their SERP API for Google AI Overviews and AI Mode with cited sources.

Caveat: their mentions index launched with Google AI Overview (all locations) and ChatGPT (US only). UK depth for ChatGPT and Claude in the mentions index should be verified before launch; the LLM Responses endpoint fills the gap at higher cost per query.

**Cited versus chosen (added 18 September 2026).** Every monitoring record stores two states per engine, not one: cited (a client-owned or client-related URL appears in the answer's sources) and chosen (the client is named as the recommendation in the answer text). Public examples show the same brand cited-not-chosen on Gemini, chosen-not-cited on ChatGPT, both on Google AI Mode and absent on Claude for the same query. LLM Mentions returns both signals (mention records and cited sources); LLM Responses returns the answer text and sources so both can be extracted. "Share of AI decisions" is the chosen rate across the client's prompt set, per engine and blended.

**Direct model APIs (OpenAI, Anthropic, Google, Perplexity).** Not a replacement for DataForSEO — you'd be rebuilding their infrastructure — but useful as a verification layer for a specific client's specific claims, and for the accuracy check where you need the model to answer a precise question about one business. Note that consumer chat interfaces, API responses and web-search-enabled responses can differ; Peec scrapes the consumer interface for that reason. DataForSEO's scraper product covers the same ground.

### Layer B: what customers are asking

**DataForSEO Keyword Data and DataForSEO Labs.** Search volume, difficulty, related and question keywords, People Also Ask via the SERP API, Google autocomplete. Standard and cheap.

**DataForSEO AI Keyword Data.** The AI-phrased equivalent. Shows how the same intent is asked of assistants. This is the column Ahrefs and Semrush don't have.

**Search Console API.** The queries the client already gets impressions for, which is the best free source of "what people actually ask around this business" and catches the long tail nobody would have guessed.

**Reddit API and forum scraping.** Until mid-August Reddit was among the most-cited domains in ChatGPT Search answers, holding a steady 3.8% share of citations from 18 July to 7 August 2026. On 14 August that fell below 1% and has stayed there, an 86% drop (Promptwatch); Pierview's separate tracking shows roughly 250 Reddit citations a day falling to 16. Over the same window Perplexity's Reddit citations roughly doubled and Gemini stayed flat, so this is a ChatGPT retrieval change, not a Reddit penalty. The likely mechanism is ChatGPT's 8 August shift to site-scoped background queries (site: operator use jumped from about 0.4% to nearly 17% of fan-out queries). For UK local businesses Reddit was never a major source; for professional services and B2B it remains a source of questions and of Perplexity citations. Reddit's API is paid and rate-limited and scraping is against its terms. Treat as monitor-only: track it in the source map, don't build for it.

**Client's own inbound.** Enquiry forms, call recordings, email. Not an integration on day one, but the richest source of real questions and worth a simple "paste the last twenty enquiries" onboarding step.

### Layer C: what actually happened

**Google Search Console API.** Free. Queries, pages, clicks, impressions, position, by day, device and country, sixteen months of history. Two to three day lag; some queries anonymised. The results column of the page ledger.

**GA4 Data API.** Free. Sessions and conversions by landing page and source. AI referrals (chatgpt.com, perplexity.ai, claude.ai, copilot) appear as distinct referral sources, which is half of AI attribution for nothing.

**Bing Webmaster Tools API.** Free. Same shape as Search Console, thinner data, and it's the index behind Copilot and ChatGPT's search.

**Google Business Profile Performance API.** Free with GBP API access. Calls, direction requests, website clicks, profile views, search queries that surfaced the profile.

**AI crawler logs.** GA4 is blind to AI bots because they don't execute JavaScript; the only place to see GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot and the live-retrieval fetchers (ChatGPT-User, Perplexity-User) is server or CDN logs. Cloudflare exposes bot analytics on the free plan and supports log drains; Vercel and Netlify likewise. Separate training crawlers from live retrieval fetchers — the latter correlate with actual citations. Verify by reverse DNS, since user agents are trivially spoofed. For small-business sites on shared hosting this is often unavailable; putting the client behind Cloudflare (free) is the simplest fix and also gives you a place to serve llms.txt and manage bot access.

### Layer D: what is true about the business

**Companies House Public Data API.** Free, API key, generous limits. Registered name, number, status, registered office, incorporation date, officers, SIC codes. The single best corroboration source for any UK limited company and the natural seed for the business record.

**Solicitors Regulation Authority API.** Free programmatic access to the register of firms and individuals the SRA regulates, with an attribution requirement.

**Other UK registers with open APIs (not verified in this pass, but known to exist as of 2025): FCA Financial Services Register API, CQC (Care Quality Commission) API, Food Standards Agency Food Hygiene Rating Scheme API, Charity Commission API.** Each gives verified status and details for a regulated vertical. Worth confirming current terms before relying on them.

**Registers with no API: Gas Safe Register, NICEIC, TrustMark, WaterSafe, RCVS, GDC, GMC.** Search-only web interfaces. Verify a client's registration once at onboarding via a browser agent and store the result; don't try to sync. The citation studies show engines name these but don't read them, so their value is as a fact you state and link, not as a source you push data to.

### Layer E: directories, listings and reviews

This is where the money and the pain are. The table in section 4 covers each; the summary is:

**Proper write APIs exist for four: Google Business Profile, Bing Places, Apple Business Connect, Facebook/Meta Pages.** All four are partner or application-gated. GBP requires a formal access request in Google Cloud Console, a legitimate use case, a verified profile active for 60-plus days, and a business website; new projects start with zero quota. It is free once approved. Bing Places API access is for verified partners and agencies, and the agency route changed in October 2025 with reports of the sign-up link being hard to find. Apple's Business API is for approved partners, with etag-based concurrency to avoid overwriting the business's own edits and a notifications API for publishing state. Meta's Pages API is standard Graph API with page-management permissions through app review.

**Trustpilot has a partner programme.** The Trusted Integration Program gives partner API keys, an OAuth flow per customer, and access to reviews and business unit data. Writing business details is limited; the value is reviews in and invitations out.

**The UK trade directories have no APIs at all: Checkatrade, MyBuilder, TrustATrader, Rated People, Which? Trusted Traders, MyJobQuote, Three Best Rated.** Reading is possible via scrapers (Apify has maintained actors for Checkatrade, TrustATrader and Yell at a few dollars per thousand profiles). Writing means logging in as the business and changing the profile — a browser agent with the client's credentials, or a task handed to the client with the exact text. Given these are the most-cited sources for trades, this is the integration that decides whether the product works.

**General UK directories: Yell, FreeIndex, Thomson Local, Scoot (syndicates to six others), 192.com, Cylex, Hotfrog.** No write APIs. Scrape to read, browser agent or manual to write. Yell in particular is cited by both ChatGPT and Google AI for trades and is behind Cloudflare, so scraping needs care.

**Yelp UK.** Fusion API for reading business data and a handful of reviews; no write API for owners. Cited in 80% of ChatGPT local answers in BrightLocal's data, so worth ensuring the profile is claimed and correct.

**Foursquare Places API.** Read access to place data; claiming and editing is through Foursquare for Business. If the "powers ChatGPT local" claim holds up, this becomes a priority.

**Tripadvisor Content API** for hospitality; **Doctify** for healthcare; **Law Society Find a Solicitor** for legal. Vertical-specific, read-only or manual.

**The alternative: rent a distribution network.** Yext, Uberall, Synup, PinMeTo and newer API-first services like Listings API sell a single write endpoint that pushes to dozens of directories through their publisher agreements, including Bing Places as a publishing partner and Apple. This buys the four big write integrations and a long tail in one contract, at a per-location fee, and some offer white-label. It does not cover Checkatrade, MyBuilder or the UK trade directories, because nobody has agreements with them. So even with a reseller, you still build the trade-directory browser agents yourself.

### Layer E2: corroboration — what the web says about the business (added 18 September 2026)

For professional services and any client where directories carry little weight, the main lever for being chosen is independent evidence, and it's a fix category as well as a data source. Read: trade press and local press (news search via SERP API; DataForSEO's Content Analysis API for brand mentions and sentiment across the web), community threads (Reddit via API for Perplexity's benefit; industry forums), partner and supplier pages, association member lists, podcast and event listings, YouTube (DataForSEO has YouTube SERP endpoints; Ahrefs tracks YouTube and TikTok mentions in beta). Write: none of these has an API for placement; the fix is an agent-drafted pitch, guest piece, request or reply, sent by or as the client, with the placement logged in the ledger and its effect measured in the next citation run. Track the corroborating domains each engine actually cites for the vertical (from layer A) and prioritise placements there.

### Layer F: the client's own site

**Your crawler.** Owned and monitored sites only. Page content, headings, schema, llms.txt, internal links, response codes, change detection week on week. Cheap, and everything else hangs off it.

**CMS write access.** WordPress REST API, Webflow API, Shopify Admin API, Squarespace (limited), Wix. Plus Google Business Profile posts via the LocalPosts API for businesses without a site worth speaking of.

### Layer G: e-commerce (second product — added 14 September 2026)

A store's AI visibility runs on a different set of sources from a service firm's, and the fixing loop is different: product data rather than directory listings. Not verified in the same depth as layers A to F; treat as the map to research when the second product is scoped.

**Product feeds and merchant listings.** Google Merchant Center (Content API for Shopping / Merchant API) is the source Google AI Overviews and AI Mode shopping results draw on, and the write API is mature and free. Bing Merchant Center likewise for Copilot and ChatGPT's Bing-connected index. OpenAI's Agentic Commerce Protocol and ChatGPT Shopping take a product feed directly; the merchant integration is via feed specification, with Shopify, Etsy and others already connected. Getting the feed correct, complete and consistent is the e-commerce equivalent of listings sync.

**Product schema and on-site data.** Product, Offer, AggregateRating and Review markup on every product page, plus availability and price accuracy. The own-site crawler from layer F does this; the checks are different.

**Review platforms.** Trustpilot (partner API, layer E), Google customer reviews via Merchant Center, Reviews.io, Feefo, Yotpo, Judge.me. Review volume and recency are heavily weighted in shopping answers.

**Marketplaces and comparison.** Amazon listings (Selling Partner API), eBay, Google Shopping comparison, PriceRunner and idealo in the UK. Assistants cite marketplaces for product questions the way they cite directories for local ones; the BrightLocal and Profound commerce data both show marketplaces and retailer pages dominating shopping citations.

**Attribution.** GA4 e-commerce events and Shopify/WooCommerce order data, with AI referral sources (chatgpt.com, perplexity.ai) separated, so the headline is orders and revenue from AI, not mentions.

**Monitoring.** DataForSEO's AI Optimization endpoints cover product prompts; Profound's ChatGPT Shopping visibility and Goodie's Agentic Commerce Optimizer are the competitive references. Prompt sets are product-and-category questions ("best waterproof walking boots under £150") rather than local ones.

**What's different about the fixing loop.** Almost everything writable has an API (Merchant Center, Shopify, Amazon), so the browser-agent work that defines the service-business moat is largely absent. The e-commerce moat is instead in feed quality, review velocity, and attribution to orders — which favours a product with deep Shopify/WooCommerce integration over one with directory integrations. This is why it is a second product, not a second vertical.

---

## 4. Source-by-source table

| Source | What you get | Read access | Write access | Cost | Priority |
|---|---|---|---|---|---|
| DataForSEO AI Optimization | AI mentions, citations, responses, AI keyword volume | API, live | n/a | Per call | Day one |
| DataForSEO SERP / Keywords / Labs / Backlinks / On-Page | Rankings, AI Overviews, keyword demand, links, audits | API | n/a | Per call | Day one |
| Google Search Console | Real queries, clicks, impressions per page | API, OAuth | n/a | Free | Day one |
| GA4 | Sessions, conversions, AI referral sources | API, OAuth | n/a | Free | Day one |
| Bing Webmaster Tools | Same as GSC for Bing/Copilot | API, OAuth | n/a | Free | Day one |
| Google Business Profile | Location data, reviews, posts, performance | API, OAuth | Yes | Free, access application, 60-day verified profile | Day one |
| Companies House | Verified company facts | API key | n/a | Free | Day one |
| Own site crawler | Page content, schema, changes | Build | via CMS APIs | Hosting | Day one |
| Cloudflare / CDN logs | AI crawler activity | Log drain / analytics | n/a | Free tier | Early |
| Checkatrade | Profile, rating, reviews (most-cited for trades) | Scrape | Browser agent / manual | Scraper ~$2-3 per 1k | Early, trades |
| MyBuilder, TrustATrader, Rated People, Which? TT | Profile, rating | Scrape | Browser agent / manual | Scraper | Early, trades |
| Yell | Profile, reviews | Scrape (Cloudflare) | Browser agent / manual | Scraper | Early |
| Bing Places | Listing | API (partner) | Yes (partner) | Free, partner approval | Early |
| Apple Business Connect | Place card | API (partner) | Yes (partner, etag) | Free, partner approval | Early |
| Meta Pages | Page info, posts | Graph API | Yes, app review | Free | Early |
| Trustpilot | Reviews, business unit | Partner API, OAuth | Limited | Partner programme | Mid |
| Yelp UK | Business data, some reviews | Fusion API | No | Free tier | Mid |
| Foursquare | Place data | Places API | Via FSQ for Business | Free tier | Mid, verify claim |
| SRA / FCA / CQC / FSA / Charity Commission | Regulated status, details | API | n/a | Free | Mid, per vertical |
| Gas Safe, NICEIC, TrustMark, RCVS etc. | Registration status | Browser check | n/a | Free | Onboarding check only |
| FreeIndex, Thomson Local, Scoot, 192.com | Listing | Scrape | Manual | Low | Late |
| Reddit | Questions, mentions; Perplexity citations only since Aug 2026 | Paid API | n/a | Paid | Monitor only |
| Listings reseller (Yext/Uberall/Synup/Listings API) | One write endpoint to 50-200 directories | API | Yes | Per location per month | Decision point |

---

## 5. Recommended build order

**Phase one: see and prove.** DataForSEO AI Optimization plus SERP, Search Console, GA4, Bing Webmaster, Companies House, own-site crawler. Everything here is API-clean, mostly free, and gives you the scan, the ledger and the results column. Apply for GBP API access on day one because approval takes time and needs a verified profile that's been live sixty days.

**Phase two: the four big writes.** GBP write, Bing Places partner access, Apple Business partner access, Meta Pages. These are the listings that feed the engines' own indexes. Decide here whether to build the partner relationships yourself or rent them from a listings API. Renting gets you live in weeks; building gets you margin and independence. For a product aimed at UK sole traders at £30 a month, the per-location reseller fee may be most of the gross margin, which argues for building the four yourself and renting nothing.

**Phase three: the trade directories.** Checkatrade first, then MyBuilder, TrustATrader, Yell. Scrapers to read, a credential-vault plus browser agent to write, with a human-approval step before any change goes live and full audit logging. This is the unglamorous work and it's where the product either works for a plumber or doesn't. Budget for these to break every few months when the sites change.

**Phase four: corroboration and reviews.** Trustpilot partner programme, Yelp, Foursquare, vertical registers with APIs, Cloudflare crawler logs. These strengthen the source-trust map and the attribution story.

**Phase five: learn.** By this point the citation data from DataForSEO, joined to the ledger, tells you per engine and per vertical which sources actually move mentions. That learned map replaces the three blog studies above and is the thing nobody else has.

---

## 6. Risks and things to verify before committing

GBP API approval is not automatic and Google can decline or throttle; have the application in early and have a fallback (browser agent against the GBP web UI, which is fragile).

Bing Places partner access appears to have changed in October 2025 and forum posts show developers struggling to find the agency sign-up. Confirm the current route before assuming it's available.

Scraping Checkatrade, Yell and the others is against their terms and behind bot protection. Reading public profile pages at low volume for a client who is themselves a member is defensible; bulk scraping is not. Keep it per-client, low-frequency, and log it. Do not build the product on Apify actors you don't control; treat them as a prototype and bring the scrapers in-house.

Writing to directories via browser agent with stored client credentials is a security and liability question. Credential vault, per-client isolation, human approval on every change, and a clear consent step at onboarding. This is also what a security-minded agency partner will ask about first.

DataForSEO's mentions index coverage for UK ChatGPT and for Claude needs checking against real queries for a handful of UK trades before you price the recurring monitoring.

The Foursquare and Bing-feeds-ChatGPT claims are unverified. Test them: change a fact on Bing Places and Foursquare only, wait, and see which engines pick it up.

Every register that has no API should be treated as a one-time verification at onboarding, not a sync target. The studies show engines name them but don't read them.

Source weights are volatile and engine-specific. The August 2026 Reddit collapse in ChatGPT (86% in a day, while Perplexity rose and Gemini held) shows a directory or platform can drop out of one engine's candidate pool overnight. Do not hard-code any directory as a priority in the product; store the priority as a learned, per-engine, per-vertical weight that the weekly citation data updates, and alert when a source's share moves by more than a set threshold. Build the fixing loop so that a source losing weight simply lowers its position in the client's to-do list rather than breaking anything.

---

## 7. Sources consulted

Whito, What AI actually cites when it recommends a UK local business (Sept 2026) · Murray Digital, AI visibility: what ChatGPT recommends for local trades (Aug 2026) · BrightLocal, Where to get local citations for AI search (Sept 2026) · Whitehat SEO, Best UK business directories and citation sites (Mar 2026) · Stagg Studios, How to get recommended by ChatGPT: UK business guide · Local Falcon, ChatGPT local search data sources · Promptwatch, Which websites ChatGPT cites most · DataForSEO, AI Optimization API overview, LLM Mentions API, pricing and GEO solutions pages · Google, Business Profile APIs overview, pricing, latest updates and accounts.locations reference · SlashPost, Google Business Profile API 2026 guide · Google Developer Forums, GBP OAuth and quota thread (Jun 2026) · Microsoft Q&A, Bing Places for Business API overview and multi-location threads · Listings API, Bing network page · PinMeTo, Bing Places and Apple Maps pages · Apple Business Partner Guides, Business API · Trustpilot Developers, Technology partners and Build a partner integration · Parse.bot, Trustpilot UK API · Apify, Yell, Checkatrade and TrustATrader scraper listings · Companies House, Developer API suite and Public Data API reference · Solicitors Regulation Authority, Register API portal · Similarweb, Log file analysis for AI bots · Digital Applied, AI crawler and bot traffic statistics 2026 · Promptwatch, Agent Analytics · Ighenatt, AI bot log analysis · Open Shadow, Monitor AI bot traffic · xSeek, Best tools to track AI crawlers · ClayHog, AI crawler logs · Citeflow, Monitor AI crawler server logs · Tradeskills4u and Trades Web Studio, UK trade directory comparisons · Promptwatch, Reddit citations are dropping in ChatGPT and Why did ChatGPT stop citing Reddit (Aug 2026) · Search Engine Land and Search Engine Journal, Reddit ChatGPT citation drop coverage (19 Aug 2026) · Semrush, Reddit's ChatGPT citations drop from 3.8% to 0.5% (26 Aug 2026) · Pierview, Reddit citations fell off a cliff in ChatGPT while Perplexity doubled down (Aug 2026).
