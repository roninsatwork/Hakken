import { AI_ENGINES, AI_ENGINE_NAMES } from "./seoAiEngines";
import { type Infer, v } from "convex/values";
import { ASSISTANT_PAGE_CHARTS_CONNECTOR } from "./toolConnectorPageCharts";

export const connectorCategoryValidator = v.union(
  v.literal("KNOWLEDGE"),
  v.literal("PROFILE"),
  v.literal("WORKFLOW"),
  v.literal("HTTP"),
  v.literal("EMAIL"),
  v.literal("VOICE"),
  v.literal("CUSTOM"),
);
export const connectorAuthModeValidator = v.union(
  v.literal("NONE"),
  v.literal("SECRET_REF"),
  v.literal("OAUTH"),
);
export const toolSideEffectLevelValidator = v.union(
  v.literal("READ"),
  v.literal("WRITE"),
  v.literal("DESTRUCTIVE"),
  v.literal("EXTERNAL"),
);

type ConnectorCategory = Infer<typeof connectorCategoryValidator>;
type ConnectorAuthMode = Infer<typeof connectorAuthModeValidator>;
type ToolSideEffectLevel = Infer<typeof toolSideEffectLevelValidator>;

export const connectorToolDefinitionValidator = v.object({
  name: v.string(),
  description: v.string(),
  handlerMapping: v.string(),
  modelName: v.string(),
  requiredRole: v.union(v.literal("ADMIN"), v.literal("SUPER_ADMIN")),
  sideEffectLevel: toolSideEffectLevelValidator,
  confirmationRequired: v.boolean(),
  inputSchema: v.optional(v.string()),
  outputSchema: v.optional(v.string()),
  secretRefKeys: v.optional(v.array(v.string())),
});

export const toolConnectorDefinitionValidator = v.object({
  key: v.string(),
  name: v.string(),
  description: v.string(),
  category: connectorCategoryValidator,
  authMode: connectorAuthModeValidator,
  oauthProvider: v.optional(v.string()),
  tenantAvailability: v.union(v.literal("GLOBAL"), v.literal("TENANT_RESTRICTED")),
  requiredScopes: v.array(v.string()),
  requiredSecretRefs: v.array(v.string()),
  accountRefLabel: v.optional(v.string()),
  toolDefinitions: v.array(connectorToolDefinitionValidator),
});

export type ConnectorToolDefinition = {
  name: string;
  description: string;
  handlerMapping: string;
  /**
   * What the model is offered this tool as.
   *
   * Chosen, not derived. Lower-case snake_case, a verb and a noun — the model
   * reads this to decide whether the tool is the one it wants, so
   * `read_mailbox` earns its place where `gmail_read` merely described the
   * plumbing. See `toolModelName.ts`.
   */
  modelName: string;
  requiredRole: "ADMIN" | "SUPER_ADMIN";
  sideEffectLevel: ToolSideEffectLevel;
  confirmationRequired: boolean;
  inputSchema?: string;
  outputSchema?: string;
  secretRefKeys?: string[];
};

export type ToolConnectorDefinition = {
  key: string;
  name: string;
  description: string;
  category: ConnectorCategory;
  authMode: ConnectorAuthMode;
  oauthProvider?: string;
  tenantAvailability: "GLOBAL" | "TENANT_RESTRICTED";
  requiredScopes: string[];
  requiredSecretRefs: string[];
  /**
   * When set, the admin screen shows a field for the external account this
   * install is bound to (stored as authAccountRef) — the phone number a
   * voice line answers, for example. OAuth connectors never set this: their
   * account ref belongs to the consent flow.
   */
  accountRefLabel?: string;
  toolDefinitions: ConnectorToolDefinition[];
};

/** The phone line's connector key, shared with the telephony webhook. */
export const TWILIO_VOICE_CONNECTOR_KEY = "twilio-voice";

/** The secret reference holding the Twilio auth token. */
export const TWILIO_AUTH_TOKEN_SECRET_REF = "twilio/auth-token";

