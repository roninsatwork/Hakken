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
              type: "string",
              description: '"false" to include navigation and footers. Defaults to main content only.',
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
];

export function getBuiltInToolConnector(key: string) {
  return BUILT_IN_TOOL_CONNECTORS.find((connector) => connector.key === key);
}
