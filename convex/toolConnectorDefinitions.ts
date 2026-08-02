type ConnectorCategory = "KNOWLEDGE" | "PROFILE" | "WORKFLOW" | "HTTP" | "EMAIL" | "CUSTOM";
type ConnectorAuthMode = "NONE" | "SECRET_REF" | "OAUTH";
type ToolSideEffectLevel = "READ" | "WRITE" | "DESTRUCTIVE" | "EXTERNAL";

export type ConnectorToolDefinition = {
  name: string;
  description: string;
  handlerMapping: string;
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
  toolDefinitions: ConnectorToolDefinition[];
};

export const BUILT_IN_TOOL_CONNECTORS: ToolConnectorDefinition[] = [
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
          "Looks up jobs on Apify. Give it something to search for — 'rightmove property listings' "
          + "— to see what jobs exist, or give it a job id to see exactly what settings that job "
          + "needs. Use this before running a job rather than guessing its settings.",
        handlerMapping: "apify.actor.describe",
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
    key: "sonae-firecrawl",
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
    key: "sonae-knowledge",
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
    key: "sonae-company-profile",
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
  // template:remove:start salesReports
  {
    key: "sales-reports",
    name: "Board Reports",
    description:
      "Lets an agent write the weekly board report from the pipeline it has been given, "
      + "grounded in the company knowledge and memories it carries.",
    category: "WORKFLOW",
    // The report is written from what the agent already holds — its pipeline
    // document, its knowledge base, its memories. Nothing leaves the platform
    // and no credential is involved.
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: [],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Write the board report",
        description:
          "Writes the eight-section board report from the pipeline document in this agent's "
          + "knowledge, drawing on company knowledge and what the agent remembers, and files it "
          + "on the Reports page. Give it a focus when this run should pay particular attention "
          + "to something — a deal, a rep, a question from the board.",
        handlerMapping: "salesReports.generate",
        requiredRole: "ADMIN",
        // Writes a report into the tenant's own workspace; nothing external.
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            focus: {
              type: "string",
              description:
                "Anything to pay particular attention to in this run, in plain words.",
            },
          },
        }),
      },
    ],
  },
  // template:remove:end
  // template:remove:start salesData
  {
    key: "sales-customer-research",
    // Named for the client at Anthony's request, 2026-08-01. It sits inside the
    // `salesData` fence, so the framework template strips it wholesale rather
    // than shipping a client's name to the next product built on this.
    name: "Comax Customer Research",
    description:
      "Lets an agent read a customer's record to see which details are missing, and record what "
      + "it finds on the web against that customer — with the page it came from.",
    category: "WORKFLOW",
    // Reads and writes the workspace's own customer records. Reaching the web
    // is a separate capability: search comes from the model provider, and
    // pages are read through Firecrawl.
    authMode: "NONE",
    // Restricted rather than global: these tools read and write one client's
    // customer records, and the screens they serve only exist for a workspace
    // with the sales data section switched on. Offering them to every company
    // would put a tool in the marketplace that most of them cannot use.
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: [],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Comax — Read a customer's record",
        description:
          "Returns one customer or prospect: the individual business name, its account code, the "
          + "chain it belongs to, its type, the details already known, the details still missing, "
          + "and the details already searched for and not published anywhere. Give it an account "
          + "name key for a particular one, or call it with nothing to get the next record that "
          + "still has gaps. A prospect needs the same details as a customer — it is a site "
          + "somebody has to be able to ring — so both kinds come back from this.",
        handlerMapping: "salesCustomers.research.read",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            accountNameKey: {
              type: "string",
              description:
                "The customer or prospect to read. Leave it out to be given the next record with "
                + "gaps, of either kind.",
            },
          },
        }),
      },
      {
        name: "Comax — Record a customer detail",
        description:
          "Records one detail you found about a customer, with the page you took it from. One "
          + "call per detail. A confident value on an empty field is saved to the record; "
          + "anything less certain, or anything contradicting what is already there, is kept for "
          + "a person to check. Set notFound when the detail is not published anywhere you "
          + "looked — that is a useful answer and stops the customer being searched again.",
        handlerMapping: "salesCustomers.research.record",
        requiredRole: "ADMIN",
        // Writes into the workspace's own customer records, and only into
        // fields that are empty. Nothing external, and nothing overwritten.
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["accountNameKey", "field"],
          properties: {
            accountNameKey: {
              type: "string",
              description: "The customer this detail belongs to, exactly as you were given it.",
            },
            field: {
              type: "string",
              description:
                "Which detail: addressLine1, addressLine2, town, postcode, country, phone, "
                + "mobile, email, accountsEmail, website, contactName, contactRole, bedrooms "
                + "or pupils.",
            },
            value: {
              type: "string",
              description: "What you found, as it appears on the page. Omit when notFound is true.",
            },
            confidence: {
              type: "string",
              enum: ["HIGH", "MEDIUM", "LOW"],
              description:
                "HIGH only when the page names this exact business and this exact detail with no "
                + "ambiguity. Anything less is not a failure — it goes to a person instead.",
            },
            sourceUrl: {
              type: "string",
              description:
                "The web address of the page you took this from. Required for every value.",
            },
            sourceName: {
              type: "string",
              description: "What to call that page on screen, for example the site's name.",
            },
            reasoning: {
              type: "string",
              description:
                "One line: why you believe this page is about this individual business and not "
                + "its parent chain.",
            },
            notFound: {
              type: "boolean",
              description: "True when this detail is not published anywhere you looked.",
            },
          },
        }),
      },
      {
        name: "Comax — Read a group",
        description:
          "Returns one group the workspace supplies: its name, its customer type, the sites in "
          + "it already supplied, and the sites an earlier run already found. Give it a group "
          + "name, or call it with nothing to get the next group nobody has looked through yet.",
        handlerMapping: "salesCustomers.prospects.read",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            groupName: {
              type: "string",
              description: "The group to look through. Leave it out to be given the next one.",
            },
          },
        }),
      },
      {
        name: "Comax — Record a site in a group",
        description:
          "Records one site you found in a group the workspace supplies. Report every site you "
          + "find, including ones you think are already supplied — you will be told which those "
          + "are, and that is how the count stays honest. A site that is already a customer is "
          + "refused and named back to you, so you can stop offering it.",
        handlerMapping: "salesCustomers.prospects.record",
        requiredRole: "ADMIN",
        // Writes a prospect into the workspace's own records. It cannot touch a
        // customer: a site that matches one is refused rather than merged.
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["groupName", "siteName"],
          properties: {
            groupName: {
              type: "string",
              description: "The group this site belongs to, exactly as you were given it.",
            },
            siteName: {
              type: "string",
              description: "The site's name, as the register or the group's own page publishes it.",
            },
            town: { type: "string", description: "The town it is in." },
            postcode: {
              type: "string",
              description:
                "Its postcode. Worth finding: it is the strongest signal that a site is or is "
                + "not one the workspace already supplies.",
            },
            sourceUrl: {
              type: "string",
              description: "The web address of the page that lists this site. Required.",
            },
            sourceName: { type: "string", description: "What to call that page on screen." },
            reasoning: {
              type: "string",
              description: "One line: why you believe this site belongs to this group.",
            },
          },
        }),
      },
    ],
  },
  // template:remove:end
];

export function getBuiltInToolConnector(key: string) {
  return BUILT_IN_TOOL_CONNECTORS.find((connector) => connector.key === key);
}
