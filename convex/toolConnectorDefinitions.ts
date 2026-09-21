import { type Infer, v } from "convex/values";

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
    key: "google-gmail",
    name: "Gmail Mailbox",
    description:
      "Connects one dedicated Gmail mailbox by consent — never a person's own. The platform can read "
      + "new mail in it and reply from it, so the whole exchange sits in the inbox for any "
      + "colleague to open and inspect. The platform holds a scoped, revocable key, never a "
      + "password; disconnecting revokes the key at Google.",
    category: "EMAIL",
    // The platform's first OAuth connector: the consent flow, encrypted token
    // storage, refresh, and revocation in connectorOAuth.ts exist because of
    // this definition, and every later connector reuses them.
    authMode: "OAUTH",
    oauthProvider: "google",
    // Restricted to one tenant: the mailbox belongs to a company, and its
    // mail must never be readable from another.
    tenantAvailability: "TENANT_RESTRICTED",
    // One scope covering read, send, and label changes on the connected
    // mailbox — the minimum the reply loop needs, and exactly what the admin
    // screen and Google's consent screen both display (commitment 3).
    requiredScopes: ["https://www.googleapis.com/auth/gmail.modify"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Read mailbox",
        description:
          "Reads mail from the connected Gmail mailbox: new messages, or one message in full. "
          + "Reads only — nothing is sent, marked, or deleted.",
        handlerMapping: "gmail.read",
        modelName: "read_mailbox",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            messageId: {
              type: "string",
              description: "A Gmail message id, to read that message in full.",
            },
          },
        }),
      },
      {
        name: "Reply to a sender",
        description:
          "Replies from the connected mailbox, in the sender's own thread — and it can hold a "
          + "conversation there, message by message. It can only answer the sender of a message "
          + "the mailbox received: it cannot start new mail, add recipients, answer machines, or "
          + "reply faster than a person could type. The reply lands in the mailbox's Sent folder "
          + "like any colleague's mail.",
        handlerMapping: "gmail.reply",
        modelName: "reply_to_email",
        requiredRole: "ADMIN",
        // WRITE, with the rails in the handler beyond the model's reach:
        // reply-to-sender-only, no no-reply addresses, per-thread hourly
        // cap, and a per-day ceiling (commitment 6). Autonomy comes from the
        // mailbox agent's own flag, not from this definition.
        sideEffectLevel: "WRITE",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            messageId: {
              type: "string",
              description: "The Gmail message id being replied to.",
            },
            body: {
              type: "string",
              description: "The reply text, plain.",
            },
          },
          required: ["messageId", "body"],
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
];

export function getBuiltInToolConnector(key: string) {
  return BUILT_IN_TOOL_CONNECTORS.find((connector) => connector.key === key);
}
