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
    key: "sonae-knowledge",
    name: "Sonae Knowledge",
    description: "Search approved tenant knowledge and uploaded documents through the governed RAG path.",
    category: "KNOWLEDGE",
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: ["knowledge:read"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Knowledge Search",
        description: "Search approved internal knowledge sources and return concise cited snippets.",
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
    name: "Sonae Company/Profile",
    description: "Read and maintain tenant company profile context used by agents and onboarding flows.",
    category: "PROFILE",
    authMode: "NONE",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["company:read", "company:write"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Update Company Overview",
        description: "Update the active tenant company overview after explicit approval.",
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
    key: "sonae-workflow-task",
    name: "Sonae Workflow/Task",
    description: "Reserved connector for creating and updating governed tasks from workflow runs.",
    category: "WORKFLOW",
    authMode: "NONE",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["workflow:read", "workflow:write"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Create Workflow Task",
        description: "Create a governed workflow task placeholder. Real task execution is not implemented yet.",
        handlerMapping: "workflow.task.create",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "http-rest",
    name: "HTTP REST",
    description: "Configure outbound REST actions with vault-backed secret references and explicit approval policy.",
    category: "HTTP",
    authMode: "SECRET_REF",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["http:request"],
    requiredSecretRefs: ["base_url", "auth_header"],
    toolDefinitions: [
      {
        name: "HTTP Request",
        description: "Prepare an outbound HTTP request through the REST connector. Real outbound execution is not implemented yet.",
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
    name: "Email/Notification",
    description: "Configure notification delivery for workflow and agent follow-up actions.",
    category: "EMAIL",
    authMode: "SECRET_REF",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["notification:send"],
    requiredSecretRefs: ["provider_api_key", "from_address"],
    toolDefinitions: [
      {
        name: "Send Notification",
        description: "Prepare an email or notification dispatch. Real delivery is not implemented yet.",
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
  {
    key: "slack",
    name: "Slack",
    description: "OAuth scaffold for Slack workspace actions and notification workflows.",
    category: "CUSTOM",
    authMode: "OAUTH",
    oauthProvider: "slack",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["channels:read", "chat:write"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Send Slack Message",
        description: "Prepare a Slack message through an OAuth-backed Slack connector. Real Slack delivery is not implemented yet.",
        handlerMapping: "slack.message.send",
        requiredRole: "ADMIN",
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: true,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["channel", "text"],
          properties: {
            channel: { type: "string" },
            text: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "google-drive",
    name: "Google Drive",
    description: "OAuth scaffold for tenant-scoped document search and file workflows.",
    category: "CUSTOM",
    authMode: "OAUTH",
    oauthProvider: "google",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["drive.metadata.readonly", "drive.readonly"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Search Google Drive",
        description: "Prepare a Google Drive search through an OAuth-backed connector. Real Drive access is not implemented yet.",
        handlerMapping: "google_drive.search",
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
    key: "gmail",
    name: "Gmail",
    description: "OAuth scaffold for reading Gmail threads and drafting governed email replies.",
    category: "EMAIL",
    authMode: "OAUTH",
    oauthProvider: "google",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["gmail.readonly", "gmail.compose"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Search Gmail Threads",
        description: "Search Gmail threads and return bounded message summaries. Real Gmail access is not implemented yet.",
        handlerMapping: "gmail.threads.search",
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
      {
        name: "Draft Gmail Reply",
        description: "Prepare a Gmail draft reply for review. Real Gmail drafting is not implemented yet.",
        handlerMapping: "gmail.reply.draft",
        requiredRole: "ADMIN",
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: true,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["threadId", "body"],
          properties: {
            threadId: { type: "string" },
            body: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "google-calendar",
    name: "Google Calendar",
    description: "OAuth scaffold for calendar availability checks and meeting scheduling workflows.",
    category: "CUSTOM",
    authMode: "OAUTH",
    oauthProvider: "google",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["calendar.readonly", "calendar.events"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Find Calendar Availability",
        description: "Prepare a calendar availability lookup. Real Calendar access is not implemented yet.",
        handlerMapping: "google_calendar.availability.find",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["start", "end"],
          properties: {
            start: { type: "string" },
            end: { type: "string" },
            attendeeEmails: { type: "array", items: { type: "string" } },
          },
        }),
      },
      {
        name: "Create Calendar Hold",
        description: "Prepare a calendar event hold after explicit approval. Real Calendar writes are not implemented yet.",
        handlerMapping: "google_calendar.event.create",
        requiredRole: "ADMIN",
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: true,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["title", "start", "end"],
          properties: {
            title: { type: "string" },
            start: { type: "string" },
            end: { type: "string" },
            attendeeEmails: { type: "array", items: { type: "string" } },
          },
        }),
      },
    ],
  },
  {
    key: "microsoft-outlook",
    name: "Microsoft Outlook",
    description: "OAuth scaffold for Microsoft 365 mail search, reply drafting, and follow-up workflows.",
    category: "EMAIL",
    authMode: "OAUTH",
    oauthProvider: "microsoft",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["Mail.Read", "Mail.Send"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Search Outlook Mail",
        description: "Search Microsoft 365 mail and return bounded summaries. Real Outlook access is not implemented yet.",
        handlerMapping: "outlook.mail.search",
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
      {
        name: "Draft Outlook Reply",
        description: "Prepare an Outlook reply for review. Real Outlook drafting is not implemented yet.",
        handlerMapping: "outlook.reply.draft",
        requiredRole: "ADMIN",
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: true,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["messageId", "body"],
          properties: {
            messageId: { type: "string" },
            body: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "microsoft-teams",
    name: "Microsoft Teams",
    description: "OAuth scaffold for Teams channel lookup and governed message preparation.",
    category: "CUSTOM",
    authMode: "OAUTH",
    oauthProvider: "microsoft",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["Channel.ReadBasic.All", "ChatMessage.Send"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Send Teams Message",
        description: "Prepare a Teams message through an OAuth-backed connector. Real Teams delivery is not implemented yet.",
        handlerMapping: "teams.message.send",
        requiredRole: "ADMIN",
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: true,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["channel", "text"],
          properties: {
            channel: { type: "string" },
            text: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "notion",
    name: "Notion",
    description: "OAuth scaffold for searching workspace pages and preparing knowledge updates.",
    category: "KNOWLEDGE",
    authMode: "OAUTH",
    oauthProvider: "notion",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["search", "read_content", "update_content"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Search Notion",
        description: "Search Notion pages and databases. Real Notion access is not implemented yet.",
        handlerMapping: "notion.search",
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
      {
        name: "Prepare Notion Page Update",
        description: "Prepare a Notion page update after explicit approval. Real Notion writes are not implemented yet.",
        handlerMapping: "notion.page.update",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["pageId", "content"],
          properties: {
            pageId: { type: "string" },
            content: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "hubspot",
    name: "HubSpot",
    description: "OAuth scaffold for CRM contact, company, and deal context.",
    category: "CUSTOM",
    authMode: "OAUTH",
    oauthProvider: "hubspot",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["crm.objects.contacts.read", "crm.objects.companies.read", "crm.objects.deals.read"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Search HubSpot CRM",
        description: "Search HubSpot CRM objects and return bounded summaries. Real HubSpot access is not implemented yet.",
        handlerMapping: "hubspot.crm.search",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            objectType: { type: "string" },
            limit: { type: "number" },
          },
        }),
      },
    ],
  },
  {
    key: "salesforce",
    name: "Salesforce",
    description: "OAuth scaffold for account, opportunity, and case lookup in Salesforce.",
    category: "CUSTOM",
    authMode: "OAUTH",
    oauthProvider: "salesforce",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["api", "refresh_token"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Search Salesforce",
        description: "Search Salesforce records and return bounded summaries. Real Salesforce access is not implemented yet.",
        handlerMapping: "salesforce.records.search",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            objectType: { type: "string" },
            limit: { type: "number" },
          },
        }),
      },
    ],
  },
  {
    key: "zendesk",
    name: "Zendesk",
    description: "API-token scaffold for support ticket search and response preparation.",
    category: "CUSTOM",
    authMode: "SECRET_REF",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["tickets:read", "tickets:write"],
    requiredSecretRefs: ["subdomain", "api_token_ref"],
    toolDefinitions: [
      {
        name: "Search Zendesk Tickets",
        description: "Search Zendesk tickets and return bounded summaries. Real Zendesk access is not implemented yet.",
        handlerMapping: "zendesk.tickets.search",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        secretRefKeys: ["subdomain", "api_token_ref"],
        inputSchema: JSON.stringify({
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
          },
        }),
      },
      {
        name: "Prepare Zendesk Reply",
        description: "Prepare a Zendesk ticket reply after explicit approval. Real Zendesk writes are not implemented yet.",
        handlerMapping: "zendesk.ticket.reply",
        requiredRole: "ADMIN",
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: true,
        secretRefKeys: ["subdomain", "api_token_ref"],
        inputSchema: JSON.stringify({
          type: "object",
          required: ["ticketId", "body"],
          properties: {
            ticketId: { type: "string" },
            body: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "jira",
    name: "Jira",
    description: "API-token scaffold for issue search, triage, and governed ticket updates.",
    category: "WORKFLOW",
    authMode: "SECRET_REF",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["issues:read", "issues:write"],
    requiredSecretRefs: ["site_url", "api_token_ref"],
    toolDefinitions: [
      {
        name: "Search Jira Issues",
        description: "Search Jira issues and return bounded summaries. Real Jira access is not implemented yet.",
        handlerMapping: "jira.issues.search",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        secretRefKeys: ["site_url", "api_token_ref"],
        inputSchema: JSON.stringify({
          type: "object",
          required: ["jql"],
          properties: {
            jql: { type: "string" },
            limit: { type: "number" },
          },
        }),
      },
      {
        name: "Prepare Jira Comment",
        description: "Prepare a Jira issue comment after explicit approval. Real Jira writes are not implemented yet.",
        handlerMapping: "jira.issue.comment",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        secretRefKeys: ["site_url", "api_token_ref"],
        inputSchema: JSON.stringify({
          type: "object",
          required: ["issueKey", "body"],
          properties: {
            issueKey: { type: "string" },
            body: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "linear",
    name: "Linear",
    description: "API-key scaffold for product issue lookup and lightweight triage workflows.",
    category: "WORKFLOW",
    authMode: "SECRET_REF",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["issues:read", "comments:write"],
    requiredSecretRefs: ["api_key_ref"],
    toolDefinitions: [
      {
        name: "Search Linear Issues",
        description: "Search Linear issues and return bounded summaries. Real Linear access is not implemented yet.",
        handlerMapping: "linear.issues.search",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        secretRefKeys: ["api_key_ref"],
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
    key: "github",
    name: "GitHub",
    description: "API-token scaffold for repository issue, pull request, and release context.",
    category: "WORKFLOW",
    authMode: "SECRET_REF",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["repo:read", "issues:write"],
    requiredSecretRefs: ["token_ref", "owner"],
    toolDefinitions: [
      {
        name: "Search GitHub",
        description: "Search repository issues and pull requests. Real GitHub access is not implemented yet.",
        handlerMapping: "github.search",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        secretRefKeys: ["token_ref", "owner"],
        inputSchema: JSON.stringify({
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            repository: { type: "string" },
            limit: { type: "number" },
          },
        }),
      },
      {
        name: "Prepare GitHub Issue Comment",
        description: "Prepare a GitHub issue or pull request comment after explicit approval. Real GitHub writes are not implemented yet.",
        handlerMapping: "github.issue.comment",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        secretRefKeys: ["token_ref", "owner"],
        inputSchema: JSON.stringify({
          type: "object",
          required: ["repository", "issueNumber", "body"],
          properties: {
            repository: { type: "string" },
            issueNumber: { type: "number" },
            body: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "stripe",
    name: "Stripe",
    description: "Secret-reference scaffold for customer, subscription, and invoice lookup.",
    category: "CUSTOM",
    authMode: "SECRET_REF",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["customers:read", "subscriptions:read", "invoices:read"],
    requiredSecretRefs: ["api_key_ref"],
    toolDefinitions: [
      {
        name: "Search Stripe Customers",
        description: "Search Stripe customer and billing records. Real Stripe access is not implemented yet.",
        handlerMapping: "stripe.customers.search",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        secretRefKeys: ["api_key_ref"],
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
    key: "airtable",
    name: "Airtable",
    description: "API-token scaffold for searching structured base records and preparing updates.",
    category: "CUSTOM",
    authMode: "SECRET_REF",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["data.records:read", "data.records:write"],
    requiredSecretRefs: ["base_id", "token_ref"],
    toolDefinitions: [
      {
        name: "Search Airtable Records",
        description: "Search Airtable records and return bounded summaries. Real Airtable access is not implemented yet.",
        handlerMapping: "airtable.records.search",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        secretRefKeys: ["base_id", "token_ref"],
        inputSchema: JSON.stringify({
          type: "object",
          required: ["table", "query"],
          properties: {
            table: { type: "string" },
            query: { type: "string" },
            limit: { type: "number" },
          },
        }),
      },
    ],
  },
  {
    key: "shopify",
    name: "Shopify",
    description: "API-token scaffold for store order, customer, and product context.",
    category: "CUSTOM",
    authMode: "SECRET_REF",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["orders:read", "customers:read", "products:read"],
    requiredSecretRefs: ["shop_domain", "access_token_ref"],
    toolDefinitions: [
      {
        name: "Search Shopify Store",
        description: "Search Shopify orders, customers, and products. Real Shopify access is not implemented yet.",
        handlerMapping: "shopify.store.search",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        secretRefKeys: ["shop_domain", "access_token_ref"],
        inputSchema: JSON.stringify({
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            objectType: { type: "string" },
            limit: { type: "number" },
          },
        }),
      },
    ],
  },
];

export function getBuiltInToolConnector(key: string) {
  return BUILT_IN_TOOL_CONNECTORS.find((connector) => connector.key === key);
}