export const BUILT_IN_TOOL_CONNECTORS: ToolConnectorDefinition[] = [
  {
    key: "dataforseo",
    name: "DataForSEO",
    description:
      "Collects search data for the websites a company holds — what they rank for, who links "
      + "to them, and how their competitors compare. The agent says which company to collect "
      + "for; the platform decides what to ask and when.",
    category: "HTTP",
    // The account stays in the backend environment, so the agent never handles
    // the credential and cannot be talked into revealing it.
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: ["dataforseo:collect"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "See what search data can be collected",
        description:
          "Lists the kinds of search data that can be asked for, and what each one needs. "
          + "Read this before asking for something rather than guessing a name.",
        handlerMapping: "dataforseo.operations.list",
        modelName: "list_search_data_types",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({ type: "object", properties: {} }),
      },
      {
        name: "Start a company's collection run",
        description:
          "Begins the scheduled collection for a company: every website it holds, and the "
          + "competitors tracked against each. Returns as soon as the work list is opened — "
          + "the collecting happens afterwards and takes as long as it takes.",
        handlerMapping: "dataforseo.collection.start",
        modelName: "start_collection_run",
        requiredRole: "ADMIN",
        // It commits the platform to spending money, even though the agent
        // never sends a request itself.
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({ type: "object", properties: {} }),
      },
      {
        name: "Ask for one website's data now",
        description:
          "Asks for one kind of search data about one website the company holds, without "
          + "waiting for its schedule. If that question was already asked today, this costs "
          + "nothing and the existing answer is used.",
        handlerMapping: "dataforseo.pull.request",
        modelName: "request_website_data",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            website: {
              type: "string",
              description: "The website to ask about, as a domain — 'example.com'.",
            },
            data_type: {
              type: "string",
              description:
                "Which kind of data to ask for. Use the listing tool to see the names.",
            },
          },
          required: ["website", "data_type"],
        }),
      },
      {
        name: "Read a website's collected numbers",
        description:
          "The search numbers already held for one website the company holds: rankings, "
          + "backlink counts and keyword positions by day. Reads what has been collected; "
          + "collects nothing and costs nothing.",
        handlerMapping: "dataforseo.metrics.read",
        modelName: "read_website_search_data",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            website: {
              type: "string",
              description: "The website to read, as a domain — 'example.com'.",
            },
            days: {
              type: "number",
              description: "How many days back to read. Leave unset for 30.",
            },
          },
          required: ["website"],
        }),
      },
    ],
  },
  {
    key: "apify-actor",
    name: "Apify",
    description:
      "Lets an agent run any job on Apify. The agent chooses which scraper to use, what to "
      + "point it at, and what settings to give it.",
    category: "HTTP",
    // The account token stays in the environment, so the agent can start work
    // without ever seeing the credential. Which job runs, and what it is
    // pointed at, is the agent's decision — that is the point of the tool, and
    // it is what lets one connector serve any use case without the platform
    // learning about any of them.
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: ["apify:run"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Find an Apify job",
        description:
          "Looks up jobs on Apify. Give it something to search for — 'public company records' "
          + "— to see what jobs exist, or give it a job id to see exactly what settings that job "
          + "needs. Use this before running a job rather than guessing its settings.",
        handlerMapping: "apify.actor.describe",
        modelName: "describe_scraper_job",
        requiredRole: "ADMIN",
        // Reads the public catalogue. Nothing runs and nothing is charged.
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            search: {
              type: "string",
              description: "What kind of job you are looking for, in plain words.",
            },
            job: {
              type: "string",
              description: "A known job id, to read its settings — for example 'apify/web-scraper'.",
            },
          },
        }),
      },
      {
        name: "Apify",
        description:
          "Runs a job on Apify. Give it the job's id from the Apify store and the settings that "
          + "job expects, including any addresses to visit. It starts the job and reports back "
          + "straight away — the results arrive a few minutes later, so do not expect them in "
          + "the same answer.",
        handlerMapping: "apify.actor.run",
        modelName: "run_scraper_job",
        requiredRole: "ADMIN",
        // It leaves the platform and it costs money per item collected.
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["job"],
          properties: {
            job: {
              type: "string",
              description:
                "The id of the Apify job to run, as it appears in the Apify store — for example "
                + "'apify/website-content-crawler'.",
            },
            settings: {
              type: "string",
              description:
                "The settings for this job, as JSON. What goes in here is decided by the job "
                + "itself — for a property scraper it might be the search address and how many "
                + "listings to collect.",
            },
          },
        }),
      },
    ],
  },
  {
    key: "hakken-firecrawl",
    name: "Firecrawl",
    description: "Lets an agent read a page on the web and use what it says.",
    category: "KNOWLEDGE",
    // The key lives in the environment, as it already does for document
    // ingestion, rather than being typed in here.
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: [],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Firecrawl",
        description:
          "Fetches a web page and returns its readable text. Use it to look something up on a "
          + "site rather than answering from memory. Give it the full address of one page.",
        handlerMapping: "web.scrape",
        modelName: "read_web_page",
        requiredRole: "ADMIN",
        // Nothing is written, but it leaves the platform and it costs money,
        // which is not the same as reading our own data.
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string", description: "The full address of the page to read." },
            mainContentOnly: {
              type: "boolean",
              description:
                "Defaults to true, which returns the article and drops navigation. Set it to "
                + "false when the page's real content is a list or a directory — on some sites "
                + "those sit outside the main article and are dropped otherwise.",
            },
          },
        }),
      },
    ],
  },
  {
    key: "hakken-knowledge",
    name: "Knowledge search",
    description: "Lets an agent search the documents you have uploaded, and quote from them.",
    category: "KNOWLEDGE",
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: ["knowledge:read"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Knowledge Search",
        description: "Searches your approved documents and returns short quotes with their source.",
        handlerMapping: "knowledge.search",
        modelName: "search_knowledge",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
          },
        }),
      },
    ],
  },
  {
    key: "hakken-company-profile",
    name: "Company profile",
    description: "Lets an agent read and update the company details it is working for.",
    category: "PROFILE",
    authMode: "NONE",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["company:read", "company:write"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Update Company Overview",
        description: "Updates the company overview, once a person has approved it.",
        handlerMapping: "company.overview.update",
        modelName: "update_company_profile",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["overview"],
          properties: {
            overview: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "hakken-tasks",
    name: "Tasks",
    description: "Lets an agent leave a job for a person, instead of only writing an answer nobody returns to.",
    category: "PROFILE",
    authMode: "NONE",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["task:write"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Raise a task",
        description:
          "Creates a task for someone in this workspace. Give the person's email address to assign it; leave it out and the task waits for whoever picks it up.",
        handlerMapping: "task.create",
        modelName: "create_task",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string", description: "What needs doing, in one line." },
            detail: { type: "string", description: "Any context the person will need. Optional." },
            assigneeEmail: {
              type: "string",
              description: "The email address of the person in this workspace it is for. Optional.",
            },
            dueDate: { type: "string", description: "When it is due, as YYYY-MM-DD. Optional." },
          },
        }),
      },
    ],
  },
  {
    key: "http-rest",
    name: "Call an API",
    description: "Lets an agent call another system over the web. You set the address and the credentials; the agent only chooses what to ask for.",
    category: "HTTP",
    authMode: "SECRET_REF",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["http:request"],
    requiredSecretRefs: ["base_url", "auth_header"],
    toolDefinitions: [
      {
        name: "HTTP Request",
        description: "Calls the API you have set up. The address and credentials come from your settings, never from the agent.",
        handlerMapping: "http.request",
        modelName: "call_api",
        requiredRole: "SUPER_ADMIN",
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: true,
        secretRefKeys: ["base_url", "auth_header"],
        inputSchema: JSON.stringify({
          type: "object",
          required: ["method", "path"],
          properties: {
            method: { type: "string" },
            path: { type: "string" },
            bodyJson: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "email-notification",
    name: "Email and notifications",
    description: "Lets an agent email or notify people in your workspace.",
    category: "EMAIL",
    authMode: "SECRET_REF",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["notification:send"],
    requiredSecretRefs: ["provider_api_key", "from_address"],
    toolDefinitions: [
      {
        name: "Send Notification",
        description: "Sends an email or notification to approved recipients.",
        handlerMapping: "notification.send",
        modelName: "send_notification",
        requiredRole: "ADMIN",
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: true,
        secretRefKeys: ["provider_api_key", "from_address"],
        inputSchema: JSON.stringify({
          type: "object",
          required: ["to", "subject", "body"],
          properties: {
            to: { type: "string" },
            subject: { type: "string" },
            body: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: TWILIO_VOICE_CONNECTOR_KEY,
    name: "Twilio Phone Line",
    description:
      "The phone number the platform answers. Claiming a number here routes its calls to this "
      + "workspace's voice agent; the connector's switch is the off button — turned off, every "
      + "caller hears a polite refusal and nothing is spent.",
    category: "VOICE",
    // Like Apify: the Twilio auth token already lives in the deployment
    // environment (TWILIO_AUTH_TOKEN), so the admin has nothing to configure
    // here beyond the number. CONNECTOR_SECRET_TWILIO_AUTH_TOKEN, when set,
    // overrides it for connector-claimed numbers.
    authMode: "NONE",
    // A phone number belongs to one workspace: its calls are that company's
    // conversations and spend its plan.
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: [],
    requiredSecretRefs: [],
    accountRefLabel: "Phone number",
    // No AI-callable tools: the phone line is an inbound door, not something
    // an agent may pick up and use.
    toolDefinitions: [],
  },
  {
    // The company's own figures for the Assistant (docs/plans/active/
    // assistant-foundation-plan.md, item 7). Global: one install serves every
    // company, because the company is the conversation's, never an argument.
    key: "assistant-figures",
    name: "Company figures",
    description:
      "Lets the Assistant read the company's own figures — its websites, their Sites overview, Search Console, AI answers and open tasks — through the same reads the screens use.",
    category: "KNOWLEDGE",
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: ["company:read"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "List the company's websites",
        description:
          "Lists the company's websites — its own and the competitors each is measured against — with the address of each one's Sites screen. Use it first when you are not sure which website is meant.",
        handlerMapping: "assistant.websites",
        modelName: "list_websites",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({ type: "object", properties: {} }),
      },
      {
        name: "Read a website's overview",
        description:
          "A website's headline figures from its Sites overview — the company's own or a competitor it tracks: searches it ranks for, pages ranking, searches in Google's top three, linking websites, searches gained and lost since the last check, AI answers naming it. With a `screen`, one Visibility screen's own figures, as the screen shows them, over a calendar `period` where the screen follows the dates (thisWeek, lastWeek, thisMonth, lastMonth, last3Months, last6Months or last12Months): overview (each check's figures in the dates and the check before them, and the rivals' visitors and the searches you share); googleAbove (each tracked search's websites above you, rivals marked); googleFeatures (the features on the tracked searches, and AI Overviews, map packs and answer boxes across everything it ranks for); googleMoves (searches moved up and down at each check, and over the span before); googleSearches (each tracked search's place, move and best); competitors (each website of the group at its newest check, their visitors over the dates, the searches each ranks above you on, and what the rivals did lately); competitorsMap (every website of the market: searches ranked for, visitors, searches shared); competitorsRival (`rival`: one rival against the website, and both lines of visitors); aiDemand (how often its searches are asked of AI against searched on Google, the last 12 months); aiMentions (each question and assistant, named of asked, and each check's answers naming it); aiShare (each assistant's answers naming each website of the group); radar (Google's AI Overviews naming the business and its rivals, month by month, and the questions behind them); mentions and mentionsRivals (pages across the web naming the business, and against the rivals); reviews and reviewsRivals (its reviews, and against the rivals'); paid (searches with adverts and the visits they bring); audit (the newest crawl's problems, and each crawl in the dates). Visibility checks a website and its rivals about once a month, so a short period may hold no check: say so, and offer a longer one. Never money: what adverts or clicks cost and what visits would be worth are never given. Give the figures with the link returned, so the reader can check them.",
        handlerMapping: "assistant.site.overview",
        modelName: "read_site_overview",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["website"],
          properties: {
            website: { type: "string", description: "The website's address, e.g. example.co.uk — one of the company's, from list_websites." },
            screen: { type: "string", enum: ["overview", "googleAbove", "googleFeatures", "googleMoves", "googleSearches", "competitors", "competitorsMap", "competitorsRival", "aiDemand", "aiMentions", "aiShare", "radar", "mentions", "mentionsRivals", "reviews", "reviewsRivals", "paid", "audit"], description: "One Visibility screen to read. Leave out for the headline figures." },
            period: { type: "string", enum: ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"], description: "For a screen that follows the dates. lastMonth when the question names no time." },
            rival: { type: "string", description: "For competitorsRival: the rival's address, e.g. rival.co.uk. Leave out for the biggest." },
          },
        }),
      },
      {
        name: "Read Search Console",
        description:
          "One of the company's own websites' Google Search Console figures — clicks, impressions, click-through rate and average position — over one calendar period — the screens' own: thisWeek, lastWeek, thisMonth, lastMonth, last3Months, last6Months or last12Months, weeks Monday to Sunday — set against the period before as the screens set it, for the whole website or the pages whose address contains `page`. With a `screen`, one Search Console screen's own figures, as the screen shows them: performance (the overview: totals against the span before, and each day or week); keywords and pages (the lists, most clicks first, with each row's clicks, times shown, click rate and place against before; `search` finds words in them); brand (searches for the business's own name against every other: clicks and times shown now and before, and the searches that gained and lost most); bands (searches in Google's top 3, 4 to 10, 11 to 20 and below, now and before, each band's clicks, and the searches into and out of the top 3 and first page); ctrCurve (the share clicked at each place 1 to 20, now and the span before); services (times shown and clicks for each of the business's services, against before); updates (each Google update in the dates, the website's 14 days before against the 14 after); newLost (searches and pages new and lost, against before, and where on Google they sit); volatility (how much the places moved each day, out of 10, against the website's usual, and the searches that moved most); keyword and page (`key`: one search's or page's own figures and its place, beside the whole website's click rate at the same place). Search Console's newest day is about three days behind, and Google gives these figures to a website's owner only, so a competitor has none: read its Sites overview instead. Never money. Give the figures with the link returned.",
        handlerMapping: "assistant.searchConsole",
        modelName: "read_search_console",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["website", "period"],
          properties: {
            website: { type: "string", description: "The website's address, e.g. example.co.uk — one of the company's, from list_websites." },
            period: { type: "string", enum: ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"], description: "lastMonth when the question names no time." },
            page: { type: "string", description: "Part of a page's address, e.g. /boiler-repair. Leave out for the whole website." },
            screen: { type: "string", enum: ["performance", "keywords", "pages", "brand", "bands", "ctrCurve", "services", "updates", "newLost", "volatility", "keyword", "page"], description: "One Search Console screen to read. Leave out for the website's totals." },
            key: { type: "string", description: "For keyword and page: the search's words, or the page's address." },
            search: { type: "string", description: "For keywords and pages: words to find in the list. Optional." },
          },
        }),
      },
      {
        name: "Read AI answers",
        description:
          "How each AI engine the platform asks treats a website — the company's own or a competitor it tracks — on each question the company tracks: named, recommended, warned against or not named in its latest answer, and how often over its latest answers. Give the answer with the link returned.",
        handlerMapping: "assistant.ai.mentions",
        modelName: "read_ai_mentions",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["website"],
          properties: {
            website: { type: "string", description: "The website's address, e.g. example.co.uk — one of the company's, from list_websites." },
            question: { type: "string", description: "Words from a tracked question, to read just that one. Optional." },
          },
        }),
      },
      {
        name: "Read open tasks",
        description: "The company's open tasks — what needs doing, who it is for and when it is due — with the link to the Tasks screen.",
        handlerMapping: "assistant.tasks.open",
        modelName: "read_open_tasks",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({ type: "object", properties: {} }),
      },
    ],
  },
  {
    // Every Google Analytics screen and figure, for the Assistant
    // (docs/plans/active/google-analytics-plan.md §18.6.8). Its own connector,
    // as the charts and the advice are, so it reaches an Assistant already installed.
    key: "assistant-analytics",
    name: "Assistant Google Analytics",
    description:
      "Lets the Assistant read every Google Analytics screen of the company's own websites, and who is on one right now, through the same reads the screens use.",
    category: "KNOWLEDGE",
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: ["company:read"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Read Google Analytics",
        description:
          "One Google Analytics screen of one of the company's own websites, over one calendar period — the screens' own: thisWeek, lastWeek, thisMonth, lastMonth, last3Months, last6Months or last12Months, weeks Monday to Sunday — with the figures the screen shows and its link. Screens: overview (the page as it reads now: visits and what was bought, or events on a website that sells nothing, against the span before; the channel with the biggest change and the best for its visits; how visits ended as squares; and where visits came from against where sales or events came from, by channel, device and new or returning. part days gives each day. part pages gives Classifications and top pages); channels (where visits came from and where they started: the four boxes each naming a channel, every channel each day with every key event's times, each channel by Classification and by device against the dates before, how far people got, and the table. Never money, and never what a channel cost. On a website with nothing bought it says events, not conversions. Conversions and events count times, not visits, so a figure for every 100 visits can pass 100: it's not a percentage. It gives the channels in one order at a time, so ask for the order that answers the question: lostMostVisits for which fell most, sellsBest for which sells best for its visits. key: one channel, for only its own figures); channel (key: the channel's name, its sources); campaigns (its four boxes with the share of the whole website, visits from campaigns each day, what people did after they arrived, and its table of campaigns with where each link was, visits and bought against the span before, conversions and who left straight away. Never money. It gives 25 at a time, so ask for the order that answers the question: lostMostVisits for which fell most, mostBought for which sold most. cameFrom reads one place alone, such as Google Ads, with its totals. Conversions count times, not visits, as it explains. If it had none in these dates, say so and read last12Months); adKeywords (the same table by ad keyword); landingPages (Funnel: its four boxes, the route chart's five columns with where most went next, the busy pages that lose people, each Classification, the visits with no page known, and its table; key reads every route of one page people started on, order mostPeopleLeft, mostPeopleStayed or mostConversions; it leaves out search, basket and account pages and says so, and everyPage puts them back. Left means two things, as it explains); landingPage (key: the page's address or path, with where its visits came from); allPages (every page's visits, page views and conversions against the span before, how many pages gained, dropped, stayed static or had no visits, how many busy pages had fewer views and quiet pages more, how few pages made half the views, and the whole website's page views and pages a visit. Like the screen, it leaves out search, basket and account pages: say so, and give everyPage to read them too, or the classification Search, basket and account for only those. It gives 25 pages at a time, so ask for the order that answers the question: lostMostViews for which pages fell most, gainedMostViews for which rose most, and so on. For one classification, such as Electrical, give classification: it adds that classification's totals. If a warning comes back, say it first. Always say classification); page (key: address or path; its views, the visits that started on it, on a product's page the items added to basket and bought, elsewhere the visitors who bought and how many scrolled to the bottom, its visitors by channel and by source, who looks at it by device, country, age and gender against the whole website, and its busiest days: never money); events; event (key: Google's event name — click, scroll, form_submit — with what it was about, the pages it happened on and the people who converted after it); conversions; visitors (list: visitorType, browser, system, age, gender or interest); products (a shop's steps and its sale, as the company picked them, and each product's items bought, added and left in the basket, selling more and less: never money); services (for a website that sells services rather than products: each service page's visits and events against the dates before, the four groups named by their numbers, the services with no events, the events on other pages, the channels that brought visits, and the table. key names one service, for its months and its channels. order mostEvents for which gets the most enquiries, bestForEvents for the most for its visits, noEvents for those people look at but never get in touch about. Events, never sales or money). Leave device out for every device; country is one of the website's other home countries, left out for the main one. Give the figures with the link returned; money is in the currency returned.",
        handlerMapping: "assistant.googleAnalytics",
        modelName: "read_google_analytics",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["website", "screen", "period"],
          properties: {
            website: { type: "string", description: "The website's address, e.g. example.co.uk — one of the company's own, from list_websites." },
            screen: { type: "string", enum: ["overview", "channels", "channel", "campaigns", "adKeywords", "landingPages", "landingPage", "allPages", "page", "events", "event", "conversions", "visitors", "products", "services"] },
            period: { type: "string", enum: ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"], description: "lastMonth when the question names no time." },
            device: { type: "string", enum: ["desktop", "mobile", "tablet"], description: "One device. Leave out for every device." },
            country: { type: "string", description: "Another home country of the website, as a three-letter code (fra). Leave out for the main one." },
            key: { type: "string", description: "For channel, landingPage, page and event: the channel, the page's address or path, or the event's Google name. For services: one service's name or address, for its months and channels. For landingPages: a page people started on, to read every route it has. For channels: one channel, to read only its own figures." },
            search: { type: "string", description: "Words to find in a list's names. Optional." },
            order: { type: "string", enum: ["mostViews", "mostVisits", "lostMostViews", "gainedMostViews", "lostMostConversions", "gainedMostConversions", "mostPeopleLeft", "mostPeopleStayed", "mostConversions", "gainedMostVisits", "lostMostVisits", "mostBought", "sellsBest", "bestForEvents", "mostEvents", "noEvents"], description: "Which to read first. For services: mostVisits, mostEvents, gainedMostVisits, lostMostVisits, bestForEvents or noEvents, mostVisits if left out. For channels: mostVisits, gainedMostVisits, lostMostVisits, mostBought, sellsBest, or on a website with nothing bought bestForEvents, mostVisits if left out. For campaigns and adKeywords: mostVisits, gainedMostVisits, lostMostVisits, mostBought or mostConversions, mostVisits if left out. For allPages: mostViews to gainedMostConversions, mostViews if left out. For landingPages: mostVisits, mostPeopleLeft, mostPeopleStayed or mostConversions, mostVisits if left out." },
            classification: { type: "string", description: "For allPages and landingPages: only this classification's pages, by its name, with their totals. Not sorted yet is one too, and so is Search, basket and account." },
            cameFrom: { type: "string", description: "For campaigns: only those from one place, in the page's words: Google Ads, Google free listing, Facebook ad, Instagram ad, Microsoft Ads, Google Business Profile, Email, Trustpilot, Pinterest, or any other source as it's written." },
            everyPage: { type: "boolean", description: "For allPages and landingPages: put search, basket and account pages back in. They leave them out if not." },
            move: { type: "string", enum: ["gains", "dropped", "static", "none"], description: "For allPages: only the pages that gained, dropped, stayed static or had no visits." },
            list: { type: "string", enum: ["visitorType", "browser", "system", "age", "gender", "interest"], description: "For visitors: which list. Browsers if left out." },
          },
        }),
      },
      {
        name: "Read Google Analytics live",
        description:
          "Who is on one of the company's own websites right now and in the last 30 minutes, from Google's live figures, asked just now and never kept: on the website now, the busiest page and town, people, page views and conversions in the last 30 minutes, people each minute, how that compares with a usual half hour, the views by Classification, the towns they are in, and pages (by title, with their addresses), places, devices or events. Each call asks Google, so call it once for a question. Say the figures are live, with the link returned. These figures can't say where these visitors came from, or why it's busy or quiet: say so first if asked, and never give a cause from another screen.",
        handlerMapping: "assistant.googleAnalytics.live",
        modelName: "read_google_analytics_live",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["website"],
          properties: {
            website: { type: "string", description: "The website's address, e.g. example.co.uk — one of the company's own, from list_websites." },
            device: { type: "string", enum: ["desktop", "mobile", "tablet"], description: "One device. Leave out for every device." },
            list: { type: "string", enum: ["pages", "places", "devices", "events"], description: "Which list to give. Pages if left out." },
          },
        }),
      },
    ],
  },
  {
    // Every Bing Webmaster screen, for the Assistant (docs/plans/active/
    // bing-webmaster-plan.md BW13). Its own connector, as Google Analytics'
    // is, so it reaches an Assistant already installed.
    key: "assistant-bing",
    name: "Assistant Bing Webmaster",
    description:
      "Lets the Assistant read every Bing Webmaster screen of the company's own websites, through the same reads the screens use.",
    category: "KNOWLEDGE",
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: ["company:read"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Read Bing Webmaster",
        description:
          "One Bing Webmaster screen of one of the company's own websites, over one calendar period — the screens' own: thisWeek, lastWeek, thisMonth, lastMonth, last3Months, last6Months or last12Months — with the figures the screen shows and its link. Bing gives keywords and pages a week at a time, so a period's lists are the Bing weeks ending inside it. Every figure sits beside Google's for the same days or keyword, from Search Console. Screens: performance (Bing's clicks, impressions and click-through rate against Google's, and Bing's share of the website's search clicks week by week); keywords (each keyword with Bing's and Google's positions); pages (each page with Bing's clicks and Google's); versus (Bing against Google over the period: how many keywords each engine ranks higher, and each keyword with both positions); crawling (pages Bing read, its errors, and each money page in Bing's index against Google's). Rows from under 10 impressions are marked fewImpressions: too few to trust. Give the figures with the link returned.",
        handlerMapping: "assistant.bingWebmaster",
        modelName: "read_bing_webmaster",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["website", "screen", "period"],
          properties: {
            website: { type: "string", description: "The website's address, e.g. example.co.uk — one of the company's own, from list_websites." },
            screen: { type: "string", enum: ["performance", "keywords", "pages", "versus", "crawling"] },
            period: { type: "string", enum: ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"], description: "lastMonth when the question names no time." },
            search: { type: "string", description: "Words to find in a list's keywords or pages. Optional." },
          },
        }),
      },
    ],
  },
  {
    // What Hakken sees on a website's screens, for the Assistant
    // (docs/plans/active/search-console-volatility-plan.md §8, HS7). Its own
    // connector, as the charts are, so it reaches an Assistant already installed.
    key: "assistant-advice",
    name: "Assistant advice",
    description:
      "Lets the Assistant read the advice the platform's screens give on a website, so it says what the screens say, never advice of its own.",
    category: "KNOWLEDGE",
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: ["company:read"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Read the screens' advice",
        description:
          "The advice the platform's own screens give on one of the company's websites, each screen's newest: what it means and what to do first, with the screen's address. Read it before you say how a website is doing, why its numbers moved, or what to do about it, and give that advice as written, with the way to its screen: add detail when asked, never different advice. Is it Google or the website? Volatility's advice says.",
        handlerMapping: "assistant.advice.read",
        modelName: "read_advice",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["website"],
          properties: {
            website: { type: "string", description: "The website's address, e.g. example.co.uk — one of the company's, from list_websites." },
          },
        }),
      },
    ],
  },
  {
    // Insights' findings for the Assistant (docs/plans/active/insights-analyst-plan.md
    // I14, phase 16): its own connector, so it reaches an Assistant already installed.
    key: "assistant-insights",
    name: "Assistant insights",
    description:
      "Lets the Assistant read Insights' findings on a website, so it gives the same advice as Insights and its reports, never advice of its own.",
    category: "KNOWLEDGE",
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: ["company:read"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Read Insights' findings",
        description:
          "Insights' newest week for one of the company's own websites: the Head of Strategy's verdict and each finding — what was found across Search Console, Google Analytics, Visibility and AI answers, what to do first and how we'll know it worked — checked by its Editor, with each finding's link; the newest monthly report's headline; and Keyword cannibalisation — every group of the website's pages competing for the same searches, the page that should own each search and what to do with every page, as the Keyword cannibalisation specialist decided it; Page decisions — every page of the website to improve, merge, redirect or remove, with why and who decided it; Strategy's call for each service; and what each Insights screen's box says, as its specialist wrote it. Read it before you say what a website should do next, why enquiries moved, what matters most, which page should rank for a search, or whether to merge or redirect a page, and give its findings and decisions as written, with their links: add detail when asked, never different advice, and never a figure it doesn't give.",
        handlerMapping: "assistant.insights.read",
        modelName: "read_insights",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["website"],
          properties: {
            website: { type: "string", description: "The website's address, e.g. example.co.uk — one of the company's own, from list_websites." },
          },
        }),
      },
    ],
  },
  {
    // The Assistant's chart under an answer (docs/plans/active/
    // hakken-tasks-plan.md, item 2.1). Its own connector rather than one more
    // figure tool: a connector's tools are written when it is installed, so a
    // new connector reaches an Assistant already installed, and a new tool in
    // an installed one would not.
    key: "assistant-charts",
    name: "Assistant charts",
    description:
      "Lets the Assistant draw a chart under its answer from the company's saved Search Console, Google Analytics, Bing, Clarity and Visibility figures, never its own numbers.",
    category: "KNOWLEDGE",
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: ["company:read"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Show a chart",
        description:
          "Draws a chart under your answer: one of the company's own websites' visitors from Google, or how often it showed up in Google (impressions), each day — for the whole website or the page whose address contains `page` — against as many days before. Use it when someone asks how something did over time, for one calendar month (`month`, e.g. last month) or the newest 7, 30 or 90 days. Or, with lookup google_analytics: the website's visits, its conversions (every one, or one by `event`), or the share of visits that converted (conversionRate), each day of a calendar `period`, against the period before where it is kept. Or, with a `kind`, the website's groups over the period — from google_analytics `by` channel, classification, device, country, landing page (page) or hour (a grid of each weekday's hours, when a conversion happens); from search_console `by` search (query), page, country or device, of clicks or impressions; from bing `by` search (query) or page, of clicks or impressions; from clarity `by` device, page, kind (of page), source or browser, of visits or how people behave (scroll, quickBacks, rageClicks, deadClicks, errors — a grid shows them all for each group); from visibility `by` website (the website against the competitors it is watched with: estimatedVisitors, searches, topThree, linkingWebsites; a grid of each website's searches by Google position; a scatter of searches against estimated visitors) or position (its searches by Google position): bars to rank them, stacked bars to show how their shares changed against the period before, a pie for shares at a glance, a scatter to set each group's visits against its conversion rate, or a grid of each group's rate for each conversion (where people drop out). Or, with lookup visibility and kind line, the website against one rival watched beside it over a calendar `period` (last12Months if they don't say), a point at each monthly check: estimatedVisitors, searches, topThree or linkingWebsites — the rival named in `rival`, else the biggest. Pick the kind that answers the question; line for anything over time. It is drawn from the figures it reads, never from yours, and returns the figures for your words. One chart to an answer. Competitors have none, except in visibility.",
        handlerMapping: "assistant.chart",
        modelName: "show_chart",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["website", "measure"],
          properties: {
            lookup: { type: "string", enum: ["search_console", "google_analytics", "bing", "clarity", "visibility"], description: "Where the figures come from: search_console (visitors, impressions), google_analytics (visits, conversions, conversionRate), bing (clicks, impressions), clarity (visits and how people behave on the website) or visibility (the website against its competitors on Google, at the newest check)." },
            website: { type: "string", description: "The website's address, e.g. example.co.uk — one of the company's, from list_websites." },
            measure: { type: "string", enum: ["visitors", "clicks", "impressions", "visits", "conversions", "conversionRate", "scroll", "quickBacks", "rageClicks", "deadClicks", "errors", "estimatedVisitors", "searches", "topThree", "linkingWebsites", "itemsBought", "itemsLeft", "sellingMore", "sellingLess"], description: "From search_console: visitors (clicks) or impressions. From google_analytics: visits, conversions, or conversionRate (the share of visits that converted); by product (a shop's products, as bars): itemsBought (sold most), itemsLeft (left in baskets most), sellingMore or sellingLess (against the period before), never money. From bing: clicks or impressions. From clarity: visits, scroll (how far people scroll), quickBacks, rageClicks, deadClicks or errors (shares of visits). From visibility: estimatedVisitors, searches (ranked for), topThree or linkingWebsites." },
            event: { type: "string", description: "google_analytics only: one conversion by its Google event name (purchase, add_to_cart, generate_lead) for conversions or conversionRate. Leave out for every conversion." },
            period: { type: "string", enum: ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"], description: "google_analytics, a chart of groups, bing and clarity: the calendar period, drawn against the period before where it is kept. lastMonth if they don't say. visibility's groups read its newest check whatever it says; its line (kind line) the period's checks, last12Months if they don't say." },
            month: { type: "string", description: "A calendar month as YYYY-MM, drawn against the month before. Leave out to use days." },
            days: { type: "number", description: "7, 30 or 90: the newest days, against as many before. Used when there's no month." },
            page: { type: "string", description: "Part of a page's address, e.g. /boiler-repair. Leave out for the whole website." },
            rival: { type: "string", description: "visibility with kind line: the rival drawn beside the website, by its address, e.g. rival.co.uk. Leave out for the biggest." },
            kind: { type: "string", enum: ["line", "bars", "stacked", "pie", "scatter", "grid"], description: "line (each day, the default for search_console and google_analytics; for visibility, the website against a rival at each check), bars (groups ranked; the default for bing, clarity and visibility), stacked (each group's share, against the period before), pie (shares), scatter (two figures for each group) or grid (each group across, rows down: conversions, Clarity's measures, or each website's positions)." },
            by: { type: "string", enum: ["channel", "kind", "device", "country", "page", "hour", "query", "source", "browser", "website", "position", "product", "age", "gender", "weekday", "service"], description: "With a kind other than line: the groups. google_analytics: channel (default), kind (of page), device, country, page (landing page), hour (grid only), product (a shop's products, bars only), service (a service business's services, bars only: measure visits, conversions for its events, or conversionRate for its events for every 100 visits), or age or gender (the whole website's visits as Visits' bars draw them, visits only, never conversions); with page set to one page's address, that page alone by channel, source, device, country, age, gender or weekday (visits, views or people, never conversions). search_console: query (default, the searches), page, country or device. bing: query (default) or page. clarity: device (default), page, kind, source or browser. visibility: website (default) or position." },
          },
        }),
      },
    ],
  },
  ASSISTANT_PAGE_CHARTS_CONNECTOR,
  {
    // The Assistant's Hakken tasks (docs/plans/active/hakken-tasks-plan.md,
    // item 1.2). Every tool proposes and nothing more: the change is written
    // onto the reply with two buttons and happens when the person taps yes,
    // so each is a read, a member's to make for their own tasks.
    key: "assistant-tasks",
    name: "Assistant tasks",
    description:
      "Lets the Assistant set up alerts a person asks for, and pause, resume or delete their own, each written out for their yes.",
    category: "KNOWLEDGE",
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: ["company:read"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Propose an alert",
        description:
          "When someone asks to be told, alerted or warned about one of the company's own websites or pages in Google — fewer or more visitors than a number, or a drop or rise against its usual day — propose it with this. It reads the last four weeks from Search Console and writes the task out under your reply with “Yes, start watching” and “Not now”: nothing starts until they tap yes. Search Console clicks count as visitors. It checks each morning once a day's figures have settled, about three days behind, and tells them in the bell and by email every day the rule is met, until they stop it. Use it whenever someone wants to keep an eye on a figure; never promise to remember it yourself.",
        handlerMapping: "assistant.tasks.propose",
        modelName: "propose_task",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({"type": "object", "required": ["website", "when", "value"], "properties": {"website": {"type": "string", "description": "One of the company's own websites, e.g. example.co.uk — from list_websites."}, "page": {"type": "string", "description": "Part of the page's address, e.g. /web-design-london/ or web-design-london. Leave out for the whole website."}, "measure": {"type": "string", "enum": ["visitors", "impressions"], "description": "visitors: clicks from Google, which count as visitors. impressions: how often it shows up in Google. Default visitors."}, "when": {"type": "string", "enum": ["below", "above", "dropBy", "riseBy"], "description": "below or above a number; dropBy or riseBy a percentage of its usual day (half = dropBy 50)."}, "value": {"type": "number", "description": "The number for below and above; the percentage for dropBy and riseBy."}, "days": {"type": "number", "description": "Days in a row before telling them. Default 1."}, "time": {"type": "string", "description": "When to tell them, 24-hour HH:MM in their own time, e.g. 09:00. Default 09:00."}}}),
      },
      {
        name: "Propose a weekly report",
        description:
          "When someone asks to be sent something regularly — every Monday, the pages that lost the most visitors from Google — propose it with this. It reads this week's figures and writes the report out under your reply with “Yes, send it” and “Not now”: nothing is sent until they tap yes. It compares last week, Monday to Sunday as far as Search Console has sent it, against the week before, once a week on the day they choose, at their time, by email and here. Visitors only for now. Never promise to send it yourself.",
        handlerMapping: "assistant.tasks.proposeReport",
        modelName: "propose_report",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["website"],
          properties: {
            website: { type: "string", description: "One of the company's own websites, e.g. example.co.uk, from list_websites." },
            direction: { type: "string", enum: ["lost", "gained"], description: "The pages that lost the most visitors, or gained the most." },
            count: { type: "number", description: "How many pages, 3 to 10; 5 if they don't say." },
            weekday: { type: "string", description: "The day it comes: Monday to Sunday; Monday if they don't say." },
            time: { type: "string", description: "Their time, HH:MM, 24-hour; 09:00 if they don't say." },
          },
        }),
      },
      {
        name: "Propose a chart sent at a time",
        description:
          "When someone asks to be sent a chart from Google Analytics at a time — once (\"send me a chart at 10am tomorrow with my conversion rates\") or every week — propose it with this. It draws the chart as it would look today under your reply and writes the offer out with “Yes, send it” and “Not now”: nothing is sent until they tap yes. On its day, at their time, it reads the period's newest saved days and sends the chart by email and here, against the period before. Visits, conversions (every one, or one event's) or the share of visits that converted — each day as a line, or, with a `kind`, the website's groups (`by` channel, classification, device or country) as bars, stacked bars, a pie, a scatter or a grid, as show_chart draws them; or any chart of groups show_chart draws from search_console, bing, clarity or visibility (`lookup`). Never promise to send it yourself, and never use propose_report for a chart.",
        handlerMapping: "assistant.tasks.proposeChartReport",
        modelName: "propose_chart_report",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["website", "measure"],
          properties: {
            website: { type: "string", description: "One of the company's own websites, e.g. example.co.uk, from list_websites." },
            measure: { type: "string", enum: ["visits", "conversions", "conversionRate", "clicks", "impressions", "scroll", "quickBacks", "rageClicks", "deadClicks", "errors", "estimatedVisitors", "searches", "topThree", "linkingWebsites", "itemsBought", "itemsLeft", "sellingMore", "sellingLess"], description: "conversionRate: the share of visits that converted, for \"conversion rates\". itemsBought, itemsLeft, sellingMore, sellingLess: a shop's products (by product, bars), never money. clicks or impressions: Search Console's or Bing's. scroll, quickBacks, rageClicks, deadClicks, errors: Clarity's. estimatedVisitors, searches, topThree, linkingWebsites: Visibility's." },
            event: { type: "string", description: "One conversion's event name, e.g. purchase, for that conversion alone. Leave out for every conversion together." },
            period: { type: "string", enum: ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"], description: "What the chart covers on the day it is sent. lastMonth for a chart sent once, lastWeek for a weekly one, if they don't say." },
            every: { type: "string", enum: ["once", "week"], description: "once on a day, or every week. once if they don't say." },
            day: { type: "string", description: "For once: today, tomorrow or YYYY-MM-DD. tomorrow if they don't say." },
            weekday: { type: "string", description: "For every week: Monday to Sunday. Monday if they don't say." },
            time: { type: "string", description: "Their time, HH:MM, 24-hour, e.g. 10:00; 09:00 if they don't say." },
            kind: { type: "string", enum: ["line", "bars", "stacked", "pie", "scatter", "grid"], description: "line (each day, the default), or a chart of the website's groups: bars, stacked, pie, scatter or grid." },
            by: { type: "string", enum: ["channel", "kind", "device", "country", "page", "hour", "query", "source", "browser", "website", "position", "product"], description: "With a kind other than line: the groups — channel (default), kind (of page), device, country, page (landing page), hour (grid only) or product (a shop's products, bars only); query for searches; source or browser for Clarity's; website or position for Visibility's." },
            lookup: { type: "string", enum: ["google_analytics", "search_console", "bing", "clarity", "visibility"], description: "Where a chart of groups comes from: google_analytics (default), search_console or bing (searches, pages; clicks or impressions), clarity (devices, pages, kinds, sources, browsers) or visibility (the website against its competitors, or its positions)." },
          },
        }),
      },
      {
        name: "Propose an alert on AI answers",
        description:
          `When someone asks to be told if an AI engine (${AI_ENGINES.map((engine) => AI_ENGINE_NAMES[engine]).join(", ")}) stops recommending them, leaves them out, or warns against them, for one of the company's tracked questions, propose it with this. It reads the newest answer and writes the alert out under your reply for a yes. It is checked whenever the question is next asked. If the question isn't tracked yet, the offer adds it on their yes, asked of that engine alone, and says what each check costs in credits.`,
        handlerMapping: "assistant.tasks.proposeAnswerAlert",
        modelName: "propose_answer_alert",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["website", "question"],
          properties: {
            website: { type: "string", description: "One of the company's own websites, e.g. example.co.uk, from list_websites." },
            question: { type: "string", description: "The tracked question, as they said it, e.g. best web design agency uk." },
            engine: { type: "string", enum: [...AI_ENGINES], description: "Which AI engine; chatgpt if they don't say." },
            watch: { type: "string", enum: ["notRecommended", "notNamed", "warnedAgainst"], description: "Tell them when it stops recommending them (default), leaves them out, or warns against them." },
            time: { type: "string", description: "Their time, HH:MM, 24-hour; 09:00 if they don't say." },
          },
        }),
      },
      {
        name: "Propose an alert on a Google ranking",
        description:
          "When someone asks to be told if they drop out of Google's top 3 (or top 10) for one of the company's tracked searches, or when they get into it, propose it with this. It reads the newest check and writes the alert out under your reply for a yes. It is checked whenever the search is next checked. If the search isn't tracked yet, the offer adds it on their yes and says what each check costs in credits.",
        handlerMapping: "assistant.tasks.proposeRankingAlert",
        modelName: "propose_ranking_alert",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["website", "search"],
          properties: {
            website: { type: "string", description: "One of the company's own websites, e.g. example.co.uk, from list_websites." },
            search: { type: "string", description: "The tracked Google search, e.g. web design surrey." },
            when: { type: "string", enum: ["outOfTop", "intoTop"], description: "Tell them when it drops out of the top (default), or gets into it." },
            position: { type: "number", description: "The top what: 3 for the top 3; 3 if they don't say." },
            time: { type: "string", description: "Their time, HH:MM, 24-hour; 09:00 if they don't say." },
          },
        }),
      },
      {
        name: "Offer to find out why",
        description:
          "When someone asks why a figure changed — why a page lost visitors, why the website dropped in Google, why AI answers stopped naming them — and it needs digging, offer to find out with this. It writes the offer out under your reply with “Yes, find out” and “Not now”; on a yes, the Research Agent looks through their Search Console figures, rankings and AI answers in the background and writes up what it found in this conversation, then tells them in the bell. It uses their monthly credits, so it always asks first. Answer a simple question yourself with your read tools instead.",
        handlerMapping: "assistant.tasks.proposeResearch",
        modelName: "propose_research",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["question"],
          properties: {
            question: { type: "string", description: "What to find out, in their words, e.g. Why did /web-design-london/ lose visitors this week?" },
            website: { type: "string", description: "One of the company's own websites, e.g. example.co.uk, from list_websites, when the question is about one." },
            page: { type: "string", description: "The page's address or part of it, when the question is about one." },
          },
        }),
      },
      {
        name: "List my tasks",
        description:
          "The person's own tasks — what each keeps an eye on, whether it is on or paused, and its time — each with the taskId a change needs. Their tasks page is linked: they can also pause, resume or delete there.",
        handlerMapping: "assistant.tasks.list",
        modelName: "list_my_tasks",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({ type: "object", properties: {} }),
      },
      {
        name: "Propose a change to a task",
        description:
          "When someone asks to pause, resume or delete one of their own tasks, propose it with this, using its taskId from list_my_tasks. The change is written out under your reply with two buttons and happens only when they tap yes.",
        handlerMapping: "assistant.tasks.change",
        modelName: "propose_task_change",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({"type": "object", "required": ["taskId", "change"], "properties": {"taskId": {"type": "string", "description": "The task's taskId, from list_my_tasks."}, "change": {"type": "string", "enum": ["pause", "resume", "delete"]}}}),
      },
    ],
  },
];

export function getBuiltInToolConnector(key: string) {
  return BUILT_IN_TOOL_CONNECTORS.find((connector) => connector.key === key);
}
